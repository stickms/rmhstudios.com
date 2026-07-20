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
  | string
  | number
  | boolean
  | null
  | ReplayJsonValue[]
  | { [key: string]: ReplayJsonValue };

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
const lightsOutMove = z.tuple([
  z.number().int().min(0).max(31),
  z.number().int().min(0).max(31),
]);

const lightsOutSchema = z.object({
  // Non-negative because getDailyShape uses `seed % SHAPES.length`; a negative
  // seed would index the shape table out of range.
  seed: z.number().int().min(0).max(99_999_999),
  inputs: z.array(lightsOutMove).min(1).max(2_000),
});

export type LightsOutReplay = z.infer<typeof lightsOutSchema>;

/** Reconstruct the exact starting board a given seed produces. */
export function lightsOutInitialGrid(seed: number): { grid: Grid; shape: ReturnType<typeof getDailyShape> } {
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
 * themselves are honest against the track — that requires the beat-map and is
 * future work (see design §7). This is the "shape-validated + bounded" tier.
 * ------------------------------------------------------------------ */

export const SLICE_IT_VERSION = 'si-1';

const sliceItJudgment = z.enum(['perfect', 'great', 'good', 'miss']);

const sliceItSchema = z.object({
  track: z.string().min(1).max(64),
  seed: z.number().int().min(0).max(99_999_999).optional(),
  inputs: z
    .array(
      z.object({
        t: z.number().min(0).max(60 * 60 * 1000), // ms into the track (≤ 1h)
        lane: z.number().int().min(0).max(7).optional(),
        judgment: sliceItJudgment,
      }),
    )
    .min(1)
    .max(20_000),
});

export type SliceItReplay = z.infer<typeof sliceItSchema>;

/** Base points per judgment; a combo multiplier grows up to 2× at 100-combo. */
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
