import {
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {
  join,
  relative,
} from 'node:path';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * s03-04. Account deletion anonymises the user row in place, so the `onDelete` rules on `ModeratorNote` never
 * fire and the notes must be removed explicitly. Notes are the site's internal records: a member's own standing
 * endpoint and account export must not contain them, so only the admin code may read the table.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const h =
  vi.hoisted(
    () => ({
      touched:
        new Set<string>(),
    }),
  );

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

describe('anonymizeAccount (moderator notes)', () => {
  it('deletes the notes about the member and de-identifies the ones they wrote or deleted', async () => {
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
    const notes =
      tx.filter(
        (
          o,
        ) =>
          o.model ===
          'moderatorNote',
      );

    expect(
      notes.find(
        (
          o,
        ) =>
          o.method ===
          'deleteMany',
      )!
        .args,
    ).toEqual(
      {
        where:
          {
            subjectId:
              'user-1',
          },
      },
    );
    const updates =
      notes
        .filter(
          (
            o,
          ) =>
            o.method ===
            'updateMany',
        )
        .map(
          (
            o,
          ) =>
            o.args,
        );
    expect(
      updates,
    ).toContainEqual(
      {
        where:
          {
            authorId:
              'user-1',
          },
        data: {
          authorId:
            null,
        },
      },
    );
    expect(
      updates,
    ).toContainEqual(
      {
        where:
          {
            deletedById:
              'user-1',
          },
        data: {
          deletedById:
            null,
        },
      },
    );
    expect(
      notes,
    ).toHaveLength(
      3,
    );
  });
});

describe('moderator notes never reach a member', () => {
  it('the standing read model does not touch the notes table', async () => {
    vi.resetModules();
    const spy =
      new Proxy(
        {},
        {
          get: (
            _t,
            model: string,
          ) =>
            new Proxy(
              {},
              {
                get:
                  () =>
                  async () => {
                    h.touched.add(
                      model,
                    );
                    return [];
                  },
              },
            ),
        },
      );
    vi.doMock(
      '@/lib/prisma.server',
      () => ({
        prisma:
          spy,
      }),
    );
    const {
      getAccountStanding,
    } =
      await import('@/lib/moderation/standing.server');
    await getAccountStanding(
      'member-1',
    ).catch(
      () =>
        undefined,
    );
    expect(
      h
        .touched
        .size,
    ).toBeGreaterThan(
      0,
    );
    expect(
      h.touched.has(
        'moderatorNote',
      ),
    ).toBe(
      false,
    );
    vi.doUnmock(
      '@/lib/prisma.server',
    );
  });

  it('only the admin notes code, the reports queue counts and the erasure touch the table', () => {
    const root =
      process.cwd();
    const allowed =
      new Set(
        [
          'lib/account/deletion.server.ts',
          'lib/moderation/notes.server.ts',
          // The reports queue: note counts for the visible members, nothing else.
          'lib/moderation/triage.server.ts',
          'lib/admin/api/admin.reports.server.ts',
          'components/admin/UserModerationPanel.tsx',
          // s05-10 admin lookup (`auth: 'admin'`): a pasted note id resolves to its subject; the text is never selected.
          'lib/admin/lookup.server.ts',
          // s07-20 erasure registry: names the model as a data entry (classification only, never a query).
          'lib/account/erasure-registry.ts',
        ],
      );
    const found: string[] =
      [];
    const walk =
      (
        dir: string,
      ) => {
        for (const name of readdirSync(
          dir,
        )) {
          if (
            name ===
              'node_modules' ||
            name ===
              '__tests__' ||
            name.startsWith(
              '.',
            )
          )
            continue;
          const path =
            join(
              dir,
              name,
            );
          if (
            statSync(
              path,
            ).isDirectory()
          )
            walk(
              path,
            );
          else if (
            /\.(ts|tsx)$/.test(
              name,
            ) &&
            /prisma\.moderatorNote|moderation\/notes|ModeratorNote/.test(
              readFileSync(
                path,
                'utf8',
              ),
            )
          ) {
            found.push(
              relative(
                root,
                path,
              ),
            );
          }
        }
      };
    for (const dir of [
      'lib',
      'app',
      'components',
      'server',
      'features',
    ])
      walk(
        join(
          root,
          dir,
        ),
      );

    // The rest that names it is the admin tier's own types, schemas, endpoints and component.
    const adminOnly =
      (
        f: string,
      ) =>
        allowed.has(
          f,
        ) ||
        f.startsWith(
          'lib/moderation/notes',
        ) ||
        f.startsWith(
          'lib/moderation/api/admin.users.$id.notes',
        ) ||
        f ===
          'components/admin/ModeratorNotes.tsx' ||
        f ===
          'lib/api/route-table.server.ts';
    expect(
      found.filter(
        (
          f,
        ) =>
          !adminOnly(
            f,
          ),
      ),
    ).toEqual(
      [],
    );
    for (const f of [
      'lib/account/api/account.export.server.ts',
      'lib/account/api/account.standing.server.ts',
      'lib/moderation/standing.server.ts',
    ]) {
      expect(
        found,
      ).not.toContain(
        f,
      );
    }
  });
});
