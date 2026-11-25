/**
 * Identity Crisis — the server game: no player's state or messages ever carry
 * their own identity, nobody's early-guess text or individual vote reaches
 * another player, inputs from the wrong player or phase are ignored, a
 * timed-out ask is skipped, and the match ends after every turn or when every
 * player has guessed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import type { MockContextData } from '../../../../../testing/rmhbox/phase-6/setup';
import { IdentityCrisisGame } from '..';
import { fuseMatcher } from '../handler';
import type { IdentityCrisisState } from '../types';
import type { Identity } from '../../../../../lib/rmhbox/identity-crisis/rules';
import {
  IC_ASSIGN_SECONDS,
  IC_FINAL_SECONDS,
  IC_RESULT_SECONDS,
  IC_REVEAL_SECONDS,
  IC_VOTE_SECONDS,
} from '../../../../../lib/rmhbox/identity-crisis/settings';

// s14-17: the hub's timeout reader is stubbed, as a synchronous answer (no database in this suite).
const restrictedUsers = vi.hoisted(() => new Set<string>());
vi.mock('../../../restrictions', () => ({
  peekMessageRestriction: (userId: string) => restrictedUsers.has(userId),
  loadMessageRestriction: async (userId: string) => restrictedUsers.has(userId),
}));

// A pool of made-up identities with names no other text in a message can collide with
vi.mock('@/lib/rmhbox/identity-crisis/data-loader', () => {
  const pool: Identity[] = [];
  for (let i = 0; i < 12; i++) {
    pool.push({
      id: `sentinel-${i}`,
      name: `Sentinel Person${String.fromCharCode(97 + i)}${i}`,
      aliases: [`quirk${String.fromCharCode(97 + i)}${i}`],
      category: `cat${i}`,
      difficulty: 'easy',
    });
  }
  for (let i = 12; i < 16; i++) {
    pool.push({
      id: `sentinel-${i}`,
      name: `Sentinel Person${String.fromCharCode(97 + i)}${i}`,
      aliases: [],
      category: `cat${i}`,
      difficulty: 'medium',
    });
  }
  return { loadIdentities: () => pool };
});

const FOUR = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
const ASK_SECONDS = 20;

let lobbyCounter = 0;

function setup(users = FOUR, settings: Record<string, number | boolean> = {}) {
  const ctx = createMockContext(users, {
    lobbyId: `IC${++lobbyCounter}`,
    gameSettings: { questionsPerPlayer: 3, askSeconds: ASK_SECONDS, hardIdentities: false, ...settings },
  });
  const game = new IdentityCrisisGame(ctx.context);
  game.start();
  return { game, ctx, ids: users.map((u) => u.userId) };
}

function stateOf(game: IdentityCrisisGame): IdentityCrisisState {
  return (game as unknown as { state: IdentityCrisisState }).state;
}

const identityOf = (game: IdentityCrisisGame, userId: string): Identity => stateOf(game).players.get(userId)!.identity;
const asker = (game: IdentityCrisisGame) => stateOf(game).askerId!;
const voters = (game: IdentityCrisisGame, ids: string[]) => ids.filter((id) => id !== asker(game));
const phase = (game: IdentityCrisisGame) => stateOf(game).phase;
const seconds = (n: number) => vi.advanceTimersByTime(n * 1000 + 5);

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

function spectatorActions(ctx: MockContextData, type: string): Array<Record<string, unknown>> {
  return ctx.spectatorLog.map((e) => e.data as Record<string, unknown>).filter((d) => d.type === type);
}

/** Everything one player was sent: lobby broadcasts plus their own messages. */
function wireFor(ctx: MockContextData, userId: string): string {
  return JSON.stringify([ctx.broadcastLog, ctx.playerLog.filter((e) => e.userId === userId)]);
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

/** Past the assignment to the first ask. */
function toFirstAsk(game: IdentityCrisisGame) {
  seconds(IC_ASSIGN_SECONDS);
  expect(phase(game)).toBe('ASK');
}

function ask(game: IdentityCrisisGame, text = 'Am I a real person?') {
  game.handleInput(asker(game), 'ask', { text });
}

function voteAll(game: IdentityCrisisGame, ids: string[], vote: 'yes' | 'no' | 'maybe' = 'yes') {
  for (const id of voters(game, ids)) game.handleInput(id, 'vote', { vote });
}

/** One whole turn: the asker asks, the table votes, the result passes. */
function playTurn(game: IdentityCrisisGame, ids: string[]) {
  ask(game);
  expect(phase(game)).toBe('VOTE');
  voteAll(game, ids);
  expect(phase(game)).toBe('RESULT');
  seconds(IC_RESULT_SECONDS);
}

/** A guess that matches the player's identity. */
const rightGuess = (game: IdentityCrisisGame, userId: string) => identityOf(game, userId).name;

describe('Identity Crisis — secrecy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never puts a player’s own identity in their state, in any phase of a whole game', () => {
    const { game, ctx, ids } = setup();
    const check = () => {
      for (const id of ids) {
        const own = identityOf(game, id).name;
        expect(JSON.stringify(game.getStateForPlayer(id)), `${phase(game)} state of ${id}`).not.toContain(own);
        expect(wireFor(ctx, id), `${phase(game)} wire of ${id}`).not.toContain(own);
        // the same state is what a reconnect receives
        expect(JSON.stringify(game.buildReconnectionSnapshot(id, false))).not.toContain(own);
      }
    };
    const seen = new Set<string>();
    const note = () => {
      seen.add(phase(game));
      check();
    };

    note(); // ASSIGN
    toFirstAsk(game);
    note(); // ASK
    for (let turn = 0; turn < 12; turn++) {
      if (phase(game) !== 'ASK') break;
      ask(game);
      note(); // VOTE, before and after some votes
      game.handleInput(voters(game, ids)[0]!, 'vote', { vote: 'no' });
      note();
      voteAll(game, ids);
      note(); // RESULT
      seconds(IC_RESULT_SECONDS);
    }
    expect(phase(game)).toBe('FINAL');
    note();
    expect([...seen].sort()).toEqual(['ASK', 'ASSIGN', 'FINAL', 'RESULT', 'VOTE']);
    game.cleanup();
  });

  it('sends the asker IC_TURN_START_SELF without an identity and everyone else IC_TURN_START with the asker’s', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    const who = asker(game);
    const own = identityOf(game, who);

    const self = playerActions(ctx, who, 'IC_TURN_START_SELF');
    expect(self).toHaveLength(1);
    expect(keysOf(self[0]).has('askerIdentity')).toBe(false);
    expect(JSON.stringify(self[0])).not.toContain(own.name);
    expect(playerActions(ctx, who, 'IC_TURN_START')).toHaveLength(0);

    for (const id of ids.filter((u) => u !== who)) {
      const start = playerActions(ctx, id, 'IC_TURN_START');
      expect(start).toHaveLength(1);
      expect(start[0]!.askerIdentity).toEqual({ name: own.name, category: own.category });
      expect(playerActions(ctx, id, 'IC_TURN_START_SELF')).toHaveLength(0);
    }
    // voters see the asker’s identity in their state too; the asker does not
    expect((game.getStateForPlayer(who) as { askerIdentity: unknown }).askerIdentity).toBeNull();
    const other = ids.find((u) => u !== who)!;
    expect((game.getStateForPlayer(other) as { askerIdentity: unknown }).askerIdentity).toEqual({
      name: own.name,
      category: own.category,
    });
    game.cleanup();
  });

  it('builds the other players’ identities from an allowlist: the viewer is left out, nothing else', () => {
    const { game, ids } = setup();
    for (const id of ids) {
      const state = game.getStateForPlayer(id) as { others: Array<{ userId: string; identity: unknown }> };
      expect(state.others.map((o) => o.userId).sort()).toEqual(ids.filter((u) => u !== id).sort());
      for (const o of state.others) {
        expect(Object.keys(o.identity as object).sort()).toEqual(['category', 'name']);
      }
    }
    game.cleanup();
  });

  it('never broadcasts or sends another player an early guess’s text, but shows spectators', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const guesser = voters(game, ids)[0]!;
    const secret = 'Quite Distinctive Wrong Answer';
    game.handleInput(guesser, 'guess', { text: secret });

    for (const id of ids.filter((u) => u !== guesser)) {
      expect(wireFor(ctx, id)).not.toContain(secret);
      expect(JSON.stringify(game.getStateForPlayer(id))).not.toContain(secret);
    }
    // the guesser is told how it went, without the text
    const result = playerActions(ctx, guesser, 'IC_GUESS_RESULT');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'early', correct: false, points: -100 });
    expect(JSON.stringify(game.getStateForPlayer(guesser))).not.toContain(secret);
    // the others learn that it was made and that it was wrong
    const told = playerActions(
      ctx,
      ids.find((u) => u !== guesser)!,
      'IC_PLAYER_GUESSED',
    );
    expect(told[0]).toMatchObject({ userId: guesser, kind: 'early', correct: false });
    expect(keysOf(told[0]).has('text')).toBe(false);
    // a spectator sees the text
    expect(spectatorActions(ctx, 'IC_PLAYER_GUESSED')[0]).toMatchObject({ userId: guesser, text: secret });
    expect(JSON.stringify(game.getStateForSpectator())).toContain(secret);
    game.cleanup();
  });

  it('never attributes a vote: a voter hears only their own, the table only a count', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const [first, second] = voters(game, ids);
    game.handleInput(first!, 'vote', { vote: 'yes' });
    game.handleInput(second!, 'vote', { vote: 'no' });

    // The acknowledgement goes to the voter alone
    expect(playerActions(ctx, first!, 'IC_VOTE_ACK')).toEqual([expect.objectContaining({ vote: 'yes' })]);
    expect(playerActions(ctx, second!, 'IC_VOTE_ACK')).toEqual([expect.objectContaining({ vote: 'no' })]);
    expect(actions(ctx, 'IC_VOTE_ACK')).toHaveLength(0);
    for (const id of ids.filter((u) => u !== first && u !== second)) {
      expect(playerActions(ctx, id, 'IC_VOTE_ACK')).toHaveLength(0);
      const state = game.getStateForPlayer(id) as Record<string, unknown>;
      expect(state.myVote).toBeNull();
      expect(keysOf(state).has('votes')).toBe(false);
    }
    // Progress is a count
    const progress = actions(ctx, 'IC_VOTE_PROGRESS');
    expect(progress[progress.length - 1]).toMatchObject({ received: 2, total: 3 });

    voteAll(game, ids);
    const result = actions(ctx, 'IC_VOTE_RESULT')[0]!;
    expect(result.counts).toEqual({ yes: 2, no: 1, maybe: 0 });
    expect(Object.keys(result).sort()).toEqual(['askerId', 'counts', 'duration', 'plurality', 'turnNumber', 'type']);
    // Not in the spectator’s view, nor in the log after the game
    expect(keysOf(game.getStateForSpectator()).has('votes')).toBe(false);
    game.cleanup();
    const log = JSON.stringify(game.computeResults().gameSpecificData);
    expect(log).not.toContain('"votes"');
    expect(log).not.toContain('voterId');
  });

  it('gives a reconnecting voter their own vote and the question, never their identity', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    ask(game, 'Am I known for music?');
    const voter = voters(game, ids)[0]!;
    game.handleInput(voter, 'vote', { vote: 'maybe' });
    const snapshot = game.buildReconnectionSnapshot(voter, false) as Record<string, unknown>;
    expect(snapshot.phase).toBe('VOTE');
    expect(snapshot.myVote).toBe('maybe');
    expect(snapshot.question).toMatchObject({ text: 'Am I known for music?' });
    expect(snapshot.votesReceived).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain(identityOf(game, voter).name);
    game.cleanup();
  });

  it('shows a spectator everything except who voted what', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    const view = game.getStateForSpectator() as {
      others: Array<{ identity: { name: string } }>;
      askerIdentity: unknown;
    };
    const names = view.others.map((o) => o.identity.name).sort();
    expect(names).toEqual(ids.map((id) => identityOf(game, id).name).sort());
    expect(view.askerIdentity).toEqual({
      name: identityOf(game, asker(game)).name,
      category: identityOf(game, asker(game)).category,
    });
    game.cleanup();
  });
});

describe('Identity Crisis — inputs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores an ask from anyone but the asker, outside the ask phase, or that is not a question', () => {
    const { game, ids } = setup();
    // during the assignment
    game.handleInput(ids[0]!, 'ask', { text: 'Am I alive?' });
    expect(phase(game)).toBe('ASSIGN');
    toFirstAsk(game);
    const notAsker = ids.find((u) => u !== asker(game))!;
    game.handleInput(notAsker, 'ask', { text: 'Am I alive?' });
    expect(phase(game)).toBe('ASK');
    game.handleInput('someone-else', 'ask', { text: 'Am I alive?' });
    game.handleInput(asker(game), 'ask', { text: 'hi' });
    game.handleInput(asker(game), 'ask', { text: 'x'.repeat(201) });
    game.handleInput(asker(game), 'ask', { text: 42 });
    game.handleInput(asker(game), 'ask', {});
    game.handleInput(asker(game), 'ask', { text: '\n\u0007 \t ' });
    expect(phase(game)).toBe('ASK');
    expect(stateOf(game).current).toBeNull();
    game.cleanup();
  });

  it('cleans the question: control characters stripped, whitespace collapsed', () => {
    const { game, ctx } = setup();
    toFirstAsk(game);
    ask(game, '  Am \t I\n\n a\u0000 real\u0007   person?  ');
    expect(actions(ctx, 'IC_QUESTION')[0]).toMatchObject({ text: 'Am I a real person?' });
    game.cleanup();
  });

  it('ignores a vote outside the vote phase, from the asker, a second vote, and a bad value', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    const [first, second] = voters(game, ids);
    game.handleInput(first!, 'vote', { vote: 'yes' }); // still asking
    expect(stateOf(game).current).toBeNull();

    ask(game);
    game.handleInput(asker(game), 'vote', { vote: 'yes' }); // the asker may not
    game.handleInput(first!, 'vote', { vote: 'perhaps' });
    game.handleInput(first!, 'vote', 'yes');
    expect(stateOf(game).current!.votes.size).toBe(0);

    game.handleInput(first!, 'vote', { vote: 'yes' });
    game.handleInput(first!, 'vote', { vote: 'no' }); // a second vote is ignored
    game.handleInput(second!, 'vote', { vote: 'no' });
    expect(stateOf(game).current!.votes.get(first!)).toBe('yes');
    expect(stateOf(game).current!.votes.size).toBe(2);
    game.cleanup();
  });

  it('ignores a guess during the assignment, the result, or from a user who is not playing', () => {
    const { game, ids } = setup();
    game.handleInput(ids[0]!, 'guess', { text: rightGuess(game, ids[0]!) });
    expect(stateOf(game).players.get(ids[0]!)!.guesses).toHaveLength(0);
    toFirstAsk(game);
    ask(game);
    voteAll(game, ids);
    expect(phase(game)).toBe('RESULT');
    const guesser = ids[1]!;
    game.handleInput(guesser, 'guess', { text: rightGuess(game, guesser) });
    expect(stateOf(game).players.get(guesser)!.guesses).toHaveLength(0);
    game.handleInput('stranger', 'guess', { text: 'anything' });
    game.handleInput('stranger', 'ask', { text: 'anything' });
    game.cleanup();
  });

  it('does not let the asker guess while the votes on their own question are open', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const who = asker(game);
    game.handleInput(who, 'guess', { text: rightGuess(game, who) });
    expect(stateOf(game).players.get(who)!.guesses).toHaveLength(0);
    expect(stateOf(game).players.get(who)!.status).toBe('asking');
    // others still may
    const other = voters(game, ids)[0]!;
    game.handleInput(other, 'guess', { text: 'nobody at all' });
    expect(stateOf(game).players.get(other)!.guesses).toHaveLength(1);
    game.cleanup();
  });

  it('ignores any other action name', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    game.handleInput(asker(game), 'tap', { pad: 1 });
    game.handleInput(asker(game), 'input', { text: 'Am I alive?' });
    expect(phase(game)).toBe('ASK');
    expect(ids).toHaveLength(4);
    game.cleanup();
  });
});

describe('Identity Crisis — turns', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips a turn that times out, spends its slot and moves to the next asker', () => {
    const { game, ctx } = setup();
    toFirstAsk(game);
    const first = asker(game);
    seconds(ASK_SECONDS);
    expect(phase(game)).toBe('ASK');
    expect(asker(game)).not.toBe(first);
    expect(stateOf(game).questions).toHaveLength(0);
    expect(stateOf(game).players.get(first)!.slotsUsed).toBe(1);
    expect(actions(ctx, 'IC_ASK_TIMEOUT')).toEqual([expect.objectContaining({ askerId: first })]);
    game.cleanup();
    const log = (game.computeResults().gameSpecificData.gameLog as { actions: Array<{ type: string }> }).actions;
    expect(log.some((a) => a.type === 'ask_timeout')).toBe(true);
    expect(log.some((a) => a.type === 'question_asked')).toBe(false);
  });

  it('ignores an ask from a member timed out of messages as a timed-out ask and tells only them (s14-17)', () => {
    const { game, ctx } = setup();
    toFirstAsk(game);
    const first = asker(game);
    restrictedUsers.add(first);
    try {
      ask(game, 'Am I a real person?');
    } finally {
      restrictedUsers.delete(first);
    }
    // No question reached the table; the turn passed and the slot was spent.
    expect(actions(ctx, 'IC_QUESTION')).toHaveLength(0);
    expect(stateOf(game).questions).toHaveLength(0);
    expect(stateOf(game).players.get(first)!.slotsUsed).toBe(1);
    expect(actions(ctx, 'IC_ASK_TIMEOUT')).toEqual([expect.objectContaining({ askerId: first })]);
    expect(phase(game)).toBe('ASK');
    expect(asker(game)).not.toBe(first);
    // Only the asker was told; the old turn's timer does not cut the next asker's turn short.
    const told = ctx.playerLog.filter((e) => e.event === 'rmhbox:error');
    expect(told).toEqual([
      expect.objectContaining({ userId: first, data: expect.objectContaining({ code: 'FEATURE_RESTRICTED' }) }),
    ]);
    seconds(ASK_SECONDS - 1);
    expect(asker(game)).not.toBe(first);
    expect(actions(ctx, 'IC_ASK_TIMEOUT')).toHaveLength(1);
    game.cleanup();
  });

  it('takes turns in a fixed order, three rounds of everyone', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    const order = [...stateOf(game).order];
    expect(order.sort()).toEqual([...ids].sort());
    const askers: string[] = [];
    for (let i = 0; i < 12; i++) {
      askers.push(asker(game));
      playTurn(game, ids);
    }
    expect(askers).toEqual([...stateOf(game).order, ...stateOf(game).order, ...stateOf(game).order]);
    expect(phase(game)).toBe('FINAL');
    game.cleanup();
  });

  it('closes the vote when the clock runs out, counting what came in', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    ask(game);
    game.handleInput(voters(game, ids)[0]!, 'vote', { vote: 'no' });
    expect(phase(game)).toBe('VOTE');
    seconds(IC_VOTE_SECONDS);
    expect(phase(game)).toBe('RESULT');
    expect(actions(ctx, 'IC_VOTE_RESULT')[0]).toMatchObject({ counts: { yes: 0, no: 1, maybe: 0 }, plurality: 'no' });
    game.cleanup();
  });

  it('reads a tie as Split', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const [a, b, c] = voters(game, ids);
    game.handleInput(a!, 'vote', { vote: 'yes' });
    game.handleInput(b!, 'vote', { vote: 'no' });
    game.handleInput(c!, 'vote', { vote: 'maybe' });
    expect(actions(ctx, 'IC_VOTE_RESULT')[0]).toMatchObject({ plurality: 'split' });
    game.cleanup();
  });

  it('announces the turn on the footer round counter', () => {
    const { game, ctx } = setup();
    toFirstAsk(game);
    const rounds = ctx.broadcastLog.filter((e) => (e.data as { type?: string }).type === 'MINIGAME_ROUND');
    expect(rounds.length).toBeGreaterThan(0);
    game.cleanup();
  });
});

describe('Identity Crisis — guesses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches "einstein" to Albert Einstein and rejects a wrong name', () => {
    const einstein: Identity = {
      id: 'albert-einstein',
      name: 'Albert Einstein',
      aliases: ['einstein'],
      category: 'scientist',
      difficulty: 'easy',
    };
    expect(fuseMatcher('einstein', einstein)).toBe(true);
    expect(fuseMatcher('albert einstein', einstein)).toBe(true);
    expect(fuseMatcher('einstien', einstein)).toBe(true);
    expect(fuseMatcher('marie curie', einstein)).toBe(false);
    expect(fuseMatcher('mozart', einstein)).toBe(false);
  });

  it('scores an early right guess 200 + 300 x slots left / slots, plus 20 a slot, and stops the player asking', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const guesser = voters(game, ids)[0]!;
    game.handleInput(guesser, 'guess', { text: rightGuess(game, guesser) });
    // 3 of 3 slots left: 200 + 300 + 3 x 20
    expect(stateOf(game).scores.get(guesser)).toBe(560);
    expect(stateOf(game).players.get(guesser)!.status).toBe('solved');
    expect(playerActions(ctx, guesser, 'IC_GUESS_RESULT')[0]).toMatchObject({
      kind: 'early',
      correct: true,
      points: 560,
    });
    expect(stateOf(game).solvedOrder).toEqual([guesser]);

    // they keep voting, and no longer take turns
    game.handleInput(guesser, 'vote', { vote: 'yes' });
    expect(stateOf(game).current!.votes.get(guesser)).toBe('yes');
    voteAll(game, ids);
    seconds(IC_RESULT_SECONDS);
    const askers: string[] = [];
    for (let i = 0; i < 20 && phase(game) === 'ASK'; i++) {
      askers.push(asker(game));
      playTurn(game, ids);
    }
    expect(askers).not.toContain(guesser);
    // 12 turns less the first (played before the loop) and the guesser's three
    expect(askers).toHaveLength(8);
    game.cleanup();
  });

  it('accepts a fuzzy right guess through the server matcher', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const guesser = voters(game, ids)[0]!;
    const alias = identityOf(game, guesser).aliases[0]!;
    game.handleInput(guesser, 'guess', { text: `  ${alias.toUpperCase()}  ` });
    expect(stateOf(game).players.get(guesser)!.status).toBe('solved');
    game.cleanup();
  });

  it('scores an early right guess lower when fewer slots are left', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    const guesser = ids.find((u) => u !== asker(game))!;
    // the guesser has used two of three slots
    stateOf(game).players.get(guesser)!.slotsUsed = 2;
    ask(game);
    game.handleInput(guesser, 'guess', { text: rightGuess(game, guesser) });
    // 1 of 3 left: 200 + 100 + 20
    expect(stateOf(game).scores.get(guesser)).toBe(320);
    game.cleanup();
  });

  it('costs 100 for a wrong early guess, ends the player’s questions and gives them a final guess', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const guesser = voters(game, ids)[0]!;
    game.handleInput(guesser, 'guess', { text: 'Completely Wrong Person' });
    expect(stateOf(game).scores.get(guesser)).toBe(-100);
    expect(stateOf(game).players.get(guesser)!.status).toBe('stopped');
    // only one early guess
    game.handleInput(guesser, 'guess', { text: rightGuess(game, guesser) });
    expect(stateOf(game).players.get(guesser)!.guesses).toHaveLength(1);
    expect(stateOf(game).scores.get(guesser)).toBe(-100);

    voteAll(game, ids);
    seconds(IC_RESULT_SECONDS);
    const askers: string[] = [];
    for (let i = 0; i < 20 && phase(game) === 'ASK'; i++) {
      askers.push(asker(game));
      playTurn(game, ids);
    }
    expect(askers).not.toContain(guesser);
    expect(phase(game)).toBe('FINAL');
    expect(stateOf(game).finalists.has(guesser)).toBe(true);
    game.cleanup();
  });

  it('gives the turn up when the asker guesses in their own ask phase', () => {
    const { game, ctx } = setup();
    toFirstAsk(game);
    const first = asker(game);
    game.handleInput(first, 'guess', { text: 'Completely Wrong Person' });
    expect(stateOf(game).players.get(first)!.status).toBe('stopped');
    expect(phase(game)).toBe('ASK');
    expect(asker(game)).not.toBe(first);
    expect(actions(ctx, 'IC_ASK_TIMEOUT')).toHaveLength(0);
    game.cleanup();
  });

  it('runs the final guess for everyone not yet right: right is 200 with no bonus, wrong is nothing, once', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const solved = voters(game, ids)[0]!;
    game.handleInput(solved, 'guess', { text: rightGuess(game, solved) });
    voteAll(game, ids);
    seconds(IC_RESULT_SECONDS);
    while (phase(game) === 'ASK') playTurn(game, ids);
    expect(phase(game)).toBe('FINAL');
    expect(actions(ctx, 'IC_FINAL_START')[0]).toMatchObject({ duration: IC_FINAL_SECONDS });
    expect(stateOf(game).finalists.has(solved)).toBe(false);

    // the solved player cannot guess again
    const before = stateOf(game).scores.get(solved)!;
    game.handleInput(solved, 'guess', { text: rightGuess(game, solved) });
    expect(stateOf(game).scores.get(solved)).toBe(before);

    const [right, wrong] = ids.filter((u) => u !== solved);
    // the player has used every slot: 200 and no efficiency
    game.handleInput(right!, 'guess', { text: rightGuess(game, right!) });
    expect(stateOf(game).scores.get(right!)).toBe(200);
    game.handleInput(wrong!, 'guess', { text: 'Not Even Close Person' });
    expect(stateOf(game).scores.get(wrong!)).toBe(0);
    // one guess only
    game.handleInput(wrong!, 'guess', { text: rightGuess(game, wrong!) });
    expect(stateOf(game).scores.get(wrong!)).toBe(0);
    expect(phase(game)).toBe('FINAL');
    // the others are told that a final guess came in, never whether it was right
    const others = playerActions(ctx, solved, 'IC_PLAYER_GUESSED').filter((a) => a.kind === 'final');
    expect(others).toHaveLength(2);
    for (const a of others) expect(keysOf(a).has('correct')).toBe(false);
    game.cleanup();
  });

  it('ends the final phase when every finalist has guessed, and reveals the identities', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    while (phase(game) === 'ASK') playTurn(game, ids);
    expect(phase(game)).toBe('FINAL');
    for (const id of ids) game.handleInput(id, 'guess', { text: 'Not Even Close Person' });
    expect(phase(game)).toBe('REVEAL');
    const reveal = actions(ctx, 'IC_REVEAL')[0]!;
    expect(
      (reveal.players as Array<{ userId: string; identity: { name: string } }>).map((p) => p.identity.name).sort(),
    ).toEqual(ids.map((id) => identityOf(game, id).name).sort());
    // after the reveal the match ends
    expect(ctx.completedResults).toHaveLength(0);
    seconds(IC_REVEAL_SECONDS);
    expect(ctx.completedResults).toHaveLength(1);
  });

  it('runs the final phase to its clock when someone never guesses', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    while (phase(game) === 'ASK') playTurn(game, ids);
    game.handleInput(ids[0]!, 'guess', { text: 'Not Even Close Person' });
    expect(phase(game)).toBe('FINAL');
    seconds(IC_FINAL_SECONDS);
    expect(phase(game)).toBe('REVEAL');
    seconds(IC_REVEAL_SECONDS);
    expect(ctx.completedResults).toHaveLength(1);
  });

  it('ends at once, skipping the final phase, when every player has guessed right', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    ask(game);
    for (const id of ids.filter((u) => u !== asker(game))) {
      game.handleInput(id, 'guess', { text: rightGuess(game, id) });
    }
    expect(phase(game)).toBe('VOTE');
    const first = asker(game);
    // everyone else has solved it, so the only turn left is the first asker's
    voteAll(game, ids);
    seconds(IC_RESULT_SECONDS);
    expect(phase(game)).toBe('ASK');
    expect(asker(game)).toBe(first);
    game.handleInput(first, 'guess', { text: rightGuess(game, first) });
    expect(phase(game)).toBe('REVEAL');
    expect(actions(ctx, 'IC_FINAL_START')).toHaveLength(0);
    seconds(IC_REVEAL_SECONDS);
    expect(ctx.completedResults).toHaveLength(1);
    const results = ctx.completedResults[0]!;
    expect(results.rankings).toHaveLength(4);
    expect(results.awards.map((a) => a.title)).toContain('Self-Aware');
  });
});

describe('Identity Crisis — a whole game', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays four players through three questions each, then the final guess, the reveal and the end', () => {
    const { game, ctx, ids } = setup();
    expect(phase(game)).toBe('ASSIGN');
    toFirstAsk(game);
    let turns = 0;
    while (phase(game) === 'ASK') {
      playTurn(game, ids);
      turns++;
    }
    expect(turns).toBe(12);
    expect(stateOf(game).questions).toHaveLength(12);
    for (const id of ids) expect(stateOf(game).players.get(id)!.slotsUsed).toBe(3);
    expect(phase(game)).toBe('FINAL');

    ids.forEach((id, i) =>
      game.handleInput(id, 'guess', { text: i % 2 === 0 ? rightGuess(game, id) : 'Nobody Known' }),
    );
    expect(phase(game)).toBe('REVEAL');
    // the reveal is the one place a player gets their own identity
    const mine = game.getStateForPlayer(ids[0]!) as { reveal: Array<{ userId: string; identity: { name: string } }> };
    expect(mine.reveal.find((r) => r.userId === ids[0])!.identity.name).toBe(identityOf(game, ids[0]!).name);
    seconds(IC_REVEAL_SECONDS);

    expect(ctx.errors).toHaveLength(0);
    expect(ctx.completedResults).toHaveLength(1);
    const results = ctx.completedResults[0]!;
    expect(results.rankings.map((r) => r.userId).sort()).toEqual([...ids].sort());
    expect(results.rankings[0]!.score).toBeGreaterThanOrEqual(results.rankings[3]!.score);

    const log = results.gameSpecificData.gameLog as {
      minigameId: string;
      initialState: { identityAssignments: Array<{ userId: string; identity: string }> };
      actions: Array<{ type: string; payload: Record<string, unknown> }>;
    };
    expect(log.minigameId).toBe('identity-crisis');
    expect(log.initialState.identityAssignments).toHaveLength(4);
    expect(log.actions.filter((a) => a.type === 'question_asked')).toHaveLength(12);
    expect(log.actions.filter((a) => a.type === 'vote_result')).toHaveLength(12);
    expect(log.actions.filter((a) => a.type === 'identity_reveal')).toHaveLength(4);
    expect(log.actions.filter((a) => a.type === 'guess')).toHaveLength(4);
    expect(game.pendingTimerCount).toBe(0);
  });

  it('draws only easy identities in the first game of a lobby session and counts the games', () => {
    const lobbyId = 'IC-SESSION';
    const make = (prior: number) => {
      const ctx = createMockContext(FOUR, {
        lobbyId,
        gameSettings: { questionsPerPlayer: 2, askSeconds: ASK_SECONDS, hardIdentities: false },
      });
      ctx.context.priorGamesOfThisMinigame = prior;
      const game = new IdentityCrisisGame(ctx.context);
      game.start();
      return game;
    };
    const first = make(0);
    expect(stateOf(first).gameNumber).toBe(1);
    for (const record of stateOf(first).players.values()) expect(record.identity.difficulty).toBe('easy');
    first.cleanup();
    const second = make(1);
    expect(stateOf(second).gameNumber).toBe(2);
    second.cleanup();
  });

  it('honours questionsPerPlayer', () => {
    const { game, ids } = setup(FOUR, { questionsPerPlayer: 2 });
    toFirstAsk(game);
    let turns = 0;
    while (phase(game) === 'ASK') {
      playTurn(game, ids);
      turns++;
    }
    expect(turns).toBe(8);
    game.cleanup();
  });

  it('skips a disconnected asker and still finishes', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    const first = asker(game);
    ctx.context.players.get(first)!.isConnected = false;
    game.handlePlayerDisconnect(first);
    expect(asker(game)).not.toBe(first);
    expect(stateOf(game).players.get(first)!.slotsUsed).toBe(1);
    game.cleanup();
    expect(ids).toContain(first);
  });

  it('closes a vote that only a disconnected player is holding open', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const [a, b, c] = voters(game, ids);
    game.handleInput(a!, 'vote', { vote: 'yes' });
    game.handleInput(b!, 'vote', { vote: 'yes' });
    ctx.context.players.get(c!)!.isConnected = false;
    game.handlePlayerDisconnect(c!);
    expect(phase(game)).toBe('RESULT');
    game.cleanup();
  });

  it('re-sends the player’s state on reconnect', () => {
    const { game, ctx, ids } = setup();
    toFirstAsk(game);
    game.handlePlayerReconnect(ids[1]!);
    const snap = ctx.playerLog.filter((e) => e.userId === ids[1] && e.event === 'rmhbox:game:state_snapshot');
    expect(snap).toHaveLength(1);
    expect(JSON.stringify(snap[0]!.data)).not.toContain(identityOf(game, ids[1]!).name);
    game.cleanup();
  });

  it('pauses and resumes with the host', () => {
    const { game } = setup();
    game.pausePhaseTimer();
    seconds(IC_ASSIGN_SECONDS * 2);
    expect(phase(game)).toBe('ASSIGN');
    game.resumePhaseTimer();
    seconds(IC_ASSIGN_SECONDS);
    expect(phase(game)).toBe('ASK');
    game.cleanup();
  });

  it('reports spectators follow the omniscient view', () => {
    const { game } = setup();
    expect(game.spectatorMode).toBe('shared-privileged');
    expect(game.getSpectatorSnapshot()).toEqual(game.getStateForSpectator());
    game.cleanup();
  });
});

describe('Identity Crisis — the settings reach the game', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the asker askSeconds', () => {
    const { game, ctx } = setup(FOUR, { askSeconds: 10 });
    toFirstAsk(game);
    const start = [...actions(ctx, 'IC_TURN_START'), ...ctx.playerLog.map((e) => e.data as Record<string, unknown>)]
      .filter((d) => d.type === 'IC_TURN_START' || d.type === 'IC_TURN_START_SELF')
      .find(Boolean)!;
    expect(start.duration).toBe(10);
    const first = asker(game);
    seconds(10);
    expect(asker(game)).not.toBe(first);
    game.cleanup();
  });

  it('is not started with fewer identities than players', () => {
    // the mocked pool holds 16; seventeen players cannot be dealt
    const users = Array.from({ length: 17 }, (_, i) => ({ ...MOCK_USERS.alice, userId: `u${i}`, username: `u${i}` }));
    const ctx = createMockContext(users, { lobbyId: 'IC-BIG', gameSettings: {} });
    const game = new IdentityCrisisGame(ctx.context);
    game.start();
    expect(ctx.errors).toHaveLength(1);
    game.cleanup();
  });
});
