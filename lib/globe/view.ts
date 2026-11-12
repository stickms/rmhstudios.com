/**
 * Binds the globe's physics (./engine.ts) to one chrome ball on the page: pointer, scroll and keyboard in, the ball's
 * drawn state and the projected pins out. Framework-free; the shell's components load it at idle through a dynamic
 * import and hand it elements.
 *
 * WHAT RUNS WHEN. The loop sleeps when nothing moves: no frame is scheduled at all, or one timer to the next ambient
 * tick. A press, a scroll kick, a keyboard focus or the globe opening wakes it, and it runs until the engine reports
 * rest. The one thing that moves with nobody touching it is the idle drift, as on the liquid globe: a few degrees a
 * second on a low tick (DRIFT_HZ), never per frame, and not at all while the tab is hidden or unfocused, the ball is
 * off screen, the visitor asked for stillness (`html[data-jelly-motion='still']`, or `prefers-reduced-motion`), or
 * someone has taken hold.
 *
 * LAYOUT IS READ ON INPUT, NEVER PER FRAME: the stage's box is read once per press. Pins are placed from a fixed
 * radius the caller gives (the open globe's), so a frame writes transforms and reads nothing.
 */
import { vibrate } from '@/lib/shared/platform';
import { DOUGH_N } from '@/lib/dough';
import { smoothstep } from '@/lib/fluid';
import { GlobeEngine, MAX_RIPPLES, RETICLE_FRACTION, kAt, placePoints, type GlobePoint } from './engine';
import { BALL_BLEED, BALL_FRAGMENT_SHADER, MAX_PINS } from './shader';

/** Total pointer travel (px) past which a release is a drag, not a click. */
const DRAG_SLOP = 8;
/** A press held this long without travelling is a hold, not a tap: its click is swallowed too. */
const HOLD_MS = 350;
/** The idle drift's tick: the liquid globe's 15 Hz floor, 7 on handhelds. */
const DRIFT_HZ = { fine: 15, coarse: 7 } as const;
/** How long the dots take to change size when the globe opens or closes (the M4 move), ms. */
const OPEN_MS = 360;
/** The chrome renderer starts at idle; until it is up, ask again this often, this many times. */
const ATTACH_RETRY_MS = 400;
const ATTACH_TRIES = 40;
/**
 * Dot size, dot strength and cage-line strength, docked and open. The dots are off at both sizes when the globe has
 * icon pins: the icons ride the ball docked as well as open, and a flat dot under each would be a second mark for the
 * same place. A globe with destinations but no pin elements keeps its dots while docked.
 */
const DOTS = { docked: [1.25, 1, 0.55], open: [0.5, 0, 1] } as const;

export { RETICLE_FRACTION };

export interface GlobeViewOptions {
  /** The chrome ball (`data-chrome="ball"`). */
  stage: HTMLElement;
  /** How many destinations sit on the sphere (0 for a globe that only turns). */
  points: number;
  /** The destination elements, in order; each is placed by `transform` from the centre of its own anchor. */
  pins?: ReadonlyArray<HTMLElement | null>;
  /** Carries `--fill`, the dwell ring's progress. */
  reticle?: HTMLElement | null;
  /** Elements beside the stage where a press also takes hold of the globe (the open menu's veil and pins). */
  surfaces?: ReadonlyArray<HTMLElement | null>;
  /** The radius the pins are placed at, px (the open globe's). Read each time the menu opens. */
  pinRadius?: () => number;
  /** The stage's open diameter, px: the renderer sizes its canvas for it while the menu is open. */
  openSize?: () => number;
  /** The label of each pin (same order): its opacity follows how squarely the pin faces the viewer. */
  labels?: ReadonlyArray<HTMLElement | null>;
  /** A hold on a locked destination completed and was released: go there. */
  onGo?: (index: number) => void;
  /** The destination in the reticle changed (-1: none). */
  onLock?: (index: number) => void;
}

export class GlobeView {
  readonly engine: GlobeEngine;
  private readonly points: GlobePoint[];
  private readonly o: GlobeViewOptions;
  private readonly off: Array<() => void> = [];
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | 0 = 0;
  private open = false;
  private openAt = 0;
  private openFrom = 0;
  private openness = 0;
  private onScreen = true;
  private lastTick = 0;
  private lastScrollY = 0;
  /** The press in flight. */
  private readonly press = { id: -1, x: 0, y: 0, moved: 0, at: 0, left: 0, top: 0, r: 1 };
  private swallow = false;
  private lockShown = -1;
  private fillShown = '';
  private readyShown = false;
  private readonly painted: Array<{ transform: string; opacity: string; hit: boolean; z: number; near: string }> = [];
  private readonly order: number[] = [];
  private readonly out = new Float64Array(2);
  /** The ball's drawn state, read by the chrome renderer (lib/chrome BallState). */
  private readonly ball: {
    rot: Float32Array;
    ripples: Float32Array;
    field: Float32Array;
    fieldSize: number;
    version: number;
    soft: boolean;
    dots: [number, number, number];
    pins: Float32Array;
    pinCount: number;
    bleed: number;
  };
  private radius = 144;
  private shrink: ReturnType<typeof setTimeout> | 0 = 0;
  /** null: not tried or the renderer is not up yet; true: attached; false: this machine cannot draw a body. */
  private attached: boolean | null = null;
  private attachTries = 0;
  private chrome: typeof import('@/lib/chrome') | null = null;
  private disposed = false;

  constructor(options: GlobeViewOptions) {
    this.o = options;
    // The pins are always laid out at the open globe's radius: docked, their anchor is scaled down with the ball.
    this.radius = options.pinRadius?.() ?? 144;
    this.points = placePoints(options.points);
    this.engine = new GlobeEngine(this.points);
    this.ball = {
      rot: new Float32Array(9),
      ripples: new Float32Array(MAX_RIPPLES * 4).fill(-1),
      field: this.engine.dough.field,
      fieldSize: DOUGH_N,
      version: 0,
      soft: false,
      dots: [DOTS.docked[0], DOTS.docked[1], DOTS.docked[2]],
      pins: new Float32Array(MAX_PINS * 3),
      pinCount: Math.min(options.points, MAX_PINS),
      bleed: BALL_BLEED,
    };
    this.points.slice(0, MAX_PINS).forEach((p, i) => this.ball.pins.set([p.bx, p.by, p.bz], i * 3));
    for (let i = 0; i < options.points; i++) {
      this.painted.push({ transform: '', opacity: '', hit: true, z: -1, near: '' });
      this.order.push(i);
    }
    this.listen();
    void import('@/lib/chrome').then((m) => {
      if (this.disposed) return;
      this.chrome = m;
      this.wake();
    });
    this.wake();
  }

  /** The menu opened or closed. Open: destination `centre` glides to face the viewer and the drift stops. */
  setOpen(open: boolean, centre = 0): void {
    if (open === this.open) return;
    this.open = open;
    this.openFrom = this.openness;
    this.openAt = performance.now();
    this.engine.ambient = !open;
    // V2: the canvas is sized for the open globe only while it is open; docked it is the dock's own size.
    if (this.shrink) clearTimeout(this.shrink);
    this.shrink = 0;
    if (open) {
      this.radius = this.o.pinRadius?.() ?? 144;
      const size = this.o.openSize?.();
      if (size) this.o.stage.dataset.chromeMax = String(size);
    } else {
      this.shrink = setTimeout(() => {
        delete this.o.stage.dataset.chromeMax;
        this.chrome?.drawChrome();
      }, OPEN_MS + 40);
    }
    if (open) this.engine.face(centre);
    else {
      this.engine.drop();
      this.engine.rested(this.openAt);
      this.setLock(-1);
    }
    this.engine.invalidate();
    this.wake();
  }

  /** Glide until destination `index` faces the viewer (keyboard focus turns the globe). */
  face(index: number): void {
    this.engine.face(index);
    this.wake();
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.off.splice(0)) off();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) clearTimeout(this.timer);
    if (this.shrink) clearTimeout(this.shrink);
    this.raf = 0;
    this.timer = 0;
    this.chrome?.detachChromeBall(this.o.stage);
  }

  private listen(): void {
    const { stage } = this.o;
    const on = <T extends EventTarget>(
      target: T,
      type: string,
      fn: (e: never) => void,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, options);
      this.off.push(() => target.removeEventListener(type, fn as EventListener, options));
    };

    const down = (e: PointerEvent) => this.begin(e);
    on(stage, 'pointerdown', down);
    for (const surface of this.o.surfaces ?? []) if (surface) on(surface, 'pointerdown', down);

    // Move and up ride WINDOW listeners rather than pointer capture, which would retarget the release away from the
    // pin the press started on and break plain clicking.
    on(
      window,
      'pointermove',
      (e: PointerEvent) => {
        const p = this.press;
        if (e.pointerId !== p.id || !this.engine.dragging) return;
        p.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
        p.x = e.clientX;
        p.y = e.clientY;
        if (p.moved > DRAG_SLOP) this.swallow = true;
        this.engine.move((e.clientX - p.left - p.r) / p.r, (e.clientY - p.top - p.r) / p.r, performance.now());
        this.wake();
      },
      { passive: true },
    );
    const finish = (commit: boolean) => (e: PointerEvent) => {
      const p = this.press;
      if (e.pointerId !== p.id || !this.engine.dragging) return;
      p.id = -1;
      if (performance.now() - p.at > HOLD_MS) this.swallow = true;
      const go = this.engine.release(commit && this.open);
      if (!commit) this.swallow = false;
      stage.removeAttribute('data-grabbing');
      if (go >= 0) {
        this.swallow = true;
        this.o.onGo?.(go);
      }
      this.wake();
    };
    on(window, 'pointerup', finish(true));
    on(window, 'pointercancel', finish(false));
    // `pointerup` is not guaranteed to arrive (a mouse released over another window, an alt-tab mid-press), and a
    // hold that never ends would fill the ring with nobody touching anything.
    on(window, 'blur', () => {
      this.press.id = -1;
      this.swallow = false;
      this.engine.drop();
      stage.removeAttribute('data-grabbing');
      this.wake();
    });

    // A release that was a drag, or a completed hold, must not ALSO fire the control it started on.
    const click = (e: MouseEvent) => {
      if (!this.swallow) return;
      this.swallow = false;
      e.preventDefault();
      e.stopPropagation();
    };
    on(stage, 'click', click, { capture: true });
    for (const surface of this.o.surfaces ?? []) if (surface) on(surface, 'click', click, { capture: true });
    // A link that is being turned must not start a native link drag.
    on(stage, 'dragstart', (e: Event) => e.preventDefault());

    on(stage, 'pointerenter', (e: PointerEvent) => {
      if (e.pointerType === 'mouse') this.engine.hovering = true;
    });
    on(stage, 'pointerleave', () => {
      this.engine.hovering = false;
      this.wake();
    });

    (this.o.pins ?? []).forEach((pin, i) => {
      if (pin) on(pin, 'focus', () => this.face(i));
    });

    // A docked globe turns with the page. The offset is read in the scroll EVENT, where layout is clean.
    this.lastScrollY = window.scrollY;
    on(
      window,
      'scroll',
      () => {
        const y = window.scrollY;
        const dy = y - this.lastScrollY;
        this.lastScrollY = y;
        if (this.open || dy === 0 || !this.onScreen) return;
        this.engine.scroll(dy);
        this.wake();
      },
      { passive: true },
    );

    const wake = () => this.wake();
    on(document, 'visibilitychange', wake);
    on(window, 'focus', wake);
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        this.onScreen = entries.some((entry) => entry.isIntersecting);
        this.wake();
      });
      io.observe(stage);
      this.off.push(() => io.disconnect());
    }
  }

  private begin(e: PointerEvent): void {
    if (e.button > 0 || this.engine.dragging) return;
    // Beside the stage (the veil, the pins) a press takes hold only while the menu is open.
    if (e.currentTarget !== this.o.stage && !this.open) return;
    const rect = this.o.stage.getBoundingClientRect();
    const r = Math.max(1, rect.width / 2);
    const p = this.press;
    p.id = e.pointerId;
    p.x = e.clientX;
    p.y = e.clientY;
    p.moved = 0;
    p.at = performance.now();
    p.left = rect.left;
    p.top = rect.top;
    p.r = r;
    this.swallow = false;
    this.engine.grab((e.clientX - rect.left - r) / r, (e.clientY - rect.top - r) / r, p.at);
    this.o.stage.setAttribute('data-grabbing', '');
    this.wake();
  }

  /** May the idle drift tick? */
  private driftHz(): number {
    if (!this.onScreen || document.visibilityState !== 'visible' || !document.hasFocus()) return 0;
    if (document.documentElement.getAttribute('data-jelly-motion') === 'still') return 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    return window.matchMedia('(pointer: coarse)').matches ? DRIFT_HZ.coarse : DRIFT_HZ.fine;
  }

  private wake(): void {
    if (this.disposed || this.raf) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const e = this.engine;

    // The ambient tick: the drift advances on its own low clock, never per vsync.
    const hz = e.drifts ? this.driftHz() : 0;
    let tick = 0;
    if (hz <= 0) {
      this.lastTick = 0;
    } else if (this.lastTick === 0 || now - this.lastTick >= 1000 / hz - 2) {
      tick = this.lastTick > 0 ? Math.min(0.25, (now - this.lastTick) / 1000) : 1 / hz;
      this.lastTick = now;
    }

    // The dots change size with the globe (the M4 move).
    const target = this.open ? 1 : 0;
    let opening = false;
    if (this.openness !== target) {
      const u = Math.min(1, (now - this.openAt) / OPEN_MS);
      this.openness = this.openFrom + (target - this.openFrom) * u;
      opening = u < 1;
      e.invalidate();
    }

    // Focus never pins this globe's pose: docked, the stage IS the focused button after a close (it would never drift
    // again), and open it is not ambient, so it does not drift anyway.
    const { painted, busy } = e.step(now, { tick, focusInside: false });
    if (painted || this.attached === null) this.paint(now);
    this.signals();

    if (busy || opening) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    // At rest: nothing scheduled, or one timer to the next drift tick or to the moment an ambient globe lets go.
    let wait = Infinity;
    if (e.drifts) {
      const rate = this.driftHz();
      if (rate > 0) wait = Math.max(0, this.lastTick + 1000 / rate - performance.now());
    }
    if (this.attached === null) wait = Math.min(wait, ATTACH_RETRY_MS);
    const letGo = e.letGoIn(performance.now());
    if (letGo > 0) wait = Math.min(wait, letGo);
    if (wait === Infinity) return;
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.wake();
    }, wait);
  };

  private paint(now: number): void {
    const e = this.engine;
    const ball = this.ball;
    ball.rot.set(e.drawM);
    e.ripplesInto(ball.ripples, now);
    ball.field = e.dough.field;
    ball.version = e.dough.version;
    ball.soft = e.soft;
    const k = this.openness;
    ball.dots[0] = DOTS.docked[0] + (DOTS.open[0] - DOTS.docked[0]) * k;
    const dockedDots = this.o.pins ? 0 : DOTS.docked[1];
    ball.dots[1] = dockedDots + (DOTS.open[1] - dockedDots) * k;
    ball.dots[2] = DOTS.docked[2] + (DOTS.open[2] - DOTS.docked[2]) * k;
    if (this.chrome) {
      if (this.attached === null) {
        this.attached = this.chrome.attachChromeBall(this.o.stage, ball, BALL_FRAGMENT_SHADER);
        // The renderer starts at idle (lib/chrome/install.ts): the loop looks again shortly, a bounded number of times.
        if (this.attached === null && ++this.attachTries > ATTACH_TRIES) this.attached = false;
      }
      if (this.attached) this.chrome.drawChrome();
    }
    this.paintPins(now);
  }

  /** Compositor-only writes, and only the ones whose value changed. */
  private paintPins(now: number): void {
    const pins = this.o.pins;
    if (!pins) return;
    const e = this.engine;
    const R = this.radius;
    const labels = this.o.labels;
    const m = e.drawM;
    const order = this.order;
    // Depth rank, not depth: it survives most frames untouched.
    order.sort((a, b) => e.pz[a]! - e.pz[b]!);
    for (let rank = 0; rank < order.length; rank++) {
      const i = order[rank]!;
      const el = pins[i];
      const last = this.painted[i];
      if (!el || !last) continue;
      const b = this.points[i]!;
      // The DRAWN position: the wobble and the ripple's swell move the pin; the lock reads the true one.
      const x = m[0]! * b.bx + m[1]! * b.by + m[2]! * b.bz;
      const y = m[3]! * b.bx + m[4]! * b.by + m[5]! * b.bz;
      const z = m[6]! * b.bx + m[7]! * b.by + m[8]! * b.bz;
      const depth = kAt(z);
      const swell = 1 + e.waveAt(b, now);
      let sx = x * depth * swell;
      let sy = y * depth * swell;
      if (e.soft) {
        e.dough.deform(sx, sy, this.out, z);
        sx = this.out[0]!;
        sy = this.out[1]!;
      }
      const transform = `translate3d(${(sx * R).toFixed(2)}px, ${(sy * R).toFixed(2)}px, 0) scale(${depth.toFixed(3)})`;
      if (transform !== last.transform) {
        last.transform = transform;
        el.style.transform = transform;
      }
      // Chrome is opaque: a destination on the far side is out of sight, and it comes round the limb.
      const opacity = smoothstep(-0.05, 0.12, z).toFixed(3);
      if (opacity !== last.opacity) {
        last.opacity = opacity;
        el.style.opacity = opacity;
      }
      if (rank !== last.z) {
        last.z = rank;
        el.style.zIndex = String(rank + 1);
      }
      // A label shows only once its pin squarely faces the viewer, so a dozen names never pile up at the limb.
      const near = smoothstep(0.34, 0.78, z).toFixed(2);
      if (near !== last.near) {
        last.near = near;
        const label = labels?.[i];
        if (label) label.style.setProperty('--near', near);
      }
      const hit = z > 0.02;
      if (hit !== last.hit) {
        last.hit = hit;
        el.style.pointerEvents = hit ? '' : 'none';
      }
    }
  }

  private setLock(index: number): void {
    if (index === this.lockShown) return;
    const pins = this.o.pins;
    if (this.lockShown >= 0) pins?.[this.lockShown]?.removeAttribute('data-locked');
    if (index >= 0) pins?.[index]?.setAttribute('data-locked', '');
    this.lockShown = index;
    this.o.onLock?.(index);
    if (index >= 0) vibrate(6);
  }

  /** The lock and the dwell ring: state the visitor reads, written only when it changes. */
  private signals(): void {
    if (!this.open) return;
    const e = this.engine;
    this.setLock(e.lock);
    const fill = e.fill.toFixed(3);
    if (fill !== this.fillShown) {
      this.fillShown = fill;
      this.o.reticle?.style.setProperty('--fill', fill);
    }
    if (e.ready !== this.readyShown) {
      this.readyShown = e.ready;
      if (e.ready) {
        this.o.reticle?.setAttribute('data-ready', '');
        vibrate([10, 30, 16]);
      } else this.o.reticle?.removeAttribute('data-ready');
    }
  }
}
