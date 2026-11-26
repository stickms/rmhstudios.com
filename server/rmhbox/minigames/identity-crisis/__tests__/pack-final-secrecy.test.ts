/**
 * Identity Crisis — a final guess stays private until the reveal in a pack game too (s15-20 after s15-17): the deal
 * waits on the pack, and a final guess by one of the pack's aliases reaches no other player's state, event or score
 * broadcast before REVEAL; at REVEAL the scores include it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_USERS, createMockContext } from '../../../../../testing/rmhbox/phase-6/setup';
import type { MockContextData } from '../../../../../testing/rmhbox/phase-6/setup';
import { IdentityCrisisGame } from '..';
import type { IdentityCrisisState } from '../types';
import type { Identity } from '../../../../../lib/rmhbox/identity-crisis/rules';
import { IC_ASSIGN_SECONDS, IC_RESULT_SECONDS } from '../../../../../lib/rmhbox/identity-crisis/settings';

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

// Each pack line is a name and one alias no other text in a message can collide with.
const PACK_LINES = Array.from(
  { length: 25 },
  (_, i) => `Packperson Zq${String.fromCharCode(97 + i)}${i} | zqalias${String.fromCharCode(97 + i)}${i}`,
);

vi.mock('../../../prisma-client', async () => {
  const { shapeChecked } = await import('../../../../../lib/db/query-shape');
  return {
    getPrismaClient: () =>
      shapeChecked({
        rmhboxPack: {
          findFirst: vi.fn(async () => ({ prompts: PACK_LINES })),
        },
      }),
  };
});

const FOUR = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
const WRONG = 'Not Even Close Person';

let lobby = 0;
async function toFinal() {
  const ctx = createMockContext(FOUR, {
    lobbyId: `ICPF${++lobby}`,
    gameSettings: { questionsPerPlayer: 1, askSeconds: 20, hardIdentities: false, packCode: 'ABC234' },
  });
  const game = new IdentityCrisisGame(ctx.context);
  game.start();
  await vi.advanceTimersByTimeAsync(0);
  const ids = FOUR.map((u) => u.userId);
  expect(stateOf(game).players.get(ids[0]!)!.identity.id.startsWith('pack-')).toBe(true);
  vi.advanceTimersByTime(IC_ASSIGN_SECONDS * 1000 + 5);
  while (stateOf(game).phase === 'ASK') {
    const asker = stateOf(game).askerId!;
    game.handleInput(asker, 'ask', { text: 'Am I a real person?' });
    for (const id of ids) if (id !== asker) game.handleInput(id, 'vote', { vote: 'yes' });
    vi.advanceTimersByTime(IC_RESULT_SECONDS * 1000 + 5);
  }
  expect(stateOf(game).phase).toBe('FINAL');
  return { game, ctx, ids };
}

const stateOf = (g: IdentityCrisisGame) => (g as unknown as { state: IdentityCrisisState }).state;
/** The pack alias of a player's identity: a right guess that is not the name. */
const aliasOf = (g: IdentityCrisisGame, userId: string) => stateOf(g).players.get(userId)!.identity.aliases[0]!;

function wireFor(ctx: MockContextData, userId: string): string {
  return JSON.stringify([ctx.broadcastLog, ctx.playerLog.filter((e) => e.userId === userId)]);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Identity Crisis with a pack — a final guess is private until the reveal', () => {
  it('a right final guess by a pack alias reaches no other player before REVEAL', async () => {
    const { game, ctx, ids } = await toFinal();
    const [a, b, c] = ids as [string, string, string, string];
    const before = wireFor(ctx, b).length;
    game.handleInput(a, 'guess', { text: aliasOf(game, a) });
    expect(stateOf(game).players.get(a)!.status).toBe('solved');
    const points = stateOf(game).scores.get(a)!;
    expect(points).toBeGreaterThan(0);

    const sent = wireFor(ctx, b).slice(before);
    expect(sent).not.toContain('"solved"');
    expect(sent).not.toContain('"correct":true');
    expect(sent).not.toContain(`"${a}":${points}`);
    expect(sent).not.toContain(aliasOf(game, a));
    for (const viewer of [b, c]) {
      const state = game.getStateForPlayer(viewer) as {
        statuses: Record<string, string>;
        scores: Record<string, number>;
      };
      expect(state.statuses[a]).toBe('final');
      expect(state.scores[a]).toBe(0);
    }
    // The guesser is told at once.
    const own = game.getStateForPlayer(a) as { myStatus: string; scores: Record<string, number> };
    expect(own.myStatus).toBe('solved');
    expect(own.scores[a]).toBe(points);
  });

  it('puts the points in every view at REVEAL', async () => {
    const { game, ctx, ids } = await toFinal();
    const [a, b, c, d] = ids as [string, string, string, string];
    game.handleInput(a, 'guess', { text: aliasOf(game, a) });
    for (const id of [b, c, d]) game.handleInput(id, 'guess', { text: WRONG });
    expect(stateOf(game).phase).toBe('REVEAL');
    const points = stateOf(game).scores.get(a)!;
    const reveal = ctx.broadcastLog.map((e) => e.data as Record<string, unknown>).find((d) => d.type === 'IC_REVEAL')!;
    expect((reveal.scores as Record<string, number>)[a]).toBe(points);
    for (const viewer of [b, c, d]) {
      const state = game.getStateForPlayer(viewer) as {
        statuses: Record<string, string>;
        scores: Record<string, number>;
      };
      expect(state.scores[a]).toBe(points);
      expect(state.statuses[a]).toBe('solved');
    }
  });
});
