import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place. An event update is event content and stays; where the
 * deleted member wrote it the author is nulled. The export lists what the member wrote.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy(
    { $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (event updates)', () => {
  it('nulls authorId on the updates the member wrote and deletes none of them', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'eventUpdate');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      method: 'updateMany',
      args: { where: { authorId: 'user-1' }, data: { authorId: null } },
    });
  });
});
