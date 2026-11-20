/** In-memory MedPrisma fake and helpers for the med schools pipeline tests. */
import { readFileSync } from 'node:fs';
import {
  dirname,
  join,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MedPrisma } from './types';

type Row =
  Record<
    string,
    unknown
  >;

const UNIQUE_KEYS: Record<
  string,
  string[]
> =
  {
    medCycleCount:
      [
        'schoolId',
        'program',
        'cycleYear',
        'date',
        'eventType',
        'source',
      ],
    medSchoolAlias:
      [
        'source',
        'sourceKey',
      ],
  };

const eq =
  (
    a: unknown,
    b: unknown,
  ): boolean =>
    a instanceof
      Date &&
    b instanceof
      Date
      ? a.getTime() ===
        b.getTime()
      : a ===
        b;

/** Flatten compound-unique selectors like `{ source_sourceKey: { source, sourceKey } }` into scalar equality. */
function flatten(
  where: Row,
): Row {
  const out: Row =
    {};
  for (const [
    k,
    v,
  ] of Object.entries(
    where,
  )) {
    if (
      v !==
        null &&
      typeof v ===
        'object' &&
      !(
        v instanceof
        Date
      ) &&
      !Array.isArray(
        v,
      ) &&
      k.includes(
        '_',
      )
    ) {
      Object.assign(
        out,
        v,
      );
    } else
      out[
        k
      ] =
        v;
  }
  return out;
}

function matches(
  row: Row,
  where:
    | Row
    | undefined,
): boolean {
  if (
    !where
  )
    return true;
  return Object.entries(
    flatten(
      where,
    ),
  ).every(
    ([
      k,
      v,
    ]) => {
      if (
        v !==
          null &&
        typeof v ===
          'object' &&
        !(
          v instanceof
          Date
        ) &&
        'in' in
          v
      ) {
        return (
          v as {
            in: unknown[];
          }
        ).in.some(
          (
            x,
          ) =>
            eq(
              row[
                k
              ],
              x,
            ),
        );
      }
      return eq(
        row[
          k
        ],
        v,
      );
    },
  );
}

export function createFakePrisma(): {
  prisma: MedPrisma;
  writes: unknown[];
  tables: Record<
    string,
    unknown[]
  >;
} {
  const writes: unknown[] =
    [];
  const tables: Record<
    string,
    Row[]
  > =
    {};
  let seq = 0;

  const table =
    (
      name: string,
    ): Row[] =>
      (tables[
        name
      ] ??=
        []);

  function insert(
    name: string,
    data: Row,
  ): Row {
    const t =
      table(
        name,
      );
    const keys =
      UNIQUE_KEYS[
        name
      ];
    if (
      keys &&
      t.some(
        (
          r,
        ) =>
          keys.every(
            (
              k,
            ) =>
              eq(
                r[
                  k
                ],
                data[
                  k
                ],
              ),
          ),
      )
    ) {
      throw new Error(
        `Unique constraint failed on ${name} (${keys.join(', ')})`,
      );
    }
    const row: Row =
      {
        id: `fake_${++seq}`,
        ...data,
      };
    t.push(
      row,
    );
    return row;
  }

  function delegate(
    name: string,
  ): Record<
    string,
    (
      args?: never,
    ) => Promise<unknown>
  > {
    const t =
      () =>
        table(
          name,
        );
    const api =
      {
        async count(args?: {
          where?: Row;
        }) {
          return t().filter(
            (
              r,
            ) =>
              matches(
                r,
                args?.where,
              ),
          )
            .length;
        },
        async findMany(args?: {
          where?: Row;
        }) {
          return t()
            .filter(
              (
                r,
              ) =>
                matches(
                  r,
                  args?.where,
                ),
            )
            .map(
              (
                r,
              ) => ({
                ...r,
              }),
            );
        },
        async findFirst(args?: {
          where?: Row;
        }) {
          const hit =
            t().find(
              (
                r,
              ) =>
                matches(
                  r,
                  args?.where,
                ),
            );
          return hit
            ? {
                ...hit,
              }
            : null;
        },
        async create(args: {
          data: Row;
        }) {
          writes.push(
            args,
          );
          return {
            ...insert(
              name,
              args.data,
            ),
          };
        },
        async createMany(args: {
          data: Row[];
          skipDuplicates?: boolean;
        }) {
          writes.push(
            args,
          );
          let count = 0;
          for (const d of args.data) {
            try {
              insert(
                name,
                d,
              );
              count++;
            } catch (e) {
              if (
                !args.skipDuplicates
              )
                throw e;
            }
          }
          return {
            count,
          };
        },
        async update(args: {
          where: Row;
          data: Row;
        }) {
          writes.push(
            args,
          );
          const hit =
            t().find(
              (
                r,
              ) =>
                matches(
                  r,
                  args.where,
                ),
            );
          if (
            !hit
          )
            throw new Error(
              `Record not found in ${name}`,
            );
          Object.assign(
            hit,
            args.data,
          );
          return {
            ...hit,
          };
        },
        async upsert(args: {
          where: Row;
          create: Row;
          update: Row;
        }) {
          writes.push(
            args,
          );
          const hit =
            t().find(
              (
                r,
              ) =>
                matches(
                  r,
                  args.where,
                ),
            );
          if (
            hit
          ) {
            Object.assign(
              hit,
              args.update,
            );
            return {
              ...hit,
            };
          }
          return {
            ...insert(
              name,
              args.create,
            ),
          };
        },
        async delete(args: {
          where: Row;
        }) {
          writes.push(
            args,
          );
          const i =
            t().findIndex(
              (
                r,
              ) =>
                matches(
                  r,
                  args.where,
                ),
            );
          if (
            i <
            0
          )
            throw new Error(
              `Record not found in ${name}`,
            );
          return t().splice(
            i,
            1,
          )[0];
        },
        async deleteMany(args: {
          where: Row;
        }) {
          writes.push(
            args,
          );
          const keep =
            t().filter(
              (
                r,
              ) =>
                !matches(
                  r,
                  args.where,
                ),
            );
          const count =
            t()
              .length -
            keep.length;
          tables[
            name
          ] =
            keep;
          return {
            count,
          };
        },
      };
    return api as unknown as Record<
      string,
      (
        args?: never,
      ) => Promise<unknown>
    >;
  }

  const names =
    [
      'medSchool',
      'medSchoolAlias',
      'medSchoolAliasMiss',
      'medCycle',
      'medCycleCount',
      'medSchoolStats',
      'medSourceRun',
    ];
  const prisma =
    Object.fromEntries(
      names.map(
        (
          n,
        ) => [
          n,
          delegate(
            n,
          ),
        ],
      ),
    ) as unknown as MedPrisma;
  const view =
    new Proxy(
      tables,
      {
        get: (
          target,
          p: string,
        ) =>
          target[
            p
          ] ??
          (target[
            p
          ] =
            []),
      },
    );
  return {
    prisma,
    writes,
    tables:
      view as unknown as Record<
        string,
        unknown[]
      >,
  };
}

const FIXTURE_DIR =
  join(
    dirname(
      fileURLToPath(
        import.meta
          .url,
      ),
    ),
    'adapters',
    'cycletrack',
    '__fixtures__',
  );

export function loadFixture(
  name: string,
): string {
  return readFileSync(
    join(
      FIXTURE_DIR,
      name,
    ),
    'utf8',
  );
}

/** Throws naming the needle if anything written contains it (e.g. a raw source id that must be hashed). */
export function assertNoLeak(
  writes: unknown[],
  needles: string[],
): void {
  const dump =
    JSON.stringify(
      writes,
    );
  for (const needle of needles) {
    if (
      dump.includes(
        needle,
      )
    )
      throw new Error(
        `Leak: written data contains "${needle}"`,
      );
  }
}
