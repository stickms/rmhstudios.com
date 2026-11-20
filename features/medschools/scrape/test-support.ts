/** In-memory MedPrisma fake and helpers for the med schools pipeline tests. */
import { readFileSync } from 'node:fs';
import {
  dirname,
  join,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceHaltedError, type PoliteClient, type PoliteHost } from './http';
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
    medSchoolAliasMiss:
      [
        'source',
        'sourceKey',
      ],
    medCycleEvent:
      ['dedupeHash'],
    medSdnThread:
      ['threadId'],
    medInterviewQuestion:
      ['dedupeHash'],
    medInterviewProfile:
      [
        'schoolId',
        'source',
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

/** Apply a Prisma-style update payload, including `{ increment: n }`. */
function applyUpdate(
  row: Row,
  data: Row,
): void {
  for (const [
    k,
    v,
  ] of Object.entries(
    data,
  )) {
    row[
      k
    ] =
      v !==
        null &&
      typeof v ===
        'object' &&
      'increment' in
        v
        ? (Number(
            row[
              k
            ] ??
              0,
          ) +
          Number(
            (
              v as {
                increment: number;
              }
            )
              .increment,
          ))
        : v;
  }
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
        )
      ) {
        const op =
          v as {
            gte?: Date | number;
            lt?: Date | number;
            not?: unknown;
            startsWith?: string;
          };
        const cell =
          row[
            k
          ];
        const n =
          (
            x: unknown,
          ) =>
            x instanceof
            Date
              ? x.getTime()
              : (x as number);
        if (
          'gte' in
            op &&
          !(
            cell !==
              null &&
            cell !==
              undefined &&
            n(
              cell,
            ) >=
              n(
                op.gte,
              )
          )
        )
          return false;
        if (
          'lt' in
            op &&
          !(
            cell !==
              null &&
            cell !==
              undefined &&
            n(
              cell,
            ) <
              n(
                op.lt,
              )
          )
        )
          return false;
        if ('startsWith' in op && !(typeof cell === 'string' && cell.startsWith(op.startsWith ?? '')))
          return false;
        if (
          'not' in
          op
        ) {
          // `{ not: null }` means "has a value"; absent columns read as null.
          const val =
            cell ===
            undefined
              ? null
              : cell;
          if (
            eq(
              val,
              op.not,
            )
          )
            return false;
        }
        return true;
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
        // The schema's column defaults for a miss, so rows made by recordAliasMiss list like real ones.
        ...(name === 'medSchoolAliasMiss'
          ? {
              resolvedSchoolId: null,
              ignored: false,
              firstSeenAt: new Date(0),
              lastSeenAt: new Date(0),
            }
          : {}),
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
        async findUnique(args: {
          where: Row;
        }) {
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
          return hit
            ? {
                ...hit,
              }
            : null;
        },
        async findFirst(args?: {
          where?: Row;
          orderBy?: unknown;
        }) {
          const all =
            t().filter(
              (
                r,
              ) =>
                matches(
                  r,
                  args?.where,
                ),
            );
          const desc =
            Object.values(
              (args as {
                orderBy?: Row;
              })
                ?.orderBy ??
                {},
            ).includes(
              'desc',
            );
          const hit =
            desc
              ? all[
                  all.length -
                    1
                ]
              : all[0];
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
          const keys =
            UNIQUE_KEYS[
              name
            ];
          const batch: Row[] =
            [];
          const clash =
            (
              d: Row,
              rows: Row[],
            ) =>
              keys !==
                undefined &&
              rows.some(
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
                        d[
                          k
                        ],
                      ),
                  ),
              );
          for (const d of args.data) {
            if (
              clash(
                d,
                t(),
              ) ||
              clash(
                d,
                batch,
              )
            ) {
              if (
                !args.skipDuplicates
              )
                throw new Error(
                  `Unique constraint failed on ${name} (${keys?.join(', ')})`,
                );
              continue;
            }
            batch.push(
              d,
            );
          }
          for (const d of batch)
            insert(
              name,
              d,
            );
          const count =
            batch.length;
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
          applyUpdate(
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
            applyUpdate(
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
        async aggregate(args: {
          where?: Row;
          _sum: Record<string, true>;
        }) {
          const hits = t().filter((r) => matches(r, args.where));
          const sum: Record<string, number | null> = {};
          for (const col of Object.keys(args._sum)) {
            const vals = hits
              .map((r) => r[col])
              .filter((v): v is number => typeof v === 'number');
            sum[col] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
          }
          return { _sum: sum };
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
      'medCycleEvent',
      'medInterviewQuestion',
      'medInterviewProfile',
      'medSchoolStats',
      'medSourceRun',
      'medSdnThread',
      'aiUsage',
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
  // A transaction runs against the same fake; a throw restores every table and the write log.
  (prisma as unknown as Record<string, unknown>).$transaction = async (
    fn: (tx: MedPrisma) => Promise<unknown>,
  ) => {
    const snapshot = Object.fromEntries(
      Object.entries(tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]),
    );
    const writeCount = writes.length;
    try {
      return await fn(prisma);
    } catch (err) {
      for (const k of Object.keys(tables)) delete tables[k];
      Object.assign(tables, snapshot);
      writes.length = writeCount;
      throw err;
    }
  };
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

/** Person-shaped strings the CycleTrack anonymization-boundary test injects into its fixtures. */
export const CYCLETRACK_NEEDLES = [
  'drsmith42',
  'jane_doe_md',
  'https://cdn.example/avatars/jd.png',
  'user_id=9931',
] as const;

/** Person-shaped strings that only the synthetic hostile Admit fixtures may contain. */
export const ADMIT_HOSTILE_NEEDLES = [
  'drsmith42',
  'jane_doe_md',
  'https://cdn.example/avatars/jd.png',
  'user-hostile-9931',
] as const;

/**
 * Person-shaped strings that only the synthetic hostile SDN fixtures may contain (a data-author, a username
 * mention, an @handle, an email in a post body, an avatar URL and a signature line).
 */
export const SDN_HOSTILE_NEEDLES = [
  'hostile_author_zq',
  'MentionedUserZQ',
  '@handle_zq77',
  'zq.person@example.com',
  'https://forums.example/data/avatars/zq.jpg',
  'sigzq-contact-line',
] as const;

/** Every person-shaped string any anonymization test hunts for; pass to `assertNoLeak`. */
export const NEEDLES: string[] = [
  ...new Set<string>([...CYCLETRACK_NEEDLES, ...ADMIT_HOSTILE_NEEDLES, ...SDN_HOSTILE_NEEDLES]),
];

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

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([k, x]) => [k, sortKeys(x)]),
    );
  }
  return v;
}

/** Route key the fake host uses for a GraphQL POST: operation name plus its variables with sorted keys. */
export function gqlKey(path: string, operationName: string, variables: unknown): string {
  return `POST ${path} ${operationName} ${JSON.stringify(sortKeys(variables ?? {}))}`;
}

/**
 * Fake PoliteHost serving canned bodies by path (GET) or by `gqlKey` (POST). A key mapped to `null` is a
 * 404. Mirrors the real gate: the session halts after three noted failures
 * and `get`/`post` then throw `SourceHaltedError`.
 */
export function createFakeHost(
  routes: Record<string, string | null> | ((path: string) => string | null),
  maxFailures = 3,
): {
  host: PoliteHost;
  requested: string[];
  requestedPosts: Array<{ op: string; variables: unknown }>;
  sessions: Array<{ spacingMs?: number } | undefined>;
} {
  const requested: string[] = [];
  const requestedPosts: Array<{ op: string; variables: unknown }> = [];
  const sessions: Array<{ spacingMs?: number } | undefined> = [];
  const lookup = typeof routes === 'function' ? routes : (p: string) => routes[p] ?? null;
  const host: PoliteHost = {
    session(opts?: { spacingMs?: number }): PoliteClient {
      sessions.push(opts);
      let failures = 0;
      let last: string | null = null;
      const total = () => requested.length + requestedPosts.length;
      return {
        async get(path) {
          if (failures >= maxFailures) throw new SourceHaltedError(last ?? undefined);
          requested.push(path);
          const body = lookup(path);
          return body === null ? { ok: false, status: 404, body: '' } : { ok: true, status: 200, body };
        },
        async post(path, body) {
          if (failures >= maxFailures) throw new SourceHaltedError(last ?? undefined);
          const parsed = JSON.parse(body) as { operationName: string; variables?: unknown };
          requestedPosts.push({ op: parsed.operationName, variables: parsed.variables ?? {} });
          const out = lookup(gqlKey(path, parsed.operationName, parsed.variables));
          return out === null ? { ok: false, status: 404, body: '' } : { ok: true, status: 200, body: out };
        },
        noteSuccess() {
          failures = 0;
        },
        noteFailure(reason) {
          failures++;
          last = reason;
        },
        get halted() {
          return failures >= maxFailures;
        },
        get requests() {
          return total();
        },
        get lastFailure() {
          return last;
        },
      };
    },
  };
  return { host, requested, requestedPosts, sessions };
}
