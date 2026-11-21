import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place. A member's community membership events
 * (joins, leaves, removals) keep counting in the community's totals, so they are
 * de-identified, not deleted: `userId` becomes null and nothing links a row to the person.
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

describe('anonymizeAccount (community membership events)', () => {
  it('sets userId to null on the account’s events and deletes none', async () => {
    await anonymizeAccount(
      'user-1',
    );
    const tx =
      (
        prismaMock.$transaction as ReturnType<
          typeof vi.fn
        >
      )
        .mock
        .calls[0]![0] as Op[];
    const ops =
      tx.filter(
        (
          o,
        ) =>
          o.model ===
          'communityMemberEvent',
      );
    expect(
      ops,
    ).toEqual(
      [
        {
          model:
            'communityMemberEvent',
          method:
            'updateMany',
          args: {
            where:
              {
                userId:
                  'user-1',
              },
            data: {
              userId:
                null,
            },
          },
        },
      ],
    );
  });
});
