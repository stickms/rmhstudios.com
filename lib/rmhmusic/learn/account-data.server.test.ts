import {
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Owner decision Q4 (Phase 6): EVERY RMH Music table joins the account data export and the
 * account-deletion sweep. A deleted account is anonymised in place (other people's content
 * references the user row), so the `onDelete: Cascade` relations never fire: each music table
 * needs its own `deleteMany`, and each needs its own export entry.
 *
 * The list of tables is read from the schema, not written here, so a future music table fails
 * this test until it is covered.
 */
type Op =
  {
    model: string;
    method: string;
    args: unknown;
  };

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
                ) => {
                  const op =
                    {
                      model:
                        name,
                      method,
                      args,
                    };
                  // Reads resolve (the export awaits them); writes are descriptors for $transaction.
                  return method.startsWith(
                    'find',
                  )
                    ? Promise.resolve(
                        Object.assign(
                          [],
                          {
                            op,
                          },
                        ),
                      )
                    : op;
                },
            },
          );
      const reads: string[] =
        [];
      return new Proxy(
        {
          reads,
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
          ) => {
            if (
              key in
              t
            )
              return t[
                key
              ];
            const m =
              model(
                key,
              );
            return new Proxy(
              m,
              {
                get: (
                  target,
                  method: string,
                ) => {
                  if (
                    method.startsWith(
                      'find',
                    )
                  )
                    reads.push(
                      key,
                    );
                  return (
                    target as Record<
                      string,
                      unknown
                    >
                  )[
                    method
                  ];
                },
              },
            );
          },
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
import {
  exportMusicData,
  musicErasureOps,
} from './account-data.server';

const root =
  join(
    __dirname,
    '..',
    '..',
    '..',
  );

/** Every RMH Music model in the schema, as its Prisma client delegate name. */
function musicModels(): string[] {
  const dir =
    join(
      root,
      'prisma',
      'schema',
    );
  const names =
    new Set<string>();
  for (const file of readdirSync(
    dir,
  ).filter(
    (
      f,
    ) =>
      f.endsWith(
        '.prisma',
      ),
  )) {
    const src =
      readFileSync(
        join(
          dir,
          file,
        ),
        'utf8',
      );
    for (const m of src.matchAll(
      /^model (\w+) \{/gm,
    )) {
      const name =
        m[1]!;
      if (
        file ===
          'rmhmusic.prisma' ||
        /^Music/.test(
          name,
        )
      )
        names.add(
          name[0]!.toLowerCase() +
            name.slice(
              1,
            ),
        );
    }
  }
  return [
    ...names,
  ].sort();
}

describe('RMH Music account data — every table, both ways', () => {
  it('finds the music tables in the schema', () => {
    expect(
      musicModels(),
    ).toEqual(
      expect.arrayContaining(
        [
          'musicLearnProfile',
          'musicSprintDaily',
          'musicSongBest',
        ],
      ),
    );
  });

  it('the deletion sweep erases every music table for the account', async () => {
    const ops =
      musicErasureOps(
        'user-1',
      ) as unknown as Op[];
    const erased =
      ops
        .filter(
          (
            o,
          ) =>
            o.method ===
            'deleteMany',
        )
        .map(
          (
            o,
          ) =>
            o.model,
        );
    for (const m of musicModels()) {
      expect(
        erased,
        `${m} is not erased on account deletion`,
      ).toContain(
        m,
      );
    }
    for (const o of ops)
      expect(
        o.args,
      ).toEqual(
        {
          where:
            {
              userId:
                'user-1',
            },
        },
      );

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
    const inTx =
      tx
        .filter(
          (
            o,
          ) =>
            o.method ===
            'deleteMany',
        )
        .map(
          (
            o,
          ) =>
            o.model,
        );
    for (const m of musicModels())
      expect(
        inTx,
        `${m} is not in anonymizeAccount`,
      ).toContain(
        m,
      );
  });

  it('the data export reads every music table for the account', async () => {
    const reads =
      prismaMock.reads as string[];
    reads.length = 0;
    const data =
      await exportMusicData(
        'user-1',
      );
    for (const m of musicModels()) {
      expect(
        reads,
        `${m} is not in the data export`,
      ).toContain(
        m,
      );
    }
    expect(
      Object.keys(
        data,
      )
        .length,
    ).toBeGreaterThanOrEqual(
      musicModels()
        .length,
    );
  });

  it('the export route includes the music data', () => {
    const src =
      readFileSync(
        join(
          root,
          'lib',
          'account',
          'api',
          'account.export.server.ts',
        ),
        'utf8',
      );
    expect(
      src,
    ).toContain(
      'exportMusicData(',
    );
    expect(
      src,
    ).toMatch(
      /rmhMusic/,
    );
  });
});
