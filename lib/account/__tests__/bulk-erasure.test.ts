import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `BulkOperation` (which only cascades from the user) must be
 * deleted explicitly. A run still in progress finds its row gone and stops at its next chunk.
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

describe('anonymizeAccount (bulk operations)', () => {
  it('deletes the account’s bulk clean-up operations', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const op = tx.find((o) => o.model === 'bulkOperation' && o.method === 'deleteMany');
    expect(op).toBeDefined();
    expect(op!.args).toEqual({ where: { userId: 'user-1' } });
  });

  it('removes only that member’s operations', async () => {
    await anonymizeAccount('user-2');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    const ops = tx.filter((o) => o.model === 'bulkOperation');
    expect(ops).toHaveLength(1);
    expect(JSON.stringify(ops[0]!.args)).toContain('user-2');
  });
});
