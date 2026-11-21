import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `Feedback` (which only cascades from the user) must be
 * deleted explicitly, and the admin who handled a row must be unlinked.
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

describe('anonymizeAccount (feedback)', () => {
  it('deletes the account’s feedback and unlinks rows it handled as an admin', async () => {
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
    const del =
      tx.find(
        (
          o,
        ) =>
          o.model ===
            'feedback' &&
          o.method ===
            'deleteMany',
      );
    expect(
      del?.args,
    ).toEqual(
      {
        where:
          {
            userId:
              'user-1',
          },
      },
    );
    const unlink =
      tx.find(
        (
          o,
        ) =>
          o.model ===
            'feedback' &&
          o.method ===
            'updateMany',
      );
    expect(
      unlink?.args,
    ).toEqual(
      {
        where:
          {
            handledById:
              'user-1',
          },
        data: {
          handledById:
            null,
        },
      },
    );
  });
});
