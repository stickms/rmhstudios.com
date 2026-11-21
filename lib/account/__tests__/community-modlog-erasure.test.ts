import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a moderation-log row (plain id columns,
 * no relation to User) is never removed by a cascade. The action stays, as "a deleted member",
 * with the moderator's own reason text; only the two ids are cleared.
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

describe('anonymizeAccount (community moderation log)', () => {
  it('nulls the member as actor and as target, and never deletes the rows', async () => {
    await anonymizeAccount(
      'user-1',
    );
    const ops =
      (
        prismaMock.$transaction as ReturnType<
          typeof vi.fn
        >
      )
        .mock
        .calls[0]![0] as Op[];
    const mine =
      ops.filter(
        (
          o,
        ) =>
          o.model ===
          'communityModAction',
      );
    expect(
      mine
        .map(
          (
            o,
          ) =>
            o.method,
        )
        .sort(),
    ).toEqual(
      [
        'updateMany',
        'updateMany',
      ],
    );
    expect(
      mine.map(
        (
          o,
        ) =>
          o.args,
      ),
    ).toEqual(
      expect.arrayContaining(
        [
          {
            where:
              {
                actorId:
                  'user-1',
              },
            data: {
              actorId:
                null,
            },
          },
          {
            where:
              {
                targetUserId:
                  'user-1',
              },
            data: {
              targetUserId:
                null,
            },
          },
        ],
      ),
    );
  });

  it('leaves the moderator-written reason and rule untouched', async () => {
    await anonymizeAccount(
      'user-2',
    );
    const calls =
      (
        prismaMock.$transaction as ReturnType<
          typeof vi.fn
        >
      )
        .mock
        .calls;
    const ops =
      calls[
        calls.length -
          1
      ]![0] as Op[];
    for (const o of ops.filter(
      (
        x,
      ) =>
        x.model ===
        'communityModAction',
    )) {
      const data =
        (
          o.args as {
            data: Record<
              string,
              unknown
            >;
          }
        )
          .data;
      expect(
        Object.keys(
          data,
        ),
      ).toHaveLength(
        1,
      );
      expect(
        data,
      ).not.toHaveProperty(
        'reason',
      );
      expect(
        data,
      ).not.toHaveProperty(
        'ruleTitle',
      );
    }
  });
});
