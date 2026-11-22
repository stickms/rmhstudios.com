/**
 * The move log of one Lights Out attempt, for "Save replay".
 *
 * A replay is the day's seed plus the ordered cells the player toggled; the server re-simulates it
 * (`verifyLightsOut` in `lib/game/replay.ts`) and refuses a log that does not solve the seed's board. The log is
 * kept as plain `[row, col]` pairs so it is exactly the payload the replay schema takes.
 */

/** The replay schema's bound on a log (`lightsOutSchema.inputs`). */
export const MAX_REPLAY_MOVES = 2_000;

export type LightsOutMove = [number, number];

export const emptyMoveLog = (): LightsOutMove[] => [];

/** The log after one more toggle. Past the bound the log stops growing, so it can no longer match the move count. */
export function appendMove(log: readonly LightsOutMove[], r: number, c: number): LightsOutMove[] {
  return log.length >= MAX_REPLAY_MOVES ? [...log] : [...log, [r, c]];
}

/** The log after taking the last move back. */
export function undoMove(log: readonly LightsOutMove[]): LightsOutMove[] {
  return log.slice(0, -1);
}

/**
 * The replay payload for a finished attempt, or null when there is nothing honest to save: no moves, a log that
 * is out of step with the move count (a solve restored from a saved result has no log), or one past the bound.
 */
export function buildReplayData(
  seed: number,
  log: readonly LightsOutMove[],
  moves: number,
): { seed: number; inputs: LightsOutMove[] } | null {
  if (log.length === 0 || log.length > MAX_REPLAY_MOVES || log.length !== moves) return null;
  return { seed, inputs: log.map(([r, c]) => [r, c] as LightsOutMove) };
}
