import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `onDelete: Cascade`
 * never fires and `UserPlayLimits` (staking caps, cool-off and exclusion dates,
 * and the monthly spending budget with its notice month) would survive the
 * erasure. It is deleted explicitly.
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

describe('anonymizeAccount (play limits and spending budget)', () => {
  it('deletes the erased member’s whole play-limits row, and only theirs', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'userPlayLimits');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.method).toBe('deleteMany');
    expect(ops[0]!.args).toEqual({ where: { userId: 'user-1' } });
  });
});
