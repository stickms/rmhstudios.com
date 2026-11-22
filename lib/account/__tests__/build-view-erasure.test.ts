import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a first view recorded against the member's id would keep naming
 * them. The row stays (the creator's totals must not change) but loses its viewer.
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

describe('anonymizeAccount (build views)', () => {
  it('de-identifies the account’s build views instead of deleting them', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'buildView');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      method: 'updateMany',
      args: { where: { userId: 'user-1' }, data: { userId: null } },
    });
  });
});
