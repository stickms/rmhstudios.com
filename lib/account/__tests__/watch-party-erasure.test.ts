import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so the cascade from the member to their "Going" marks
 * never fires, and a party they host and have not held would still open as the erased account. Both are
 * handled explicitly in `anonymizeAccount`.
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

describe('anonymizeAccount (watch parties)', () => {
  it('deletes the member’s RSVPs and closes the upcoming parties they host', async () => {
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

    const rsvps =
      tx.find(
        (
          o,
        ) =>
          o.model ===
            'rmhTubeRoomRsvp' &&
          o.method ===
            'deleteMany',
      );
    expect(
      rsvps,
    ).toBeDefined();
    expect(
      rsvps!
        .args,
    ).toEqual(
      {
        where:
          {
            userId:
              'user-1',
          },
      },
    );

    const rooms =
      tx.find(
        (
          o,
        ) =>
          o.model ===
            'rmhTubeRoom' &&
          o.method ===
            'updateMany',
      );
    expect(
      rooms,
    ).toBeDefined();
    expect(
      rooms!
        .args,
    ).toEqual(
      {
        where:
          {
            hostId:
              'user-1',
            closedAt:
              null,
            scheduledFor:
              {
                gt: expect.any(
                  Date,
                ),
              },
          },
        data: {
          closedAt:
            expect.any(
              Date,
            ),
        },
      },
    );
  });
});
