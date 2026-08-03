/**
 * Saving, loading, and the migration off the old game.
 *
 * The save is a plain object: sets become arrays, everything else is already
 * JSON. There is no compression and no versioned migration chain beyond v1→v2,
 * because a save that is readable in a browser console is a save you can fix
 * when something goes wrong at three in the morning.
 */
import { useEffect } from 'react';
import type { BowlState, GameState, LegacySaveV1, SaveData, SourceId } from './types';
import { useTempleStore } from './store';
import { createInitialState } from './store';
import { ZERO_SOURCES } from './data/sources';
import { MAX_GLOBES } from './data/globes';
import { reserveId } from './ids';
import {
  BOWL_BOOST_SECONDS,
  BOWL_COOLDOWN_SECONDS,
  BOWL_MAX_MULTIPLIER,
  BOWL_PINS,
  createBowl,
} from './bowling';
import { createGarden, emptyPlots, GARDEN_SIZE } from './minigames/garden';
import { createChoir } from './minigames/choir';
import { createExchange } from './minigames/exchange';
import { createHours } from './minigames/hours';
import { createManna } from './minigames/manna';
import { computeGraceEarned } from './engine';

const LOCAL_KEY = 'temple_of_joy_save_v2';

/**
 * v3 added the globes and the Bowl. The local storage key is deliberately
 * UNCHANGED: v3 is a strict superset of v2 — two scalars and one object, all
 * optional on the way in — so bumping the key would have orphaned every
 * existing save to gain nothing. `readSave` accepts either version and
 * `saveToState` fills the new fields with the values a v2 player should get:
 * the one globe everybody starts with, and a lane nobody has bowled on.
 */
export const SAVE_VERSION = 3 as const;

/** Versions this build knows how to read. */
const READABLE_VERSIONS = new Set([2, 3]);

/* ══════════════════════════════════════════════════════════════════════════
   Serialising
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `at` is passed in rather than read from the clock so that the timestamp
 * inside the payload and the one written back to the store are the same
 * instant. They are what the vigil measures the absence from; a few
 * milliseconds of drift between them is harmless, but two different notions of
 * "when this was saved" is the kind of thing that rots into a real bug.
 */
export function stateToSave(state: GameState, at = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    joy: state.joy,
    runJoy: state.runJoy,
    lifetimeJoy: state.lifetimeJoy,
    peakJoy: state.peakJoy,
    sources: { ...state.sources },
    sourceLevels: { ...state.sourceLevels },
    sourceEarnings: { ...state.sourceEarnings },
    globes: state.globes,
    globesBought: state.globesBought,
    bowl: state.bowl,
    blessings: [...state.blessings],
    trophies: [...state.trophies],
    grace: state.grace,
    graceSpent: state.graceSpent,
    graceEarned: state.graceEarned,
    legacy: [...state.legacy],
    ascensions: state.ascensions,
    keepsakes: [...state.keepsakes],
    manna: state.manna,
    totalTouches: state.totalTouches,
    halosCaught: state.halosCaught,
    haloStreak: state.haloStreak,
    rapture: state.rapture,
    sinners: state.sinners,
    sinnersStruck: state.sinnersStruck,
    sinnerHarvest: state.sinnerHarvest,
    buffs: state.buffs,
    garden: state.garden,
    choir: state.choir,
    exchange: state.exchange,
    hours: state.hours,
    lastSaved: at,
    playtime: state.playtime,
    runPlaytime: state.runPlaytime,
    theme: state.theme,
    numberFormat: state.numberFormat,
    soundEnabled: state.soundEnabled,
    musicVolume: state.musicVolume,
    sfxVolume: state.sfxVolume,
    stewardEnabled: state.stewardEnabled,
    confirmAscend: state.confirmAscend,
    reducedFlourish: state.reducedFlourish,
    buyQty: state.buyQty,
  };
}

export function saveToState(save: SaveData): Partial<GameState> {
  const base = createInitialState();
  return {
    joy: num(save.joy),
    runJoy: num(save.runJoy),
    lifetimeJoy: num(save.lifetimeJoy),
    peakJoy: num(save.peakJoy),
    sources: { ...ZERO_SOURCES, ...(save.sources ?? {}) } as Record<SourceId, number>,
    sourceLevels: { ...ZERO_SOURCES, ...(save.sourceLevels ?? {}) } as Record<SourceId, number>,
    sourceEarnings: { ...ZERO_SOURCES, ...(save.sourceEarnings ?? {}) } as Record<SourceId, number>,
    // A v2 save predates the globes: it is read as the one every temple starts
    // with. Clamped both ways, because a save file is a text file a player can
    // edit, and `globes` sizes an array the renderer walks every frame.
    globes: Math.max(1, Math.min(MAX_GLOBES, Math.floor(num(save.globes)) || 1)),
    globesBought: Math.max(0, Math.floor(num(save.globesBought))),
    bowl: reviveBowl(save.bowl),
    blessings: new Set(save.blessings ?? []),
    trophies: new Set(save.trophies ?? []),
    grace: num(save.grace),
    graceSpent: num(save.graceSpent),
    graceEarned: num(save.graceEarned),
    legacy: new Set(save.legacy ?? []),
    ascensions: num(save.ascensions),
    keepsakes: save.keepsakes ?? [],
    manna: { ...createManna(), ...(save.manna ?? {}) },
    totalTouches: num(save.totalTouches),
    halosCaught: num(save.halosCaught),
    haloStreak: num(save.haloStreak),
    rapture: Math.max(0, Math.min(3, num(save.rapture))),
    sinners: reviveSinners(save.sinners),
    sinnersStruck: num(save.sinnersStruck),
    sinnerHarvest: num(save.sinnerHarvest),
    buffs: save.buffs ?? [],
    garden: reviveGarden(save.garden),
    choir: { ...createChoir(), ...(save.choir ?? {}) },
    exchange: reviveExchange(save.exchange),
    hours: { ...createHours(), ...(save.hours ?? {}) },
    lastSaved: num(save.lastSaved) || Date.now(),
    playtime: num(save.playtime),
    runPlaytime: num(save.runPlaytime),
    theme: save.theme ?? base.theme,
    numberFormat: save.numberFormat ?? base.numberFormat,
    soundEnabled: save.soundEnabled ?? true,
    musicVolume: clamp01(save.musicVolume ?? base.musicVolume),
    sfxVolume: clamp01(save.sfxVolume ?? base.sfxVolume),
    stewardEnabled: save.stewardEnabled ?? false,
    confirmAscend: save.confirmAscend ?? true,
    reducedFlourish: save.reducedFlourish ?? false,
    buyQty: save.buyQty ?? 1,
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, num(v)));
}

/**
 * A garden from an older build may have a shorter plot array. Rehydrating it
 * to the full 36 rather than trusting the save is what stops a bad write from
 * turning into an index crash three sessions later.
 */
function reviveGarden(saved: GameState['garden'] | undefined): GameState['garden'] {
  const base = createGarden();
  if (!saved) return base;
  const plots = emptyPlots();
  (saved.plots ?? []).slice(0, GARDEN_SIZE).forEach((plot, i) => {
    if (plot && typeof plot === 'object') plots[i] = { ...plots[i]!, ...plot };
  });
  return { ...base, ...saved, plots };
}

/**
 * The Sinners, with their ids taken out of circulation.
 *
 * They are the only entities that survive a save carrying a minted id, so this
 * is the one place the id counter has to be told what a previous session
 * already used — see `ids.ts` §reserveId.
 */
function reviveSinners(saved: GameState['sinners'] | undefined): GameState['sinners'] {
  const sinners = saved ?? [];
  for (const sinner of sinners) reserveId(sinner?.id);
  return sinners;
}

/**
 * The lane, from a save that may predate it entirely.
 *
 * Both clocks are clamped to their own ceilings rather than trusted. They are
 * counted down in seconds by the tick, so a hand-edited `remaining` of `1e9`
 * would be a boost lasting thirty years — and `multiplier` is a term in the
 * income stack, which is precisely the field an edited save would reach for.
 */
function reviveBowl(saved: BowlState | undefined): BowlState {
  const base = createBowl();
  if (!saved || typeof saved !== 'object') return base;
  const remaining = Math.max(0, Math.min(BOWL_BOOST_SECONDS, num(saved.remaining)));
  return {
    ...base,
    ...saved,
    cooldown: Math.max(0, Math.min(BOWL_COOLDOWN_SECONDS, num(saved.cooldown))),
    remaining,
    multiplier:
      remaining > 0 ? Math.max(1, Math.min(BOWL_MAX_MULTIPLIER, num(saved.multiplier) || 1)) : 1,
    frames: Math.max(0, Math.floor(num(saved.frames))),
    bestPins: Math.max(0, Math.min(BOWL_PINS, Math.floor(num(saved.bestPins)))),
    strikes: Math.max(0, Math.floor(num(saved.strikes))),
    lastPins: Math.max(0, Math.min(BOWL_PINS, Math.floor(num(saved.lastPins)))),
    revealed: Boolean(saved.revealed),
  };
}

function reviveExchange(saved: GameState['exchange'] | undefined): GameState['exchange'] {
  const base = createExchange();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    goods: { ...base.goods, ...(saved.goods ?? {}) },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Migration from the old game
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The v1 temple had a different set of sources, three parallel prestige
 * currencies and no minigames. Nothing about its structure survives the
 * rewrite — but the *time* someone put into it does, and throwing that away
 * would be the wrong call.
 *
 * So a v1 save is read for its lifetime happiness and converted into Grace on
 * the new curve, plus its playtime and its settings. The player restarts with
 * a Ladder they did not have to climb twice.
 */
export function migrateV1(old: LegacySaveV1): Partial<GameState> {
  const lifetime = num(old.lifetimeHappiness);
  // The old economy ran roughly three orders of magnitude hotter than this one
  // at the same point on the curve, so the transfer is deliberately
  // conservative: it should feel like a gift, not like a skipped game.
  const equivalent = lifetime / 1_000;
  const grace = Math.max(
    computeGraceEarned(equivalent),
    // Anyone who transcended in the old game gets at least a rung per reset.
    num(old.prestigeCount) * 2 + num(old.ascensionCount) * 25,
  );

  return {
    grace,
    graceEarned: grace,
    ascensions: num(old.prestigeCount),
    playtime: num(old.totalPlaytime),
    totalTouches: num(old.totalClicks),
    theme: old.theme === 'light' ? 'dawn' : 'vespers',
    numberFormat: old.numberFormat === 'scientific' ? 'scientific' : 'named',
    soundEnabled: old.soundEnabled ?? true,
    musicVolume: clamp01(old.musicVolume ?? 0.35),
    sfxVolume: clamp01(old.sfxVolume ?? 0.5),
  };
}

/**
 * Read whatever is on the server or in storage and normalise it to v2 state.
 *
 * The two save shapes have nothing structural in common, so this sniffs rather
 * than casting to an intersection: `SaveData & LegacySaveV1` narrows to `never`
 * (v2's `version` is the literal 2, v1's is `number | undefined`) and every
 * field read off it becomes an error.
 */
export function readSave(raw: unknown): Partial<GameState> | null {
  if (!raw || typeof raw !== 'object') return null;
  const probe = raw as { version?: unknown; lifetimeHappiness?: unknown };
  // v2 and v3 are the same document, v3 with three more fields, so one reader
  // serves both — a v2 payload simply leaves the globes and the lane to their
  // defaults. Writing always emits the current version.
  if (typeof probe.version === 'number' && READABLE_VERSIONS.has(probe.version)) {
    return saveToState(raw as SaveData);
  }
  // Anything that is not v2/v3 but carries the old currency is a v1 save.
  if (typeof probe.lifetimeHappiness === 'number') return migrateV1(raw as LegacySaveV1);
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Storage
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The guaranteed write.
 *
 * Synchronous, same-process, no network — which is why it is the one that runs
 * first in every path, including the one where the tab is being torn down. The
 * server write is how a save reaches another device; *this* is how a save
 * survives closing the laptop.
 */
export function saveLocal(state: GameState, at = Date.now()): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(stateToSave(state, at)));
  } catch {
    // Private browsing, quota, a disabled storage API — none of which should
    // interrupt a game that also saves to the server.
  }
}

export function loadLocal(): unknown {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const SAVE_URL = '/api/temple-of-joy/save';

export async function saveToServer(state: GameState, at = Date.now()): Promise<void> {
  await fetch(SAVE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `keepalive` lets the request outlive the document, which matters on the
    // paths that fire while the page is going away.
    keepalive: true,
    body: JSON.stringify({ saveData: stateToSave(state, at) }),
  });
}

/**
 * The last-chance write, for when the page is being torn down.
 *
 * A plain `fetch` issued from `pagehide` is routinely cancelled mid-flight —
 * the browser is under no obligation to finish a request for a document that
 * no longer exists. `sendBeacon` is the API built for exactly this: the
 * request is handed to the browser's own queue and survives the unload.
 *
 * Both it and `keepalive` cap the body at 64 KB, and a late-game save can
 * approach that, so a `false` return falls through to `keepalive` and, failing
 * that, to nothing at all — which is survivable, because {@link saveLocal} has
 * already run by the time this is called.
 */
export function saveBeacon(state: GameState, at = Date.now()): boolean {
  const body = JSON.stringify({ saveData: stateToSave(state, at) });

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // The Blob's type becomes the Content-Type; without it the route sees
      // `text/plain` and some stacks refuse to parse the body.
      if (navigator.sendBeacon(SAVE_URL, new Blob([body], { type: 'application/json' }))) {
        return true;
      }
    }
  } catch {
    // Beacon can throw on a body the browser considers too large.
  }

  try {
    void fetch(SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function loadFromServer(): Promise<unknown> {
  try {
    const res = await fetch('/api/temple-of-joy/save');
    if (!res.ok) return null;
    const json = (await res.json()) as { saveData?: unknown };
    return json.saveData ?? null;
  } catch {
    return null;
  }
}

/* ── Import / export ─────────────────────────────────────────────────────── */

export function exportSave(state: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(stateToSave(state)))));
}

export function importSave(encoded: string): Partial<GameState> | null {
  try {
    return readSave(JSON.parse(decodeURIComponent(escape(atob(encoded.trim())))));
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Autosave
   ══════════════════════════════════════════════════════════════════════════ */

/** The heartbeat, while the player is here. */
export const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * Save once this long after the last interaction.
 *
 * The case this exists for is the common one: somebody plays for a minute,
 * puts the phone down mid-interval, and the tab is later killed by the OS
 * without ever firing `pagehide`. Fifteen seconds of quiet is a reliable
 * signal that now is a good moment, and it costs one request.
 */
export const IDLE_SAVE_MS = 15_000;

/**
 * Never write to the server more often than this.
 *
 * The endpoint is rate-limited to 20 requests a minute; between the interval,
 * the idle timer and every tab switch, an engaged player could otherwise walk
 * into their own 429. Local writes are not throttled — they cost nothing.
 */
export const MIN_SERVER_GAP_MS = 10_000;

/** What prompted a save. Only used to decide *how* to reach the server. */
type SaveReason = 'interval' | 'idle' | 'hidden' | 'unload' | 'manual';

/**
 * Keep the save current: on a timer, shortly after the player stops touching
 * anything, and on every path by which a tab can go away.
 *
 * Three properties are worth stating, because each is a bug somebody has
 * shipped before:
 *
 * 1. **Local storage is written first, synchronously, on every path.** It is
 *    the only write that cannot be cancelled by the page disappearing, and the
 *    loader takes whichever of local and server is newer — so a killed tab
 *    costs nothing on the same device.
 * 2. **The teardown paths use `sendBeacon`**, not `fetch`. A plain request
 *    issued from `pagehide` is routinely dropped.
 * 3. **`visibilitychange → hidden` is the load-bearing one on mobile.** iOS
 *    and Android frequently never fire `pagehide` or `beforeunload` at all;
 *    backgrounding the app is the last event you are guaranteed to see, so it
 *    is treated as a full save rather than a hint.
 */
export function useAutoSave(intervalMs = AUTOSAVE_INTERVAL_MS): void {
  useEffect(() => {
    let lastServerWrite = 0;
    let idleTimer = 0;
    /** Set once the idle save has fired; cleared by the next interaction. */
    let idleSaved = false;

    const flush = (reason: SaveReason) => {
      const state = useTempleStore.getState();
      // Saving before the load has finished would write the empty initial
      // state over a real save — the one genuinely destructive thing this
      // module can do.
      if (!state.initialized) return;

      const now = Date.now();
      saveLocal(state, now);

      const leaving = reason === 'hidden' || reason === 'unload';
      if (leaving) {
        saveBeacon(state, now);
        lastServerWrite = now;
      } else if (now - lastServerWrite >= MIN_SERVER_GAP_MS) {
        lastServerWrite = now;
        saveToServer(state, now).catch(() => {
          // The local write above already succeeded; a failed server write
          // just means this device is the freshest copy for now. Rewind the
          // clock so the next tick retries promptly rather than in 10s.
          lastServerWrite = 0;
        });
      }

      useTempleStore.setState({ lastSaved: now });
    };

    /* ── The heartbeat ── */
    const interval = window.setInterval(() => flush('interval'), intervalMs);

    /* ── Inactivity ── */
    const armIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        if (idleSaved) return;
        idleSaved = true;
        flush('idle');
      }, IDLE_SAVE_MS);
    };

    const onActivity = () => {
      idleSaved = false;
      armIdle();
    };

    // Passive listeners: this must not delay a tap in a game whose whole
    // interface is taps.
    const activity = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const event of activity) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    armIdle();

    /* ── Going away ── */
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush('hidden');
      else onActivity();
    };
    const onPageHide = () => flush('unload');
    // Fired when a page enters the back/forward cache — the tab is not closing
    // but it is about to stop running, which amounts to the same thing here.
    const onFreeze = () => flush('unload');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('freeze', onFreeze);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(idleTimer);
      for (const event of activity) window.removeEventListener(event, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('freeze', onFreeze);
      // Navigating away inside the app is a teardown like any other.
      flush('unload');
    };
  }, [intervalMs]);
}

/** Save right now, from a button or an irreversible moment. */
export function saveNow(): Promise<void> {
  const state = useTempleStore.getState();
  const now = Date.now();
  saveLocal(state, now);
  useTempleStore.setState({ lastSaved: now });
  return saveToServer(state, now);
}

/**
 * Erase everything, everywhere.
 *
 * Local first and unconditionally: the local copy is the one that survives a
 * closed laptop, so a wipe that cleared only the server would be undone by the
 * next autosave the moment the page reloaded. The server call is best-effort
 * for the same reason it is best-effort on the way out — a signed-out player
 * has no row to delete and gets a 401, which is not a failure of this
 * operation.
 *
 * Returns nothing to check. There is no partial success worth reporting to a
 * player: either the game in front of them is empty or it is not, and the
 * caller resets the store either way.
 */
export async function clearSave(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Private browsing, quota, a disabled storage API.
  }

  try {
    await fetch(SAVE_URL, { method: 'DELETE', keepalive: true });
  } catch {
    // Offline, signed out, or the request outlived the page. The local copy is
    // already gone, which is what the player asked for.
  }
}
