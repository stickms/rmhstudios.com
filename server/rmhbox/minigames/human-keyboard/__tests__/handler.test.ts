/**
 * Human Keyboard — the server game: the deal and who may see it, the judging of
 * every press, the lock after a wrong letter, spaces that advance on their own,
 * the per-player rate limit, a reshuffle that never moves the cursor, the
 * re-deal after a disconnect and the end of a round and of the match.
 *
 * The game has no database access (the match write is the coordinator's), so
 * there is no Prisma fake here; every body a test reads goes through
 * assertJsonSafe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import type { MockContextData } from '../../../../../testing/rmhbox/phase-6/setup';
import { assertJsonSafe } from '../../../../../lib/db/query-shape';
import { HumanKeyboardGame } from '..';
import type { HumanKeyboardState } from '../types';
import { HK_ALPHABET } from '../../../../../lib/rmhbox/human-keyboard/rules';
import {
  HK_INPUT_RATE_LIMIT,
  HK_REDEAL_GRACE_MS,
  HK_RESULT_SECONDS,
  HK_REVEAL_SECONDS,
  HK_SPACE_DELAY_MS,
  HK_TYPING_SECONDS,
  HK_WRONG_KEY_LOCK_MS,
} from '../../../../../lib/rmhbox/human-keyboard/settings';

const alice = MOCK_USERS.alice.userId;
const bob = MOCK_USERS.bob.userId;
const charlie = MOCK_USERS.charlie.userId;
const RESHUFFLE = 8;

function setup(userList = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie], rounds = 1) {
  const ctx = createMockContext(userList, { gameSettings: { rounds, reshuffleSeconds: RESHUFFLE } });
  const game = new HumanKeyboardGame(ctx.context);
  game.start();
  return { game, ctx };
}

function stateOf(game: HumanKeyboardGame): HumanKeyboardState {
  return (game as unknown as { state: HumanKeyboardState }).state;
}

function sentenceOf(game: HumanKeyboardGame): string {
  const s = stateOf(game);
  return s.sentences[s.currentRound]!.text;
}

function holderOf(game: HumanKeyboardGame, letter: string): string {
  for (const [id, letters] of stateOf(game).deal) if (letters.includes(letter)) return id;
  throw new Error(`nobody holds ${letter}`);
}

/** A held letter that is not `not`, with its holder. */
function wrongPress(game: HumanKeyboardGame, not: string): { id: string; key: string } {
  for (const [id, letters] of stateOf(game).deal) {
    const key = letters.find((l) => l !== not);
    if (key) return { id, key };
  }
  throw new Error('no letter held');
}

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

function openTyping(game: HumanKeyboardGame) {
  vi.advanceTimersByTime(HK_REVEAL_SECONDS * 1000 + 5);
  expect(stateOf(game).phase).toBe('TYPING');
}

/** Press the next letter as its holder, waiting out each space. */
function typeNext(game: HumanKeyboardGame): void {
  const s = stateOf(game);
  const text = sentenceOf(game);
  if (text[s.cursor] === ' ') {
    vi.advanceTimersByTime(HK_SPACE_DELAY_MS + 1);
    return;
  }
  const letter = text[s.cursor]!;
  game.handleInput(holderOf(game, letter), 'press', { key: letter });
  // Under the five-a-second limit for anyone holding a run of letters
  vi.advanceTimersByTime(250);
}

function typeUntil(game: HumanKeyboardGame, cursor: number): void {
  let guard = 0;
  while (stateOf(game).cursor < cursor && stateOf(game).phase === 'TYPING' && guard++ < 500) typeNext(game);
}

describe('Human Keyboard — the deal and secrecy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deals the 26 letters once each, and tells each player only their own', () => {
    const { game, ctx } = setup();
    const deal = stateOf(game).deal;
    expect([...deal.values()].flat().sort().join('')).toBe(HK_ALPHABET);

    for (const id of [alice, bob, charlie]) {
      const mine = playerActions(ctx, id, 'HK_DEAL');
      expect(mine).toHaveLength(1);
      expect(mine[0]!.letters).toEqual(deal.get(id));
      // The only letters on the wire to this player are their own
      const wire = JSON.stringify(ctx.playerLog.filter((e) => e.userId === id));
      for (const other of [alice, bob, charlie].filter((o) => o !== id)) {
        const theirs = deal.get(other)!;
        expect(theirs.length).toBeGreaterThan(0);
        expect(wire).not.toContain(JSON.stringify(theirs));
      }
    }
    // The table's broadcasts hold counts, never letters
    const broadcast = JSON.stringify(ctx.broadcastLog.map((e) => e.data));
    expect(broadcast).not.toContain('"letters"');
    expect(broadcast).not.toContain('"deal"');
    game.cleanup();
  });

  it('puts only the player own letters in a player state, and every deal in a spectator state', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const deal = stateOf(game).deal;
    for (const id of [alice, bob, charlie]) {
      const state = game.getStateForPlayer(id) as Record<string, unknown>;
      assertJsonSafe(state);
      expect(state.myLetters).toEqual(deal.get(id));
      expect(state.deal).toBeNull();
      expect(state.counts).toEqual({
        [alice]: deal.get(alice)!.length,
        [bob]: deal.get(bob)!.length,
        [charlie]: deal.get(charlie)!.length,
      });
      const json = JSON.stringify(state);
      for (const other of [alice, bob, charlie].filter((o) => o !== id)) {
        expect(json).not.toContain(JSON.stringify(deal.get(other)));
      }
    }
    const spectator = game.getStateForSpectator() as Record<string, unknown>;
    assertJsonSafe(spectator);
    expect(spectator.deal).toEqual({
      [alice]: deal.get(alice),
      [bob]: deal.get(bob),
      [charlie]: deal.get(charlie),
    });
    expect(spectator.myLetters).toEqual([]);
    // The spectator is sent every deal
    expect(ctx.spectatorLog.some((e) => (e.data as Record<string, unknown>).type === 'HK_DEAL')).toBe(true);
    game.cleanup();
  });

  it('shows the sentence from its reveal and never a later round sentence', () => {
    const { game } = setup(undefined, 2);
    const first = sentenceOf(game);
    const state = game.getStateForPlayer(alice) as Record<string, unknown>;
    expect(state.sentence).toBe(first);
    const later = stateOf(game).sentences[1]!.text;
    expect(JSON.stringify(state)).not.toContain(later);
    game.cleanup();
  });
});

describe('Human Keyboard — presses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores a press before typing opens', () => {
    const { game } = setup();
    const letter = sentenceOf(game)[0]!;
    game.handleInput(holderOf(game, letter), 'press', { key: letter });
    expect(stateOf(game).cursor).toBe(0);
    game.cleanup();
  });

  it('advances the cursor when the holder presses the next letter, with one small broadcast', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const letter = sentenceOf(game)[0]!;
    const holder = holderOf(game, letter);
    game.handleInput(holder, 'press', { key: letter });
    expect(stateOf(game).cursor).toBe(1);
    const presses = actions(ctx, 'HK_PRESS');
    expect(presses).toEqual([{ type: 'HK_PRESS', cursor: 1, presserId: holder }]);
    expect(stateOf(game).correct.get(holder)).toBe(1);
    game.cleanup();
  });

  it('ignores a letter the presser does not hold, and tells only the presser', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const letter = sentenceOf(game)[0]!;
    const holder = holderOf(game, letter);
    const other = [alice, bob, charlie].find((id) => id !== holder)!;
    game.handleInput(other, 'press', { key: letter });
    expect(stateOf(game).cursor).toBe(0);
    expect(stateOf(game).wrong.get(other)).toBe(0);
    expect(playerActions(ctx, other, 'HK_KEY_NOT_YOURS')).toHaveLength(1);
    expect(playerActions(ctx, holder, 'HK_KEY_NOT_YOURS')).toHaveLength(0);
    expect(actions(ctx, 'HK_KEY_NOT_YOURS')).toHaveLength(0);
    expect(actions(ctx, 'HK_LOCK')).toHaveLength(0);
    game.cleanup();
  });

  it('locks the sentence for everyone 500 ms after a wrong held letter', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const next = sentenceOf(game)[0]!;
    const { id, key } = wrongPress(game, next);
    game.handleInput(id, 'press', { key });
    expect(stateOf(game).cursor).toBe(0);
    expect(stateOf(game).wrong.get(id)).toBe(1);
    expect(playerActions(ctx, id, 'HK_KEY_WRONG')).toHaveLength(1);
    expect(actions(ctx, 'HK_LOCK')).toHaveLength(1);

    // The right letter by its holder is refused while the table is locked
    const holder = holderOf(game, next);
    vi.advanceTimersByTime(HK_WRONG_KEY_LOCK_MS - 50);
    game.handleInput(holder, 'press', { key: next });
    expect(stateOf(game).cursor).toBe(0);

    vi.advanceTimersByTime(60);
    game.handleInput(holder, 'press', { key: next });
    expect(stateOf(game).cursor).toBe(1);
    game.cleanup();
  });

  it('advances over a space by itself after 200 ms, and a press meanwhile does nothing', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const text = sentenceOf(game);
    const space = text.indexOf(' ');
    typeUntil(game, space - 1);
    // The last letter before the space, with no wait after it
    game.handleInput(holderOf(game, text[space - 1]!), 'press', { key: text[space - 1]! });
    expect(stateOf(game).cursor).toBe(space);

    // The cursor rests on the space: a letter held by someone is neither right nor wrong
    const { id, key } = wrongPress(game, ' ');
    game.handleInput(id, 'press', { key });
    expect(stateOf(game).wrong.get(id) ?? 0).toBe(0);
    expect(stateOf(game).cursor).toBe(space);

    vi.advanceTimersByTime(HK_SPACE_DELAY_MS - 1);
    expect(stateOf(game).cursor).toBe(space);
    vi.advanceTimersByTime(2);
    expect(stateOf(game).cursor).toBe(space + 1);
    const autos = actions(ctx, 'HK_PRESS').filter((a) => a.presserId === null);
    expect(autos).toEqual([{ type: 'HK_PRESS', cursor: space + 1, presserId: null }]);
    game.cleanup();
  });

  it('drops more than five presses a second from one player, and counts them as nothing', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const next = sentenceOf(game)[0]!;
    const holder = holderOf(game, next);
    const presser = [alice, bob, charlie].find((id) => id !== holder)!;
    // A letter the presser does not hold: each allowed press answers "not yours"
    for (let i = 0; i < HK_INPUT_RATE_LIMIT + 3; i++) game.handleInput(presser, 'press', { key: next });
    expect(playerActions(ctx, presser, 'HK_KEY_NOT_YOURS')).toHaveLength(HK_INPUT_RATE_LIMIT);

    // Another player is not limited by it, and a second later the first may press again
    game.handleInput(holder, 'press', { key: next });
    expect(stateOf(game).cursor).toBe(1);
    vi.advanceTimersByTime(1001);
    game.handleInput(presser, 'press', { key: next });
    expect(playerActions(ctx, presser, 'HK_KEY_NOT_YOURS')).toHaveLength(HK_INPUT_RATE_LIMIT + 1);
    game.cleanup();
  });

  it('ignores bad input, a non-player and a press while paused', () => {
    const { game } = setup();
    openTyping(game);
    const letter = sentenceOf(game)[0]!;
    const holder = holderOf(game, letter);
    for (const data of [{ key: letter.toUpperCase() }, { key: 'ab' }, { key: 7 }, {}, null, 'a']) {
      game.handleInput(holder, 'press', data);
    }
    game.handleInput('someone-else', 'press', { key: letter });
    game.handleInput(holder, 'other', { key: letter });
    expect(stateOf(game).cursor).toBe(0);

    game.pausePhaseTimer();
    game.handleInput(holder, 'press', { key: letter });
    expect(stateOf(game).cursor).toBe(0);
    game.resumePhaseTimer();
    game.handleInput(holder, 'press', { key: letter });
    expect(stateOf(game).cursor).toBe(1);
    game.cleanup();
  });
});

describe('Human Keyboard — reshuffle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns 3 s ahead, deals again on schedule and never moves the cursor', () => {
    const { game, ctx } = setup();
    openTyping(game);
    typeUntil(game, 3);
    const cursor = stateOf(game).cursor;
    const before = JSON.stringify([...stateOf(game).deal]);

    // Move to just before the warning, then through it and the reshuffle
    const elapsed = Date.now() - stateOf(game).phaseStartedAt;
    vi.advanceTimersByTime((RESHUFFLE - 3) * 1000 - elapsed + 10);
    expect(actions(ctx, 'HK_RESHUFFLE_WARNING')).toHaveLength(1);
    expect(playerActions(ctx, alice, 'HK_DEAL').filter((d) => d.reason === 'reshuffle')).toHaveLength(0);
    vi.advanceTimersByTime(3000);

    const reshuffles = playerActions(ctx, alice, 'HK_DEAL').filter((d) => d.reason === 'reshuffle');
    expect(reshuffles).toHaveLength(1);
    expect(stateOf(game).cursor).toBe(cursor);
    expect([...stateOf(game).deal.values()].flat().sort().join('')).toBe(HK_ALPHABET);
    expect(JSON.stringify([...stateOf(game).deal])).not.toBe(before);
    game.cleanup();
  });

  it('still lets the new holder finish the sentence after a reshuffle', () => {
    const { game } = setup();
    openTyping(game);
    typeUntil(game, 1000);
    expect(stateOf(game).complete).toBe(true);
    game.cleanup();
  });
});

describe('Human Keyboard — disconnects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-deals a dropped player letters to the others after 5 s, without moving the cursor', () => {
    const { game, ctx } = setup();
    openTyping(game);
    typeUntil(game, 2);
    const cursor = stateOf(game).cursor;
    const dropped = charlie;
    const had = [...stateOf(game).deal.get(dropped)!];
    const keptBy = new Map([alice, bob].map((id) => [id, [...stateOf(game).deal.get(id)!]]));

    ctx.context.players.get(dropped)!.isConnected = false;
    game.handlePlayerDisconnect(dropped);
    vi.advanceTimersByTime(HK_REDEAL_GRACE_MS - 100);
    expect(stateOf(game).deal.get(dropped)).toEqual(had);

    vi.advanceTimersByTime(200);
    expect(stateOf(game).deal.get(dropped)).toEqual([]);
    const all = [...stateOf(game).deal.values()].flat().sort();
    expect(all.join('')).toBe(HK_ALPHABET);
    for (const [id, letters] of keptBy) for (const l of letters) expect(stateOf(game).deal.get(id)).toContain(l);
    expect(stateOf(game).cursor).toBe(cursor);
    expect(playerActions(ctx, alice, 'HK_DEAL').some((d) => d.reason === 'redeal')).toBe(true);

    // The table can finish without them
    typeUntil(game, 1000);
    expect(stateOf(game).complete).toBe(true);
    game.cleanup();
  });

  it('changes nothing when the player is back inside the grace', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const had = [...stateOf(game).deal.get(charlie)!];
    ctx.context.players.get(charlie)!.isConnected = false;
    game.handlePlayerDisconnect(charlie);
    vi.advanceTimersByTime(2000);
    ctx.context.players.get(charlie)!.isConnected = true;
    game.handlePlayerReconnect(charlie);
    // Past the grace but before the first reshuffle: the redeal was cancelled
    vi.advanceTimersByTime(HK_REDEAL_GRACE_MS - 1000);
    expect(stateOf(game).deal.get(charlie)).toEqual(had);
    expect(playerActions(ctx, alice, 'HK_DEAL').some((d) => d.reason === 'redeal')).toBe(false);
    game.cleanup();
  });

  it('deals a player back in at the next reshuffle once they are connected again', () => {
    const { game, ctx } = setup();
    openTyping(game);
    ctx.context.players.get(charlie)!.isConnected = false;
    game.handlePlayerDisconnect(charlie);
    vi.advanceTimersByTime(HK_REDEAL_GRACE_MS + 10);
    expect(stateOf(game).deal.get(charlie)).toEqual([]);
    ctx.context.players.get(charlie)!.isConnected = true;
    game.handlePlayerReconnect(charlie);
    // Back, but holding nothing until the keys are dealt again
    expect(stateOf(game).deal.get(charlie)).toEqual([]);
    vi.advanceTimersByTime(RESHUFFLE * 1000);
    expect(stateOf(game).deal.get(charlie)!.length).toBeGreaterThan(0);
    expect(playerActions(ctx, charlie, 'HK_DEAL').some((d) => d.reason === 'reshuffle')).toBe(true);
    game.cleanup();
  });

  it('leaves a player who is still away out of the next reshuffle, with no letters', () => {
    const { game, ctx } = setup();
    openTyping(game);
    ctx.context.players.get(charlie)!.isConnected = false;
    game.handlePlayerDisconnect(charlie);
    vi.advanceTimersByTime(RESHUFFLE * 1000);
    expect(stateOf(game).deal.get(charlie)).toEqual([]);
    expect([...stateOf(game).deal.values()].flat().sort().join('')).toBe(HK_ALPHABET);
    expect((game.getStateForPlayer(alice) as { counts: Record<string, number> }).counts[charlie]).toBe(0);
    game.cleanup();
  });
});

describe('Human Keyboard — a whole round and the match', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays a round to its end: reveal, typing, result, then the match ends', () => {
    const { game, ctx } = setup(undefined, 1);
    expect(stateOf(game).phase).toBe('REVEAL');
    expect(actions(ctx, 'HK_ROUND')).toHaveLength(1);
    openTyping(game);
    expect(actions(ctx, 'HK_TYPING')).toHaveLength(1);

    typeUntil(game, 1000);
    expect(stateOf(game).complete).toBe(true);
    expect(stateOf(game).phase).toBe('ROUND_RESULT');

    const [result] = actions(ctx, 'HK_RESULT');
    assertJsonSafe(result);
    expect(result).toMatchObject({ completed: true, sentence: sentenceOf(game), roundIndex: 0 });
    const rows = result!.results as Array<{ userId: string; correct: number; wrong: number; points: number }>;
    expect(rows).toHaveLength(3);
    // Every letter of the sentence was pressed by someone
    const letters = sentenceOf(game).replace(/ /g, '').length;
    expect(rows.reduce((n, r) => n + r.correct, 0)).toBe(letters);
    expect(rows.every((r) => r.wrong === 0 && r.points > 0)).toBe(true);

    expect(ctx.completedResults).toHaveLength(0);
    vi.advanceTimersByTime(HK_RESULT_SECONDS * 1000 + 5);
    expect(ctx.completedResults).toHaveLength(1);
    const done = ctx.completedResults[0]!;
    assertJsonSafe(done);
    expect(done.rankings).toHaveLength(3);
    expect(done.rankings.map((r) => r.score)).toEqual([...done.rankings.map((r) => r.score)].sort((a, b) => b - a));
    expect(done.awards.some((a) => a.title === 'Team Spirit')).toBe(true);
    expect(game.pendingTimerCount).toBe(0);

    // The log carries the round's sentence id, completion time and each player's presses
    const log = done.gameSpecificData.gameLog as { actions: Array<{ type: string; payload: Record<string, unknown> }> };
    const logged = log.actions.find((a) => a.type === 'round_result')!;
    expect(logged.payload.sentenceId).toBe(stateOf(game).sentences[0]!.id);
    expect(typeof logged.payload.elapsedMs).toBe('number');
    const players = logged.payload.results as Array<Record<string, unknown>>;
    for (const p of players) expect(p).toHaveProperty('correct');
    for (const p of players) expect(p).toHaveProperty('wrong');
  });

  it('plays two rounds with a fresh deal and a different sentence each', () => {
    const { game, ctx } = setup(undefined, 2);
    const first = sentenceOf(game);
    openTyping(game);
    typeUntil(game, 1000);
    expect(stateOf(game).phase).toBe('ROUND_RESULT');
    vi.advanceTimersByTime(HK_RESULT_SECONDS * 1000 + 5);
    expect(stateOf(game).currentRound).toBe(1);
    expect(stateOf(game).phase).toBe('REVEAL');
    expect(sentenceOf(game)).not.toBe(first);
    expect(stateOf(game).cursor).toBe(0);
    expect(playerActions(ctx, alice, 'HK_DEAL').filter((d) => d.reason === 'round')).toHaveLength(2);
    openTyping(game);
    typeUntil(game, 1000);
    vi.advanceTimersByTime(HK_RESULT_SECONDS * 1000 + 5);
    expect(ctx.completedResults).toHaveLength(1);
  });

  it('ends an unfinished round at 90 s with the half multiplier', () => {
    const { game, ctx } = setup(undefined, 1);
    openTyping(game);
    typeUntil(game, 2);
    vi.advanceTimersByTime(HK_TYPING_SECONDS * 1000);
    expect(stateOf(game).phase).toBe('ROUND_RESULT');
    const [result] = actions(ctx, 'HK_RESULT');
    expect(result).toMatchObject({ completed: false, multiplier: 0.5 });
    // No presses after the end. The sentence is drawn at random, so press the next letter someone holds (the
    // character under the cursor can be a space, which nobody holds).
    const cursor = stateOf(game).cursor;
    const letter = [...sentenceOf(game).slice(cursor)].find((c) => c !== ' ')!;
    game.handleInput(holderOf(game, letter), 'press', { key: letter });
    expect(stateOf(game).cursor).toBe(cursor);
    game.cleanup();
  });

  it('scores a wrong letter against the presser and withholds the perfect-accuracy bonus', () => {
    const { game, ctx } = setup(undefined, 1);
    openTyping(game);
    const { id, key } = wrongPress(game, sentenceOf(game)[0]!);
    game.handleInput(id, 'press', { key });
    vi.advanceTimersByTime(HK_WRONG_KEY_LOCK_MS + 10);
    typeUntil(game, 1000);
    const [result] = actions(ctx, 'HK_RESULT');
    const rows = result!.results as Array<{ userId: string; wrong: number; perfect: boolean }>;
    expect(rows.find((r) => r.userId === id)).toMatchObject({ wrong: 1, perfect: false });
    game.cleanup();
  });

  it('clears every timer when the game is cleaned up mid-round', () => {
    const { game } = setup();
    openTyping(game);
    game.cleanup();
    expect(game.pendingTimerCount).toBe(0);
  });
});

describe('Human Keyboard — review follow-ups', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the table locked after a wrong letter even when the presser reconnects', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const next = sentenceOf(game)[0]!;
    const { id, key } = wrongPress(game, next);
    game.handleInput(id, 'press', { key });
    ctx.context.players.get(id)!.isConnected = false;
    game.handlePlayerDisconnect(id);
    ctx.context.players.get(id)!.isConnected = true;
    game.handlePlayerReconnect(id);
    game.handleInput(holderOf(game, next), 'press', { key: next });
    expect(stateOf(game).cursor).toBe(0);
    vi.advanceTimersByTime(HK_WRONG_KEY_LOCK_MS + 10);
    game.handleInput(holderOf(game, next), 'press', { key: next });
    expect(stateOf(game).cursor).toBe(1);
    game.cleanup();
  });

  it('gives Not My Job to whoever pressed the most letters they did not hold', () => {
    const { game, ctx } = setup();
    openTyping(game);
    const notMine = stateOf(game).deal.get(bob)![0]!;
    game.handleInput(alice, 'press', { key: notMine });
    vi.advanceTimersByTime(250);
    game.handleInput(alice, 'press', { key: notMine });
    typeUntil(game, 1000);
    vi.advanceTimersByTime(HK_RESULT_SECONDS * 1000 + 5);
    const awards = ctx.completedResults[0]!.awards.filter((a) => a.title === 'Not My Job');
    expect(awards.map((a) => a.userId)).toEqual([alice]);
  });

  it('delivers partial results and leaves no timer when the host ends the game mid-round', () => {
    const { game, ctx } = setup(undefined, 2);
    openTyping(game);
    typeUntil(game, 2);
    ctx.context.players.get(charlie)!.isConnected = false;
    game.handlePlayerDisconnect(charlie);
    game.forceEnd('host_end');
    expect(ctx.completedResults).toHaveLength(1);
    assertJsonSafe(ctx.completedResults[0]);
    expect(game.pendingTimerCount).toBe(0);
    vi.advanceTimersByTime(HK_REDEAL_GRACE_MS + HK_TYPING_SECONDS * 1000);
    expect(ctx.completedResults).toHaveLength(1);
  });
});
