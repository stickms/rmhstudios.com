import { describe, expect, it, vi } from 'vitest';

/**
 * s15-08: account deletion anonymises the user row in place, so `CalcGraph` (which only cascades from the user) must
 * be deleted explicitly, and for that member only. The graph holds the member's own functions and the plotted points;
 * there is no second person in the row, so the one `deleteMany` on `userId` is the whole operation.
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
import { calcGraphErasureOps } from '@/lib/rmhcalculator/graphs.server';

describe('anonymizeAccount (saved calculator graphs)', () => {
  it('deletes the account’s saved graphs inside the deletion transaction', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'calcGraph');
    expect(ops).toEqual([{ model: 'calcGraph', method: 'deleteMany', args: { where: { userId: 'user-1' } } }]);
  });

  it('still deletes the notebooks beside them', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    expect(tx.some((o) => o.model === 'calcNotebook' && o.method === 'deleteMany')).toBe(true);
  });

  it('the operation is a plain Prisma delete scoped to the member (no raw SQL in the array)', () => {
    expect(calcGraphErasureOps('user-9')).toEqual([
      { model: 'calcGraph', method: 'deleteMany', args: { where: { userId: 'user-9' } } },
    ]);
  });
});
