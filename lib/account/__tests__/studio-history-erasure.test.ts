import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so earlier Studio project versions (which cascade only from
 * the project) must be deleted explicitly, scoped to the deleted member, and the export carries metadata only.
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

describe('anonymizeAccount (Studio history)', () => {
  it('deletes the member’s project versions, scoped to that member', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'studioProjectRevision');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.method).toBe('deleteMany');
    expect(ops[0]!.args).toEqual({ where: { userId: 'user-1' } });
  });
});
