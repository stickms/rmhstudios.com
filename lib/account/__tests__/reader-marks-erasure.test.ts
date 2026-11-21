import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `LibraryReaderMark` (which only
 * cascades from the user) must be deleted explicitly: a member's place, bookmarks, note
 * text and tombstones go with the account.
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

describe('anonymizeAccount (reader sync)', () => {
  it('deletes every synced place, bookmark, note and tombstone of the account, and only its own', async () => {
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
          'libraryReaderMark',
      );
    expect(
      ops,
    ).toHaveLength(
      1,
    );
    expect(
      ops[0],
    ).toMatchObject(
      {
        method:
          'deleteMany',
        args: {
          where:
            {
              userId:
                'user-1',
            },
        },
      },
    );
  });
});
