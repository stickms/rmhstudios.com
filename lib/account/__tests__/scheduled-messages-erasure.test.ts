import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a scheduled message's
 * cascade from the sender never fires. A pending row left behind would still be
 * delivered by the cron, as an account that no longer exists.
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

describe('anonymizeAccount (scheduled messages)', () => {
  it('deletes every scheduled message the account holds, pending or failed', async () => {
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
            'scheduledChatMessage' &&
          o.method ===
            'deleteMany',
      );
    expect(
      op,
    ).toBeDefined();
    // No status filter: a failed row still carries the sender's text.
    expect(
      op!
        .args,
    ).toEqual(
      {
        where:
          {
            senderId:
              'user-1',
          },
      },
    );
  });
});
