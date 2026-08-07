/**
 * Replay capture contract (platform expansion §7).
 *
 * v1 targets DETERMINISTIC single-player games: a replay is nothing more than a
 * seed plus an ordered input log — no video. Because the game is deterministic,
 * the exact run can be re-derived (and re-scored) from `(seed, inputs)` alone,
 * which is what makes replays cheap to store and, crucially, *verifiable* on the
 * server: `verify()` re-simulates the log and returns the authoritative score,
 * or `null` when the log is invalid/inconsistent (a rejected submission).
 *
 * This module is intentionally pure (no `.server` deps) so both the server
 * (`lib/replays.server.ts`) and the client player (`components/replays/*`) can
 * import the schemas, versions, and — for games whose logic is pure — the
 * re-simulation itself.
 *
 * Adopting a new game = add one entry to {@link replayableGames}. Adopting games
 * MUST bump their `version` on any logic change that would alter re-simulation,
 * so older replays fall back to the version-mismatch screen instead of being
 * silently mis-rendered.
 */

import { z } from 'zod';
import { createSeededRng } from '@/lib/lights-out/seed';
import { getDailyShape, isActiveCell, getShapeLabel } from '@/lib/lights-out/shapes';
import { generatePuzzle, toggleCellInGrid, isSolved, type Grid } from '@/lib/lights-out/lights-out';

/** A JSON-serializable value — replay payloads are stored as JSON and travel
 * through server-function loaders, so the element type must be serializable
 * (TanStack's `ValidateSerializableMapped` rejects `unknown`). */
export type ReplayJsonValue =
  string | number | boolean | null | ReplayJsonValue[] | { [key: string]: ReplayJsonValue };

/** Loose base shape every replay payload conforms to. Per-game schemas narrow it. */
export interface ReplayData {
  seed?: number | string;
  inputs?: ReplayJsonValue[];
  snapshots?: ReplayJsonValue[];
}

export interface ReplayableGame {
  /** Stable game key (matches `GameReplay.game`, ≤ 32 chars). */
  game: string;
  /** Logic version (≤ 16 chars). Bump on any change to re-simulation/scoring. */
  version: string;
  /** Zod schema for this game's `data` payload. */
  schema: z.ZodTypeAny;
  /**
   * Re-simulate the run from its log and return the derived score, or `null`
   * when the log is invalid/inconsistent. When present, its score is
   * authoritative (the client-submitted score is not trusted).
   */
  verify?(data: unknown): { score: number } | null;
}

/** Hard cap on stored payload size (`JSON.stringify` byte length). */
export const REPLAY_SIZE_CAP = 256 * 1024;

/* ------------------------------------------------------------------ *
 * Lights Out — fully deterministic; real re-simulation.
 *
 * The daily game derives everything from a single numeric seed:
 *   shape = getDailyShape(seed); grid = generatePuzzle(createSeededRng(seed), shape)
 * (see components/lights-out/LightsOutGame.tsx). So the replay stores only the
 * seed and the ordered list of clicked cells; verify() replays those clicks and
 * accepts the run only if the board ends solved.
 * ------------------------------------------------------------------ */

export const LIGHTS_OUT_VERSION = 'lo-1';

/** A move is a clicked cell [row, col]. Bounds are generous but finite (anti-DoS). */
const lightsOutMove = z.tuple([z.number().int().min(0).max(31), z.number().int().min(0).max(31)]);

const lightsOutSchema = z.object({
  // Non-negative because getDailyShape uses `seed % SHAPES.length`; a negative
  // seed would index the shape table out of range.
  seed: z.number().int().min(0).max(99_999_999),
  inputs: z.array(lightsOutMove).min(1).max(2_000),
});

export type LightsOutReplay = z.infer<typeof lightsOutSchema>;

/** Reconstruct the exact starting board a given seed produces. */
export function lightsOutInitialGrid(seed: number): {
  grid: Grid;
  shape: ReturnType<typeof getDailyShape>;
} {
  const shape = getDailyShape(seed);
  const grid = generatePuzzle(createSeededRng(seed), shape);
  return { grid, shape };
}

/** Human-readable shape label for a lights-out seed (used by chrome/OG). */
export function lightsOutShapeLabel(seed: number): string {
  return getShapeLabel(getDailyShape(seed));
}

function verifyLightsOut(data: unknown): { score: number } | null {
  const parsed = lightsOutSchema.safeParse(data);
  if (!parsed.success) return null;

  const { seed, inputs } = parsed.data;
  const { grid: start, shape } = lightsOutInitialGrid(seed);

  let grid = start;
  for (const [r, c] of inputs) {
    // A click on an inactive/out-of-range cell is impossible in real play →
    // the log is inconsistent with the board this seed produces.
    if (!isActiveCell(shape, r, c)) return null;
    grid = toggleCellInGrid(grid, r, c, shape);
  }

  // A valid replay is a *winning* run: the board must end fully off.
  if (!isSolved(grid, shape)) return null;

  // Fewer moves is better in-game, but the stored score is simply the move
  // count; the leaderboard index sorts it — presentation decides direction.
  return { score: inputs.length };
}

/* ------------------------------------------------------------------ *
 * Slice It! — rhythm game. Not fully re-simulable here (the authoritative
 * beat-map / track data isn't importable as pure logic), so verify() validates
 * the log's *shape and internal consistency* and re-derives the score from the
 * judgment log with a fixed scoring rule. It CANNOT prove the judgments
 * themselves are honest against the track — that requires the beat-map. This is
 * the "shape-validated + bounded" tier.
 *
 * The tier above it now exists and lives where the beat-map does:
 * `lib/slice-it/verify.server.ts` reads `Song.analysisData`, rebuilds the exact
 * chart from `mods`, and re-judges every input with the game's own `judge()`.
 * It is deliberately NOT wired in here — this module is pure by contract, and
 * the check needs the database — so it runs asynchronously after submission
 * (`R8`) and never on the request path.
 * ------------------------------------------------------------------ */

export const SLICE_IT_VERSION = 'si-1';

const sliceItJudgment = z.enum(['perfect', 'great', 'good', 'miss']);

/**
 * The four-value judgement vocabulary this schema stores.
 *
 * Slice It's engine judges in six (`MARVELOUS … MISS`). It maps down to these
 * four on the way in — see `lib/slice-it/replay.ts`, which owns that mapping and
 * documents what the narrowing costs. **This enum is a contract**: it is read by
 * the speedrun verifier and by every game-agnostic consumer of a replay, so it
 * does not grow to fit one game's judgement ladder.
 */
export type SliceItJudgment = z.infer<typeof sliceItJudgment>;

/**
 * Hard cap on the input log, and the size the recorder pre-allocates.
 *
 * 20 000 resolutions is ~11 minutes at `MAX_NOTES_PER_SECOND` (20), i.e. beyond
 * any chart the generator can produce for a track anyone uploads. A run that
 * would exceed it is truncated at the source rather than sent whole and rejected
 * whole — a partial replay of a real run is worth more than a 422.
 */
export const SLICE_IT_MAX_INPUTS = 20_000;

/**
 * The chart- and judgement-determining settings of the run.
 *
 * Optional because the field is newer than the schema, but in practice always
 * present: without it a replay cannot be played back, because Slice It's chart
 * is *generated* — bombs and lane-switches are placed by a PRNG seeded on
 * `(songId, difficulty, bombs, switching, oneTrack)` — and a viewer that
 * rebuilds the chart under different modifiers is showing different notes than
 * the run played. `speed` and `strictTiming` are here for the same reason on the
 * judging side: they scale every hit window.
 */
const sliceItMods = z.object({
  difficulty: z.enum(['easy', 'normal', 'hard', 'expert']).optional(),
  speed: z.number().min(0.25).max(4).optional(),
  bombs: z.boolean().optional(),
  switching: z.boolean().optional(),
  oneTrack: z.boolean().optional(),
  strictTiming: z.boolean().optional(),
});

const sliceItSchema = z.object({
  track: z.string().min(1).max(64),
  /**
   * Fingerprint of the run's chart seed. Slice It's real seed is a string; this
   * is it hashed into the numeric range the cross-game field allows, and is used
   * as a checksum against a chart rebuilt from `mods` — see
   * `lib/slice-it/replay.ts#replaySeed`.
   */
  seed: z.number().int().min(0).max(99_999_999).optional(),
  mods: sliceItMods.optional(),
  /** The chart's content hash at the time of the run (`C12`), when it had one. */
  chartHash: z.string().length(64).optional(),
  inputs: z
    .array(
      z.object({
        t: z
          .number()
          .min(0)
          .max(60 * 60 * 1000), // ms into the track (≤ 1h)
        lane: z.number().int().min(0).max(7).optional(),
        judgment: sliceItJudgment,
      }),
    )
    .min(1)
    .max(SLICE_IT_MAX_INPUTS),
});

/**
 * Exported so Slice It's own routes can compose it (`z.object({ replay: … })`)
 * instead of re-declaring the payload shape a second time and letting the two
 * drift. The registry entry below is the same object.
 */
export const sliceItReplaySchema = sliceItSchema;

export type SliceItReplay = z.infer<typeof sliceItSchema>;

/**
 * Base points per judgment; a combo multiplier grows up to 2× at 100-combo.
 *
 * **This is not the game's scoring rule** and the number it produces is not
 * comparable to a `SongLeaderboard.score`. It is a monotone function of the
 * judgement log whose only job is to be recomputable from the log, so a
 * tampered `GameReplay.score` disagrees with its own inputs. Anything showing a
 * player a score must read the leaderboard row, never this.
 */
const SLICE_IT_POINTS: Record<z.infer<typeof sliceItJudgment>, number> = {
  perfect: 100,
  great: 70,
  good: 40,
  miss: 0,
};

function verifySliceIt(data: unknown): { score: number } | null {
  const parsed = sliceItSchema.safeParse(data);
  if (!parsed.success) return null;

  let score = 0;
  let combo = 0;
  let lastT = -1;
  for (const note of parsed.data.inputs) {
    // Timestamps must be monotonic — a note "before" the previous one means the
    // log was reordered/tampered.
    if (note.t < lastT) return null;
    lastT = note.t;

    if (note.judgment === 'miss') {
      combo = 0;
      continue;
    }
    combo += 1;
    const multiplier = 1 + Math.min(combo, 100) / 100;
    score += Math.round(SLICE_IT_POINTS[note.judgment] * multiplier);
  }

  return { score };
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export const replayableGames: Record<string, ReplayableGame> = {
  'lights-out': {
    game: 'lights-out',
    version: LIGHTS_OUT_VERSION,
    schema: lightsOutSchema,
    verify: verifyLightsOut,
  },
  'slice-it': {
    game: 'slice-it',
    version: SLICE_IT_VERSION,
    schema: sliceItSchema,
    verify: verifySliceIt,
  },
};

export function getReplayable(game: string): ReplayableGame | undefined {
  return replayableGames[game];
}

/** Games that can be captured, for UI menus. */
export const REPLAYABLE_GAME_IDS = Object.keys(replayableGames);

/** Display titles for the capturable games (kept in sync with lib/games.ts). */
export const REPLAY_GAME_TITLES: Record<string, string> = {
  'lights-out': 'Lights Out',
  'slice-it': 'Slice It!',
};
