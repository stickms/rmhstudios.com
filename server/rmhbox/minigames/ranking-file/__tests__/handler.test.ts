/**
 * Ranking File — the server game: secrecy until each reveal, input rules,
 * early end when everyone has locked, and scores over rounds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import type { MockContextData } from '../../../../../testing/rmhbox/phase-6/setup';
import { RankingFileGame } from '..';
import type { RankingFileState } from '../types';
import { RF_REVEAL_SECONDS, RF_ROUND_SECONDS } from '../../../../../lib/rmhbox/ranking-file/settings';

const alice = MOCK_USERS.alice.userId;
const bob = MOCK_USERS.bob.userId;
const charlie = MOCK_USERS.charlie.userId;
const users = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie];

function setup(rounds = 3) {
  const ctx = createMockContext(users, { gameSettings: { totalRounds: rounds } });
  const game = new RankingFileGame(ctx.context);
  game.start();
  return { game, ctx };
}

function stateOf(game: RankingFileGame): RankingFileState {
  return (game as unknown as { state: RankingFileState }).state;
}

function officialLabels(game: RankingFileGame): string[] {
  const s = stateOf(game);
  return s.rounds[s.currentRound].official.map((item) => item.label);
}

function actions(ctx: MockContextData, type: string): Array<Record<string, unknown>> {
  return ctx.broadcastLog
    .filter((e) => e.event === 'rmhbox:game:action')
    .map((e) => e.data as Record<string, unknown>)
    .filter((d) => d.type === type);
}

/** Every key anywhere inside a JSON-serialisable value. */
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

const REVEAL_ONLY_KEYS = ['official', 'value', 'unit', 'source', 'results', 'distance'];

function expectMasked(payload: unknown, official: string[], values: number[]) {
  const keys = keysOf(payload);
  for (const key of REVEAL_ONLY_KEYS) expect(keys.has(key), `key ${key}`).toBe(false);
  const json = JSON.stringify(payload);
  // The five official labels in their official sequence never appear in a state
  expect(json).not.toContain(JSON.stringify(official));
  // No item's value sits next to its label
  for (const value of values) expect(json).not.toContain(`"value":${value}`);
}

describe('Ranking File — secrecy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no player or spectator state carries the order or a value before the reveal, in any round', () => {
    const { game, ctx } = setup(3);
    // Earlier rounds' reveals are public by now: only what came after the last one is checked
    let sinceBroadcast = 0;
    let sincePlayer = 0;
    for (let round = 0; round < 3; round++) {
      const s = stateOf(game);
      const official = officialLabels(game);
      const values = s.rounds[s.currentRound].official.map((i) => i.value);

      for (const userId of [alice, bob, charlie]) expectMasked(game.getStateForPlayer(userId), official, values);
      expectMasked(game.getStateForSpectator(), official, values);
      expectMasked(game.getSpectatorSnapshot(alice), official, values);
      // Nothing broadcast or sent so far carries them either
      expectMasked(
        ctx.broadcastLog.slice(sinceBroadcast).map((e) => e.data),
        official,
        values,
      );
      expectMasked(
        ctx.playerLog.slice(sincePlayer).map((e) => e.data),
        official,
        values,
      );

      // the labels shown are the shuffled ones, in an order that is not the answer
      const shown = (game.getStateForPlayer(alice) as { labels: string[] }).labels;
      expect(new Set(shown)).toEqual(new Set(official));
      expect(shown).not.toEqual(official);

      // end the round, then the reveal is the first place the order appears
      for (const userId of [alice, bob, charlie]) game.handleInput(userId, 'lock', {});
      expect(stateOf(game).phase).toBe('REVEAL');
      const revealState = game.getStateForSpectator() as {
        reveal: { official: Array<{ label: string; value: number }> };
      };
      expect(revealState.reveal.official.map((i) => i.label)).toEqual(official);
      expect(revealState.reveal.official.map((i) => i.value)).toEqual(values);
      sinceBroadcast = ctx.broadcastLog.length;
      sincePlayer = ctx.playerLog.length;
      if (round < 2) vi.advanceTimersByTime(RF_REVEAL_SECONDS * 1000 + 50);
    }
    game.cleanup();
  });

  it('shows a player only their own order', () => {
    const { game } = setup();
    const official = officialLabels(game);
    const swapped = [...(game.getStateForPlayer(alice) as { labels: string[] }).labels].reverse();
    game.handleInput(alice, 'reorder', { order: swapped });
    expect((game.getStateForPlayer(alice) as { myOrder: string[] }).myOrder).toEqual(swapped);
    expect((game.getStateForPlayer(bob) as { myOrder: string[] }).myOrder).not.toEqual(swapped);
    expect((game.getStateForSpectator() as { myOrder: unknown }).myOrder).toBeNull();
    expect(JSON.stringify(game.getStateForPlayer(bob))).not.toContain(JSON.stringify(swapped));
    expect(official).toHaveLength(5);
    game.cleanup();
  });
});

describe('Ranking File — input', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const myOrder = (game: RankingFileGame, userId: string) => stateOf(game).orders.get(userId) as string[];

  it("takes a reorder of this round's labels", () => {
    const { game } = setup();
    const order = [...myOrder(game, alice)].reverse();
    game.handleInput(alice, 'reorder', { order });
    expect(myOrder(game, alice)).toEqual(order);
    game.cleanup();
  });

  it('ignores a reorder with a foreign label, a duplicate, the wrong length or the wrong shape', () => {
    const { game } = setup();
    const before = [...myOrder(game, alice)];
    game.handleInput(alice, 'reorder', { order: [...before.slice(0, 4), 'Not an item of this round'] });
    game.handleInput(alice, 'reorder', { order: [before[0], before[0], before[2], before[3], before[4]] });
    game.handleInput(alice, 'reorder', { order: before.slice(0, 4) });
    game.handleInput(alice, 'reorder', { order: [...before, 'extra'] });
    game.handleInput(alice, 'reorder', { order: 'nope' });
    game.handleInput(alice, 'reorder', null);
    expect(myOrder(game, alice)).toEqual(before);
    game.cleanup();
  });

  it('ignores a reorder that changes nothing', () => {
    const { game } = setup();
    const stored = myOrder(game, alice);
    game.handleInput(alice, 'reorder', { order: [...stored] });
    expect(myOrder(game, alice)).toBe(stored); // the very same array: nothing was written
    game.cleanup();
  });

  it('ignores unknown actions and players who are not in the round', () => {
    const { game, ctx } = setup();
    const before = [...myOrder(game, alice)];
    game.handleInput(alice, 'shout', { order: before });
    game.handleInput('stranger', 'reorder', { order: [...before].reverse() });
    game.handleInput('stranger', 'lock', {});
    expect(stateOf(game).orders.has('stranger')).toBe(false);
    expect(stateOf(game).locked.size).toBe(0);
    expect(actions(ctx, 'RF_PLAYER_LOCKED')).toHaveLength(0);
    game.cleanup();
  });

  it('makes a lock final', () => {
    const { game, ctx } = setup();
    const locked = [...myOrder(game, alice)];
    game.handleInput(alice, 'lock', {});
    expect(actions(ctx, 'RF_PLAYER_LOCKED')).toHaveLength(1);

    game.handleInput(alice, 'reorder', { order: [...locked].reverse() });
    game.handleInput(alice, 'lock', {});
    expect(myOrder(game, alice)).toEqual(locked);
    expect(actions(ctx, 'RF_PLAYER_LOCKED')).toHaveLength(1);
    expect((game.getStateForPlayer(alice) as { myLocked: boolean }).myLocked).toBe(true);
    game.cleanup();
  });

  it('says who has locked, never what', () => {
    const { game, ctx } = setup();
    game.handleInput(alice, 'lock', {});
    const [event] = actions(ctx, 'RF_PLAYER_LOCKED');
    expect(event).toEqual({ type: 'RF_PLAYER_LOCKED', userId: alice });
    game.cleanup();
  });

  it('ignores every action once the round is over', () => {
    const { game, ctx } = setup();
    for (const userId of [alice, bob, charlie]) game.handleInput(userId, 'lock', {});
    expect(stateOf(game).phase).toBe('REVEAL');
    const frozen = JSON.stringify(stateOf(game).scores);
    game.handleInput(alice, 'reorder', { order: [...myOrder(game, alice)].reverse() });
    game.handleInput(alice, 'lock', {});
    expect(JSON.stringify(stateOf(game).scores)).toBe(frozen);
    expect(actions(ctx, 'RF_REVEAL')).toHaveLength(1);
    game.cleanup();
  });
});

describe('Ranking File — rounds and scores', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends the round early when everyone has locked, and not before', () => {
    const { game, ctx } = setup();
    game.handleInput(alice, 'lock', {});
    game.handleInput(bob, 'lock', {});
    expect(stateOf(game).phase).toBe('ORDERING');
    game.handleInput(charlie, 'lock', {});
    expect(stateOf(game).phase).toBe('REVEAL');
    expect(actions(ctx, 'RF_REVEAL')).toHaveLength(1);
    // the old timer does not end the next round again
    vi.advanceTimersByTime(RF_REVEAL_SECONDS * 1000 + 50);
    expect(stateOf(game).currentRound).toBe(1);
    expect(stateOf(game).phase).toBe('ORDERING');
    expect(actions(ctx, 'RF_REVEAL')).toHaveLength(1);
    game.cleanup();
  });

  it('ends the round at the timer with an unlocked order counting as it stands', () => {
    const { game, ctx } = setup();
    const official = officialLabels(game);
    game.handleInput(alice, 'reorder', { order: official });
    vi.advanceTimersByTime(RF_ROUND_SECONDS * 1000 + 50);
    expect(stateOf(game).phase).toBe('REVEAL');
    const [reveal] = actions(ctx, 'RF_REVEAL') as Array<{
      results: Array<{ userId: string; distance: number; points: number; locked: boolean }>;
    }>;
    const mine = reveal.results.find((r) => r.userId === alice);
    expect(mine).toMatchObject({ distance: 0, points: 800, locked: false });
    const bobs = reveal.results.find((r) => r.userId === bob);
    expect(bobs?.locked).toBe(false);
    expect(bobs?.distance).toBeGreaterThan(0);
    game.cleanup();
  });

  it('does not wait for a disconnected player', () => {
    const { game, ctx } = setup();
    ctx.context.players.get(charlie)!.isConnected = false;
    game.handleInput(alice, 'lock', {});
    game.handleInput(bob, 'lock', {});
    expect(stateOf(game).phase).toBe('REVEAL');
    game.cleanup();
  });

  it('adds scores up over rounds, ranks with shared places and reports the match', () => {
    const { game, ctx } = setup(3);
    for (let round = 0; round < 3; round++) {
      const official = officialLabels(game);
      // alice is perfect, bob is perfect too, charlie never moves a thing
      game.handleInput(alice, 'reorder', { order: official });
      game.handleInput(bob, 'reorder', { order: official });
      for (const userId of [alice, bob, charlie]) game.handleInput(userId, 'lock', {});
      expect(stateOf(game).phase).toBe('REVEAL');
      if (round < 2) vi.advanceTimersByTime(RF_REVEAL_SECONDS * 1000 + 50);
    }
    vi.advanceTimersByTime(RF_REVEAL_SECONDS * 1000 + 50);

    expect(ctx.completedResults).toHaveLength(1);
    const results = ctx.completedResults[0];
    const byUser = new Map(results.rankings.map((r) => [r.userId, r]));
    expect(byUser.get(alice)?.score).toBe(3 * 800);
    expect(byUser.get(bob)?.score).toBe(3 * 800);
    expect(byUser.get(alice)?.rank).toBe(1);
    expect(byUser.get(bob)?.rank).toBe(1); // a tie shares the place
    expect(byUser.get(charlie)?.rank).toBe(3);
    expect(byUser.get(alice)?.deltas).toEqual({ round_1: 800, round_2: 800, round_3: 800 });

    // charlie's total is the sum of his three rounds, each (12 - distance) x 50
    const rounds = results.gameSpecificData.roundHistory as Array<{
      results: Array<{ userId: string; points: number; distance: number }>;
    }>;
    const charlieRounds = rounds.map((r) => r.results.find((x) => x.userId === charlie)!);
    expect(charlieRounds.reduce((sum, r) => sum + r.points, 0)).toBe(byUser.get(charlie)?.score);
    for (const r of charlieRounds) expect(r.points).toBe((12 - r.distance) * 50 + (r.distance === 0 ? 200 : 0));
    expect(results.awards.some((a) => a.title === 'Perfect Order')).toBe(true);
  });

  it('plays every round with a different set', () => {
    const { game } = setup(8);
    const ids = stateOf(game).rounds.map((r) => r.setId);
    expect(new Set(ids).size).toBe(ids.length);
    game.cleanup();
  });

  it('keeps the official order in the stored game log only for revealed rounds', () => {
    const { game, ctx } = setup(3);
    const firstOfficial = officialLabels(game);
    for (const userId of [alice, bob, charlie]) game.handleInput(userId, 'lock', {});
    game.forceEnd('test');
    const log = ctx.completedResults[0].gameSpecificData.gameLog as {
      actions: Array<{ type: string; payload: Record<string, unknown> }>;
      version: number;
    };
    expect(log.version).toBe(1);
    const reveals = log.actions.filter((a) => a.type === 'round_reveal');
    expect(reveals).toHaveLength(1);
    expect((reveals[0].payload.official as Array<{ label: string }>).map((i) => i.label)).toEqual(firstOfficial);
    // round starts name the set and the shuffled labels, never the answer
    for (const start of log.actions.filter((a) => a.type === 'round_start')) {
      expect(keysOf(start.payload).has('official')).toBe(false);
      expect(keysOf(start.payload).has('value')).toBe(false);
    }
  });

  it('restores a reconnecting player to their own order and lock', () => {
    const { game, ctx } = setup();
    const order = [...(stateOf(game).orders.get(alice) as string[])].reverse();
    game.handleInput(alice, 'reorder', { order });
    game.handlePlayerReconnect(alice);
    const sent = ctx.playerLog.filter((e) => e.userId === alice && e.event === 'rmhbox:game:state_snapshot').pop();
    expect((sent?.data as { myOrder: string[] }).myOrder).toEqual(order);
    game.cleanup();
  });
});
