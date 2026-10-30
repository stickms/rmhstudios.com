import { describe, expect, it, vi } from 'vitest';

/**
 * Deleting an account anonymises the user row in place (other people's content
 * references it), so rows that merely cascade from the user are NOT removed. Per-title playtime
 * is the person's activity: it must be erased, or a tombstoned "Deleted user"
 * would keep showing up in "Most played by" with their hours.
 */

type Op = { model: string; method: string; args: unknown };

const prismaMock = vi.hoisted(() => {
  // Every `prisma.<model>.<method>(args)` returns a descriptor; `$transaction`
  // hands the descriptors back so the test can see exactly what would run.
  const model = (name: string) =>
    new Proxy(
      {},
      { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) },
    );
  return new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount', () => {
  it('erases the account’s per-title and per-day playtime', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0] as Op[];
    const erased = tx
      .filter((o) => o.method === 'deleteMany')
      .map((o) => o.model)
      .sort();
    expect(erased).toContain('gamePlaytime');
    expect(erased).toContain('gamePlaytimeDay');
    for (const m of ['gamePlaytime', 'gamePlaytimeDay']) {
      const op = tx.find((o) => o.model === m && o.method === 'deleteMany');
      expect(op?.args).toEqual({ where: { userId: 'user-1' } });
    }
  });

  it('erases trading cards, the drop ledger and badges', async () => {
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0] as Op[];
    for (const m of ['userCard', 'cardDrop', 'gameBadge']) {
      const op = tx.find((o) => o.model === m && o.method === 'deleteMany');
      expect(op?.args).toEqual({ where: { userId: 'user-1' } });
    }
  });

  it('removes the account’s live market listings, and only the active ones', async () => {
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0] as Op[];
    const op = tx.find((o) => o.model === 'cardListing' && o.method === 'deleteMany');
    expect(op?.args).toEqual({ where: { sellerId: 'user-1', status: 'ACTIVE' } });
  });

  it('removes pending trade offers in either direction', async () => {
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0] as Op[];
    const op = tx.find((o) => o.model === 'cardTrade' && o.method === 'deleteMany');
    expect(op?.args).toEqual({
      where: { status: 'PENDING', OR: [{ fromId: 'user-1' }, { toId: 'user-1' }] },
    });
  });

  it('erases the account’s hub replies and threads', async () => {
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0] as Op[];
    const post = tx.find((o) => o.model === 'gameThreadPost' && o.method === 'deleteMany');
    const thread = tx.find((o) => o.model === 'gameThread' && o.method === 'deleteMany');
    expect(post?.args).toEqual({ where: { authorId: 'user-1' } });
    expect(thread?.args).toEqual({ where: { authorId: 'user-1' } });
  });
});
