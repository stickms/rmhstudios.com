/**
 * Plasmatic Jelly's single shared policy: who gets which budget, when the material is off, and the motion bounds
 * nothing may exceed (master plan §4.1, R3; plan 04 §3).
 *
 * ## Why one file
 *
 * Under Liquid Glass the engine's `off()`, `runtime.ts`'s `disabled()` and the arcs plan's global-off list each wrote
 * the same predicate by hand, and three copies of a predicate drift. Every jelly service that still runs JavaScript —
 * the click arcs, the globe, the scene feed, the pointer variable — reads its tier, budget and off state
 * from here, so a theme or preference that switches the material off switches all of it off together. (The CSS
 * material answers to the same signals through selectors: `.app-high-contrast`, `html[data-jelly-motion]`.)
 *
 * ## What decides the tier
 *
 * Only the handheld query (copied exactly from `handheld-tier.test.ts`, which scans this file for near-misses),
 * `(hover: hover) and (pointer: fine)` and the off predicate. There is no low-end tier: a software renderer, Data Saver
 * or a weak device gets the same material as any other (the old low-end class is gone; games and the globe's CSS
 * fallback read `lib/low-end.ts`, which the material never does). The tier is computed per route and on media-query change and never flips on a frame-rate reading;
 * that was the (retired) governor's job.
 *
 * ## Off versus tier
 *
 * {@link jellyOff} answers "may the MATERIAL layers draw" (the globe, arcs): false in print, under the app tier's high
 * contrast and in a hidden tab. {@link jellyTier} is the device tier. {@link jellyMode} folds both, plus the
 * preferences and game state, into what each service may do now.
 *
 * SSR-safe: nothing here touches `window` or `document` at import, and every reader takes its document as an argument.
 */

export type JellyTier = 'full' | 'coarse' | 'handheld' | 'off';
export type JellyMotion = 'lively' | 'calm' | 'still';
export type ElectricArcsMode = 'full' | 'clicks' | 'off';

export interface JellyBudget {
  /** The globe's ambient clock while someone is there. */
  clockHz: number;
  /** Ambient clock floor after {@link IDLE_AFTER_MS} without input (R7: never 0 while visible). */
  idleClockHz: number;
  /** Minimum gap between ambient arcs. `Infinity` = no ambient arcs (the only installer passes `ambient: false`). */
  ambientArcMinIntervalMs: number;
  /** Bolts thrown per click. */
  clickBolts: number;
  /**
   * How many on-screen glass hosts may hold a refracting rim layer at once (`lib/jelly/refract/install.ts`), nearest the
   * viewport centre first; the rest keep the lit rim. Chosen by measurement (docs/plasmatic-jelly-system.md §1.2), not guessed.
   */
  refractHosts: number;
}

/**
 * The budgets, final per R6/R10 and 04 §3.1, kept to the fields something still reads: the globe's
 * ambient clock (`clockHz` while someone is there, `idleClockHz` after {@link IDLE_AFTER_MS}; 60/15 Hz on the desktop
 * tiers, 30/7 on handhelds) and the click arcs (`clickBolts`, `ambientArcMinIntervalMs`). The rim, haze-slot, carrier,
 * animated-area, body and lattice budgets belonged to the glass engine, the CSS carriers and the soft-body physics,
 * which are gone (CSS-first jelly); the CSS material needs no budget, it costs nothing at rest.
 */
export const JELLY_BUDGETS: Readonly<Record<JellyTier, Readonly<JellyBudget>>> = {
  full: {
    clockHz: 60,
    idleClockHz: 15,
    ambientArcMinIntervalMs: 2000,
    clickBolts: 3,
    refractHosts: 24,
  },
  coarse: {
    clockHz: 60,
    idleClockHz: 15,
    ambientArcMinIntervalMs: 2000,
    clickBolts: 2,
    refractHosts: 12,
  },
  // R10: half the desktop ambient-arc rate, not 04's zero — the owner wants phones charged too.
  handheld: {
    clockHz: 30,
    idleClockHz: 7,
    ambientArcMinIntervalMs: 4000,
    clickBolts: 1,
    refractHosts: 0,
  },
  off: {
    clockHz: 0,
    idleClockHz: 0,
    ambientArcMinIntervalMs: Infinity,
    clickBolts: 0,
    refractHosts: 0,
  },
};

/**
 * While a game is playing (`html[data-game-state="playing"]`, R16): everything that moves on its own stops, so nothing
 * competes with the play-field for the frame or the eye.
 */
export const GAME_PLAYING_BUDGET: Readonly<JellyBudget> = {
  clockHz: 0,
  idleClockHz: 0,
  ambientArcMinIntervalMs: Infinity,
  clickBolts: 0,
  refractHosts: 0,
};

/**
 * `calm` (04 §4.2): haze amplitude × 0.4 (the globe's coat), the ambient clock ≤ 12 Hz, no ambient arcs; a click arc's
 * light (glow, impact, rim light) and its nudge draw at `arcIntensity` (lib/jelly/arcs/glow.ts `arcIntensityScale`).
 */
export const CALM = { amplitude: 0.4, maxClockHz: 12, arcIntensity: 0.6 } as const;

/** Input-free time after which the clock drops to `idleClockHz` (R7). There is deliberately no freeze after it. */
export const IDLE_AFTER_MS = 20_000;

/** Site-wide photosensitivity ledger (R13, WCAG 2.3.1): every arc onset counts. */
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
} as const;

/**
 * Dormant plasma (#989): invisible at rest, woken by hover, brightened by press/focus/click. The globe's coat reads all
 * four; the CSS wake is `--plasma-wake` in `app/globals.css`, which a parity test (`jelly-tokens.test.ts`) keeps equal to
 * {@link PLASMA.wake}. Services import these; components never restate them.
 */
export const PLASMA = {
  rest: 0,
  /** Hover level (`--plasma-wake`). */
  wake: 0.35,
  press: 1,
  /** Level easing time constant, ms. */
  easeMs: 180,
} as const;

/** Charge, breakdown and pulses (#989): the click arcs' charge book (`lib/jelly/arcs/charge.ts`). */
export const CHARGE = {
  /** A gap below breakdownGapPx × (1 + 1.5q) breaks down (ambient strikes only; the click runtime has none). */
  breakdownGapPx: 12,
  breakdownChargeGain: 1.5,
  /** Delay between breakdown conditions and the strike. */
  formativeLagMs: 120,
  /** Charge a click deposits on its body, 0..1. */
  clickCharge: 1,
  /** Fraction handed to a neighbour in reach when it jumps. */
  hopFraction: 0.5,
  /** Charge below this stops hopping. */
  minHopCharge: 0.2,
  /** Charge decay time constant, ms. */
  decayMs: 1500,
  /** How fast a click's charge travels through the gel before its hop leaves, px/s (`ringDelayMs`). */
  pulseSpeedPxS: 900,
  /** Coulomb attraction: force scale and max reach, CSS px. Displacement stays ≤ MOTION_BOUNDS.nudgePx. */
  attractReachPx: 96,
  attractGain: 0.6,
} as const;

/** Layout (#989): the spacing the owner's layout rule asks for. */
export const JELLY_LAYOUT = {
  /** `--space-4`: bodies sit at least this far apart. */
  minGapPx: 16,
  /** `--jelly-margin`: unclipped space around every body. */
  marginPx: 16,
} as const;

/**
 * The app tier's high-contrast theme lives on the app shell, not `<html>`, so it is looked up in the document. Together
 * with print (a media query, read separately) it is the only state that turns the material off. The site's
 * high-contrast theme, the OS forced-colours / reduced-transparency fallbacks and the old low-end tier are gone: the
 * material always draws.
 */
export const APP_HIGH_CONTRAST_SELECTOR = '.app-high-contrast';

/**
 * The liquid globe's own elements (components/radial/LiquidGlobe.tsx, RadialGlobeDock.tsx): the root, its square
 * stage, the disc and coat layers, and the dock that holds it. The globe IS Plasmatic Jelly, but drawn by its own ROUND
 * shader (components/radial/jelly-glass.ts: haze, dormant plasma, RGB-led rim, all clipped to the sphere), so none of
 * these may ever become a rectangular host — a CSS rim, woken haze, soft body or arc endpoint on one of these boxes is
 * the "plasma outlining the globe in a square" bug. Folded into {@link OPT_OUT_SELECTOR} so every service that honours
 * opt-outs (the registry and the arc candidates, click arcs, the pointer variable) drops them through one selector. The
 * pins inside keep their own press (`data-fluid-press="lift"`).
 */
export const GLOBE_SELECTOR =
  '.radial-globe,.radial-globe__stage,.radial-globe__glass,.radial-globe__jelly,.radial-globe__cage,.radial-globe__skin,.rad-globe-dock';

/** Per-element opt-outs, including the Liquid Glass and fluid-press aliases that stay accepted (R11), and the globe. */
export const OPT_OUT_SELECTOR = `[data-jelly="off"],[data-liquid-material="off"],[data-liquid-glass="off"],[data-liquid-motion="off"],[data-fluid-press="off"],[data-fluid-press="none"],${GLOBE_SELECTOR}`;

/** Subtree opt-outs: an ancestor matching this switches jelly off for everything inside it. */
export const OPT_OUT_SCOPE_SELECTOR =
  '[data-jelly-scope="off"],[data-jelly-zone="playfield"],[data-liquid-motion="off"]';

/**
 * Every jelly host: the glass role classes, the app tier's `.app-glass`, the explicit opt-in, eversion hosts, solid
 * controls and fields, toasts, anything tagged `data-jelly`, and the app tier's adapter surfaces
 * (`[data-liquid-surface]`, `.app-theme` boxes on `bg-(--app-surface)`). The registry admits these, so arcs land on
 * exactly the surfaces that carry the material, and more.
 */
export const JELLY_SELECTOR =
  '.glass-pane,.glass-fill,.glass-chrome,.glass-overlay,.glass-inset,.glass-interactive,.app-glass,[data-liquid-glass],[data-evert],[data-slot="button"],[data-slot="input"],[data-slot="textarea"],[data-sonner-toast],[data-jelly],[data-liquid-surface],.app-theme [class~="bg-(--app-surface)"]';

/**
 * The nodes the jelly services inject that React never knows about: the arc layer (into `<body>`) and a host's refracting
 * rim layer (`lib/jelly/refract/layer.ts`, the host's first child). Never hosts, never
 * "content changed"; the registry notifies when one is removed from a host (React's `setTextContent` wipe), so its
 * owner can re-attach it.
 */
export const JELLY_LAYER_SELECTOR = '.jelly-arc-layer,.jelly-refract';

/**
 * The radial hub open or an eversion in progress: arcs are off. `tiers` does not otherwise know about these, so the
 * arc runtime checks this selector, and so does the lazy installer (`arc-lazy.ts`) before it loads anything.
 */
export const HUB_OR_EVERSION_SELECTOR = '.radial-hub:not([data-phase="closed"]),.eversion-overlay';

/** The handheld tier's query, copied exactly from `handheld-tier.test.ts` (which pins it here). */
export const HANDHELD_QUERY = '(pointer: coarse) and (max-width: 1024px)';
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const PRINT_QUERY = 'print';

/** The media queries {@link onJellyEnvChange} watches: everything the tier and the off predicate read. */
export const JELLY_ENV_QUERIES = [HANDHELD_QUERY, FINE_POINTER_QUERY, PRINT_QUERY] as const;

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

/** Why the material may not draw at all: print, or the app tier's high contrast. */
function hardOff(doc: Document, win: Window | undefined): boolean {
  return matches(win, PRINT_QUERY) || !!doc.querySelector(APP_HIGH_CONTRAST_SELECTOR);
}

/**
 * The device/state tier. Never `hidden`-dependent (a background tab is a clock decision, not a tier) and never
 * frame-rate dependent. No document (SSR) → `'off'`.
 */
export function jellyTier(env?: JellyEnv): JellyTier {
  const { doc, win } = resolveEnv(env);
  if (!doc) return 'off';
  if (hardOff(doc, win)) return 'off';
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
 * May the material layers draw at all: false for the globe and the arcs under the app high-contrast theme, print, or a
 * hidden tab. No document (SSR) → true.
 */
export function jellyOff(doc: Document | undefined = defaultDoc()): boolean {
  if (!doc) return true;
  const win = doc.defaultView ?? undefined;
  return doc.hidden || hardOff(doc, win);
}

export interface JellyModeState {
  /** The globe may run on the ambient clock. */
  ambient: boolean;
  /** Which arcs may fire. Ambient arcs additionally need the tier's `ambientArcMinIntervalMs` to be finite. */
  arcs: ElectricArcsMode;
}

/**
 * What each service may do right now: the tier, the off predicate, `jellyMotion`, `electricArcs` and the game state
 * folded into one answer so the globe and the arcs cannot disagree.
 *
 * - Hidden tab and print: nothing.
 * - Other material-off states (the app tier's high contrast): no ambient, no arcs.
 * - Game playing (R16): ambient and arcs zeroed.
 * - `still`: ambient motion and arcs stop; direct hover/press/scroll reactions remain available (they are CSS).
 */
export function jellyMode(env?: JellyEnv): JellyModeState {
  const { doc, win } = resolveEnv(env);
  const none: JellyModeState = { ambient: false, arcs: 'off' };
  if (!doc || doc.hidden) return none;
  if (matches(win, PRINT_QUERY)) return none;
  if (gamePlaying(doc)) return none;
  if (jellyOff(doc)) return none;
  const motion = jellyMotionLevel(doc);
  if (motion === 'still') return none;
  const pref = electricArcsPref(doc);
  const arcs: ElectricArcsMode = motion === 'calm' && pref === 'full' ? 'clicks' : pref;
  return { ambient: true, arcs };
}

/**
 * The tier's budget with the current state applied: game playing swaps in {@link GAME_PLAYING_BUDGET}, `calm` caps the
 * clock, `still` and every non-ambient mode zero the clock.
 */
export function jellyBudget(env?: JellyEnv): JellyBudget {
  const { doc, win } = resolveEnv(env);
  const tier = jellyTier({ doc, win });
  if (doc && gamePlaying(doc)) return { ...GAME_PLAYING_BUDGET };
  const base: JellyBudget = { ...JELLY_BUDGETS[tier] };
  const mode = jellyMode({ doc, win });
  if (!mode.ambient) {
    base.clockHz = 0;
    base.idleClockHz = 0;
  }
  if (mode.arcs !== 'full') base.ambientArcMinIntervalMs = Infinity;
  if (mode.arcs === 'off') base.clickBolts = 0;
  if (mode.ambient && jellyMotionLevel(doc) === 'calm') {
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
  // `hardOff` also reads the app tier's high-contrast class, which lives on an app shell inside <body>, not on
  // <html>: watch the body too, and notify only when its presence flips.
  const contrastOn = () =>
    typeof doc.querySelector === 'function' && !!doc.querySelector(APP_HIGH_CONTRAST_SELECTOR);
  let highContrast = contrastOn();
  const contrastObserver = new win.MutationObserver((records) => {
    if (
      records?.length &&
      !records.some(
        (r) =>
          r.type === 'childList' ||
          (r.target as Element).matches?.(`.app-theme,${APP_HIGH_CONTRAST_SELECTOR}`),
      )
    )
      return;
    const next = contrastOn();
    if (next === highContrast) return;
    highContrast = next;
    notify();
  });
  if (doc.body) {
    contrastObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }
  doc.addEventListener('visibilitychange', notify);
  return {
    doc,
    listeners,
    dispose: () => {
      for (const q of queries) q.removeEventListener('change', notify);
      observer.disconnect();
      contrastObserver.disconnect();
      doc.removeEventListener('visibilitychange', notify);
    },
  };
}
