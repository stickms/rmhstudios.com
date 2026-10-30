import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drop granting and badge crafting against an in-memory database. The fake models
 * the two guarantees the code leans on: the card_drop primary key (a duplicate create
 * throws P2002) and the transaction running to completion before the next begins.
 */

type Key = string;
const state = vi.hoisted(() => ({
  playtime: new Map<string, number>(),
  drops: new Map<string, { cardIndex: number; foil: boolean }>(),
  cards: new Map<string, number>(),
  badges: new Map<string, number>(),
  xp: 0,
}));

const cardKey = (u: string, g: string, i: number, f: boolean): Key => `${u}|${g}|${i}|${f}`;

const prismaMock = vi.hoisted(() => {
  const m: Record<string, unknown> = {
    gamePlaytime: {
      findUnique: async ({ where }: { where: { userId_gameId: { userId: string; gameId: string } } }) => {
        const t = state.playtime.get(`${where.userId_gameId.userId}|${where.userId_gameId.gameId}`);
        return t === undefined ? null : { totalSeconds: t };
      },
    },
    cardDrop: {
      findMany: async ({ where }: { where: { userId: string; gameId: string } }) =>
        [...state.drops.keys()]
          .filter((k) => k.startsWith(`${where.userId}|${where.gameId}|`))
          .map((k) => ({ dropIndex: Number(k.split('|')[2]) })),
      create: ({ data }: { data: { userId: string; gameId: string; dropIndex: number; cardIndex: number; foil: boolean } }) => {
        const k = `${data.userId}|${data.gameId}|${data.dropIndex}`;
        return Promise.resolve().then(() => {
          if (state.drops.has(k)) throw Object.assign(new Error('unique'), { code: 'P2002' });
          state.drops.set(k, { cardIndex: data.cardIndex, foil: data.foil });
        });
      },
    },
    userCard: {
      upsert: ({ where }: { where: { userId_gameId_cardIndex_foil: { userId: string; gameId: string; cardIndex: number; foil: boolean } } }) => {
        const w = where.userId_gameId_cardIndex_foil;
        return Promise.resolve().then(() => {
          const k = cardKey(w.userId, w.gameId, w.cardIndex, w.foil);
          state.cards.set(k, (state.cards.get(k) ?? 0) + 1);
        });
      },
      findMany: async ({ where }: { where: { userId: string; gameId: string; foil: boolean } }) =>
        [...state.cards.entries()]
          .filter(([k]) => {
            const [u, g, , f] = k.split('|');
            return u === where.userId && g === where.gameId && (f === 'true') === where.foil;
          })
          .map(([k, count]) => ({ cardIndex: Number(k.split('|')[2]), count })),
      delete: async ({ where }: { where: { userId_gameId_cardIndex_foil: { userId: string; gameId: string; cardIndex: number; foil: boolean } } }) => {
        const w = where.userId_gameId_cardIndex_foil;
        state.cards.delete(cardKey(w.userId, w.gameId, w.cardIndex, w.foil));
      },
      update: async ({ where }: { where: { userId_gameId_cardIndex_foil: { userId: string; gameId: string; cardIndex: number; foil: boolean } } }) => {
        const w = where.userId_gameId_cardIndex_foil;
        const k = cardKey(w.userId, w.gameId, w.cardIndex, w.foil);
        state.cards.set(k, (state.cards.get(k) ?? 0) - 1);
      },
    },
    gameBadge: {
      findUnique: async ({ where }: { where: { userId_gameId_foil: { userId: string; gameId: string; foil: boolean } } }) => {
        const w = where.userId_gameId_foil;
        const l = state.badges.get(`${w.userId}|${w.gameId}|${w.foil}`);
        return l === undefined ? null : { level: l };
      },
      upsert: async ({ where, create }: { where: { userId_gameId_foil: { userId: string; gameId: string; foil: boolean } }; create: { level: number } }) => {
        const w = where.userId_gameId_foil;
        state.badges.set(`${w.userId}|${w.gameId}|${w.foil}`, create.level);
      },
    },
    $executeRaw: async () => 0,
  };
  // A transaction either runs the callback against the fake or settles an op list.
  // Serialised, like the real advisory lock: one crafter at a time.
  let chain: Promise<unknown> = Promise.resolve();
  m.$transaction = (arg: unknown) => {
    const run = async () =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(m)
        : Promise.all(arg as Promise<unknown>[]);
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  };
  return m;
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/xp/engine.server', () => ({
  awardXp: vi.fn(async (_u: string, amount: number) => {
    state.xp += amount;
    return state.xp;
  }),
}));

import { craftBadge, grantDueDrops } from '@/lib/cards/cards.server';
import { DROP_EVERY_SECONDS, MAX_DROPS_PER_TITLE, SET_SIZE } from '@/lib/cards/cards';

const U = 'user-1';
const G = 'altair';

beforeEach(() => {
  state.playtime.clear();
  state.drops.clear();
  state.cards.clear();
  state.badges.clear();
  state.xp = 0;
});

describe('grantDueDrops', () => {
  it('grants nothing before 30 minutes of play', async () => {
    state.playtime.set(`${U}|${G}`, DROP_EVERY_SECONDS - 1);
    expect(await grantDueDrops(U, G)).toEqual([]);
  });

  it('grants each earned drop once, however often it is called', async () => {
    state.playtime.set(`${U}|${G}`, DROP_EVERY_SECONDS * 2);
    const first = await grantDueDrops(U, G);
    const second = await grantDueDrops(U, G);
    expect(first).toHaveLength(2);
    expect(second).toEqual([]);
    expect(state.drops.size).toBe(2);
  });

  it('never grants more than the per-title cap, even after enormous playtime', async () => {
    state.playtime.set(`${U}|${G}`, DROP_EVERY_SECONDS * 1000);
    await grantDueDrops(U, G);
    expect(state.drops.size).toBe(MAX_DROPS_PER_TITLE);
  });

  it('survives two beats racing for the same drop', async () => {
    state.playtime.set(`${U}|${G}`, DROP_EVERY_SECONDS);
    const [a, b] = await Promise.all([grantDueDrops(U, G), grantDueDrops(U, G)]);
    expect(a.length + b.length).toBe(1);
    expect(state.drops.size).toBe(1);
    const total = [...state.cards.values()].reduce((n, c) => n + c, 0);
    expect(total).toBe(1);
  });

  it('ignores a title that does not track playtime', async () => {
    expect(await grantDueDrops(U, 'not-a-title')).toEqual([]);
  });
});

function giveSet(foil: boolean, each = 1) {
  for (let i = 0; i < SET_SIZE; i++) state.cards.set(cardKey(U, G, i, foil), each);
}

describe('craftBadge', () => {
  it('refuses with a card missing and spends nothing', async () => {
    giveSet(false);
    state.cards.delete(cardKey(U, G, 3, false));
    expect(await craftBadge(U, G, false)).toEqual({ ok: false, reason: 'missing-cards' });
    expect(state.cards.size).toBe(SET_SIZE - 1);
    expect(state.xp).toBe(0);
  });

  it('spends one of each, levels the badge and awards XP', async () => {
    giveSet(false, 2);
    const r = await craftBadge(U, G, false);
    expect(r).toEqual({ ok: true, level: 1, foil: false, xp: 100 });
    expect([...state.cards.values()]).toEqual(Array(SET_SIZE).fill(1));
    expect(state.badges.get(`${U}|${G}|false`)).toBe(1);
    expect(state.xp).toBe(100);
  });

  it('removes a stack that reaches zero', async () => {
    giveSet(false, 1);
    await craftBadge(U, G, false);
    expect(state.cards.size).toBe(0);
  });

  it('two concurrent crafts cannot spend the same single set', async () => {
    giveSet(false, 1);
    const results = await Promise.all([craftBadge(U, G, false), craftBadge(U, G, false)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(state.badges.get(`${U}|${G}|false`)).toBe(1);
    expect(state.xp).toBe(100);
  });

  it('stops at the top level', async () => {
    state.badges.set(`${U}|${G}|false`, 5);
    giveSet(false);
    expect(await craftBadge(U, G, false)).toEqual({ ok: false, reason: 'max-level' });
  });

  it('a foil badge uses foil cards only and pays more', async () => {
    giveSet(true);
    giveSet(false);
    const r = await craftBadge(U, G, true);
    expect(r).toEqual({ ok: true, level: 1, foil: true, xp: 400 });
    // The normal stacks are untouched.
    for (let i = 0; i < SET_SIZE; i++) expect(state.cards.get(cardKey(U, G, i, false))).toBe(1);
  });

  it('rejects an unknown title', async () => {
    expect(await craftBadge(U, 'nope', false)).toEqual({ ok: false, reason: 'unknown-title' });
  });
});
