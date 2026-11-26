/**
 * s15-17: Human Keyboard with a community pack. The pack's sentences are the round's sentences; a bad code, a hidden,
 * removed or other-game pack, a pack whose stored lines no longer parse and a database failure all fall back to the
 * bundled sentences. The hub re-checks every stored line with the game's own rule.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import { HumanKeyboardGame } from '..';
import { packSentences } from '../handler';
import type { HumanKeyboardState } from '../types';
import type { Sentence } from '../../../../../lib/rmhbox/human-keyboard/rules';

vi.mock('@/lib/rmhbox/human-keyboard/data-loader', () => {
  const pool: Sentence[] = Array.from({ length: 6 }, (_, i) => ({
    id: `bundled-${i}`,
    text: `bundled sentence number ${'abcdef'[i]} for the table`,
    difficulty: 'easy' as const,
    category: 'test',
  }));
  return { loadSentences: () => pool };
});

const h = vi.hoisted(() => ({ packs: [] as Array<Record<string, unknown>>, fail: false, asked: [] as unknown[] }));

vi.mock('../../../prisma-client', async () => {
  const { shapeChecked } = await import('../../../../../lib/db/query-shape');
  return {
    getPrismaClient: () =>
      shapeChecked({
        rmhboxPack: {
          findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
            h.asked.push(args.where);
            if (h.fail) throw new Error('database is down');
            const hit = h.packs.find((p) => Object.entries(args.where).every(([k, v]) => p[k] === v));
            return hit ? { prompts: hit.prompts } : null;
          }),
        },
      }),
  };
});

const THREE = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie];
const sentenceLines = Array.from(
  { length: 14 },
  (_, i) => `our pack sentence about ${'abcdefghijklmn'[i]}${'opqrstuvwxyzab'[i]} things`,
);
const pack = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: 'ABC234',
  game: 'human-keyboard',
  hidden: false,
  moderatedAt: null,
  prompts: sentenceLines,
  ...over,
});

let lobby = 0;
function setup(settings: Record<string, string | number> = {}, rounds = 2) {
  const ctx = createMockContext(THREE, {
    lobbyId: `HKP${++lobby}`,
    gameSettings: { rounds, reshuffleSeconds: 8, ...settings },
  });
  const game = new HumanKeyboardGame(ctx.context);
  game.start();
  return { game, ctx };
}
const stateOf = (g: HumanKeyboardGame) => (g as unknown as { state?: HumanKeyboardState }).state;
const texts = (g: HumanKeyboardGame) => stateOf(g)!.sentences.map((s) => s.text);
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  h.packs = [];
  h.fail = false;
  h.asked = [];
});
afterEach(() => vi.useRealTimers());

describe('Human Keyboard with a pack code', () => {
  it('without a code starts at once on the bundled sentences and never asks the database', () => {
    const { game } = setup();
    expect(texts(game).every((t) => t.startsWith('bundled'))).toBe(true);
    expect(h.asked).toEqual([]);
  });

  it('plays the pack’s sentences, one per round, with no repeats', async () => {
    h.packs = [pack()];
    const { game, ctx } = setup({ packCode: ' abc234 ' }, 3);
    expect(stateOf(game)).toBeUndefined();
    await flush();
    const chosen = texts(game);
    expect(chosen).toHaveLength(3);
    expect(new Set(chosen).size).toBe(3);
    expect(chosen.every((t) => sentenceLines.includes(t))).toBe(true);
    expect(h.asked[0]).toEqual({ code: 'ABC234', game: 'human-keyboard', hidden: false, moderatedAt: null });
    // The round's sentence reaches the table.
    const round = ctx.broadcastLog
      .filter((e) => e.event === 'rmhbox:game:action')
      .map((e) => e.data as Record<string, unknown>)
      .find((d) => d.type === 'HK_ROUND');
    expect(sentenceLines).toContain(round?.sentence);
  });

  it('re-reads stored lines: they are normalised again, and one the game could not type is never played', async () => {
    const stored = ['Not Normalised Sentence Here', 'short one', 'x'.repeat(70), ...sentenceLines];
    h.packs = [pack({ prompts: stored })];
    const { game } = setup({ packCode: 'ABC234' }, 3);
    await flush();
    for (const t of texts(game)) {
      expect(t).toMatch(/^[a-z]+(?: [a-z]+)*$/);
      expect(t.length).toBeGreaterThanOrEqual(20);
      expect(t.length).toBeLessThanOrEqual(60);
      expect(['short one', 'x'.repeat(70)]).not.toContain(t);
    }
  });

  it.each([
    ['an unknown code', () => (h.packs = [])],
    ['a hidden pack', () => (h.packs = [pack({ hidden: true })])],
    ['a removed pack', () => (h.packs = [pack({ moderatedAt: new Date() })])],
    ['a pack for another game', () => (h.packs = [pack({ game: 'identity-crisis' })])],
    [
      'a pack too small once its bad lines are dropped',
      () => (h.packs = [pack({ prompts: ['x', 7, ...sentenceLines.slice(0, 5)] })]),
    ],
    ['a pack stored as something other than a list', () => (h.packs = [pack({ prompts: 'not a list' })])],
    ['a database failure', () => (h.fail = true)],
  ])('falls back to the bundled sentences for %s', async (_name, arrange) => {
    arrange();
    const { game } = setup({ packCode: 'ABC234' });
    await flush();
    expect(stateOf(game)).toBeDefined();
    expect(texts(game).every((t) => t.startsWith('bundled'))).toBe(true);
  });

  it('a code that is not a pack code never reaches the database', async () => {
    const { game } = setup({ packCode: 'zz' });
    await flush();
    expect(h.asked).toEqual([]);
    expect(texts(game).every((t) => t.startsWith('bundled'))).toBe(true);
  });

  it('answers a snapshot (a reconnect, a heartbeat) and a host skip while the pack is still loading', async () => {
    h.packs = [pack()];
    const { game } = setup({ packCode: 'ABC234' });
    expect(stateOf(game)).toBeUndefined();
    // No phase: the client ignores it, and the deal's own snapshot follows.
    expect(game.getStateForPlayer(MOCK_USERS.alice.userId)).toEqual({});
    expect(game.getStateForSpectator()).toEqual({});
    expect(game.computeResults()).toMatchObject({ rankings: [], awards: [] });
    await flush();
    expect(game.getStateForPlayer(MOCK_USERS.alice.userId)).toHaveProperty('phase');
  });
});

describe('a pack as sentences', () => {
  it('numbers the sentences per pack and drops a line the game could not type', () => {
    const out = packSentences([
      'the quick brown fox jumps',
      'Not Valid Because Capitals',
      'another usable sentence here',
    ]);
    expect(out.map((s) => [s.id, s.text])).toEqual([
      ['pack-1', 'the quick brown fox jumps'],
      ['pack-3', 'another usable sentence here'],
    ]);
  });
});
