'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type Ref,
} from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { vibrate } from '@/lib/shared/platform';
import type { NavLeaf } from '@/lib/sidebar-nav';

/**
 * The **liquid globe** navigator — the site's navigation as a glass sphere you
 * turn to find where you want to go.
 *
 * Every destination is a pin on a unit sphere. Drag (pointer or finger) anywhere
 * on the stage to spin it; release and it coasts. Bring a pin into the **reticle**
 * at the front of the globe and it locks on; hold — keep the pointer down — and
 * the reticle's ring **fills**. Let go once it is full and you land on that page.
 * Let go early, or drag the pin back out, and the ring drains and nothing happens,
 * so the gesture is always cancellable right up to the release.
 *
 * ## Why it is built this way
 *
 * - **One rAF loop, bounded by mount.** The hub only renders this component while
 *   the menu is up (`RadialHub` gates it on the phase), so the loop cannot outlive
 *   the overlay; it is cancelled on unmount. Per frame it does ~12 pins of trig and
 *   writes `transform`/`opacity`/one custom property per pin — compositor-only
 *   properties, no layout reads, and the writes are skipped entirely on a frame
 *   where nothing changed.
 * - **Nothing above a `backdrop-filter`.** This is the thing that moves, and it
 *   moves continuously, so the overlay under it must not be a viewport-sized
 *   backdrop-filter (Chromium re-blurs such a layer *in full* whenever anything
 *   above it moves — measured at ~10fps in this exact stack; see
 *   `components/radial/README.md`). `.radial-hub__veil` is a plain painted veil
 *   for exactly this reason. Do not "restore the frost".
 * - **The pins are real links.** They carry their own href, so click, middle-click,
 *   Enter and screen-reader navigation all work without the gesture. Focusing one
 *   with the keyboard *glides* the globe until that pin faces front, which keeps
 *   the visual and the focus ring telling the same story.
 */

const DEG = Math.PI / 180;

/** Degrees of rotation per pixel dragged. A full turn is ~800px of travel. */
const ROT_PER_PX = 0.45;
/** How far the globe may be tilted, so the poles never come to the reticle. */
const PITCH_LIMIT = 62;
/** Inertia half-life: velocity decays by `e^(-DAMP·dt)` once you let go. */
const DAMP = 3.4;
/** Below this angular speed (deg/s) the coast is over and the snap takes over. */
const SNAP_SPEED = 34;
/** Exponential approach rate of the snap / keyboard glide. */
const EASE_RATE = 9;
/** Idle drift (deg/s) — only while nothing is locked on and nothing is held. */
const IDLE_SPIN = 5.5;
/** How long a locked-on pin must be held before the ring is full. */
const DWELL_MS = 620;
/** The ring drains faster than it fills, so a mis-lock costs nothing. */
const DRAIN_SCALE = 0.42;
/** Total pointer travel (px) past which a release is a drag, not a click. */
const DRAG_SLOP = 8;
/** Runaway flick guard, in deg/s. */
const MAX_SPIN = 900;

/**
 * Perspective, as a multiple of the stage's width. The projection below and the
 * CSS `perspective` on the stage read the SAME number (the component hands it to
 * CSS inline), because the wireframe sphere is drawn by CSS 3D while the pins are
 * projected here — if the two disagreed, the pins would slide off the surface
 * they are supposed to be stuck to.
 */
const PERSP = 3.1;
/** Foreshortening at depth `z` on the unit sphere (z = 1 front, −1 back). */
const kAt = (z: number) => PERSP / (PERSP - z * 0.5);

/**
 * Reticle radius, as a planar distance on the unit sphere. Every pin sits ON the
 * sphere, so a planar distance of `d` from the centre means the pin is `asin(d)`
 * off the viewing axis — 0.26 is a ~15° cone. The Fibonacci placement below keeps
 * neighbours ~50° apart at the counts this nav runs at, so at most one pin can be
 * inside the reticle at a time and the lock is never ambiguous.
 */
const RETICLE = 0.26;
/**
 * Magnetism: a pin this close is eased to dead centre once the spin settles.
 * 0.55 is a ~33° capture cone, which at this nav's size leaves very few
 * orientations with nothing in reach — so a release almost always parks on
 * something you can hold, instead of on empty ocean.
 */
const SNAP_R = 0.55;
/** The reticle's on-screen diameter, in % of the stage — derived, never re-typed. */
const RETICLE_PCT = RETICLE * kAt(1) * 100;

/**
 * Latitude band the pins are distributed over, as `sin(lat)`. Capping it at 0.72
 * (±46°) keeps every destination clear of the poles: a pin at a pole can only be
 * centred by tilting the globe past `PITCH_LIMIT`, i.e. it could never be chosen.
 */
const LAT_SPAN = 0.72;
/** Golden angle — the classic even-ish spherical distribution. */
const GOLDEN_DEG = 180 * (3 - Math.sqrt(5));

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);
/** Smooth 0→1 ramp across [a, b]. */
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** The nearest angle equivalent to `to`, measured from `from` — no long way round. */
const shortestAngle = (from: number, to: number) =>
  from + ((((to - from) % 360) + 540) % 360) - 180;

interface GlobeNode extends NavLeaf {
  /** Where the pin is fixed on the sphere. */
  lat: number;
  lon: number;
  /** Direction cosines, precomputed — the projection runs these every frame. */
  bx: number;
  by: number;
  bz: number;
}

/**
 * Fibonacci-sphere placement, squeezed into the usable latitude band. Deterministic
 * from the destination list, so the same account always finds the same face of the
 * globe in the same place — this is navigation, and muscle memory is the point.
 */
function place(items: NavLeaf[]): GlobeNode[] {
  const n = items.length;
  return items.map((item, i) => {
    const sinLat = n <= 1 ? 0 : (1 - (2 * (i + 0.5)) / n) * LAT_SPAN;
    const lat = Math.asin(sinLat) / DEG;
    const lon = ((i * GOLDEN_DEG) % 360) - 180;
    const cl = Math.cos(lat * DEG);
    return {
      ...item,
      lat,
      lon,
      // Screen-handed: x right, y DOWN, z toward the viewer — the same axes CSS
      // 3D uses, so the projection and the wireframe's transform agree.
      bx: cl * Math.sin(lon * DEG),
      by: -Math.sin(lat * DEG),
      bz: cl * Math.cos(lon * DEG),
    };
  });
}

/** Meridians and parallels of the drawn wireframe (degrees). */
const MERIDIANS = [0, 30, 60, 90, 120, 150];
const PARALLELS = [-60, -40, -20, 0, 20, 40, 60];

interface LiquidGlobeProps {
  /** Destinations, already filtered for auth/admin by the hub. */
  items: NavLeaf[];
  /** Current route, so the globe can open oriented near where you already are. */
  pathname: string;
  /** Dismiss the hub (called before every navigation this component performs). */
  onDismiss: () => void;
  /** −1 while the hub is closing, so nothing here is tabbable behind the fade. */
  tabIndex: number;
  /**
   * The hub moves focus here once the globe has bloomed. It lands on the ROOT
   * (`tabIndex={-1}`), not on the first pin: focusing a pin glides the globe to
   * face it, which would throw away the "you are here" orientation the moment the
   * menu opened.
   */
  rootRef?: Ref<HTMLDivElement>;
}

export function LiquidGlobe({ items, pathname, onDismiss, tabIndex, rootRef }: LiquidGlobeProps) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const reduced = useReducedMotion();

  const nodes = useMemo(() => place(items), [items]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const sphereRef = useRef<HTMLDivElement | null>(null);
  const reticleRef = useRef<HTMLDivElement | null>(null);
  const pinRefs = useRef<Array<HTMLLIElement | null>>([]);

  // Everything the frame loop touches lives in refs: a 60Hz React render for a
  // rotation nobody reads in JSX would be the whole cost of this component.
  const rot = useRef({ yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 });
  const drag = useRef({ active: false, id: -1, x: 0, y: 0, moved: 0, held: false });
  const lastMoveAt = useRef(0);
  const glide = useRef<{ yaw: number; pitch: number } | null>(null);
  const fill = useRef(0);
  const lockRef = useRef(-1);
  const readyRef = useRef(false);
  const sizeRef = useRef(320);
  const dirty = useRef(true);
  /**
   * Whether the visitor has taken hold of the globe yet (a press, or a keyboard
   * focus). It switches the loop between its two moods, and they are mutually
   * exclusive on purpose: UNTOUCHED it drifts and never snaps, so an idle globe
   * keeps turning and reads as alive; TOUCHED it snaps and never drifts, so once
   * you are aiming, nothing moves the target out from under you. Letting both run
   * gave the worst of each — the globe drifted until the magnetism caught the
   * first pin it passed, then parked there for good.
   */
  const touched = useRef(false);
  /** Set when a release has already been spent (on a drag, or on a dwell jump). */
  const swallowClick = useRef(false);

  // Only these three reach the render: the caption, the ring's state classes.
  const [lock, setLock] = useState(-1);
  const [ready, setReady] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  /**
   * Open oriented on the page you are already on, held clear of the reticle: the
   * offset is wide enough that the current page is outside the SNAP cone
   * (`asin(SNAP_R)` ≈ 27°), so "you are here" is legible without the magnetism
   * immediately dragging it in — which would arm a hold to re-open the page the
   * visitor is already looking at.
   */
  useEffect(() => {
    const here = nodes.findIndex((n) =>
      n.href === '/' ? pathname === '/' : pathname === n.href || pathname.startsWith(`${n.href}/`),
    );
    const n = here >= 0 ? nodes[here] : null;
    rot.current.yaw = n ? -n.lon + 42 : 12;
    rot.current.pitch = n ? clamp(-n.lat + 9, -PITCH_LIMIT, PITCH_LIMIT) : -8;
    rot.current.vYaw = 0;
    rot.current.vPitch = 0;
    dirty.current = true;
    // Orientation is chosen once per mount (the hub mounts this on open), not on
    // every route change behind an open menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The stage is square and sized by a clamp, so its px size changes with the
  // viewport. Measured once and on resize — never read inside the frame loop.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // `offsetWidth`, not `getBoundingClientRect()`: the globe scales during its
    // opening bloom, and a rect would report the mid-animation scaled width and
    // wedge every pin at whatever radius that frame happened to have.
    const read = () => {
      sizeRef.current = el.offsetWidth || 320;
      dirty.current = true;
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = useCallback(
    (node: GlobeNode) => {
      vibrate(18);
      swallowClick.current = true;
      if (node.external) {
        window.location.href = node.href;
        return;
      }
      onDismiss();
      void navigate({ to: node.href } as never);
    },
    [navigate, onDismiss],
  );

  /* ── The frame loop ───────────────────────────────────────────────────────
     integrate → project → magnetism → paint → dwell. It runs for as long as the
     menu is open and stops dead on unmount; a frame where nothing moved and
     nothing is filling writes nothing to the DOM.

     Projection and painting are deliberately SEPARATE passes. The magnetism in
     step 3 needs to know which pin is nearest the reticle, and it moves the globe
     in response — so the projection has to run before it and the paint after it,
     or the pins are drawn a frame behind the rotation they were computed from
     (which, with the paint gated on `dirty`, showed up as pins that froze
     mid-snap while the wireframe kept turning under them). Projecting twice on a
     snapping frame is a dozen sin/cos; painting stale is a visible bug. */
  useEffect(() => {
    const count = nodes.length;
    // Scratch, allocated once per node-set: the loop must not allocate.
    const px = new Float64Array(count);
    const py = new Float64Array(count);
    const pz = new Float64Array(count);
    let lockIdx = -1;
    let snapIdx = -1;

    /** Screen-space position + depth of every pin, and what the reticle holds. */
    const project = () => {
      const r = rot.current;
      // Yaw about Y, then pitch about X — the same order as the sphere's
      // `rotateX(pitch) rotateY(yaw)`, which is what keeps the projected pins
      // glued to the drawn wireframe.
      const cy = Math.cos(r.yaw * DEG);
      const sy = Math.sin(r.yaw * DEG);
      const cp = Math.cos(r.pitch * DEG);
      const sp = Math.sin(r.pitch * DEG);
      let lockD = Infinity;
      let snapD = Infinity;
      lockIdx = -1;
      snapIdx = -1;
      for (let i = 0; i < count; i++) {
        const n = nodes[i];
        const x1 = n.bx * cy + n.bz * sy;
        const z1 = -n.bx * sy + n.bz * cy;
        px[i] = x1;
        py[i] = n.by * cp - z1 * sp;
        pz[i] = n.by * sp + z1 * cp;
        if (pz[i] <= 0) continue;
        const d = Math.hypot(x1, py[i]);
        if (d < RETICLE && d < lockD) {
          lockD = d;
          lockIdx = i;
        }
        if (d < SNAP_R && d < snapD) {
          snapD = d;
          snapIdx = i;
        }
      }
    };

    const paint = () => {
      const R = sizeRef.current / 2;
      for (let i = 0; i < count; i++) {
        const el = pinRefs.current[i];
        if (!el) continue;
        const z = pz[i];
        const k = kAt(z);
        el.style.transform =
          `translate3d(${(px[i] * R * k).toFixed(2)}px, ${(py[i] * R * k).toFixed(2)}px, 0)` +
          ` scale(${k.toFixed(3)})`;
        // The far hemisphere stays faintly visible — it is what tells you there is
        // more globe to turn to — but it never takes a click.
        el.style.opacity = (0.12 + 0.88 * smoothstep(-0.5, 0.45, z)).toFixed(3);
        el.style.zIndex = String(200 + Math.round(z * 180));
        el.style.pointerEvents = z > 0.02 ? 'auto' : 'none';
        // Labels resolve only for the handful of pins actually facing you, so a
        // dozen names never pile up in the middle of the sphere.
        el.style.setProperty('--near', smoothstep(0.34, 0.78, z).toFixed(3));
      }
      const r = rot.current;
      if (sphereRef.current) {
        sphereRef.current.style.transform = `rotateX(${r.pitch.toFixed(2)}deg) rotateY(${r.yaw.toFixed(2)}deg)`;
      }
    };

    let raf = 0;
    let last = 0;

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;

      const r = rot.current;
      const stationary = now - lastMoveAt.current > 110;

      // 1. Motion. Dragging writes the rotation directly (in the pointer handler);
      //    everything here is what happens when you are NOT dragging.
      if (!drag.current.active) {
        if (glide.current) {
          const k = reduced ? 1 : 1 - Math.exp(-EASE_RATE * dt);
          const gy = shortestAngle(r.yaw, glide.current.yaw);
          r.yaw += (gy - r.yaw) * k;
          r.pitch += (glide.current.pitch - r.pitch) * k;
          if (Math.abs(gy - r.yaw) < 0.15 && Math.abs(glide.current.pitch - r.pitch) < 0.15) {
            r.yaw = gy;
            r.pitch = glide.current.pitch;
            glide.current = null;
          }
          dirty.current = true;
        } else {
          const decay = Math.exp(-DAMP * dt);
          r.vYaw *= decay;
          r.vPitch *= decay;
          if (Math.abs(r.vYaw) > 1 || Math.abs(r.vPitch) > 1) {
            r.yaw += r.vYaw * dt;
            r.pitch = clamp(r.pitch + r.vPitch * dt, -PITCH_LIMIT, PITCH_LIMIT);
            dirty.current = true;
          } else {
            r.vYaw = 0;
            r.vPitch = 0;
          }
        }
      }

      // 2. Where everything is now, and what the reticle is holding.
      project();

      // 3. Magnetism. Once the coast is over, a pin inside the snap cone is eased
      //    to dead centre — including while you hold still with the pointer down,
      //    which is what makes "hold to fill" land reliably on a phone.
      let moved = false;
      if (
        touched.current &&
        !glide.current &&
        stationary &&
        Math.abs(r.vYaw) < SNAP_SPEED &&
        snapIdx >= 0
      ) {
        const n = nodes[snapIdx];
        const k = reduced ? 1 : 1 - Math.exp(-EASE_RATE * dt);
        const ty = shortestAngle(r.yaw, -n.lon);
        const tp = clamp(-n.lat, -PITCH_LIMIT, PITCH_LIMIT);
        if (Math.abs(ty - r.yaw) > 0.05 || Math.abs(tp - r.pitch) > 0.05) {
          r.yaw += (ty - r.yaw) * k;
          r.pitch += (tp - r.pitch) * k;
          moved = true;
        }
      } else if (!touched.current && !reduced) {
        // Untouched: drift, so a globe left alone still reads as a globe rather
        // than a picture of one. It stops for good the moment anyone takes hold.
        r.yaw += IDLE_SPIN * dt;
        moved = true;
      }
      if (moved) {
        dirty.current = true;
        project();
      }

      // 4. One paint, from the rotation the lock below was actually computed from.
      if (dirty.current) {
        paint();
        dirty.current = false;
      }

      // 5. The dwell ring. It only fills while the pointer is DOWN on a locked-on
      //    pin, so nothing can ever navigate without a deliberate hold-and-release
      //    — drag away, or let go early, and it drains.
      if (lockIdx !== lockRef.current) {
        lockRef.current = lockIdx;
        fill.current = 0;
        setLock(lockIdx);
        if (readyRef.current) {
          readyRef.current = false;
          setReady(false);
        }
        if (lockIdx >= 0) vibrate(6);
      }
      const holding = drag.current.held && lockIdx >= 0;
      const next = holding
        ? fill.current + (dt * 1000) / DWELL_MS
        : fill.current - (dt * 1000) / (DWELL_MS * DRAIN_SCALE);
      const clamped = clamp01(next);
      if (clamped !== fill.current) {
        fill.current = clamped;
        reticleRef.current?.style.setProperty('--fill', clamped.toFixed(3));
      }
      if (clamped >= 1 && !readyRef.current) {
        readyRef.current = true;
        setReady(true);
        vibrate([10, 30, 16]);
      } else if (clamped < 1 && readyRef.current) {
        readyRef.current = false;
        setReady(false);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [nodes, reduced]);

  /* ── Pointer ──────────────────────────────────────────────────────────────
     `pointerdown` is taken on the stage (so a press that lands on a pin still
     grabs the globe); move/up ride WINDOW listeners rather than pointer capture,
     which would retarget the release away from the pin the press started on and
     break plain clicking. */
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    drag.current = {
      active: true,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: 0,
      held: true,
    };
    rot.current.vYaw = 0;
    rot.current.vPitch = 0;
    glide.current = null;
    touched.current = true;
    swallowClick.current = false;
    lastMoveAt.current = performance.now();
    setGrabbing(true);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.moved > DRAG_SLOP) swallowClick.current = true;

      const now = performance.now();
      const span = Math.max(8, now - lastMoveAt.current) / 1000;
      lastMoveAt.current = now;

      const dYaw = dx * ROT_PER_PX;
      const dPitch = -dy * ROT_PER_PX;
      const r = rot.current;
      r.yaw += dYaw;
      r.pitch = clamp(r.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT);
      r.vYaw = clamp(dYaw / span, -MAX_SPIN, MAX_SPIN);
      r.vPitch = clamp(dPitch / span, -MAX_SPIN, MAX_SPIN);
      dirty.current = true;
    };

    const finish = (e: PointerEvent, commit: boolean) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.id) return;
      d.active = false;
      d.held = false;
      setGrabbing(false);
      // The whole gesture, in one line: a full ring at the moment you let go is
      // the navigation. Anything else just leaves the globe where you put it.
      if (commit && readyRef.current && lockRef.current >= 0) go(nodes[lockRef.current]);
    };

    const onUp = (e: PointerEvent) => finish(e, true);
    const onCancel = (e: PointerEvent) => finish(e, false);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [go, nodes]);

  /**
   * A release that has already been spent — on a drag, or on a completed dwell —
   * must not ALSO fire the link it happens to have started on. Captured on the
   * way down so it beats the anchor's own handler.
   */
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * Keyboard: focusing a pin turns the globe until that pin faces you. It counts
   * as taking hold — otherwise the idle drift would immediately carry the pin the
   * focus ring is sitting on back off the front of the sphere.
   */
  const faceNode = useCallback((n: GlobeNode) => {
    glide.current = { yaw: -n.lon, pitch: clamp(-n.lat, -PITCH_LIMIT, PITCH_LIMIT) };
    rot.current.vYaw = 0;
    rot.current.vPitch = 0;
    touched.current = true;
    dirty.current = true;
  }, []);

  const locked = lock >= 0 ? nodes[lock] : null;
  const lockedLabel = locked ? t(locked.tKey, { defaultValue: locked.label }) : null;
  const LockedIcon = locked?.icon as LucideIcon | undefined;

  return (
    <div
      ref={rootRef}
      className="radial-globe"
      tabIndex={-1}
      aria-label={t('globe-label', {
        defaultValue: 'Navigation globe — drag to spin, hold on a destination, let go to open',
      })}
      data-locked={locked ? 'true' : undefined}
      data-ready={ready ? 'true' : undefined}
      style={
        { '--globe-persp': PERSP, '--reticle-d': `${RETICLE_PCT.toFixed(2)}%` } as CSSProperties
      }
    >
      <div
        ref={stageRef}
        className="radial-globe__stage"
        data-grabbing={grabbing ? 'true' : undefined}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
      >
        {/* WIREFRAME — a real CSS 3D sphere: meridians are circles turned about Y,
            parallels are circles laid flat and lifted along it. One transform on
            the parent turns the whole cage, so the cage costs one style write a
            frame no matter how many rings it has. */}
        <div ref={sphereRef} className="radial-globe__sphere" aria-hidden>
          {MERIDIANS.map((a) => (
            <span
              key={`m${a}`}
              className={
                'radial-globe__ring radial-globe__ring--meridian' +
                (a === 0 ? ' radial-globe__ring--major' : '')
              }
              style={{ '--a': `${a}deg` } as CSSProperties}
            />
          ))}
          {PARALLELS.map((latitude) => (
            <span
              key={`p${latitude}`}
              className={
                'radial-globe__ring radial-globe__ring--parallel' +
                (latitude === 0 ? ' radial-globe__ring--major' : '')
              }
              style={
                {
                  '--ty': `${(-Math.sin(latitude * DEG) * 50).toFixed(3)}%`,
                  '--s': Math.cos(latitude * DEG).toFixed(4),
                } as CSSProperties
              }
            />
          ))}
        </div>

        {/* The glass body itself: a flat disc of shading over the cage, so the
            wireframe reads as structure suspended INSIDE a liquid ball rather
            than as a drawing on top of one. */}
        <span className="radial-globe__glass" aria-hidden />

        {/* PINS — projected here rather than placed in the 3D cage, so their type
            stays flat, crisp and billboarded instead of skewing with the sphere. */}
        <ul
          className="radial-globe__pins"
          role="menu"
          aria-label={t('section-navigation', { defaultValue: 'Browse RMH Studios' })}
        >
          {nodes.map((n, i) => {
            const Icon = n.icon as LucideIcon;
            const label = t(n.tKey, { defaultValue: n.label });
            const isLocked = lock === i;
            const cls = 'radial-globe__pin' + (isLocked ? ' is-locked' : '');
            const shared = {
              className: cls,
              role: 'menuitem' as const,
              tabIndex,
              draggable: false,
              'aria-label': label,
              onFocus: () => faceNode(n),
              onClick: onDismiss,
            };
            return (
              <li
                key={n.id}
                role="none"
                className="radial-globe__pin-wrap"
                style={{ '--i': i } as CSSProperties}
                ref={(el) => {
                  pinRefs.current[i] = el;
                }}
              >
                {n.external ? (
                  <a href={n.href} {...shared}>
                    <span className="radial-globe__pin-dot">
                      <Icon aria-hidden />
                    </span>
                    <span className="radial-globe__pin-name">{label}</span>
                  </a>
                ) : (
                  <Link to={n.href} {...shared}>
                    <span className="radial-globe__pin-dot">
                      <Icon aria-hidden />
                    </span>
                    <span className="radial-globe__pin-name">{label}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {/* RETICLE — the target, and the dwell ring that fills inside it. */}
        <div ref={reticleRef} className="radial-globe__reticle" aria-hidden>
          <span className="radial-globe__reticle-ring" />
        </div>
      </div>

      {/* READOUT — what is locked on, and what to do about it. Polite-live so the
          lock is announced without interrupting. */}
      <div className="radial-globe__readout" aria-live="polite">
        <p className="radial-globe__name">
          {LockedIcon && <LockedIcon aria-hidden />}
          <span>
            {lockedLabel ?? t('globe-idle', { defaultValue: 'Turn the globe to explore' })}
          </span>
        </p>
        <p className="radial-globe__hint">
          {locked
            ? ready
              ? t('globe-release', { defaultValue: 'Let go to open' })
              : t('globe-hold', { defaultValue: 'Hold to lock on' })
            : t('globe-drag', { defaultValue: 'Drag to spin · hold on a place · let go' })}
        </p>
      </div>
    </div>
  );
}
