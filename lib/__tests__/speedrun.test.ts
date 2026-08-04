import { describe, it, expect } from 'vitest';

import {
  laundrySortReplaySchema,
  getSpeedrunVerifier,
  verifySpeedrun,
  verificationTierFor,
  canCaptureRuns,
  SPEEDRUN_VERIFIERS,
} from '@/lib/speedrun/verifier';
import {
  bucketByVersion,
  buildBoard,
  compareVersions,
  filterVersion,
  formatRunTime,
  rankEntries,
  versionsOf,
} from '@/lib/speedrun/versions';
import { ALL_VERSIONS, type SpeedrunEntryView } from '@/lib/speedrun/types';
import { LIGHTS_OUT_VERSION } from '@/lib/game/replay';
import { lightsOutInitialGrid } from '@/lib/game/replay';
import { isActiveCell } from '@/lib/lights-out/shapes';
import { solvePuzzle } from '@/lib/lights-out/lights-out';
import { buildDropSchedule } from '@/lib/laundry-sort/match';

/**
 * The verifier is the feature (design K1), so these tests are about what it
 * ACCEPTS and what it REFUSES — not about whether the code runs.
 *
 * The Lights Out cases build a genuinely winning run by asking the game's own
 * solver for the moves, so "accepted" means the same thing here as it does in
 * production: the board ends dark when the log is replayed.
 */

/** A real solving move list for a seed, from the game's own solver. */
function solutionFor(seed: number): [number, number][] {
  const { grid, shape } = lightsOutInitialGrid(seed);
  const moves = solvePuzzle(grid, shape);
  if (!moves) throw new Error(`seed ${seed} has no solution`);
  return moves;
}

const CLAIM_TIME = { metric: 'time' as const };

describe('speedrun verifier — Lights Out (deterministic tier)', () => {
  const seed = 4242;
  const moves = solutionFor(seed);

  it('verifies a run whose inputs actually solve the board', () => {
    const verdict = verifySpeedrun({
      game: 'lights-out',
      version: LIGHTS_OUT_VERSION,
      data: { seed, inputs: moves },
      claim: { timeMs: moves.length * 500, score: moves.length, ...CLAIM_TIME },
    });

    expect(verdict.status).toBe('verified');
    expect(verdict.tier).toBe('deterministic');
    expect(verdict.derivedScore).toBe(moves.length);
    expect(verdict.reason).toBeUndefined();
  });

  it('rejects a run that does not end on a solved board', () => {
    // Drop the last move: every click was legal, the board simply is not clear.
    const verdict = verifySpeedrun({
      game: 'lights-out',
      version: LIGHTS_OUT_VERSION,
      data: { seed, inputs: moves.slice(0, -1) },
      claim: { timeMs: 30_000, score: moves.length - 1, ...CLAIM_TIME },
    });

    expect(verdict.status).toBe('rejected');
    expect(verdict.reason).toBe('SIMULATION_FAILED');
  });

  it('rejects a click on a cell the board does not have', () => {
    const { shape } = lightsOutInitialGrid(seed);
    // Find a coordinate inside the schema's bounds that is not a real cell.
    let offBoard: [number, number] | null = null;
    for (let r = 0; r < 32 && !offBoard; r++) {
      for (let c = 0; c < 32; c++) {
        if (!isActiveCell(shape, r, c)) {
          offBoard = [r, c];
          break;
        }
      }
    }
    expect(offBoard).not.toBeNull();

    const verdict = verifySpeedrun({
      game: 'lights-out',
      version: LIGHTS_OUT_VERSION,
      data: { seed, inputs: [...moves, offBoard!] },
      claim: { timeMs: 30_000, score: moves.length + 1, ...CLAIM_TIME },
    });

    expect(verdict.status).toBe('rejected');
  });

  it('rejects a score that does not match the re-simulation', () => {
    const verdict = verifySpeedrun({
      game: 'lights-out',
      version: LIGHTS_OUT_VERSION,
      data: { seed, inputs: moves },
      claim: { timeMs: 30_000, score: 1, ...CLAIM_TIME },
    });

    expect(verdict.status).toBe('rejected');
    expect(verdict.reason).toBe('SCORE_MISMATCH');
    // The truth still travels, so a reviewer can see what the run really was.
    expect(verdict.derivedScore).toBe(moves.length);
  });

  it('rejects a time no human could produce for that many inputs', () => {
    const verdict = verifySpeedrun({
      game: 'lights-out',
      version: LIGHTS_OUT_VERSION,
      data: { seed, inputs: moves },
      claim: { timeMs: 1, score: moves.length, ...CLAIM_TIME },
    });

    expect(verdict.status).toBe('rejected');
    expect(verdict.reason).toBe('TIME_IMPLAUSIBLE');
  });

  it('rejects a malformed payload before it reaches the simulation', () => {
    const verdict = verifySpeedrun({
      game: 'lights-out',
      version: LIGHTS_OUT_VERSION,
      data: { seed, inputs: 'not an input log' },
      claim: { timeMs: 30_000, score: 10, ...CLAIM_TIME },
    });

    expect(verdict.status).toBe('rejected');
    expect(verdict.reason).toBe('INVALID_REPLAY');
  });

  it('queues rather than judges a replay from a version it cannot run', () => {
    const verdict = verifySpeedrun({
      game: 'lights-out',
      version: 'lo-999',
      data: { seed, inputs: moves },
      claim: { timeMs: moves.length * 500, score: moves.length, ...CLAIM_TIME },
    });

    // Version drift must never look like cheating: the run is unjudgeable, not
    // wrong.
    expect(verdict.status).toBe('pending');
    expect(verdict.reason).toBe('VERSION_UNSUPPORTED');
  });

  it('demands a score when the category ranks by score', () => {
    const verdict = verifySpeedrun({
      game: 'lights-out',
      version: LIGHTS_OUT_VERSION,
      data: { seed, inputs: moves },
      claim: { timeMs: 30_000, score: null, metric: 'score' },
    });

    expect(verdict.status).toBe('rejected');
    expect(verdict.reason).toBe('SCORE_MISMATCH');
  });
});

describe('speedrun verifier — tiers and registry', () => {
  it('never auto-verifies a consistency-tier game', () => {
    const seed = 77;
    const drops = buildDropSchedule(seed, 60, 'standard');
    const data = {
      seed,
      durationSec: 60,
      difficulty: 'standard' as const,
      inputs: drops.slice(0, 5).map((drop, index) => ({
        drop: index,
        outcome: 'sorted' as const,
        at: drop.at + 1,
      })),
    };

    const verdict = verifySpeedrun({
      game: 'laundry-sort',
      version: '',
      data,
      claim: { timeMs: 60_000, score: null, ...CLAIM_TIME },
    });

    // `versions: []` for laundry-sort, so nothing matches and it queues —
    // which is also the correct answer for a game with no capture contract.
    expect(verdict.status).toBe('pending');
  });

  it('queues a manual-tier game instead of pretending to check it', () => {
    const verdict = verifySpeedrun({
      game: 'dream-rift',
      version: 'dr-1',
      data: { seed: 1, inputs: [] },
      claim: { timeMs: 60_000, score: 500, ...CLAIM_TIME },
    });

    expect(verdict.status).toBe('pending');
    expect(verdict.tier).toBe('manual');
    expect(verdict.reason).toBe('NO_VERIFIER');
  });

  it('queues an unregistered game rather than throwing', () => {
    const verdict = verifySpeedrun({
      game: 'not-a-game',
      version: 'x-1',
      data: {},
      claim: { timeMs: 1_000, score: null, ...CLAIM_TIME },
    });
    expect(verdict.status).toBe('pending');
    expect(verificationTierFor('not-a-game')).toBe('manual');
  });

  it('gives every manual entry a stated reason', () => {
    for (const verifier of SPEEDRUN_VERIFIERS) {
      if (verifier.tier === 'manual') {
        expect(verifier.note, `${verifier.game} must say why it is manual`).toBeTruthy();
        expect(verifier.simulate).toBeUndefined();
      } else {
        expect(verifier.simulate, `${verifier.game} must be able to simulate`).toBeTypeOf(
          'function',
        );
      }
    }
  });

  it('knows which games can even record a run', () => {
    expect(canCaptureRuns('lights-out')).toBe(true);
    // Honest about the gap rather than opening a board nobody can submit to.
    expect(canCaptureRuns('laundry-sort')).toBe(false);
    expect(getSpeedrunVerifier('laundry-sort')?.tier).toBe('consistency');
  });
});

describe('speedrun verifier — Laundry Sort schedule re-derivation', () => {
  const seed = 909;
  const durationSec = 60;
  const difficulty = 'standard' as const;
  const drops = buildDropSchedule(seed, durationSec, difficulty);
  const simulate = getSpeedrunVerifier('laundry-sort')?.simulate;

  function run(inputs: { drop: number; outcome: 'sorted' | 'wrong' | 'missed'; at: number }[]) {
    return simulate!({ seed, durationSec, difficulty, inputs });
  }

  it('re-scores a legal log with the game’s own combo rules', () => {
    const result = run(
      drops.slice(0, 3).map((drop, index) => ({
        drop: index,
        outcome: 'sorted' as const,
        at: drop.at + 0.5,
      })),
    );

    // 120 at combo 0, 132 at combo 1, 144 at combo 2 (10% per step).
    expect(result).toEqual({ ok: true, score: 120 + 132 + 144, inputCount: 3 });
  });

  it('never lets a score go negative', () => {
    const result = run([{ drop: 0, outcome: 'wrong', at: drops[0].at + 0.5 }]);
    expect(result).toEqual({ ok: true, score: 0, inputCount: 1 });
  });

  it('refuses a garment this seed never dropped', () => {
    const result = run([{ drop: drops.length + 10, outcome: 'sorted', at: 5 }]);
    expect(result).toEqual({ ok: false, reason: 'SIMULATION_FAILED' });
  });

  it('refuses a garment resolved before it was released', () => {
    const late = drops.findIndex((d) => d.at > 5);
    const result = run([{ drop: late, outcome: 'sorted', at: 0.1 }]);
    expect(result).toEqual({ ok: false, reason: 'SIMULATION_FAILED' });
  });

  it('refuses the same garment twice', () => {
    const result = run([
      { drop: 0, outcome: 'sorted', at: drops[0].at + 0.2 },
      { drop: 0, outcome: 'sorted', at: drops[0].at + 0.3 },
    ]);
    expect(result).toEqual({ ok: false, reason: 'SIMULATION_FAILED' });
  });

  it('refuses a log that runs past the final tick', () => {
    const result = run([{ drop: 0, outcome: 'sorted', at: durationSec + 1 }]);
    expect(result).toEqual({ ok: false, reason: 'SIMULATION_FAILED' });
  });

  it('rejects a payload that is not a recording at all', () => {
    expect(simulate!({ nope: true })).toEqual({ ok: false, reason: 'INVALID_REPLAY' });
    expect(
      laundrySortReplaySchema.safeParse({ seed, durationSec: 61, difficulty, inputs: [] }).success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Version bucketing                                                          */
/* -------------------------------------------------------------------------- */

function entry(overrides: Partial<SpeedrunEntryView> & { id: string }): SpeedrunEntryView {
  return {
    categoryId: 'cat',
    version: 'lo-1',
    replayId: `replay-${overrides.id}`,
    timeMs: 10_000,
    score: null,
    status: 'verified',
    rejectReason: null,
    verifiedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    runner: { id: 'u1', name: 'Runner', image: null, handle: null },
    ...overrides,
  };
}

describe('speedrun boards are per game version', () => {
  it('orders version tags numerically, not lexically', () => {
    expect(['lo-2', 'lo-10', 'lo-1'].sort(compareVersions)).toEqual(['lo-10', 'lo-2', 'lo-1']);
  });

  it('never merges two versions into one ranking', () => {
    const entries = [
      entry({ id: 'a', version: 'lo-1', timeMs: 5_000 }),
      entry({ id: 'b', version: 'lo-2', timeMs: 9_000 }),
      entry({ id: 'c', version: 'lo-2', timeMs: 7_000 }),
    ];

    const board = buildBoard(entries, 'time', ALL_VERSIONS);

    // Two buckets, newest first — NOT one list topped by the 5s run set on the
    // older, easier version.
    expect(board.map((b) => b.version)).toEqual(['lo-2', 'lo-1']);
    expect(board[0].entries.map((e) => e.id)).toEqual(['c', 'b']);
    expect(board[1].entries.map((e) => e.id)).toEqual(['a']);
  });

  it('filters to one version on request', () => {
    const entries = [entry({ id: 'a', version: 'lo-1' }), entry({ id: 'b', version: 'lo-2' })];
    expect(filterVersion(entries, 'lo-2').map((e) => e.id)).toEqual(['b']);
    expect(filterVersion(entries, ALL_VERSIONS)).toHaveLength(2);
    expect(versionsOf(entries)).toEqual(['lo-2', 'lo-1']);
    expect(bucketByVersion(entries)).toHaveLength(2);
  });

  it('ranks only verified runs', () => {
    const entries = [
      entry({ id: 'pending', timeMs: 1_000, status: 'pending' }),
      entry({ id: 'rejected', timeMs: 2_000, status: 'rejected' }),
      entry({ id: 'verified', timeMs: 8_000 }),
    ];
    expect(rankEntries(entries, 'time').map((e) => e.id)).toEqual(['verified']);
  });

  it('ranks score categories by score, breaking ties on time then on who was first', () => {
    const entries = [
      entry({ id: 'slow-high', score: 900, timeMs: 40_000 }),
      entry({ id: 'fast-high', score: 900, timeMs: 20_000 }),
      entry({ id: 'low', score: 100, timeMs: 1_000 }),
      entry({
        id: 'earliest',
        score: 900,
        timeMs: 20_000,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ];
    expect(rankEntries(entries, 'score').map((e) => e.id)).toEqual([
      'earliest',
      'fast-high',
      'slow-high',
      'low',
    ]);
  });

  it('formats run times the way a speedrun board reads them', () => {
    expect(formatRunTime(0)).toBe('00:00.000');
    expect(formatRunTime(65_432)).toBe('01:05.432');
    expect(formatRunTime(3_600_000 + 1_000)).toBe('1:00:01.000');
  });
});
