import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `CommunityMemberNote` rows about the member never cascade: they
 * are deleted explicitly, and where the member was the author or the deleting moderator the reference is nulled (s06-02).
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock =
  vi.hoisted(
    () => {
      const model =
        (
          name: string,
        ) =>
          new Proxy(
            {},
            {
              get:
                (
                  _t,
                  method: string,
                ) =>
                (
                  args: unknown,
                ) => ({
                  model:
                    name,
                  method,
                  args,
                }),
            },
          );
      return new Proxy(
        {
          $transaction:
            vi.fn(
              async (
                ops: unknown[],
              ) =>
                ops,
            ),
        } as Record<
          string,
          unknown
        >,
        {
          get: (
            t,
            key: string,
          ) =>
            key in
            t
              ? t[
                  key
                ]
              : model(
                  key,
                ),
        },
      );
    },
  );
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      prismaMock,
  }),
);

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (community moderator notes)', () => {
  const run = async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    return tx.filter((o) => o.model === 'communityMemberNote');
  };

  it('deletes the notes about the member', async () => {
    expect(await run()).toContainEqual({
      model: 'communityMemberNote',
      method: 'deleteMany',
      args: { where: { subjectId: 'user-1' } },
    });
  });

  it('nulls the author and the deleting moderator where the member was one', async () => {
    const ops = await run();
    expect(ops).toContainEqual({
      model: 'communityMemberNote',
      method: 'updateMany',
      args: { where: { authorId: 'user-1' }, data: { authorId: null } },
    });
    expect(ops).toContainEqual({
      model: 'communityMemberNote',
      method: 'updateMany',
      args: { where: { deletedById: 'user-1' }, data: { deletedById: null } },
    });
  });

  it('the notes about a member are deleted outright: no operation keeps their text', async () => {
    const ops = await run();
    expect(ops.filter((o) => o.method === 'deleteMany')).toHaveLength(1);
    expect(ops.every((o) => o.method === 'deleteMany' || o.method === 'updateMany')).toBe(true);
  });
});
