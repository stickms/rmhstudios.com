import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so the cascade never fires and a member's pinned posts would stay
 * pinned to a profile that no longer exists. They are unpinned explicitly (the posts themselves are not erased here).
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

describe('anonymizeAccount (profile pins)', () => {
  it('unpins every post the account had pinned', async () => {
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
    const op =
      tx.find(
        (
          o,
        ) =>
          o.model ===
            'rMHark' &&
          o.method ===
            'updateMany',
      );
    expect(
      op,
    ).toBeDefined();
    expect(
      op!
        .args,
    ).toEqual(
      {
        where:
          {
            userId:
              'user-1',
            pinnedAt:
              {
                not: null,
              },
          },
        data: {
          pinnedAt:
            null,
        },
      },
    );
  });
});
