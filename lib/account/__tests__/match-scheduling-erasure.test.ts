import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a live match-time
 * proposal the member made (`proposedById`) is withdrawn explicitly: the
 * reference and the proposed time go together. Match rows themselves are
 * tournament records and stay.
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

describe('anonymizeAccount (match scheduling)', () => {
  it('withdraws the member’s live time proposals and keeps the match rows', async () => {
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
            'tournamentMatch' &&
          o.method ===
            'updateMany' &&
          JSON.stringify(
            o.args,
          ).includes(
            '"proposedById":"user-1"',
          ),
      );
    expect(
      op,
      'proposal erasure',
    ).toBeDefined();
    expect(
      op!
        .args,
    ).toEqual(
      {
        where:
          {
            proposedById:
              'user-1',
          },
        data: {
          proposedById:
            null,
          proposedAt:
            null,
        },
      },
    );
    expect(
      tx.some(
        (
          o,
        ) =>
          o.model ===
            'tournamentMatch' &&
          o.method ===
            'deleteMany',
      ),
    ).toBe(
      false,
    );
  });
});
