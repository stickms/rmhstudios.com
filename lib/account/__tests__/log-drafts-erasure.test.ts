import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so an editor's id on `BlogPostRevision.authorId` and
 * `BlogPost.updatedById` (plain columns, no foreign key) must be cleared explicitly. The Logs and their history stay.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => ({
          model: name,
          method,
          args,
        }),
      },
    );
  return new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    } as Record<string, unknown>,
    {
      get: (t, key: string) => (key in t ? t[key] : model(key)),
    },
  );
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: prismaMock,
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (Log drafts)', () => {
  it('de-identifies the account on revisions and on Logs it last saved, and deletes nothing', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const revisions = tx.find((o) => o.model === 'blogPostRevision');
    expect(revisions).toMatchObject({
      method: 'updateMany',
      args: {
        where: {
          authorId: 'user-1',
        },
        data: {
          authorId: null,
        },
      },
    });
    const posts = tx.find((o) => o.model === 'blogPost');
    expect(posts).toMatchObject({
      method: 'updateMany',
      args: {
        where: {
          updatedById: 'user-1',
        },
        data: {
          updatedById: null,
        },
      },
    });
    expect(
      tx.some((o) => (o.model === 'blogPost' || o.model === 'blogPostRevision') && o.method.startsWith('delete')),
    ).toBe(false);
  });
});
