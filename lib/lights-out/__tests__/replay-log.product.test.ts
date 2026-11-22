import { describe, expect, it } from 'vitest';
import { createSeededRng } from '@/lib/lights-out/seed';
import { getDailyShape, isActiveCell } from '@/lib/lights-out/shapes';
import { generatePuzzle, isSolved, solvePuzzle, toggleCellInGrid } from '@/lib/lights-out/lights-out';
import { replayableGames } from '@/lib/game/replay';
import {
  MAX_REPLAY_MOVES,
  appendMove,
  buildReplayData,
  emptyMoveLog,
  undoMove,
  type LightsOutMove,
} from '@/lib/lights-out/replay-log';

const SEED = 20261122;

/** Play the seed's puzzle the way the game does, logging every toggle. */
function playSolve(seed: number): LightsOutMove[] {
  const shape = getDailyShape(seed);
  let grid = generatePuzzle(createSeededRng(seed), shape);
  let log = emptyMoveLog();
  for (const [r, c] of solvePuzzle(grid, shape) ?? []) {
    log = appendMove(log, r, c);
    grid = toggleCellInGrid(grid, r, c, shape);
  }
  expect(isSolved(grid, shape)).toBe(true);
  return log;
}

describe('the Lights Out move log', () => {
  it('records a solve that the replay verifier accepts, with the move count as its score', () => {
    const log = playSolve(SEED);
    const data = buildReplayData(SEED, log, log.length);
    expect(data).not.toBeNull();
    expect(replayableGames['lights-out']!.verify!(data)).toEqual({ score: log.length });
  });

  it('only records cells the board has', () => {
    const shape = getDailyShape(SEED);
    for (const [r, c] of playSolve(SEED)) expect(isActiveCell(shape, r, c)).toBe(true);
  });

  it('takes the last move back with undo', () => {
    const log = appendMove(appendMove(emptyMoveLog(), 0, 1), 2, 3);
    expect(undoMove(log)).toEqual([[0, 1]]);
    expect(undoMove(emptyMoveLog())).toEqual([]);
  });

  it('starts empty after a restart, and an empty log is not offered as a replay', () => {
    expect(emptyMoveLog()).toEqual([]);
    expect(buildReplayData(SEED, emptyMoveLog(), 0)).toBeNull();
  });

  it('offers nothing when the log is out of step with the move count', () => {
    const log = playSolve(SEED);
    expect(buildReplayData(SEED, log, log.length + 1)).toBeNull();
  });

  it('stops at the 2 000 move bound the replay schema holds', () => {
    let log = emptyMoveLog();
    for (let i = 0; i < MAX_REPLAY_MOVES + 5; i++) log = appendMove(log, 0, 0);
    expect(log).toHaveLength(MAX_REPLAY_MOVES);
    expect(buildReplayData(SEED, log, MAX_REPLAY_MOVES)).not.toBeNull();
    // a longer attempt has a move count the log no longer matches
    expect(buildReplayData(SEED, log, MAX_REPLAY_MOVES + 5)).toBeNull();
  });

  it('does not alias the log it was given', () => {
    const log = playSolve(SEED);
    const data = buildReplayData(SEED, log, log.length)!;
    data.inputs[0]![0] = 99;
    expect(log[0]![0]).not.toBe(99);
  });
});
