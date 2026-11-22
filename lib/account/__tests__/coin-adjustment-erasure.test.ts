import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a `CoinAdjustment` is not
 * cascaded. It is a financial record and stays (like the ledger rows it explains),
 * but the admin's free-text note about the member is cleared, and nothing deletes
 * the row or touches the amount.
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

describe('anonymizeAccount (coin adjustments)', () => {
  it('clears the note on adjustments about the member and keeps the records', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'coinAdjustment');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      model: 'coinAdjustment',
      method: 'updateMany',
      args: { where: { userId: 'user-1' }, data: { note: null } },
    });
    expect(ops.some((o) => o.method.startsWith('delete'))).toBe(false);
  });
});
