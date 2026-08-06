/**
 * Slice It — modifier pools (`R1`).
 *
 * ## Why a pool and not the modifier set
 *
 * A leaderboard row is only meaningful against rows describing a comparable
 * run. `SongLeaderboard` used to key on `(songId, userId)` — one row per player
 * per song across all four difficulties and all 2^7 modifier combinations — so
 * an `easy` run with six modifiers sat on the same board as an `expert` full
 * combo, and setting a personal best on `normal` overwrote your `expert`
 * record.
 *
 * The obvious fix is a board per modifier combination. It is also the wrong one:
 * 256 boards with one entry each is not a leaderboard. So the board is keyed by
 * `(songId, difficulty, modPool, userId)`, and this module is the whole
 * definition of `modPool` — three buckets chosen so that within one, runs are
 * genuinely comparable.
 *
 * ## The three pools
 *
 * | pool        | what is in it                                              |
 * | ----------- | ---------------------------------------------------------- |
 * | `none`      | the chart as written, at 1.0x, with nothing switched on     |
 * | `standard`  | speed, and the risk gauges that can only *shorten* a run    |
 * | `challenge` | anything that changes what you SEE or how tight the windows are |
 *
 * `difficulty` is deliberately **not** a pool input: it is its own dimension of
 * the board key, so an `expert` run is never compared against a `normal` one no
 * matter which pool both land in.
 *
 * Browser-free and Node-free: this is imported by the engine-side UI, by
 * `/api/slice-it/score` and by the leaderboard route, and by the backfill test —
 * the same rule `constants.ts` follows, for the same reason.
 */

import { DIFFICULTIES } from './constants';
import { activeModifierKeys } from './modifiers';
import type { Modifiers } from './types';

/** The pools, in escalating order. Stored as a `VARCHAR(16)` on the board row. */
export const MOD_POOLS = ['none', 'standard', 'challenge'] as const;
export type ModPool = (typeof MOD_POOLS)[number];

/** The default a row falls back to when nothing better is known. */
export const DEFAULT_MOD_POOL: ModPool = 'none';

/**
 * Modifiers that change what the player can see, or how tight the judgement
 * windows are.
 *
 * These are the ones that make a run incomparable rather than merely harder: a
 * chart you cannot read and a chart with 70% windows are different *games*, and
 * a score set under either says nothing about a score set without them. Note
 * that they are all worth a score bonus, so they cannot be pooled with clean
 * runs in either direction — the bonus would make them dominate, and stripping
 * the bonus would make them pointless.
 */
export const CHALLENGE_MODIFIERS = [
  'invisible',
  'spin',
  'strictTiming',
  'oneTrack',
  'switching',
  'bombs',
] as const satisfies readonly (keyof Modifiers)[];

/**
 * The pool a run belongs to.
 *
 * `suddenDeath` and `healthGauge` are deliberately **not** challenge
 * modifiers even though both pay a bonus. Everything they can do is end the run
 * early — neither reveals a note, moves a note or widens a window — so a run
 * that survived one is a run of the same chart, played the same way, that
 * happened to carry more risk. Sorting them into `challenge` would mean a
 * player who ticks the gauge for the 0.2 bonus disappears off the board they
 * actually play on.
 *
 * Accepts a partial set (a `modifiers` JSON blob written before a flag existed)
 * because that is what the backfill and every historical row hand it.
 */
export function poolOf(modifiers: Partial<Modifiers> | null | undefined): ModPool {
  if (!modifiers) return 'none';

  if (CHALLENGE_MODIFIERS.some((key) => modifiers[key] === true)) return 'challenge';

  // `activeModifierKeys` is the same "what differs from the defaults" list the
  // badges are built from, so a modifier that is worth showing to a player is
  // exactly one that is worth splitting a board on. It already excludes
  // `difficulty`, which is its own key column.
  const active = activeModifierKeys({ ...EMPTY_MODIFIERS, ...modifiers });
  return active.length === 0 ? 'none' : 'standard';
}

/**
 * A zero-value modifier set, used only to fill the gaps in a partial blob
 * before handing it to `activeModifierKeys`.
 *
 * Not `DEFAULT_MODIFIERS`: importing that would be correct today and a
 * time bomb the moment a default stops being "off", because then a row that
 * simply omitted a key would inherit an *active* modifier it never had.
 */
const EMPTY_MODIFIERS: Modifiers = {
  invisible: false,
  speed: 1,
  suddenDeath: false,
  bombs: false,
  switching: false,
  spin: false,
  strictTiming: false,
  oneTrack: false,
  healthGauge: false,
  difficulty: 'normal',
};

/**
 * The pool for a **stored leaderboard row**, from the two things such a row
 * carries: its `modifiers` JSON blob and its `speedMod` column.
 *
 * This is the TypeScript mirror of the `CASE` expression in
 * `prisma/migrations/20260806160500_slice_it_leaderboard_rekey/migration.sql`,
 * and it exists so the backfill's logic can be tested at all — the migration is
 * SQL that runs once against a database this repo's test suite does not have.
 * `lib/slice-it/__tests__/pools.test.ts` pins the two together case by case.
 * **Change one, change the other.**
 *
 * It differs from {@link poolOf} in exactly one way, and deliberately:
 * `speedMod` is a real column that `poolOf` never sees, and on a historical row
 * it is the more trustworthy of the two — it was written by the server from the
 * clamped modifier set, while the JSON blob is whatever the client sent that
 * day. Both are consulted; either one saying "not 1.0x" is enough.
 */
export function poolOfStoredRow(row: {
  modifiers: Partial<Modifiers> | null | undefined;
  speedMod?: number | null;
}): ModPool {
  const modifiers = row.modifiers ?? {};

  if (CHALLENGE_MODIFIERS.some((key) => modifiers[key] === true)) return 'challenge';

  const speedColumn = typeof row.speedMod === 'number' ? row.speedMod : 1;
  const speedJson = typeof modifiers.speed === 'number' ? modifiers.speed : 1;
  if (
    modifiers.suddenDeath === true ||
    modifiers.healthGauge === true ||
    speedColumn !== 1 ||
    speedJson !== 1
  ) {
    return 'standard';
  }
  return 'none';
}

/**
 * The difficulty for a stored row — the other half of the backfill.
 *
 * Same fallback `ModifiersZ` applies to a blob with no `difficulty` key at all:
 * `normal`. An unrecognised value falls back rather than being trusted, because
 * the column is part of a unique key and a typo would mint a board of one.
 */
export function difficultyOfStoredRow(modifiers: Partial<Modifiers> | null | undefined): string {
  const raw = modifiers?.difficulty;
  return typeof raw === 'string' && (DIFFICULTIES as readonly string[]).includes(raw)
    ? raw
    : 'normal';
}

/** Narrow an arbitrary string (a DB column, a query param) to a pool. */
export function isModPool(value: unknown): value is ModPool {
  return typeof value === 'string' && (MOD_POOLS as readonly string[]).includes(value);
}

/** Coerce anything to a pool, defaulting rather than throwing. */
export function toModPool(value: unknown): ModPool {
  return isModPool(value) ? value : DEFAULT_MOD_POOL;
}
