/**
 * Bum's Rush — the client-side save: localStorage for guests, the account
 * for signed-in players, and the merge between them (design doc §10.4).
 *
 * No `.server` suffix on purpose — this runs in the browser. It never touches
 * Prisma; the one server-side persistence path is
 * `lib/bums-rush/progress/save.server.ts`, which this file must not import
 * (the reverse import — server code reading `createDefaultProfile` from
 * here — is fine and is exactly what `save.server.ts` does).
 *
 * ## Why a custom transport, not the shared `jsonTransport`
 *
 * `jsonTransport` speaks the generic `{ saveData }` envelope so a game with no
 * table of its own can share `/api/game-saves/:gameId`. Bum's Rush has its own
 * table and its own route (`/api/bums-rush/profile`, GET/PUT), whose body
 * *is* the profile — no wrapper — because the server needs those fields named
 * to validate and index them, not buried inside an opaque blob. That is the
 * "own-table game" case `cloud-save.ts`'s docs call out for a custom
 * {@link CloudTransport}.
 *
 * ## Why one localStorage key, not the two the design doc names
 *
 * §10.4 describes guest storage as two keys, `bums-rush:profile:v1` and
 * `bums-rush:clears:v1`. The shared `Profile` contract (`lib/bums-rush/types.ts`,
 * which this module may not edit) already nests `clears` inside `Profile`,
 * and `createCloudSave<T>` manages exactly one key plus its metadata sibling.
 * Splitting `Profile` back into two stored documents would mean re-assembling
 * it on every read for no benefit, so this module keeps the one key the type
 * already implies (`bums-rush:profile:v1`) and treats the second name in the
 * doc as describing the *shape*, not a second `localStorage.setItem` call.
 */
import { createCloudSave, type CloudTransport } from '@/lib/game-saves/cloud-save';
import {
  untranslated,
  type MonotonicCounters,
  type SaveSummary,
  type SummaryTranslate,
} from '@/lib/game-saves/conflict';
import type { Cosmetics, GameSettings, LevelClear, Profile } from '@/lib/bums-rush/types';
import { ASSIST, DEFAULT_ASSISTS, DEFAULT_COSMETICS } from '@/lib/bums-rush/constants';
import { isValidCosmetics } from '@/lib/bums-rush/cosmetics';
import { clearKey, distinctLevelsCleared, mergeProfiles, type MergeReport } from './merge';

export const BUMS_RUSH_LOCAL_KEY = 'bums-rush:profile:v1';
const PROFILE_ENDPOINT = '/api/bums-rush/profile';

/* ══════════════════════════════════════════════════════════════════════════
   Defaults
   ══════════════════════════════════════════════════════════════════════════ */

function defaultSettings(): GameSettings {
  return {
    assists: { ...DEFAULT_ASSISTS },
    music: 0.7,
    sfx: 0.9,
    ui: 0.7,
    rumble: 1,
    alwaysShowTags: false,
    catAfterWipes: ASSIST.CAT_WIPES_DEFAULT,
    touchScheme: 'auto-grab',
    touchTilt: false,
    deadzone: 0.15,
    saturation: 1,
    padBrand: 'auto',
  };
}

/** A brand-new profile — what a player who has never saved before starts with. */
export function createDefaultProfile(now = Date.now()): Profile {
  return {
    cosmetics: { ...DEFAULT_COSMETICS },
    // §11.2 "first launch": heads 1-3, the default gloves, the four seat inks.
    unlockedCosmetics: [
      'biro',
      'eraser',
      'sharpener',
      'mitten',
      'seat-1',
      'seat-2',
      'seat-3',
      'seat-4',
    ],
    parcelsFound: [],
    posesFound: [],
    recipesMade: [],
    clears: {},
    levelsCleared: 0,
    deaths: 0,
    metresSwung: 0,
    showdownRating: 1000,
    showdownWins: 0,
    showdownLosses: 0,
    settings: defaultSettings(),
    updatedAt: now,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Parsing (the corruption guard)
   ══════════════════════════════════════════════════════════════════════════ */

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function parseCosmetics(v: unknown): Cosmetics {
  if (v && typeof v === 'object') {
    const c = v as Partial<Cosmetics>;
    const candidate: Cosmetics = {
      head: typeof c.head === 'string' ? c.head : DEFAULT_COSMETICS.head,
      hat: typeof c.hat === 'string' ? c.hat : null,
      gloves: typeof c.gloves === 'string' ? c.gloves : DEFAULT_COSMETICS.gloves,
      ink: typeof c.ink === 'string' ? c.ink : DEFAULT_COSMETICS.ink,
    };
    if (isValidCosmetics(candidate)) return candidate;
  }
  return { ...DEFAULT_COSMETICS };
}

function parseSettings(v: unknown): GameSettings {
  const base = defaultSettings();
  if (!v || typeof v !== 'object') return base;
  const s = v as Partial<GameSettings>;
  return {
    assists:
      s.assists && typeof s.assists === 'object' ? { ...base.assists, ...s.assists } : base.assists,
    music: num(s.music, base.music),
    sfx: num(s.sfx, base.sfx),
    ui: num(s.ui, base.ui),
    rumble: num(s.rumble, base.rumble),
    alwaysShowTags: Boolean(s.alwaysShowTags),
    catAfterWipes:
      s.catAfterWipes === 0 || s.catAfterWipes === 3 || s.catAfterWipes === 6
        ? s.catAfterWipes
        : base.catAfterWipes,
    touchScheme: s.touchScheme === 'two-stick' ? 'two-stick' : 'auto-grab',
    touchTilt: Boolean(s.touchTilt),
    deadzone: num(s.deadzone, base.deadzone),
    saturation: num(s.saturation, base.saturation),
    padBrand:
      s.padBrand === 'xbox' ||
      s.padBrand === 'playstation' ||
      s.padBrand === 'nintendo' ||
      s.padBrand === 'generic'
        ? s.padBrand
        : 'auto',
  };
}

function parseClear(v: unknown): LevelClear | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Partial<LevelClear>;
  if (typeof c.levelId !== 'string' || !c.levelId) return null;
  const playerCount = Math.round(num(c.playerCount, 0));
  if (playerCount < 1 || playerCount > 4) return null;
  return {
    levelId: c.levelId,
    playerCount,
    bestMs: Math.max(0, Math.round(num(c.bestMs, 0))),
    objectives: Math.max(0, Math.round(num(c.objectives, 0))) & 0b111,
    assisted: Boolean(c.assisted),
    clears: Math.max(1, Math.round(num(c.clears, 1))),
  };
}

function parseClears(v: unknown): Record<string, LevelClear> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, LevelClear> = {};
  // Re-keyed from the parsed record's own `(levelId, playerCount)` rather
  // than trusting the stored object key — a hand-edited save (or a bug) could
  // carry a key that no longer matches the value under it, and a lookup by
  // `clearKey(levelId, playerCount)` would silently miss that record forever.
  for (const value of Object.values(v as Record<string, unknown>)) {
    const parsed = parseClear(value);
    if (parsed) out[clearKey(parsed.levelId, parsed.playerCount)] = parsed;
  }
  return out;
}

/**
 * Read whatever a `read()`/`localStorage` call returned back into a `Profile`,
 * or `null` if it is not one. Every field is rebuilt with a guard rather than
 * trusted, the same discipline `temple-of-joy/persistence.ts` uses — a save
 * file a player (or a bug) can hand-edit is not allowed to crash the loader.
 */
export function parseProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Profile>;
  const clears = parseClears(p.clears);
  return {
    cosmetics: parseCosmetics(p.cosmetics),
    unlockedCosmetics: strings(p.unlockedCosmetics),
    parcelsFound: strings(p.parcelsFound),
    posesFound: strings(p.posesFound),
    recipesMade: strings(p.recipesMade),
    clears,
    levelsCleared: distinctLevelsCleared(clears),
    deaths: Math.max(0, Math.round(num(p.deaths, 0))),
    metresSwung: Math.max(0, Math.round(num(p.metresSwung, 0))),
    showdownRating: Math.round(num(p.showdownRating, 1000)),
    showdownWins: Math.max(0, Math.round(num(p.showdownWins, 0))),
    showdownLosses: Math.max(0, Math.round(num(p.showdownLosses, 0))),
    settings: parseSettings(p.settings),
    updatedAt: num(p.updatedAt, 0),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Transport
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `/api/bums-rush/profile`'s own shape: the body IS the profile, both ways —
 * see the module doc for why this is a custom transport rather than
 * `jsonTransport`.
 */
const profileTransport: CloudTransport = {
  async read() {
    const res = await fetch(PROFILE_ENDPOINT);
    if (!res.ok) return null;
    return res.json();
  },

  async write(payload) {
    const res = await fetch(PROFILE_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`bums-rush profile save failed: ${res.status}`);
  },

  beacon(payload) {
    // `navigator.sendBeacon` can only issue a POST, and this route is PUT —
    // go straight to the fallback `jsonTransport.beacon` itself uses once
    // `sendBeacon` isn't an option: a `keepalive` fetch, best-effort.
    try {
      void fetch(PROFILE_ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(payload),
      }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  },

  async remove() {
    await fetch(PROFILE_ENDPOINT, { method: 'DELETE', keepalive: true });
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   The save
   ══════════════════════════════════════════════════════════════════════════ */

function monotonic(save: Profile): MonotonicCounters {
  return {
    levelsCleared: save.levelsCleared,
    deaths: save.deaths,
    metresSwung: save.metresSwung,
    parcels: save.parcelsFound.length,
    poses: save.posesFound.length,
    recipes: save.recipesMade.length,
    showdownWins: save.showdownWins,
  };
}

export function summarizeProfile(save: Profile, t: SummaryTranslate): SaveSummary {
  return {
    savedAt: save.updatedAt,
    headline: t('save-summary-levels', {
      cleared: save.levelsCleared,
      defaultValue: '{{cleared}} of 72 levels cleared',
    }),
    lines: [
      {
        label: t('save-summary-parcels', { defaultValue: 'Parcels found' }),
        value: String(save.parcelsFound.length),
      },
      {
        label: t('save-summary-poses', { defaultValue: 'Poses found' }),
        value: String(save.posesFound.length),
      },
      {
        label: t('save-summary-recipes', { defaultValue: 'Recipes made' }),
        value: String(save.recipesMade.length),
      },
      {
        label: t('save-summary-showdown', { defaultValue: 'Showdown record' }),
        value: `${save.showdownWins}-${save.showdownLosses}`,
      },
    ],
  };
}

/**
 * The save itself. `progress/unlocks.ts` and `screens/Wardrobe.tsx` (a
 * separate ticket) read `bumsRushSave.readLocal()`/`.getIdentity()` and call
 * the functions below rather than reaching into `createCloudSave` directly,
 * so this file stays the one seam that knows the transport is custom and the
 * local key is singular.
 */
export const bumsRushSave = createCloudSave<Profile>({
  gameId: 'bums-rush',
  localKey: BUMS_RUSH_LOCAL_KEY,
  transport: profileTransport,
  parse: parseProfile,
  monotonic,
  savedAt: (save) => save.updatedAt,
  summarize: (save) => summarizeProfile(save, untranslated),
});

export function setSaveIdentity(userId: string | null): void {
  bumsRushSave.setIdentity(userId);
}

/** The local copy, or a fresh default profile if there is none yet (never `null` — there is always something to render). */
export function loadOrCreateLocalProfile(): Profile {
  return bumsRushSave.readLocal() ?? createDefaultProfile();
}

export function saveLocalProfile(profile: Profile): void {
  bumsRushSave.writeLocal(profile);
}

export function saveProfileToServer(profile: Profile): Promise<void> {
  return bumsRushSave.writeCloud(profile);
}

export function saveProfileBeacon(profile: Profile): boolean {
  return bumsRushSave.writeBeacon(profile);
}

export function loadProfileFromServer(): Promise<Profile | null> {
  return bumsRushSave.readCloud();
}

/**
 * Record one freshly-finished level into a profile, in place of a merge.
 *
 * This is not the §10.4 two-history merge (that combines two independent
 * pasts); it is "one more data point arrived", used for guest play (no
 * server round trip) and to keep the local mirror current after a signed-in
 * clear. The kept `assisted` flag describes whichever run's time survived —
 * the better of the two, never a stale one from a worse run.
 */
export function applyLevelClear(
  profile: Profile,
  clear: {
    levelId: string;
    playerCount: number;
    bestMs: number;
    objectives: number;
    assisted: boolean;
  },
  now = Date.now(),
): Profile {
  const key = clearKey(clear.levelId, clear.playerCount);
  const existing = profile.clears[key];
  const better = !existing || clear.bestMs < existing.bestMs;
  const nextClear: LevelClear = {
    levelId: clear.levelId,
    playerCount: clear.playerCount,
    bestMs: better ? clear.bestMs : existing.bestMs,
    objectives: (existing?.objectives ?? 0) | clear.objectives,
    assisted: better ? clear.assisted : existing.assisted,
    clears: (existing?.clears ?? 0) + 1,
  };
  const clears = { ...profile.clears, [key]: nextClear };
  return { ...profile, clears, levelsCleared: distinctLevelsCleared(clears), updatedAt: now };
}

/**
 * The §10.4 sign-in merge. Call once when a session transitions from signed
 * out to signed in — not on every save. Returns `null` when there was
 * nothing to reconcile (no local save, no cloud save, or exactly one of the
 * two exists and simply becomes the truth), and the {@link MergeReport}
 * otherwise so the caller can show the one-line toast §10.4 asks for.
 */
export async function mergeOnSignIn(userId: string): Promise<MergeReport | null> {
  setSaveIdentity(userId);
  const local = bumsRushSave.readLocal();
  const cloud = await loadProfileFromServer();

  if (!local && !cloud) return null;
  if (!local) {
    saveLocalProfile(cloud!);
    return null;
  }
  if (!cloud) {
    await bumsRushSave.commit(local);
    return null;
  }

  const { merged, report } = mergeProfiles(local, cloud);
  await bumsRushSave.commit(merged);
  return report;
}

export async function clearProfileEverywhere(): Promise<void> {
  await bumsRushSave.clear();
}
