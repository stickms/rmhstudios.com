import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Account deletion anonymises the user row in place. Published build comments stay under "Deleted user", the way
 * post comments do, so nothing is deleted or blanked; only where the member was the creator who hid a comment is the
 * reference unlinked. The export lists what the member wrote and never who hid it.
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
import { exportBuildComments } from '@/lib/builds/comments.server';

describe('anonymizeAccount (build comments)', () => {
  it("keeps the member's comments and only unlinks where they hid", async () => {
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
          'buildComment',
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
          'updateMany',
        args: {
          where:
            {
              hiddenById:
                'user-1',
            },
          data: {
            hiddenById:
              null,
          },
        },
      },
    );
    expect(
      ops.some(
        (
          o,
        ) =>
          o.method ===
            'deleteMany' ||
          o.method ===
            'delete',
      ),
    ).toBe(
      false,
    );
  });
});

describe('exportBuildComments', () => {
  it("reads only the member's own comments and leaves out hiddenById", async () => {
    const findMany =
      vi.fn(
        async () => [
          {
            content:
              'Nice build',
            createdAt:
              new Date(
                '2026-11-20T10:00:00Z',
              ),
            editedAt:
              new Date(
                '2026-11-20T10:10:00Z',
              ),
            deletedAt:
              null,
            build:
              {
                title:
                  'Boat',
                slug: 'boat',
              },
          },
        ],
      );
    (
      prismaMock as Record<
        string,
        unknown
      >
    ).buildComment =
      {
        findMany,
      };
    const rows =
      await exportBuildComments(
        'user-1',
      );
    const args =
      (
        findMany
          .mock
          .calls as unknown[][]
      )[0]![0] as {
        where: unknown;
        select: Record<
          string,
          unknown
        >;
      };
    expect(
      args.where,
    ).toEqual(
      {
        userId:
          'user-1',
      },
    );
    expect(
      args.select,
    ).not.toHaveProperty(
      'hiddenById',
    );
    expect(
      rows,
    ).toEqual(
      [
        {
          buildTitle:
            'Boat',
          buildSlug:
            'boat',
          content:
            'Nice build',
          createdAt:
            '2026-11-20T10:00:00.000Z',
          editedAt:
            '2026-11-20T10:10:00.000Z',
          deletedAt:
            null,
        },
      ],
    );
  });
});
