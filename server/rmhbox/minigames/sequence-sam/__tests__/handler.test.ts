/**
 * Sequence Sam — the server game: no step before it is shown, the judging of
 * every tap, the inputs that are ignored, the early end of a round and the end
 * of the match.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import type { MockContextData } from '../../../../../testing/rmhbox/phase-6/setup';
import { SequenceSamGame } from '..';
import type { SequenceSamState } from '../types';
import { SS_RESULT_SECONDS, SS_SHOW_LEAD_MS } from '../../../../../lib/rmhbox/sequence-sam/settings';

const alice = MOCK_USERS.alice.userId;
const bob = MOCK_USERS.bob.userId;
const charlie = MOCK_USERS.charlie.userId;
const STEP_MS = 600;

function setup(userList = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie], rounds = 5) {
  const ctx = createMockContext(userList, { gameSettings: { rounds, recallSeconds: 20, stepMs: STEP_MS } });
  const game = new SequenceSamGame(ctx.context);
  game.start();
  return { game, ctx };
}

function stateOf(game: SequenceSamGame): SequenceSamState {
  return (game as unknown as { state: SequenceSamState }).state;
}

function sequenceOf(game: SequenceSamGame): number[] {
  const s = stateOf(game);
  return s.sequences[s.currentRound]!;
}

/** A pad that is not `pad`. */
const other = (pad: number) => (pad + 1) % 4;

function actions(ctx: MockContextData, type: string): Array<Record<string, unknown>> {
  return ctx.broadcastLog
    .filter((e) => e.event === 'rmhbox:game:action')
    .map((e) => e.data as Record<string, unknown>)
    .filter((d) => d.type === type);
}

function playerActions(ctx: MockContextData, userId: string, type: string): Array<Record<string, unknown>> {
  return ctx.playerLog
    .filter((e) => e.userId === userId && e.event === 'rmhbox:game:action')
    .map((e) => e.data as Record<string, unknown>)
    .filter((d) => d.type === type);
}

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, into));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      keysOf(v, into);
    }
  }
  return into;
}

/** Run the show to its end: the recall opens after the last step's time. */
function openRecall(game: SequenceSamGame) {
  vi.advanceTimersByTime(SS_SHOW_LEAD_MS + sequenceOf(game).length * STEP_MS + 5);
  expect(stateOf(game).phase).toBe('RECALL');
}

function playAll(game: SequenceSamGame, userId: string) {
  for (const pad of sequenceOf(game)) game.handleInput(userId, 'tap', { pad });
}

function playWrong(game: SequenceSamGame, userId: string) {
  game.handleInput(userId, 'tap', { pad: other(sequenceOf(game)[0]!) });
}

describe('Sequence Sam — secrecy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends each step as it is shown and never an unshown one, to players or spectators', () => {
    const { game, ctx } = setup();
    const sequence = sequenceOf(game);
    const everyone = () => [
      ...[alice, bob, charlie].map((u) => game.getStateForPlayer(u) as Record<string, unknown>),
      game.getStateForSpectator() as Record<string, unknown>,
      game.getSpectatorSnapshot(alice) as Record<string, unknown>,
    ];

    // Before the first step: no step anywhere
    for (const state of everyone()) {
      expect(state.shownSteps).toEqual([]);
      expect(keysOf(state).has('sequence')).toBe(false);
    }
    expect(actions(ctx, 'SS_STEP')).toHaveLength(0);
    expect(keysOf(ctx.broadcastLog.map((e) => e.data)).has('pad')).toBe(false);

    vi.advanceTimersByTime(SS_SHOW_LEAD_MS + 1);
    for (let shown = 1; shown <= sequence.length; shown++) {
      // Exactly the steps shown so far are in every state and every message
      for (const state of everyone()) {
        expect(state.shownSteps).toEqual(sequence.slice(0, shown));
        expect(keysOf(state).has('sequence')).toBe(false);
      }
      const steps = actions(ctx, 'SS_STEP');
      expect(steps.map((s) => s.pad)).toEqual(sequence.slice(0, shown));
      expect(steps.map((s) => s.step)).toEqual(Array.from({ length: shown }, (_, i) => i));
      // The sequence as one array is nowhere before the end of the round
      if (shown < sequence.length) {
        const wire = JSON.stringify([ctx.broadcastLog, ctx.playerLog, ctx.spectatorLog]);
        expect(wire).not.toContain(JSON.stringify(sequence));
      }
      vi.advanceTimersByTime(STEP_MS);
    }
    expect(stateOf(game).phase).toBe('RECALL');
    game.cleanup();
  });

  it('carries the whole sequence only in the result, after the round', () => {
    const { game, ctx } = setup();
    const sequence = sequenceOf(game);
    openRecall(game);
    for (const state of [game.getStateForPlayer(alice), game.getStateForSpectator()]) {
      expect((state as { result: unknown }).result).toBeNull();
    }
    for (const u of [alice, bob, charlie]) playAll(game, u);
    expect(stateOf(game).phase).toBe('RESULT');
    const result = actions(ctx, 'SS_RESULT')[0] as { sequence: number[]; length: number };
    expect(result.sequence).toEqual(sequence);
    expect(result.length).toBe(3);
    const spectator = game.getStateForSpectator() as { result: { sequence: number[] } };
    expect(spectator.result.sequence).toEqual(sequence);
    game.cleanup();
  });

  it('keeps the log free of a round\u2019s sequence until its result', () => {
    const { game } = setup();
    type Entry = { type: string; payload: Record<string, unknown> };
    const log = () => (game as unknown as { actionLog: Entry[] }).actionLog;
    expect(log().some((a) => 'sequence' in a.payload)).toBe(false);
    openRecall(game);
    for (const u of [alice, bob, charlie]) playAll(game, u);
    const entries = log().filter((a) => 'sequence' in a.payload);
    expect(entries.map((a) => a.type)).toEqual(['round_result']);
    game.cleanup();
  });

  it('shows a player only their own taps', () => {
    const { game } = setup();
    openRecall(game);
    const first = sequenceOf(game)[0]!;
    game.handleInput(alice, 'tap', { pad: first });
    expect((game.getStateForPlayer(alice) as { myTaps: number[] }).myTaps).toEqual([first]);
    expect((game.getStateForPlayer(bob) as { myTaps: number[] }).myTaps).toEqual([]);
    expect((game.getStateForSpectator() as { myTaps: number[] }).myTaps).toEqual([]);
    game.cleanup();
  });
});

describe('Sequence Sam — taps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts correct taps and finishes a player on the last step', () => {
    const { game, ctx } = setup();
    openRecall(game);
    const sequence = sequenceOf(game);
    game.handleInput(alice, 'tap', { pad: sequence[0] });
    expect(stateOf(game).correct.get(alice)).toBe(1);
    expect(stateOf(game).finished.has(alice)).toBe(false);
    game.handleInput(alice, 'tap', { pad: sequence[1] });
    game.handleInput(alice, 'tap', { pad: sequence[2] });
    expect(stateOf(game).finished.has(alice)).toBe(true);
    const taps = playerActions(ctx, alice, 'SS_TAP');
    expect(taps.map((t) => t.correct)).toEqual([true, true, true]);
    expect(taps[2]).toMatchObject({ finished: true, complete: true, correctSteps: 3 });
    game.cleanup();
  });

  it('ends a wrong-tapping player’s round at the steps they got right', () => {
    const { game, ctx } = setup();
    openRecall(game);
    const sequence = sequenceOf(game);
    game.handleInput(alice, 'tap', { pad: sequence[0] });
    game.handleInput(alice, 'tap', { pad: other(sequence[1]!) });
    expect(stateOf(game).finished.has(alice)).toBe(true);
    expect(stateOf(game).correct.get(alice)).toBe(1);
    expect(playerActions(ctx, alice, 'SS_TAP')[1]).toMatchObject({ correct: false, finished: true, correctSteps: 1 });
    // Further taps do nothing
    game.handleInput(alice, 'tap', { pad: sequence[1] });
    expect(stateOf(game).correct.get(alice)).toBe(1);
    expect(playerActions(ctx, alice, 'SS_TAP')).toHaveLength(2);
    // The others are still playing
    expect(stateOf(game).phase).toBe('RECALL');
    game.cleanup();
  });

  it('ignores a tap before the recall opens', () => {
    const { game, ctx } = setup();
    const sequence = sequenceOf(game);
    game.handleInput(alice, 'tap', { pad: sequence[0] });
    vi.advanceTimersByTime(SS_SHOW_LEAD_MS + STEP_MS);
    expect(stateOf(game).phase).toBe('SHOW');
    game.handleInput(alice, 'tap', { pad: sequence[0] });
    expect(stateOf(game).taps.get(alice)).toEqual([]);
    expect(playerActions(ctx, alice, 'SS_TAP')).toHaveLength(0);
    game.cleanup();
  });

  it('ignores a pad outside 0 to 3 and malformed input', () => {
    const { game } = setup();
    openRecall(game);
    for (const bad of [{ pad: 4 }, { pad: -1 }, { pad: 1.5 }, { pad: '0' }, {}, null, undefined]) {
      game.handleInput(alice, 'tap', bad);
    }
    game.handleInput(alice, 'reorder', { pad: 0 });
    expect(stateOf(game).taps.get(alice)).toEqual([]);
    expect(stateOf(game).finished.has(alice)).toBe(false);
    game.cleanup();
  });

  it('ignores a tap from a player who is not in the round, and after the round ended', () => {
    const { game } = setup();
    openRecall(game);
    game.handleInput('stranger', 'tap', { pad: 0 });
    expect(stateOf(game).taps.has('stranger')).toBe(false);
    for (const u of [alice, bob, charlie]) playAll(game, u);
    expect(stateOf(game).phase).toBe('RESULT');
    const before = stateOf(game).scores.get(alice);
    game.handleInput(alice, 'tap', { pad: 0 });
    expect(stateOf(game).scores.get(alice)).toBe(before);
    game.cleanup();
  });

  it('never takes more taps than the sequence has steps', () => {
    const { game } = setup();
    openRecall(game);
    playAll(game, alice);
    for (let i = 0; i < 5; i++) game.handleInput(alice, 'tap', { pad: 0 });
    expect(stateOf(game).taps.get(alice)).toHaveLength(3);
    game.cleanup();
  });
});

describe('Sequence Sam — scoring on the server clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('times the bonus from the recall opening and scores a miss 60 per correct step', () => {
    const { game, ctx } = setup();
    openRecall(game);
    const sequence = sequenceOf(game);
    // alice plays at once (bonus 50), bob after 10 s of 20 (bonus 25), charlie gets one step right
    playAll(game, alice);
    vi.advanceTimersByTime(10_000);
    playAll(game, bob);
    game.handleInput(charlie, 'tap', { pad: sequence[0] });
    game.handleInput(charlie, 'tap', { pad: other(sequence[1]!) });
    expect(stateOf(game).phase).toBe('RESULT');

    const result = actions(ctx, 'SS_RESULT')[0] as {
      results: Array<{ userId: string; points: number; bonus: number; completed: boolean; correctSteps: number }>;
    };
    const by = (u: string) => result.results.find((r) => r.userId === u)!;
    expect(by(alice)).toMatchObject({ points: 350, bonus: 50, completed: true });
    expect(by(bob)).toMatchObject({ points: 325, bonus: 25, completed: true });
    expect(by(charlie)).toMatchObject({ points: 60, bonus: 0, completed: false, correctSteps: 1 });
    game.cleanup();
  });

  it('ignores the clock the client claims', () => {
    const { game } = setup();
    openRecall(game);
    const sequence = sequenceOf(game);
    vi.advanceTimersByTime(19_000);
    for (const pad of sequence) game.handleInput(alice, 'tap', { pad, elapsedMs: 0, at: Date.now() - 19_000 });
    const elapsed = stateOf(game).elapsed.get(alice)!;
    expect(elapsed).toBeGreaterThanOrEqual(19_000);
    game.cleanup();
  });

  it('keeps time paused out of the bonus', () => {
    const { game, ctx } = setup();
    openRecall(game);
    vi.advanceTimersByTime(2_000);
    game.pausePhaseTimer();
    vi.advanceTimersByTime(60_000);
    game.resumePhaseTimer();
    playAll(game, alice);
    expect(stateOf(game).elapsed.get(alice)).toBeLessThan(2_500);
    game.cleanup();
    expect(ctx.errors).toHaveLength(0);
  });
});

describe('Sequence Sam — the end of a round', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends early once every player still in has finished', () => {
    const { game } = setup();
    openRecall(game);
    playAll(game, alice);
    playWrong(game, bob);
    expect(stateOf(game).phase).toBe('RECALL');
    playAll(game, charlie);
    expect(stateOf(game).phase).toBe('RESULT');
    game.cleanup();
  });

  it('ends when the time runs out and counts an unfinished round as a miss', () => {
    const { game } = setup();
    openRecall(game);
    playAll(game, alice);
    vi.advanceTimersByTime(20_000 + 50);
    expect(stateOf(game).phase).toBe('RESULT');
    expect(stateOf(game).misses.get(alice)).toBe(0);
    expect(stateOf(game).misses.get(bob)).toBe(1);
    expect(stateOf(game).misses.get(charlie)).toBe(1);
    game.cleanup();
  });

  it('does not wait for a disconnected player', () => {
    const { game, ctx } = setup();
    openRecall(game);
    playAll(game, alice);
    playAll(game, bob);
    ctx.context.players.get(charlie)!.isConnected = false;
    game.handlePlayerDisconnect(charlie);
    expect(stateOf(game).phase).toBe('RESULT');
    game.cleanup();
  });

  it('adds a step each round', () => {
    const { game } = setup();
    const lengths: number[] = [];
    for (let r = 0; r < 3; r++) {
      lengths.push(sequenceOf(game).length);
      openRecall(game);
      for (const u of [alice, bob, charlie]) playAll(game, u);
      vi.advanceTimersByTime(SS_RESULT_SECONDS * 1000 + 50);
    }
    expect(lengths).toEqual([3, 4, 5]);
    game.cleanup();
  });
});

describe('Sequence Sam — the end of the match', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('puts a player out on the second miss and ends when one player is left', () => {
    const { game, ctx } = setup([MOCK_USERS.alice, MOCK_USERS.bob], 8);
    // Round 1: bob misses once, still in
    openRecall(game);
    playAll(game, alice);
    playWrong(game, bob);
    expect(stateOf(game).out.has(bob)).toBe(false);
    vi.advanceTimersByTime(SS_RESULT_SECONDS * 1000 + 50);
    expect(ctx.completedResults).toHaveLength(0);
    expect(stateOf(game).currentRound).toBe(1);

    // Round 2: bob misses again and is out; one player is left, so the match ends
    openRecall(game);
    playAll(game, alice);
    playWrong(game, bob);
    expect(stateOf(game).out.has(bob)).toBe(true);
    vi.advanceTimersByTime(SS_RESULT_SECONDS * 1000 + 50);
    expect(ctx.completedResults).toHaveLength(1);
    const results = ctx.completedResults[0]!;
    expect(results.rankings[0]!.userId).toBe(alice);
    expect(results.rankings[0]!.rank).toBe(1);
    expect(results.gameSpecificData.totalRounds).toBe(8);
    expect((results.gameSpecificData.roundHistory as unknown[]).length).toBe(2);
  });

  it('keeps an out player out and watching in later rounds', () => {
    const { game } = setup([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie], 8);
    for (let r = 0; r < 2; r++) {
      openRecall(game);
      playAll(game, alice);
      playAll(game, charlie);
      playWrong(game, bob);
      vi.advanceTimersByTime(SS_RESULT_SECONDS * 1000 + 50);
    }
    expect(stateOf(game).out.has(bob)).toBe(true);
    // Round 3 has two players in, bob watches
    expect(stateOf(game).currentRound).toBe(2);
    openRecall(game);
    expect(stateOf(game).inRound.has(bob)).toBe(false);
    game.handleInput(bob, 'tap', { pad: sequenceOf(game)[0] });
    expect(stateOf(game).taps.has(bob)).toBe(false);
    const bobState = game.getStateForPlayer(bob) as { imOut: boolean; imIn: boolean };
    expect(bobState).toMatchObject({ imOut: true, imIn: false });
    // The two still in finish: the round ends without waiting for bob
    playAll(game, alice);
    playAll(game, charlie);
    expect(stateOf(game).phase).toBe('RESULT');
    game.cleanup();
  });

  it('plays every round when nobody goes out and then reports each round’s length', () => {
    const { game, ctx } = setup(undefined, 5);
    for (let r = 0; r < 5; r++) {
      openRecall(game);
      for (const u of [alice, bob, charlie]) playAll(game, u);
      vi.advanceTimersByTime(SS_RESULT_SECONDS * 1000 + 50);
    }
    expect(ctx.completedResults).toHaveLength(1);
    const done = ctx.completedResults[0]!;
    const history = done.gameSpecificData.roundHistory as Array<{ length: number }>;
    expect(history.map((h) => h.length)).toEqual([3, 4, 5, 6, 7]);
    const log = done.gameSpecificData.gameLog as { actions: Array<{ type: string; payload: { length: number } }> };
    const logged = log.actions.filter((a) => a.type === 'round_result');
    expect(logged.map((a) => a.payload.length)).toEqual([3, 4, 5, 6, 7]);
    expect(done.rankings.every((r) => r.score > 0)).toBe(true);
    expect(ctx.errors).toHaveLength(0);
  });
});

describe('Sequence Sam — reconnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-sends a masked snapshot of the steps shown so far', () => {
    const { game, ctx } = setup();
    vi.advanceTimersByTime(SS_SHOW_LEAD_MS + STEP_MS + 5);
    game.handlePlayerReconnect(alice);
    const sent = ctx.playerLog.filter((e) => e.userId === alice && e.event === 'rmhbox:game:state_snapshot').pop()!;
    const state = sent.data as { shownSteps: number[]; phase: string };
    expect(state.phase).toBe('SHOW');
    expect(state.shownSteps).toEqual(sequenceOf(game).slice(0, 2));
    game.cleanup();
  });
});
