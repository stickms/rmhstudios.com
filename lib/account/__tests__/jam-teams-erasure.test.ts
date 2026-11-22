import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `GameJamTeamMember` (which only cascades from the user
 * and from the entry) must be deleted explicitly: the member's own rows, and the invitations still pending on
 * entries they submitted. Published entries stay (an owner decision), so accepted teammates on another
 * submitter's entry are untouched and nobody else's row goes.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (game jam teams)', () => {
  it('deletes the member’s team rows and the pending invitations on their entries, in the erasure transaction', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'gameJamTeamMember');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.method).toBe('deleteMany');
    expect(ops[0]!.args).toEqual({
      where: { OR: [{ userId: 'user-1' }, { status: 'invited', entry: { userId: 'user-1' } }] },
    });
  });

  it('does not erase the jam entries themselves, and never uses raw SQL in the batch', async () => {
    await anonymizeAccount('user-2');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    expect(tx.some((o) => o.method === '$executeRaw')).toBe(false);
    expect(tx.some((o) => o.model === 'gameJamEntry' || o.model === 'gameJamRating')).toBe(false);
  });
});
