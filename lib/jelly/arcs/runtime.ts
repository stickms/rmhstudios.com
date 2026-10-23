/**
 * `installElectricArcs(doc)`: composes the arc system and gates it (docs/plans/plasmatic-jelly/03-arcs.md §2.3, §6;
 * master plan R9, R10, R13).
 *
 * ## Gates
 *
 * **Global off** — no arcs of any kind, the layer is removed and every input listener is detached; only the
 * environment watchers stay:
 *
 * - `jellyMode().arcs === 'off'` (`lib/jelly/tiers.ts`): reduced transparency, forced colours, print, high contrast
 *   (site and app), `perf-lite`, a hidden tab, a playing game, `jellyMotion = still`, `electricArcs = off`;
 * - the radial hub open (`.radial-hub:not([data-phase="closed"])`) or an eversion in progress (`.eversion-overlay`) —
 *   tiers does not know about these, so this file checks them, through one body observer and again at every action.
 *
 * **Ambient only** — additionally needs `jellyMode().arcs === 'full'`, a finite `jellyBudget().ambientArcMinIntervalMs`
 * (handheld: 1 per 4s, R10), not a low-end device or Save-Data, the 3s warm-up after mount, and no quiet state
 * (scrolling, typing, drag, selection, modal, playing video — `scheduler.ts`).
 *
 * **Click arcs** use `jellyBudget().clickBolts` (handheld 1, coarse 2, full 3) and ignore quiet states.
 *
 * One flash ledger ({@link arcFlashLedger}) is shared by ambient, click, fizz, discharge and API arcs, and is the one
 * other site-wide flash sources (a rim pulse) should ask too.
 *
 * ## Candidates
 *
 * The shared jelly registry (`jellyRegistry()`) is the source. If nobody installed it yet, the runtime installs one
 * (reference-counted) and releases it on teardown. Its cached rects are turned into rounded rects once per registry
 * change — the corner radius is parsed from computed style only when an element's size changes — never per event.
 *
 * SSR-safe: nothing runs at import; the ledger is a pure object.
 */

import { innerRadius } from '../../liquid/glass/policy';
import { jellyBus, type JellyBus } from '../bus';
import { installJellyRegistry, jellyRegistry, type JellyRegistry } from '../registry';
import {
  FINE_POINTER_QUERY,
  jellyBudget,
  jellyMode,
  jellyOptedOut,
  onJellyEnvChange,
  type JellyBudget,
} from '../tiers';
import {
  createArcActions,
  installClickArcs,
  pressHost,
  type ArcActions,
  type DischargeOptions,
  type StrikeOptions,
} from './clicks';
import type { RoundedRect } from './geometry';
import { createFlashLedger, type FlashLedger } from './ledger';
import { selectCandidates } from './pairs';
import { ARC_BUDGET } from './rate';
import { createArcRenderer, type ArcRenderer, type LiveArc } from './renderer';
import { mulberry32 } from './rng';
import {
  createAmbientScheduler,
  createChargeBook,
  createQuietTracker,
  isEditable,
  type AmbientScheduler,
  type ArcCandidate,
  type QuietTracker,
} from './scheduler';

/** The site-wide flash ledger (≤ 3 onsets in any 1000ms, WCAG 2.3.1). */
export const arcFlashLedger: FlashLedger = createFlashLedger();

/** The hub is open or an eversion is running: arcs are off (§2.3 global-off list). */
export const HUB_OR_EVERSION_SELECTOR = '.radial-hub:not([data-phase="closed"]),.eversion-overlay';

/** Candidates inside these never arc. */
const CANDIDATE_BLOCK = '[aria-hidden="true"],[inert],[data-jelly-arcs="off"]';

/** Charge a soft-body release adds, per unit of release energy. */
const RELEASE_CHARGE = 0.5;

export interface ElectricArcsOptions {
  /** Use this registry instead of the document's shared one (tests). */
  registry?: JellyRegistry | null;
  bus?: JellyBus;
  ledger?: FlashLedger;
  seed?: number;
  warmupMs?: number;
}

export interface ElectricArcsRuntime {
  readonly doc: Document;
  /** Arcs are on (the layer exists). */
  readonly active: boolean;
  /** Ambient arcs may be scheduled (gates only; quiet states aside). */
  readonly ambient: boolean;
  /** The ambient timer is armed. */
  readonly ambientArmed: boolean;
  dischargeAt(x: number, y: number, opts?: DischargeOptions): boolean;
  strike(a: Element, b: Element, opts?: StrikeOptions): boolean;
  dispose(): void;
}

let current: ElectricArcsRuntime | null = null;

/** The installed runtime, or null (not installed, SSR). */
export function activeElectricArcs(): ElectricArcsRuntime | null {
  return current;
}

interface NavigatorHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** The glass engine's low-end heuristic: ≤ 2 cores, ≤ 2GB, or Save-Data → clicks only. */
function lowEndDevice(win: Window): boolean {
  const nav = win.navigator as NavigatorHints | undefined;
  if (!nav) return false;
  return (
    (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) ||
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    nav.connection?.saveData === true
  );
}

interface Live {
  renderer: ArcRenderer;
  actions: ArcActions;
  quiet: QuietTracker;
  scheduler: AmbientScheduler;
  teardown: (() => void)[];
}

export function installElectricArcs(doc: Document, opts: ElectricArcsOptions = {}): () => void {
  const win = doc?.defaultView;
  if (!win || !doc.body) return () => {};
  current?.dispose();

  let releaseRegistry: (() => void) | null = null;
  let registry = opts.registry === undefined ? jellyRegistry(doc) : opts.registry;
  if (!registry) {
    releaseRegistry = installJellyRegistry(doc);
    registry = jellyRegistry(doc);
  }
  const reg = registry;
  const bus = opts.bus ?? jellyBus;
  const ledger = opts.ledger ?? arcFlashLedger;
  const rand = mulberry32(opts.seed ?? (Math.random() * 0x100000000) >>> 0);
  const charge = createChargeBook();
  const lowEnd = lowEndDevice(win);
  const clock = () => win.performance?.now() ?? Date.now();
  let fineQuery: MediaQueryList | null = null;
  try {
    fineQuery = win.matchMedia(FINE_POINTER_QUERY);
  } catch {
    fineQuery = null;
  }

  let live: Live | null = null;
  let disposed = false;
  let warm = false;
  let ambientOk = false;
  let budget: JellyBudget = jellyBudget({ doc });

  // ── Candidates (cached per registry change) ────────────────────────────────
  const radii = new WeakMap<Element, { w: number; h: number; r: number }>();
  const radiusOf = (el: Element, w: number, h: number): number => {
    const hit = radii.get(el);
    if (hit && hit.w === w && hit.h === h) return hit.r;
    let r: number;
    try {
      const cs = win.getComputedStyle(el);
      r = Math.max(
        innerRadius(cs.borderTopLeftRadius, 0, w, h),
        innerRadius(cs.borderTopRightRadius, 0, w, h),
        innerRadius(cs.borderBottomRightRadius, 0, w, h),
        innerRadius(cs.borderBottomLeftRadius, 0, w, h),
      );
    } catch {
      r = 0;
    }
    radii.set(el, { w, h, r });
    return r;
  };
  const measure = (el: Element): RoundedRect | null => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return null;
    return { x: b.left, y: b.top, w: b.width, h: b.height, r: radiusOf(el, b.width, b.height) };
  };

  let candVersion = 0;
  let candCache: { version: number; list: ArcCandidate[] } | null = null;
  const candidates = (): readonly ArcCandidate[] => {
    if (candCache && candCache.version === candVersion) return candCache.list;
    const all: ArcCandidate[] = [];
    if (reg) {
      const active = doc.activeElement;
      for (const e of reg.visible()) {
        const el = e.el;
        if (el.closest(CANDIDATE_BLOCK)) continue;
        if (el === active && isEditable(el)) continue;
        const { left, top, width, height } = e.rect;
        all.push({
          el,
          rect: { x: left, y: top, w: width, h: height, r: radiusOf(el, width, height) },
        });
      }
    }
    const keep = selectCandidates(
      all.map((c) => c.rect),
      { w: win.innerWidth, h: win.innerHeight },
      ARC_BUDGET.maxCandidates,
    );
    candCache = { version: candVersion, list: keep.map((i) => all[i]) };
    return candCache.list;
  };

  const hubOrEversion = () => !!doc.querySelector(HUB_OR_EVERSION_SELECTOR);

  // ── Emission ───────────────────────────────────────────────────────────────
  const onStrike = (arc: LiveArc) => {
    if (bus.listenerCount('arc:strike') === 0) return;
    for (const c of arc.contacts) {
      if (!c.el) continue;
      // The payload's normal is INWARD: the direction of the kick.
      bus.emit('arc:strike', {
        el: c.el,
        x: c.x,
        y: c.y,
        nx: -c.nx,
        ny: -c.ny,
        energy: arc.energy,
        kind: arc.emitKind,
      });
    }
  };

  // ── On / off ───────────────────────────────────────────────────────────────
  const enable = (): Live => {
    const renderer = createArcRenderer(doc, { ledger, onStrike, now: clock });
    const actions = createArcActions({
      renderer,
      ledger,
      charge,
      rand,
      candidates,
      measure,
      clickBolts: () => budget.clickBolts,
    });
    const teardown: (() => void)[] = [];
    let scheduler: AmbientScheduler | null = null;
    const quiet = createQuietTracker(doc, {
      bus,
      scrolling: () => reg?.scrolling ?? false,
      onChange: () => scheduler?.poke(),
      onScroll: () => renderer.fade(),
      now: clock,
    });
    scheduler = createAmbientScheduler({
      candidates,
      quiet: () => !ambientOk || quiet.quiet(),
      minIntervalMs: () => (ambientOk ? budget.ambientArcMinIntervalMs : Infinity),
      multiplier: () => ((fineQuery?.matches ?? true) ? 1 : ARC_BUDGET.coarseMultiplier),
      fire: (a, b) => actions.strike(a.el, b.el, { kind: 'ambient' }),
      rand,
      now: clock,
      charge,
    });
    const sched = scheduler;
    teardown.push(
      installClickArcs(doc, {
        allowed: () => !!live && budget.clickBolts > 0 && !hubOrEversion(),
        actions,
      }),
    );
    if (reg) {
      teardown.push(
        reg.onChange(() => {
          candVersion++;
          sched.invalidate();
        }),
      );
    }
    return { renderer, actions, quiet, scheduler: sched, teardown };
  };

  const disable = () => {
    if (!live) return;
    const l = live;
    live = null;
    l.scheduler.stop();
    l.quiet.dispose();
    for (const fn of l.teardown) fn();
    l.renderer.dispose();
  };

  const evaluate = () => {
    if (disposed) return;
    const mode = jellyMode({ doc });
    budget = jellyBudget({ doc });
    if (doc.hidden) ledger.reset();
    if (mode.arcs === 'off' || budget.clickBolts <= 0 || hubOrEversion()) {
      ambientOk = false;
      disable();
      return;
    }
    ambientOk =
      warm && !lowEnd && mode.arcs === 'full' && Number.isFinite(budget.ambientArcMinIntervalMs);
    live ??= enable();
    live.scheduler.poke();
  };

  // ── Watchers (survive global off) ──────────────────────────────────────────
  const offEnv = onJellyEnvChange(evaluate, doc);
  // The hub's phase flips (attribute, anywhere) and the controller's overlay is appended to <body> (direct children
  // only — a subtree childList watch would fire on every render).
  const hubWatch = new win.MutationObserver(evaluate);
  hubWatch.observe(doc.body, { attributes: true, subtree: true, attributeFilter: ['data-phase'] });
  const overlayWatch = new win.MutationObserver(evaluate);
  overlayWatch.observe(doc.body, { childList: true });
  const offRelease = bus.on('body:release', ({ el, energy }) => {
    charge.add(el, RELEASE_CHARGE * Math.max(0, Math.min(1, energy)), clock());
  });
  const warmTimer = setTimeout(() => {
    warm = true;
    evaluate();
  }, opts.warmupMs ?? ARC_BUDGET.warmupMs);

  evaluate();

  const gateAction = (): Live | null => {
    if (!live || budget.clickBolts <= 0 || hubOrEversion()) return null;
    return live;
  };

  const runtime: ElectricArcsRuntime = {
    doc,
    get active() {
      return !!live;
    },
    get ambient() {
      return !!live && ambientOk;
    },
    get ambientArmed() {
      return !!live && live.scheduler.armed;
    },
    dischargeAt(x, y, o = {}) {
      const l = gateAction();
      if (!l) return false;
      const target = doc.elementFromPoint?.(x, y) ?? null;
      const host = pressHost(target);
      if (host) return l.actions.press(host, x, y, o.pointerType !== 'touch');
      if (
        target &&
        target.closest('[disabled],[aria-disabled="true"],[inert],[data-jelly-arcs="off"]')
      )
        return false;
      return l.actions.background(x, y);
    },
    strike(a, b, o) {
      const l = gateAction();
      if (!l) return false;
      if (jellyOptedOut(a) || jellyOptedOut(b)) return false;
      if (a.closest(CANDIDATE_BLOCK) || b.closest(CANDIDATE_BLOCK)) return false;
      return l.actions.strike(a, b, o);
    },
    dispose() {
      if (disposed) return;
      disable();
      disposed = true;
      clearTimeout(warmTimer);
      offEnv();
      hubWatch.disconnect();
      overlayWatch.disconnect();
      offRelease();
      releaseRegistry?.();
      if (current === runtime) current = null;
    },
  };
  current = runtime;
  return () => runtime.dispose();
}
