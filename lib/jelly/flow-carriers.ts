/**
 * The CSS flow carriers: the moving haze for every jelly surface the shader does not give a haze canvas (01 §3.2,
 * §3.5; master plan R2, R6; 04 §3.1, §3.3).
 *
 * A carrier is one clipped, `contain: strict` span injected as the host's FIRST child, holding two spans whose only
 * animated property is `transform` (app/jelly-material.css §3). The motion itself is pure CSS on the compositor; this
 * module only decides WHICH hosts carry one. It is a document service with no `requestAnimationFrame` and no
 * per-frame work: it runs when the jelly registry reports a change (visibility, membership, a rect refresh at scroll
 * end or resize), when the engine announces a haze canvas (`haze:change` on the jelly bus), and when the environment
 * changes (tier, `jellyMotion`, theme, game state).
 *
 * ## The DOM contract (binding, W1-D)
 *
 * ```html
 * <span class="jelly-flow" aria-hidden="true" style="--jelly-phase:-13.7s">
 *   <span class="jelly-flow__drift"></span>
 *   <span class="jelly-flow__current"></span>
 * </span>
 * ```
 *
 * The host gets `data-jelly-flow="on"` while its carrier is shown (that attribute isolates the host and lets the
 * static haze floor step aside). Fields add `.jelly-flow--rim-only`, and only ever on a wrapper (`.glass-inset`, a
 * non-void `[data-slot="input"]`): never on `input`, `textarea` or any void / replaced element, which cannot hold a
 * child. `--jelly-phase` is seeded once from the host's registry discovery order, so neighbours never pulse in sync.
 *
 * ## Budget
 *
 * The live set is the visible registry entries, ranked overlay → chrome → pane → fill → control then by distance to
 * the viewport centre ({@link rankEntries}), capped at `jellyBudget().carriers` (24 / 16 / 8, 0 under perf-lite,
 * still, game playing and every degraded state) and by the animated-area cap: `animatedViewports` × viewport area,
 * minus the area the engine's haze canvases already animate. Hosts over the cap keep the static haze floor.
 *
 * - **Offscreen:** a carrier whose host leaves the viewport is hidden at once (`hidden`, so it costs nothing) and
 *   removed after {@link OFFSCREEN_DETACH_MS}. Coming back inside that window un-hides the same node.
 * - **Haze canvas:** a host with `data-jelly-haze="on"` gets no carrier; the engine's haze owns its interior.
 * - **Ambient off** (`jellyMode().ambient === false`: still, degraded, game playing, hidden tab): every carrier is
 *   removed, not just paused.
 * - **Wide hosts:** the current band's travel scales with the host's width (~17 px/s at 1200 px). A per-host
 *   `--jelly-flow-speed` caps every carrier's surface drift at `AMBIENT_BOUNDS.maxDriftPxPerSecond` (12 px/s).
 * - **Scrolling:** nothing is attached while a scroll is in flight (the registry's rects are stale, and attaching
 *   during a fling is main-thread work at the worst moment); the registry refreshes at scroll end and the live set is
 *   re-ranked then. Carriers already running are paused through `html[data-scrolling]` (see below).
 *
 * ## React safety
 *
 * Carriers follow the same rule as `lib/liquid/runtime.ts`'s `.liquid-light`: a decorative, `aria-hidden` leaf that
 * React never knows about, added to a host React owns. React only ever inserts relative to its own nodes and removes
 * its own nodes, so a foreign first child survives keyed moves, inserts and removals. The one React path that would
 * wipe it is `setTextContent`: a host whose ONLY child is a string has its text replaced via `textContent`, which
 * deletes every child. Hosts with no element child (text-only or empty) are therefore never given a carrier, and as a
 * second line every pass re-inserts a carrier that was removed from under it. The service mounts from an idle
 * callback after hydration (`hooks/useLiquidInteractions.ts`), so it never adds nodes React is about to hydrate.
 *
 * ## `html[data-scrolling]`
 *
 * jelly-material.css pauses carriers under `html[data-scrolling]` (04 §3.3). `lib/scrollbar-reveal.ts` already stamps
 * that attribute on `<html>` for DOCUMENT scrolls (and on the scrolled element otherwise). This service stamps
 * `<html>` for scrolls of an inner scroller too, which is what full-screen app shells and dialogs scroll — but only
 * when the root itself does not overflow, because the same attribute reveals the root's scrollbar thumb, and showing
 * it while a menu scrolls would be wrong. It writes on the edges only (scroll start / scroll end), and it never removes
 * a stamp it did not set, so the scrollbar's 900 ms reveal is never cut short.
 */
import { jellyBus as defaultBus, type JellyBus } from './bus';
import {
  SCROLL_END_MS,
  jellyRegistry,
  rankEntries,
  takeWithin,
  type JellyEntry,
  type JellyRegistry,
} from './registry';
import {
  AMBIENT_BOUNDS,
  jellyBudget,
  jellyMode,
  onJellyEnvChange,
  type JellyBudget,
} from './tiers';

/** How long a carrier survives offscreen (hidden) before it is removed (04 §3.3). */
export const OFFSCREEN_DETACH_MS = 2000;

/** Seconds of `jelly-drift`'s period: the phase offset is spread over one period. */
const DRIFT_PERIOD_S = 29;

/** Never given a carrier: void / replaced elements and form controls cannot (or must not) hold a child. */
const VOID_TAGS = new Set([
  'input',
  'textarea',
  'select',
  'option',
  'img',
  'br',
  'hr',
  'canvas',
  'video',
  'audio',
  'iframe',
  'embed',
  'object',
  'svg',
  'area',
  'col',
  'meta',
  'link',
  'source',
  'track',
  'wbr',
]);

/** Per-host opt-outs on top of the registry's (which already drops `[data-jelly="off"]` and friends). */
const CARRIER_EXCLUDE =
  '[data-jelly-flow="off"],[data-jelly="lite"],[contenteditable="true"],[contenteditable=""],[data-slot="button"][data-variant="ghost"],[data-slot="button"][data-variant="link"]';

/** Fields: the carrier is a rim-only band so the caret's interior stays still (01 §5.5). */
const FIELD_SELECTOR = '.glass-inset,[data-slot="input"],[data-slot="textarea"]';

/**
 * The role speeds jelly-material.css §1 sets on each host (`--jelly-flow-speed`), so the cap can tell when a host is
 * already slow enough. Checked in this order; anything else runs at 1.
 */
const ROLE_SPEEDS: readonly (readonly [string, number])[] = [
  ['[data-slot="button"]', 1.2],
  ['.glass-overlay', 0.6],
  ['.glass-inset,[data-slot="input"],[data-slot="textarea"]', 0.6],
  ['.glass-chrome', 0.7],
];

/**
 * Surface speed of the carrier's paint, in px/s per unit of `--jelly-flow-speed`, derived from the keyframes in
 * jelly-material.css (spans are 140% of the host):
 *
 * - `jelly-current`: ±18% of the span over 36 s, linear → 0.36 × 1.4 × W / 36 = 0.014 W.
 * - `jelly-drift`: the largest segment is 7% of 1.4 W across and 5% of 1.4 H down in 14.5 s (half of 29 s), plus a
 *   5° turn about the span centre seen at the haze features (~0.3 × the span diagonal) →
 *   hypot(0.00676 W, 0.00483 H) + 0.00253 × hypot(W, H).
 *
 * The bound is the larger of the two. The theme gain (`--site-jelly-flow-speed`) is ≤ 1 in every theme and `calm`'s
 * tempo only slows things further, so the role speed is the worst case.
 */
export function driftPerSpeed(width: number, height: number): number {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const current = 0.014 * w;
  const drift = Math.hypot(0.00676 * w, 0.00483 * h) + 0.00253 * Math.hypot(w, h);
  return Math.max(current, drift);
}

/**
 * The `--jelly-flow-speed` a host may run at so its drift stays ≤ `AMBIENT_BOUNDS.maxDriftPxPerSecond`, or `null`
 * when the role speed is already within the bound (no inline override needed). Pure.
 */
export function cappedFlowSpeed(width: number, height: number, roleSpeed: number): number | null {
  const per = driftPerSpeed(width, height);
  if (per <= 0) return null;
  const max = AMBIENT_BOUNDS.maxDriftPxPerSecond / per;
  if (roleSpeed <= max) return null;
  // Floor to 2 dp so the rounded value can never exceed the bound.
  return Math.max(0.01, Math.floor(max * 100) / 100);
}

/**
 * The `--jelly-phase` for a host's discovery order: a negative delay spread over one drift period with the golden
 * ratio, so consecutive hosts land far apart in phase. Pure and stable.
 */
export function phaseFor(order: number): string {
  // +1 so the first host is not at phase 0 (every host starts mid-cycle).
  const frac = ((Math.abs(order) + 1) * 0.6180339887498949) % 1;
  return `${(-frac * DRIFT_PERIOD_S).toFixed(2)}s`;
}

export interface JellyFlowOptions {
  /** Defaults to the document's installed registry ({@link jellyRegistry}). No registry → the service is a no-op. */
  registry?: JellyRegistry | null;
  /** Defaults to the site-wide bus. */
  bus?: JellyBus;
  /**
   * The budget to honour. Defaults to `jellyBudget({ doc })`. The engine's governor can pass a governed budget here
   * (`governBudget(jellyBudget(), step)`) once it exposes its step.
   */
  budget?: () => JellyBudget;
}

interface Carrier {
  node: HTMLSpanElement;
  /** Inline `--jelly-flow-speed` this service wrote on the host, or null. */
  speed: number | null;
  /** Shown (attached, not hidden) right now. */
  shown: boolean;
  offTimer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Install the carrier service on `doc` and return its teardown, which removes every carrier, attribute, timer and
 * listener it added. SSR-safe (no window → no-op).
 */
export function installJellyFlow(doc: Document, options: JellyFlowOptions = {}): () => void {
  const win = doc?.defaultView;
  const registry = options.registry === undefined ? jellyRegistry(doc) : options.registry;
  if (!win || !registry) return () => {};
  const bus = options.bus ?? defaultBus;
  const budgetOf = options.budget ?? (() => jellyBudget({ doc }));
  const root = doc.documentElement;

  /** Every host that currently has a carrier node in its subtree (shown or hidden). */
  const carriers = new Map<Element, Carrier>();
  /** Kept across detaches so a returning host reuses its node and phase. */
  const nodes = new WeakMap<Element, HTMLSpanElement>();
  /** Per-host static eligibility (position, tag), read once. */
  const positioned = new WeakMap<Element, boolean>();

  let disposed = false;
  let active = jellyMode({ doc }).ambient;
  let passTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Carrier DOM ─────────────────────────────────────────────────────────────

  const build = (host: Element, order: number): HTMLSpanElement => {
    const node = doc.createElement('span');
    node.className = host.matches(FIELD_SELECTOR)
      ? 'jelly-flow jelly-flow--rim-only'
      : 'jelly-flow';
    node.setAttribute('aria-hidden', 'true');
    node.style.setProperty('--jelly-phase', phaseFor(order));
    const drift = doc.createElement('span');
    drift.className = 'jelly-flow__drift';
    const current = doc.createElement('span');
    current.className = 'jelly-flow__current';
    node.append(drift, current);
    return node;
  };

  const roleSpeed = (host: Element): number => {
    for (const [sel, speed] of ROLE_SPEEDS) if (host.matches(sel)) return speed;
    return 1;
  };

  const applySpeed = (host: Element, c: Carrier, rect: JellyEntry['rect']) => {
    const next = cappedFlowSpeed(rect.width, rect.height, roleSpeed(host));
    const style = (host as HTMLElement).style;
    if (!style) return;
    // A running animation jumps when its duration changes, so only rewrite on a real (> 10%) change.
    if (next === null) {
      if (c.speed !== null) {
        style.removeProperty('--jelly-flow-speed');
        c.speed = null;
      }
      return;
    }
    if (c.speed !== null && Math.abs(next - c.speed) <= c.speed * 0.1) return;
    style.setProperty('--jelly-flow-speed', String(next));
    c.speed = next;
  };

  const show = (entry: JellyEntry) => {
    const host = entry.el;
    let c = carriers.get(host);
    if (!c) {
      const node = nodes.get(host) ?? build(host, entry.order);
      nodes.set(host, node);
      c = { node, speed: null, shown: false, offTimer: undefined };
      carriers.set(host, c);
    }
    if (c.offTimer !== undefined) {
      clearTimeout(c.offTimer);
      c.offTimer = undefined;
    }
    // First child, re-inserted if React (or anyone) took it out from under us.
    if (c.node.parentNode !== host || host.firstChild !== c.node) {
      host.insertBefore(c.node, host.firstChild);
    }
    if (c.node.hidden) c.node.hidden = false;
    applySpeed(host, c, entry.rect);
    if (host.getAttribute('data-jelly-flow') !== 'on') host.setAttribute('data-jelly-flow', 'on');
    c.shown = true;
  };

  /** Remove the carrier from the host entirely. */
  const detach = (host: Element) => {
    const c = carriers.get(host);
    if (!c) return;
    if (c.offTimer !== undefined) clearTimeout(c.offTimer);
    carriers.delete(host);
    c.node.remove();
    if (c.speed !== null) (host as HTMLElement).style?.removeProperty('--jelly-flow-speed');
    if (host.getAttribute('data-jelly-flow') === 'on') host.removeAttribute('data-jelly-flow');
  };

  /** Hide now (no cost), remove after the offscreen grace period. */
  const park = (host: Element) => {
    const c = carriers.get(host);
    if (!c) return;
    if (c.shown) {
      c.node.hidden = true;
      c.shown = false;
      // The floor comes back while the carrier is parked.
      if (host.getAttribute('data-jelly-flow') === 'on') host.removeAttribute('data-jelly-flow');
    }
    if (c.offTimer === undefined) {
      c.offTimer = setTimeout(() => {
        c.offTimer = undefined;
        if (!disposed && !c.shown) detach(host);
      }, OFFSCREEN_DETACH_MS);
    }
  };

  const detachAll = () => {
    for (const host of [...carriers.keys()]) detach(host);
  };

  // ── Selection ───────────────────────────────────────────────────────────────

  const hazeOn = (el: Element) => el.getAttribute('data-jelly-haze') === 'on';

  /** Static checks that need no layout: tag, opt-outs, a child React will not wipe. */
  const structurallyEligible = (el: Element): boolean => {
    if (VOID_TAGS.has(el.tagName.toLowerCase())) return false;
    if (el.matches(CARRIER_EXCLUDE)) return false;
    // React replaces a lone string child via `textContent`, which would delete the carrier. Our own node does not
    // count: it is the first child once attached.
    const own = carriers.get(el)?.node ?? null;
    let elements = el.childElementCount;
    if (own && own.parentNode === el) elements--;
    return elements > 0;
  };

  const pass = () => {
    passTimer = undefined;
    if (disposed) return;
    if (!active) {
      detachAll();
      return;
    }
    // Rects are stale mid-fling and attaching is main-thread work; scroll end refreshes the registry and lands here.
    if (registry.scrolling) return;

    const budget = budgetOf();
    const visible = registry.visible();
    const viewportArea = Math.max(1, win.innerWidth * win.innerHeight);
    let hazeArea = 0;
    const candidates: JellyEntry[] = [];
    for (const e of visible) {
      if (hazeOn(e.el)) {
        hazeArea += e.rect.width * e.rect.height;
        continue;
      }
      if (e.rect.width <= 0 || e.rect.height <= 0) continue;
      if (!e.el.isConnected || !structurallyEligible(e.el)) continue;
      candidates.push(e);
    }

    // One style-read pass for hosts not seen before, before any write below (no read/write interleave).
    for (const e of candidates) {
      if (!positioned.has(e.el)) {
        let ok: boolean;
        try {
          ok = win.getComputedStyle(e.el).position !== 'static';
        } catch {
          ok = false;
        }
        positioned.set(e.el, ok);
      }
    }
    const placeable = candidates.filter((e) => positioned.get(e.el));

    const maxArea = Math.max(0, budget.animatedViewports * viewportArea - hazeArea);
    const count = Math.max(0, Math.floor(budget.carriers));
    const ranked = rankEntries(placeable, {
      x: win.innerWidth / 2,
      y: win.innerHeight / 2,
    });
    const live = count > 0 && maxArea > 0 ? takeWithin(ranked, count, maxArea) : [];
    const liveSet = new Set(live.map((e) => e.el));
    const visibleSet = new Set(visible.map((e) => e.el));

    // Writes: retire first (frees budget), then show.
    for (const host of [...carriers.keys()]) {
      if (liveSet.has(host)) continue;
      if (!host.isConnected || hazeOn(host) || visibleSet.has(host)) {
        // Gone, handed to a haze canvas, or visible but over budget: no grace period.
        detach(host);
      } else {
        park(host);
      }
    }
    for (const e of live) show(e);
  };

  const schedule = () => {
    if (disposed || passTimer !== undefined) return;
    passTimer = setTimeout(pass, 0);
  };

  // ── html[data-scrolling] ────────────────────────────────────────────────────

  let ownStamp = false;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const SCROLL_ATTR = 'data-scrolling';

  const endScroll = () => {
    if (scrollTimer !== undefined) clearTimeout(scrollTimer);
    scrollTimer = undefined;
    if (ownStamp) {
      ownStamp = false;
      root.removeAttribute(SCROLL_ATTR);
    }
  };
  const onScroll = (event: Event) => {
    const target = event.target as Node | null;
    const documentScroll = target === doc || target === root || target === doc.body;
    if (documentScroll) {
      // scrollbar-reveal owns the root stamp for document scrolls; never remove it from under it.
      ownStamp = false;
    } else if (!ownStamp && !root.hasAttribute(SCROLL_ATTR)) {
      // Edge only: one layout read per gesture start. A root that overflows would show its thumb under the stamp.
      const rootOverflows =
        root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth;
      if (!rootOverflows) {
        root.setAttribute(SCROLL_ATTR, '');
        ownStamp = true;
      }
    }
    if (ownStamp) {
      if (scrollTimer !== undefined) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(endScroll, SCROLL_END_MS);
    }
  };
  const onScrollEnd = () => {
    if (ownStamp) endScroll();
  };
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  doc.addEventListener('scrollend', onScrollEnd, { capture: true, passive: true });

  // ── Wiring ──────────────────────────────────────────────────────────────────

  const offRegistry = registry.onChange(schedule);
  const offHaze = bus.on('haze:change', ({ el, on }) => {
    if (on) detach(el);
    schedule();
  });
  const offEnv = onJellyEnvChange(() => {
    active = jellyMode({ doc }).ambient;
    if (!active) detachAll();
    schedule();
  }, doc);

  schedule();

  return () => {
    if (disposed) return;
    disposed = true;
    if (passTimer !== undefined) clearTimeout(passTimer);
    offRegistry();
    offHaze();
    offEnv();
    doc.removeEventListener('scroll', onScroll, { capture: true });
    doc.removeEventListener('scrollend', onScrollEnd, { capture: true });
    endScroll();
    detachAll();
  };
}
