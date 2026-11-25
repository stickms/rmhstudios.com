import { describe, expect, it, vi } from 'vitest';

/**
 * s13-11: account deletion anonymises the user row in place, so `ListLeave` (which only cascades from the user) is
 * deleted explicitly, by the member's own id and nothing else. The rows on a list the member owns go with the list.
 */

interface Op {
  model: string;
  method: string;
  args: { where?: Record<string, unknown> };
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/email/send.server', () => ({ sendEmail: vi.fn(async () => undefined) }));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { ERASURE_REGISTRY } from '@/lib/account/erasure-registry';
import { listLeaveErasureOps } from '@/lib/lists/lists-on.server';

describe('lists you are on: erasure', () => {
  it('deletes the member’s own leave rows by their id, and touches nothing else', () => {
    const ops = listLeaveErasureOps('user-1') as unknown as Op[];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ model: 'listLeave', method: 'deleteMany', args: { where: { userId: 'user-1' } } });
  });

  it('runs inside anonymizeAccount’s transaction', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'listLeave');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.method).toBe('deleteMany');
    expect(ops[0]!.args.where).toEqual({ userId: 'user-1' });
  });

  it('is classified as erase in the registry', () => {
    expect(ERASURE_REGISTRY.ListLeave?.decision).toBe('erase');
  });
});
