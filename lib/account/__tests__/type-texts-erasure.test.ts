import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `RmhTypeText` and `RmhTypeTextRun` (which only cascade
 * from the user) must be deleted explicitly. Their `text:<id>` ghosts live in `RmhTypeGhost`, which is already
 * deleted by user id for every passage, so no ghost operation is added for texts (asserted below).
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

describe('anonymizeAccount (RMHType saved texts)', () => {
  it('deletes the account’s texts and runs, runs first', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const runs = tx.findIndex((o) => o.model === 'rmhTypeTextRun' && o.method === 'deleteMany');
    const texts = tx.findIndex((o) => o.model === 'rmhTypeText' && o.method === 'deleteMany');
    expect(runs).toBeGreaterThanOrEqual(0);
    expect(texts).toBeGreaterThan(runs);
    expect(tx[runs]!.args).toEqual({ where: { userId: 'user-1' } });
    expect(tx[texts]!.args).toEqual({ where: { userId: 'user-1' } });
  });

  it('erases their text: ghosts with every ghost row, by user id and no passage filter', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    const ghosts = tx.filter((o) => o.model === 'rmhTypeGhost');
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({ method: 'deleteMany', args: { where: { userId: 'user-1' } } });
  });
});
