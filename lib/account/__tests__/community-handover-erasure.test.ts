import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so an ownership offer to or from the member never cascades.
 * Open offers are deleted explicitly; a community the member owns is left alone (a site admin assigns an owner).
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

describe('anonymizeAccount (community handover)', () => {
  it('deletes the pending offers the account made or received', async () => {
    await anonymizeAccount('user-1');
    const ops = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const op = ops.find((o) => o.model === 'communityHandover' && o.method === 'deleteMany');
    expect(op).toBeDefined();
    expect(op!.args).toEqual({
      where: { status: 'pending', OR: [{ fromId: 'user-1' }, { toId: 'user-1' }] },
    });
  });

  it('leaves the community itself with its (now tombstone) owner for a site admin to reassign', async () => {
    await anonymizeAccount('user-1');
    const ops = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Op[];
    expect(ops.filter((o) => o.model === 'community')).toEqual([]);
  });
});
