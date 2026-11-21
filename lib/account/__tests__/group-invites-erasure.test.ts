import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place, so the invite links a member made and the removals on record
 * about them (which only cascade from the chat) must be deleted explicitly (s06-09).
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
import { exportGroupInvites } from '@/lib/group-chat/invites.server';

describe('anonymizeAccount (group invite links)', () => {
  it('deletes the links the account made and the removals on record about it', async () => {
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
    const invites =
      tx.find(
        (
          o,
        ) =>
          o.model ===
            'chatInvite' &&
          o.method ===
            'deleteMany',
      );
    expect(
      invites?.args,
    ).toEqual(
      {
        where:
          {
            createdById:
              'user-1',
          },
      },
    );
    const removals =
      tx.find(
        (
          o,
        ) =>
          o.model ===
            'chatRemoval' &&
          o.method ===
            'deleteMany',
      );
    expect(
      removals?.args,
    ).toEqual(
      {
        where:
          {
            userId:
              'user-1',
          },
      },
    );
  });

  it('exports nothing from a recording stub without throwing', async () => {
    await expect(
      exportGroupInvites(
        'user-1',
      ),
    ).resolves.toEqual(
      [],
    );
  });
});
