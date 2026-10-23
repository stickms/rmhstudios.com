/**
 * Plasmatic Jelly's single shared policy: who gets which budget, when the material is off, and the motion bounds
 * nothing may exceed (master plan §4.1, R3; plan 04 §3).
 *
 * ## Why one file
 *
 * Under Liquid Glass the engine's `off()`, `runtime.ts`'s `disabled()` and the arcs plan's global-off list each wrote
 * the same predicate by hand, and three copies of a predicate drift. Every jelly service — the shader engine, the CSS
 * carriers, the soft-body physics and the arcs — reads its tier, budget and off state from here, so a theme or
 * preference that switches the material off switches all of it off together.
 *
 * ## What decides the tier
 *
 * Only signals the site already stamps: `html.perf-lite` (`lib/perf-tier.ts`), the handheld query (copied exactly
 * from `handheld-tier.test.ts`, which scans this file for near-misses), `(hover: hover) and (pointer: fine)` and the
 * off predicate. The tier is computed per route and on media-query change and never flips on a frame-rate reading;
 * that is the governor's job (`governor.ts`), and the governor only turns engine-internal knobs down.
 *
 * ## Off versus tier
 *
 * {@link jellyOff} answers "may the MATERIAL layers draw" (canvases, haze, carriers, arcs) and is true under
 * `perf-lite` too, because the site stamps `perf-lite` in {@link DEGRADED_ROOT_SELECTOR} and the engine already drops
 * every canvas there. {@link jellyTier} keeps `perf-lite` apart as `'lite'` because press still works on a weak device
 * (04 §3.4). {@link jellyMode} folds both, plus the preferences and game state, into what each service may do now.
 *
 * SSR-safe: nothing here touches `window` or `document` at import, and every reader takes its document as an argument.
 */

export type JellyTier = 'full' | 'coarse' | 'handheld' | 'lite' | 'off';
export type JellyMotion = 'lively' | 'calm' | 'still';
export type ElectricArcsMode = 'full' | 'clicks' | 'off';
export type JellyDeform = 'full' | 'press' | 'off';

export interface JellyBudget {
  /** Rim slabs the shader engine may admit (`GLASS_BUDGET.maxSurfaces`). */
  rims: number;
  /** Haze canvases redrawn on the ambient clock. */
  hazeSlots: number;
  /** CSS flow carriers in the live set. */
  carriers: number;
  /** Animated area (haze + carriers) as a multiple of the viewport. */
  animatedViewports: number;
  /** Ambient clock while someone is there. */
  clockHz: number;
  /** Ambient clock floor after {@link IDLE_AFTER_MS} without input (R7: never 0 while visible). */
  idleClockHz: number;
  /** Tier E envelope bodies awake at once (02). */
  bodies: number;
  /** Tier L lattices awake at once (02), only while moving. */
  lattices: number;
  /** Minimum gap between ambient arcs. `Infinity` = no ambient arcs. */
  ambientArcMinIntervalMs: number;
  /** Bolts thrown per click. */
  clickBolts: number;
}

/**
 * The budgets, final per R6/R10 and 04 §3.1. Ambient slots stay at 8 (not 24) because every animated haze canvas is a
 * compositor layer re-rastered on every tick; 24 of them is the 2026-10-08 never-idle failure in a new form.
 *
 * `off` keeps 3 press-only bodies: reduced transparency and high contrast remove the material, not the press (04
 * §4.7, 02 §4), so physics may still sink a button when {@link jellyMode} says `deform: 'press'`.
 */
export const JELLY_BUDGETS: Readonly<Record<JellyTier, Readonly<JellyBudget>>> = {
  full: {
    rims: 24,
    hazeSlots: 8,
    carriers: 24,
    animatedViewports: 1.5,
    clockHz: 30,
    idleClockHz: 12,
    bodies: 12,
    lattices: 8,
    ambientArcMinIntervalMs: 2000,
    clickBolts: 3,
  },
  coarse: {
    rims: 16,
    hazeSlots: 6,
    carriers: 16,
    animatedViewports: 1.25,
    clockHz: 30,
    idleClockHz: 12,
    bodies: 8,
    lattices: 6,
    ambientArcMinIntervalMs: 2000,
    clickBolts: 2,
  },
  handheld: {
    rims: 10,
    hazeSlots: 4,
    carriers: 8,
    animatedViewports: 1,
    clockHz: 15,
    idleClockHz: 8,
    bodies: 6,
    lattices: 4,
    // R10: half the desktop rate, not 04's zero — the owner wants phones charged too.
    ambientArcMinIntervalMs: 4000,
    clickBolts: 1,
  },
  lite: {
    rims: 0,
    hazeSlots: 0,
    carriers: 0,
    animatedViewports: 0,
    clockHz: 0,
    idleClockHz: 0,
    bodies: 3,
    lattices: 0,
    ambientArcMinIntervalMs: Infinity,
    clickBolts: 0,
  },
  off: {
    rims: 0,
    hazeSlots: 0,
    carriers: 0,
    animatedViewports: 0,
    clockHz: 0,
    idleClockHz: 0,
    bodies: 3,
    lattices: 0,
    ambientArcMinIntervalMs: Infinity,
    clickBolts: 0,
  },
};

/**
 * While a game is playing (`html[data-game-state="playing"]`, R16): the pause UI keeps two rims and everything that
 * moves on its own stops, so nothing competes with the play-field for the frame or the eye.
 */
export const GAME_PLAYING_BUDGET: Readonly<JellyBudget> = {
  rims: 2,
  hazeSlots: 0,
  carriers: 0,
  animatedViewports: 0,
  clockHz: 0,
  idleClockHz: 0,
  bodies: 0,
  lattices: 0,
  ambientArcMinIntervalMs: Infinity,
  clickBolts: 0,
};

/** `calm` (04 §4.2): haze amplitude × 0.4, clock ≤ 12 Hz, slots and carriers halved, no ambient arcs. */
export const CALM = { amplitude: 0.4, maxClockHz: 12, slotShare: 0.5 } as const;

/** Input-free time after which the clock drops to `idleClockHz` (R7). There is deliberately no freeze after it. */
export const IDLE_AFTER_MS = 20_000;

/** Site-wide photosensitivity ledger (R13, WCAG 2.3.1): every arc onset and any rim pulse above 0.1 ΔL counts. */
export const FLASH_LEDGER = { maxOnsets: 3, windowMs: 1000 } as const;

/** Host motion bounds (R12, 02 D3). Text, hit areas and layout never move beyond these. */
export const MOTION_BOUNDS = {
  maxEdgeTravelPx: 4,
  maxScaleDelta: 0.03,
  nudgePx: 1.5,
  nudgeRadiusPx: 24,
  nudgeMax: 4,
} as const;

/**
 * Vestibular and attention bounds on ambient motion (04 §4.3, §4.5), pinned so a tuning pass cannot quietly exceed
 * them. Ambient motion never moves a host's position; it moves haze inside a still host.
 */
export const AMBIENT_BOUNDS = {
  maxDriftPxPerSecond: 12,
  minFeatureSizePx: 120,
  minLuminancePeriodSeconds: 6,
  maxLuminanceModulationHz: 3,
  /** Above this area a host gets no affine and lattice amplitude × {@link AMBIENT_BOUNDS.largeLatticeScale}. */
  largeSurfaceAreaPx2: 250_000,
  largeLatticeScale: 0.5,
  /** No jelly layer paints further outside the host box than the focus ring's offset. */
  maxOverdrawPx: 2,
} as const;

/**
 * The root classes that degrade the material, exactly as the site stamps them on `<html>` today (the engine's `off()`
 * and `runtime.ts`'s `disabled()`). Forced colours, reduced transparency and print are media queries, read separately.
 */
export const DEGRADED_ROOT_SELECTOR = '.reduce-transparency,.style-high-contrast,.perf-lite';

/** The app tier's high-contrast theme lives on the app shell, not `<html>`, so it is looked up in the document. */
export const APP_HIGH_CONTRAST_SELECTOR = '.app-high-contrast';

/** Per-element opt-outs, including the Liquid Glass and fluid-press aliases that stay accepted (R11). */
export const OPT_OUT_SELECTOR =
  '[data-jelly="off"],[data-liquid-material="off"],[data-liquid-glass="off"],[data-liquid-motion="off"],[data-fluid-press="off"],[data-fluid-press="none"]';

/** Subtree opt-outs: an ancestor matching this switches jelly off for everything inside it. */
export const OPT_OUT_SCOPE_SELECTOR =
  '[data-jelly-scope="off"],[data-jelly-zone="playfield"],[data-liquid-motion="off"]';

/**
 * Every jelly host: the glass role classes, the app tier's `.app-glass`, the engine's explicit opt-in, eversion
 * hosts, solid controls and fields, toasts and anything tagged `data-jelly`. A superset of the engine's slab selector,
 * so arcs and physics land on exactly the surfaces that can be drawn as slabs, and more.
 */
export const JELLY_SELECTOR =
  '.glass-pane,.glass-fill,.glass-chrome,.glass-overlay,.glass-inset,.glass-interactive,.app-glass,[data-liquid-glass],[data-evert],[data-slot="button"],[data-slot="input"],[data-slot="textarea"],[data-sonner-toast],[data-jelly]';

/** The handheld tier's query, copied exactly from `handheld-tier.test.ts` (which pins it here). */
export const HANDHELD_QUERY = '(pointer: coarse) and (max-width: 1024px)';
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const FORCED_QUERY = '(forced-colors: active)';
const TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';
const PRINT_QUERY = 'print';

/** The media queries {@link onJellyEnvChange} watches: everything the tier and the off predicate read. */
export const JELLY_ENV_QUERIES = [
  HANDHELD_QUERY,
  FINE_POINTER_QUERY,
  FORCED_QUERY,
  TRANSPARENCY_QUERY,
  PRINT_QUERY,
] as const;

/** The `<html>` attributes {@link onJellyEnvChange} watches. `data-scrolling` is left out on purpose: it flips per fling. */
export const JELLY_ENV_ATTRIBUTES = [
  'class',
  'data-jelly-motion',
  'data-electric-arcs',
  'data-game-state',
] as const;

export interface JellyEnv {
  doc?: Document;
  win?: Window;
}

const defaultDoc = (): Document | undefined =>
  typeof document === 'undefined' ? undefined : document;

const resolveEnv = (env?: JellyEnv): { doc?: Document; win?: Window } => {
  const doc = env?.doc ?? env?.win?.document ?? defaultDoc();
  const win = env?.win ?? doc?.defaultView ?? undefined;
  return { doc, win };
};

const matches = (win: Window | undefined, query: string): boolean => {
  try {
    return !!win?.matchMedia?.(query).matches;
  } catch {
    return false;
  }
};

/** Why the material may not draw at all, apart from `perf-lite` (which is the `lite` tier, not off). */
function hardOff(doc: Document, win: Window | undefined): boolean {
  const root = doc.documentElement;
  return (
    matches(win, TRANSPARENCY_QUERY) ||
    matches(win, FORCED_QUERY) ||
    matches(win, PRINT_QUERY) ||
    root.matches('.reduce-transparency,.style-high-contrast') ||
    !!doc.querySelector(APP_HIGH_CONTRAST_SELECTOR)
  );
}

const perfLite = (doc: Document): boolean => doc.documentElement.matches('.perf-lite');

/**
 * The device/state tier. Never `hidden`-dependent (a background tab is a clock decision, not a tier) and never
 * frame-rate dependent. No document (SSR) → `'off'`.
 */
export function jellyTier(env?: JellyEnv): JellyTier {
  const { doc, win } = resolveEnv(env);
  if (!doc) return 'off';
  if (hardOff(doc, win)) return 'off';
  if (perfLite(doc)) return 'lite';
  if (matches(win, HANDHELD_QUERY)) return 'handheld';
  if (matches(win, FINE_POINTER_QUERY)) return 'full';
  return 'coarse';
}

/** `html[data-jelly-motion]`; absent or unknown → `'lively'` (the attribute is only stamped off the default). */
export function jellyMotionLevel(doc: Document | undefined = defaultDoc()): JellyMotion {
  const v = doc?.documentElement.getAttribute('data-jelly-motion');
  return v === 'calm' || v === 'still' ? v : 'lively';
}

/** `html[data-electric-arcs]`; absent or unknown → `'full'`. The user's choice only — see {@link jellyMode}. */
export function electricArcsPref(doc: Document | undefined = defaultDoc()): ElectricArcsMode {
  const v = doc?.documentElement.getAttribute('data-electric-arcs');
  return v === 'clicks' || v === 'off' ? v : 'full';
}

/** `html[data-game-state="playing"]` (R16). */
export function gamePlaying(doc: Document | undefined = defaultDoc()): boolean {
  return doc?.documentElement.getAttribute('data-game-state') === 'playing';
}

/**
 * May the material layers draw at all: false for canvases, haze, carriers and arcs under a degraded root
 * ({@link DEGRADED_ROOT_SELECTOR}, so `perf-lite` included), the app high-contrast theme, forced colours, reduced
 * transparency, print, or a hidden tab. No document (SSR) → true.
 */
export function jellyOff(doc: Document | undefined = defaultDoc()): boolean {
  if (!doc) return true;
  const win = doc.defaultView ?? undefined;
  return doc.hidden || perfLite(doc) || hardOff(doc, win);
}

export interface JellyModeState {
  /** Haze and carriers may run on the ambient clock. */
  ambient: boolean;
  /** Which arcs may fire. Ambient arcs additionally need the tier's `ambientArcMinIntervalMs` to be finite. */
  arcs: ElectricArcsMode;
  /** Soft-body permission: everything, press only, or none. */
  deform: JellyDeform;
}

/**
 * What each service may do right now: the tier, the off predicate, `jellyMotion`, `electricArcs` and the game state
 * folded into one answer so engine, carriers, physics and arcs cannot disagree.
 *
 * - Hidden tab, print and forced colours: nothing (04 §4.7 — no physics transforms under forced colours).
 * - Other material-off states and `perf-lite`: press only, no ambient, no arcs.
 * - Game playing (R16): ambient and arcs zeroed, no bodies.
 * - `still`: press only, arcs off whatever `electricArcs` says (R9). `calm`: no ambient arcs, clicks per preference.
 */
export function jellyMode(env?: JellyEnv): JellyModeState {
  const { doc, win } = resolveEnv(env);
  const none: JellyModeState = { ambient: false, arcs: 'off', deform: 'off' };
  if (!doc || doc.hidden) return none;
  if (matches(win, PRINT_QUERY) || matches(win, FORCED_QUERY)) return none;
  if (gamePlaying(doc)) return none;
  const press: JellyModeState = { ambient: false, arcs: 'off', deform: 'press' };
  if (jellyOff(doc)) return press;
  const motion = jellyMotionLevel(doc);
  if (motion === 'still') return press;
  const pref = electricArcsPref(doc);
  const arcs: ElectricArcsMode = motion === 'calm' && pref === 'full' ? 'clicks' : pref;
  return { ambient: true, arcs, deform: 'full' };
}

/**
 * The tier's budget with the current state applied: game playing swaps in {@link GAME_PLAYING_BUDGET}, `calm` halves
 * slots and carriers and caps the clock, `still` and every non-ambient mode zero everything ambient. The governor
 * (`governor.ts`) may lower this further; nothing raises it.
 */
export function jellyBudget(env?: JellyEnv): JellyBudget {
  const { doc, win } = resolveEnv(env);
  const tier = jellyTier({ doc, win });
  if (doc && gamePlaying(doc)) return { ...GAME_PLAYING_BUDGET };
  const base: JellyBudget = { ...JELLY_BUDGETS[tier] };
  const mode = jellyMode({ doc, win });
  if (!mode.ambient) {
    base.hazeSlots = 0;
    base.carriers = 0;
    base.animatedViewports = 0;
    base.clockHz = 0;
    base.idleClockHz = 0;
    base.lattices = 0;
  }
  if (mode.arcs !== 'full') base.ambientArcMinIntervalMs = Infinity;
  if (mode.arcs === 'off') base.clickBolts = 0;
  if (mode.deform === 'off') base.bodies = 0;
  if (mode.ambient && jellyMotionLevel(doc) === 'calm') {
    base.hazeSlots = Math.floor(base.hazeSlots * CALM.slotShare);
    base.carriers = Math.floor(base.carriers * CALM.slotShare);
    base.clockHz = Math.min(base.clockHz, CALM.maxClockHz);
    base.idleClockHz = Math.min(base.idleClockHz, base.clockHz);
  }
  return base;
}

/**
 * Is this element opted out of jelly, on itself or through an ancestor scope? One `matches` and one `closest`, meant
 * for activation time — never per pointer move.
 */
export function jellyOptedOut(el: Element): boolean {
  return el.matches(OPT_OUT_SELECTOR) || el.closest(OPT_OUT_SCOPE_SELECTOR) !== null;
}

// ── Environment change: one shared watcher ──────────────────────────────────

interface Watcher {
  doc: Document;
  listeners: Set<() => void>;
  dispose: () => void;
}

let watcher: Watcher | null = null;

/**
 * Call `cb` whenever anything the tier, off predicate or mode reads may have changed: the watched media queries, the
 * watched `<html>` attributes, and tab visibility. One media-query set and one attribute observer serve every
 * subscriber; they are installed with the first and removed with the last. Callbacks are not de-duplicated by value,
 * so re-read what you need and compare. SSR (no document) → a no-op unsubscribe.
 */
export function onJellyEnvChange(
  cb: () => void,
  doc: Document | undefined = defaultDoc(),
): () => void {
  const win = doc?.defaultView;
  if (!doc || !win) return () => {};
  if (!watcher || watcher.doc !== doc) {
    watcher?.dispose();
    watcher = createWatcher(doc, win);
  }
  const current = watcher;
  current.listeners.add(cb);
  return () => {
    current.listeners.delete(cb);
    if (current.listeners.size === 0 && watcher === current) {
      current.dispose();
      watcher = null;
    }
  };
}

function createWatcher(doc: Document, win: NonNullable<Document['defaultView']>): Watcher {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of [...listeners]) fn();
  };
  const queries = JELLY_ENV_QUERIES.map((q) => win.matchMedia(q));
  for (const q of queries) q.addEventListener('change', notify);
  const observer = new win.MutationObserver(notify);
  observer.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: [...JELLY_ENV_ATTRIBUTES],
  });
  doc.addEventListener('visibilitychange', notify);
  return {
    doc,
    listeners,
    dispose: () => {
      for (const q of queries) q.removeEventListener('change', notify);
      observer.disconnect();
      doc.removeEventListener('visibilitychange', notify);
    },
  };
}
