import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `ContentRemoval` (which only cascades from the user) must be
 * deleted explicitly, and `reviewedById` (a plain column on it) nulled when a moderator's account is erased.
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
import { ERASURE_REGISTRY } from '@/lib/account/erasure-registry';

describe('anonymizeAccount (removal records)', () => {
  it('deletes the member’s own removal records and nulls the moderator column', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const own = tx.find((o) => o.model === 'contentRemoval' && o.method === 'deleteMany');
    expect(own, 'contentRemoval.deleteMany').toBeDefined();
    expect(own!.args).toEqual({ where: { authorId: 'user-1' } });
    const moderator = tx.find((o) => o.model === 'contentRemoval' && o.method === 'updateMany');
    expect(moderator, 'contentRemoval.updateMany').toBeDefined();
    expect(moderator!.args).toEqual({ where: { reviewedById: 'user-1' }, data: { reviewedById: null } });
  });

  it('is classified as erase, never todo', () => {
    expect(ERASURE_REGISTRY.ContentRemoval?.decision).toBe('erase');
  });
});
