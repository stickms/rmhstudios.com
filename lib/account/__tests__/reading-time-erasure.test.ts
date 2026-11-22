import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `reading_time_day` (which
 * only cascades from the user) is deleted explicitly, and the two reading-time
 * settings are reset.
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

describe('anonymizeAccount (reading time)', () => {
  it('deletes every reading-time row and resets the settings', async () => {
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
            'readingTimeDay' &&
          o.method ===
            'deleteMany',
      );
    expect(
      del,
    ).toBeDefined();
    expect(
      del!
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
    const prefs =
      tx.find(
        (
          o,
        ) =>
          o.model ===
            'readingPrefs' &&
          o.method ===
            'updateMany',
      );
    expect(
      prefs!
        .args,
    ).toEqual(
      {
        where:
          {
            userId:
              'user-1',
          },
        data: {
          trackTime: false,
          weeklyMinutesTarget:
            null,
        },
      },
    );
  });
});
