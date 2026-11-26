/**
 * s15-17: Identity Crisis with a community pack. The pack's identities (names and aliases) are the table's alone, a
 * bad code, a hidden, removed or other-game pack, a pack whose stored lines no longer parse and a database failure
 * all fall back to the bundled identities, and the guess matcher keeps its 0.3 threshold over the pack's aliases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import { IdentityCrisisGame } from '..';
import { fuseMatcher, packIdentities } from '../handler';
import type { IdentityCrisisState } from '../types';
import type { Identity } from '../../../../../lib/rmhbox/identity-crisis/rules';
import { drawIdentities } from '../../../../../lib/rmhbox/identity-crisis/rules';
import { IC_GUESS_MATCH_THRESHOLD } from '../../../../../lib/rmhbox/identity-crisis/settings';

vi.mock('../../../restrictions', () => ({
  peekMessageRestriction: () => false,
  loadMessageRestriction: async () => false,
}));

vi.mock('@/lib/rmhbox/identity-crisis/data-loader', () => {
  const pool: Identity[] = Array.from({ length: 12 }, (_, i) => ({
    id: `bundled-${i}`,
    name: `Bundled Person${String.fromCharCode(97 + i)}${i}`,
    aliases: [],
    category: `cat${i}`,
    difficulty: 'easy' as const,
  }));
  return { loadIdentities: () => pool };
});

interface PackRow {
  code: string;
  game: string;
  hidden: boolean;
  moderatedAt: Date | null;
  prompts: unknown;
}
const h = vi.hoisted(() => ({ packs: [] as Array<Record<string, unknown>>, fail: false, asked: [] as unknown[] }));

vi.mock('../../../prisma-client', async () => {
  const { shapeChecked } = await import('../../../../../lib/db/query-shape');
  return {
    getPrismaClient: () =>
      shapeChecked({
        rmhboxPack: {
          findFirst: vi.fn(async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
            h.asked.push(args.where);
            if (h.fail) throw new Error('database is down');
            const hit = h.packs.find((p) => Object.entries(args.where).every(([k, v]) => p[k] === v));
            return hit ? { prompts: hit.prompts } : null;
          }),
        },
      }),
  };
});

const FOUR = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
const lines = (n = 25) =>
  Array.from({ length: n }, (_, i) =>
    i === 0
      ? 'Ada Lovelace | Lovelace | Countess of Lovelace'
      : `Pack Person ${String.fromCharCode(65 + (i % 26))}${i}`,
  );
const pack = (over: Partial<PackRow> = {}): Record<string, unknown> => ({
  code: 'ABC234',
  game: 'identity-crisis',
  hidden: false,
  moderatedAt: null,
  prompts: lines(),
  ...over,
});

let lobby = 0;
function setup(settings: Record<string, string | number | boolean> = {}) {
  const ctx = createMockContext(FOUR, {
    lobbyId: `ICP${++lobby}`,
    gameSettings: { questionsPerPlayer: 3, askSeconds: 20, hardIdentities: false, ...settings },
  });
  const game = new IdentityCrisisGame(ctx.context);
  game.start();
  return { game, ctx };
}
const stateOf = (g: IdentityCrisisGame) => (g as unknown as { state?: IdentityCrisisState }).state;
const names = (g: IdentityCrisisGame) => [...stateOf(g)!.players.values()].map((p) => p.identity);
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  h.packs = [];
  h.fail = false;
  h.asked = [];
});
afterEach(() => vi.useRealTimers());

describe('Identity Crisis with a pack code', () => {
  it('without a code deals at once from the bundled identities and never asks the database', () => {
    const { game } = setup();
    expect(stateOf(game)).toBeDefined();
    expect(names(game).every((i) => i.id.startsWith('bundled-'))).toBe(true);
    expect(h.asked).toEqual([]);
  });

  it('deals every player an identity from the pack, with its aliases and no category', async () => {
    h.packs = [pack()];
    const { game, ctx } = setup({ packCode: 'abc234' });
    expect(stateOf(game)).toBeUndefined();
    await flush();
    const dealt = names(game);
    expect(dealt).toHaveLength(4);
    expect(dealt.every((i) => i.id.startsWith('pack-'))).toBe(true);
    expect(dealt.every((i) => i.category === '')).toBe(true);
    expect(h.asked[0]).toEqual({ code: 'ABC234', game: 'identity-crisis', hidden: false, moderatedAt: null });
    // The first snapshot is sent once the deal exists.
    expect(ctx.playerLog.some((e) => e.event === 'rmhbox:game:state_snapshot')).toBe(true);
  });

  it('draws every pack identity at some point (the whole pack is the pool, not a difficulty slice)', async () => {
    h.packs = [pack({ prompts: lines(20) })];
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { game } = setup({ packCode: 'ABC234' });
      await flush();
      for (const id of names(game)) seen.add(id.name);
      game.cleanup();
    }
    expect(seen.size).toBe(20);
    expect([...seen].some((n) => n === 'Ada Lovelace')).toBe(true);
  });

  it.each([
    ['an unknown code', () => (h.packs = [])],
    ['a hidden pack', () => (h.packs = [pack({ hidden: true })])],
    ['a removed pack', () => (h.packs = [pack({ moderatedAt: new Date() })])],
    ['a pack for another game', () => (h.packs = [pack({ game: 'wit-war' })])],
    [
      'a pack whose stored lines no longer parse',
      () => (h.packs = [pack({ prompts: ['x', 'y', 5, null, ...lines(10)] })]),
    ],
    ['a pack stored as something other than a list', () => (h.packs = [pack({ prompts: { not: 'a list' } })])],
    ['a database failure', () => (h.fail = true)],
  ])('falls back to the bundled identities for %s', async (_name, arrange) => {
    arrange();
    const { game } = setup({ packCode: 'ABC234' });
    await flush();
    expect(stateOf(game)).toBeDefined();
    expect(names(game).every((i) => i.id.startsWith('bundled-'))).toBe(true);
  });

  it('a code that is not a pack code never reaches the database', async () => {
    const { game } = setup({ packCode: 'no' });
    await flush();
    expect(h.asked).toEqual([]);
    expect(names(game).every((i) => i.id.startsWith('bundled-'))).toBe(true);
  });

  it('does not deal if the game was stopped while the pack loaded', async () => {
    h.packs = [pack()];
    const { game } = setup({ packCode: 'ABC234' });
    game.cleanup();
    (game as unknown as { isRunning: boolean }).isRunning = false;
    await flush();
    expect(stateOf(game)).toBeUndefined();
  });

  it('answers a snapshot (a reconnect, a heartbeat) and a host skip while the pack is still loading', async () => {
    h.packs = [pack()];
    const { game } = setup({ packCode: 'ABC234' });
    expect(stateOf(game)).toBeUndefined();
    // No phase: the client ignores it, and the deal's own snapshot follows.
    expect(game.getStateForPlayer(MOCK_USERS.alice.userId)).not.toHaveProperty('phase');
    expect(game.getStateForSpectator()).not.toHaveProperty('phase');
    expect(game.computeResults()).toMatchObject({ rankings: [], awards: [] });
    await flush();
    expect(game.getStateForPlayer(MOCK_USERS.alice.userId)).toHaveProperty('phase');
  });
});

describe('a pack as identities', () => {
  it('reads names and aliases and drops a line that no longer parses', () => {
    const out = packIdentities(['Ada Lovelace | Lovelace', 'x', 'Alan Turing']);
    expect(out.map((i) => [i.id, i.name, i.aliases])).toEqual([
      ['pack-1', 'Ada Lovelace', ['Lovelace']],
      ['pack-3', 'Alan Turing', []],
    ]);
  });

  it('skips the category spread: every identity shares the one placeholder category and all are dealt', () => {
    const pool = packIdentities(lines(25));
    const drawn = drawIdentities(pool, ['a', 'b', 'c', 'd'], { gameNumber: 1, hardIdentities: false, pack: true });
    expect(drawn).toHaveLength(4);
    expect(new Set(drawn.map((i) => i.id)).size).toBe(4);
  });
});

describe('guessing a pack identity', () => {
  const ada = packIdentities(['Ada Lovelace | Lovelace | Countess of Lovelace'])[0]!;

  it('keeps the 0.3 threshold', () => {
    expect(IC_GUESS_MATCH_THRESHOLD).toBe(0.3);
  });

  it('matches the name, an alias and a near miss, and not another person', () => {
    expect(fuseMatcher('ada lovelace', ada)).toBe(true);
    expect(fuseMatcher('lovelace', ada)).toBe(true);
    expect(fuseMatcher('countess of lovelace', ada)).toBe(true);
    expect(fuseMatcher('ada lovelase', ada)).toBe(true);
    expect(fuseMatcher('alan turing', ada)).toBe(false);
  });

  it('does not mix up two packs that number their identities the same', () => {
    const other = packIdentities(['Alan Turing'])[0]!;
    expect(other.id).toBe(ada.id);
    expect(fuseMatcher('alan turing', other)).toBe(true);
    expect(fuseMatcher('alan turing', ada)).toBe(false);
  });
});
