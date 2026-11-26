/**
 * Identity Crisis — a final guess is private until the reveal (s15-20): before REVEAL no other player's state,
 * event or score broadcast says whether a finalist guessed right; the guesser is told at once; spectators see all;
 * at REVEAL the scores include the final points.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import type { MockContextData } from '../../../../../testing/rmhbox/phase-6/setup';
import { IdentityCrisisGame } from '..';
import type { IdentityCrisisState } from '../types';
import type { Identity } from '../../../../../lib/rmhbox/identity-crisis/rules';
import { IC_ASSIGN_SECONDS, IC_RESULT_SECONDS } from '../../../../../lib/rmhbox/identity-crisis/settings';

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

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** To the final phase with nobody solved; returns the table. */
function toFinal() {
  const t = setup();
  toFirstAsk(t.game);
  while (phase(t.game) === 'ASK') playTurn(t.game, t.ids);
  expect(phase(t.game)).toBe('FINAL');
  return t;
}

const WRONG = 'Not Even Close Person';

describe('Identity Crisis — a final guess is private until the reveal', () => {
  it('reads every finalist as final to the others, right or wrong, in the state', () => {
    const { game, ids } = toFinal();
    const [a, b, c, d] = ids as [string, string, string, string];
    game.handleInput(a, 'guess', { text: rightGuess(game, a) });
    game.handleInput(b, 'guess', { text: WRONG });
    for (const viewer of [c, d]) {
      const state = game.getStateForPlayer(viewer) as { statuses: Record<string, string> };
      expect(state.statuses[a]).toBe('final');
      expect(state.statuses[b]).toBe('final');
      expect(state.statuses[c]).toBe(viewer === c ? 'asking' : 'final');
    }
    // the guesser's own view tells them at once
    const own = game.getStateForPlayer(a) as { statuses: Record<string, string>; myStatus: string };
    expect(own.myStatus).toBe('solved');
    expect(own.statuses[a]).toBe('solved');
    expect(own.statuses[b]).toBe('final');
  });

  it('keeps the correct flag and the status out of IC_PLAYER_GUESSED for a final guess', () => {
    const { game, ctx, ids } = toFinal();
    const [a, b, c] = ids as [string, string, string, string];
    game.handleInput(a, 'guess', { text: rightGuess(game, a) });
    game.handleInput(b, 'guess', { text: WRONG });
    for (const viewer of [b, c]) {
      for (const ev of playerActions(ctx, viewer, 'IC_PLAYER_GUESSED').filter((e) => e.kind === 'final')) {
        expect(ev).toEqual({ type: 'IC_PLAYER_GUESSED', userId: ev.userId, kind: 'final' });
      }
    }
    expect(playerActions(ctx, a, 'IC_PLAYER_GUESSED').filter((e) => e.userId === a)).toHaveLength(0);
  });

  it('leaves a final guess’s points out of every other player’s scores until REVEAL', () => {
    const { game, ctx, ids } = toFinal();
    const [a, b, c] = ids as [string, string, string, string];
    game.handleInput(a, 'guess', { text: rightGuess(game, a) });
    expect(stateOf(game).scores.get(a)).toBe(200);
    // no score update, and no state, shows a's 200 to anyone else
    for (const viewer of [b, c]) {
      for (const ev of playerActions(ctx, viewer, 'IC_SCORE_UPDATE')) {
        expect((ev.scores as Record<string, number>)[a]).toBe(0);
      }
      expect((game.getStateForPlayer(viewer) as { scores: Record<string, number> }).scores[a]).toBe(0);
    }
    // the guesser sees their own at once, in the event and the state
    const mine = playerActions(ctx, a, 'IC_SCORE_UPDATE').at(-1)!;
    expect((mine.scores as Record<string, number>)[a]).toBe(200);
    expect((game.getStateForPlayer(a) as { scores: Record<string, number> }).scores[a]).toBe(200);
    expect(playerActions(ctx, a, 'IC_GUESS_RESULT')[0]).toMatchObject({ kind: 'final', correct: true, points: 200 });
    // no broadcast reaches the lobby with the points either
    for (const ev of actions(ctx, 'IC_SCORE_UPDATE')) expect((ev.scores as Record<string, number>)[a]).toBe(0);
  });

  it('shows spectators everything', () => {
    const { game, ctx, ids } = toFinal();
    const a = ids[0]!;
    game.handleInput(a, 'guess', { text: rightGuess(game, a) });
    const state = game.getStateForSpectator() as { statuses: Record<string, string>; scores: Record<string, number> };
    expect(state.statuses[a]).toBe('solved');
    expect(state.scores[a]).toBe(200);
    expect(spectatorActions(ctx, 'IC_PLAYER_GUESSED').at(-1)).toMatchObject({
      userId: a,
      kind: 'final',
      correct: true,
      status: 'solved',
    });
    expect((spectatorActions(ctx, 'IC_SCORE_UPDATE').at(-1)!.scores as Record<string, number>)[a]).toBe(200);
  });

  it('adds the final points to the public scores at REVEAL, in the event and the state', () => {
    const { game, ctx, ids } = toFinal();
    const [a, b, c, d] = ids as [string, string, string, string];
    game.handleInput(a, 'guess', { text: rightGuess(game, a) });
    game.handleInput(b, 'guess', { text: WRONG });
    game.handleInput(c, 'guess', { text: WRONG });
    expect(phase(game)).toBe('FINAL');
    game.handleInput(d, 'guess', { text: WRONG });
    expect(phase(game)).toBe('REVEAL');
    const reveal = actions(ctx, 'IC_REVEAL')[0]!;
    expect((reveal.scores as Record<string, number>)[a]).toBe(200);
    for (const viewer of [b, c, d]) {
      const state = game.getStateForPlayer(viewer) as {
        scores: Record<string, number>;
        statuses: Record<string, string>;
      };
      expect(state.scores[a]).toBe(200);
      expect(state.statuses[a]).toBe('solved');
    }
  });

  it('ends at once, with the points public, when the last finalist’s right guess solves the table', () => {
    const { game, ctx, ids } = toFinal();
    for (const id of ids) game.handleInput(id, 'guess', { text: rightGuess(game, id) });
    expect(phase(game)).toBe('REVEAL');
    const reveal = actions(ctx, 'IC_REVEAL')[0]!;
    for (const id of ids) expect((reveal.scores as Record<string, number>)[id]).toBe(200);
  });

  it('still shows an early solve to the table, and never hides a non-finalist', () => {
    const { game, ids } = setup();
    toFirstAsk(game);
    ask(game);
    const solved = voters(game, ids)[0]!;
    game.handleInput(solved, 'guess', { text: rightGuess(game, solved) });
    voteAll(game, ids);
    seconds(IC_RESULT_SECONDS);
    while (phase(game) === 'ASK') playTurn(game, ids);
    expect(phase(game)).toBe('FINAL');
    const viewer = ids.find((u) => u !== solved)!;
    const state = game.getStateForPlayer(viewer) as {
      statuses: Record<string, string>;
      scores: Record<string, number>;
    };
    expect(state.statuses[solved]).toBe('solved');
    expect(state.scores[solved]).toBeGreaterThan(200);
  });

  it('never puts a correct final guess in what another player was sent, down to the wire', () => {
    const { game, ctx, ids } = toFinal();
    const [a, b] = ids as [string, string, string, string];
    const before = wireFor(ctx, b).length;
    game.handleInput(a, 'guess', { text: rightGuess(game, a) });
    const sent = wireFor(ctx, b).slice(before);
    expect(sent).not.toContain('"solved"');
    expect(sent).not.toContain('"correct":true');
    expect(sent).not.toContain('"points":200');
    expect(sent).not.toContain('"' + a + '":200');
  });

  it('reconnects a finalist into the masked view', () => {
    const { game, ctx, ids } = toFinal();
    const [a, b] = ids as [string, string, string, string];
    game.handleInput(a, 'guess', { text: rightGuess(game, a) });
    game.handlePlayerReconnect(b);
    const snap = ctx.playerLog.filter((e) => e.userId === b && e.event === 'rmhbox:game:state_snapshot').at(-1)!
      .data as { statuses: Record<string, string>; scores: Record<string, number> };
    expect(snap.statuses[a]).toBe('final');
    expect(snap.scores[a]).toBe(0);
  });
});
