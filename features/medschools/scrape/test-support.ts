/** In-memory MedPrisma fake and helpers for the med schools pipeline tests. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceHaltedError, type PoliteClient, type PoliteHost } from './http';
import type { MedPrisma } from './types';

type Row = Record<string, unknown>;

const UNIQUE_KEYS: Record<string, string[]> = {
  medCycleCount: ['schoolId', 'program', 'cycleYear', 'date', 'eventType', 'source'],
  medSchoolAlias: ['source', 'sourceKey'],
  medSchoolAliasMiss: ['source', 'sourceKey'],
  medCycleEvent: ['dedupeHash'],
  medAdmitMember: ['memberHash'],
  medAdmitForumThread: ['schoolId', 'cycleYear'],
  medRequestBudget: ['key', 'day'],
  medSdnThread: ['threadId'],
  medInterviewQuestion: ['dedupeHash'],
  medInterviewProfile: ['schoolId', 'source'],
  medTrackerCycle: ['userId', 'cycleYear'],
  medTrackerApplication: ['cycleId', 'schoolId', 'program'],
  medTrackerMilestone: ['applicationId', 'type'],
  medSchoolListItem: ['listId', 'schoolId', 'program'],
  medUserPrefs: ['userId'],
  medApplicantProfile: ['userId'],
  medApplicantHours: ['profileId', 'category'],
  medForecast: ['schoolId', 'program', 'cycleYear', 'eventType'],
  medWaitCurve: ['schoolId', 'program'],
  medSecondaryPrompt: ['schoolId', 'program', 'key'],
  medSecondaryObservation: ['promptId', 'cycleYear', 'source'],
  medSecondaryCheck: ['schoolId', 'source'],
  medSchoolAdmissionsPolicy: ['schoolId', 'program'],
  medSecondaryTurnaround: ['schoolId', 'program'],
  medSchoolFact: ['schoolId', 'program', 'cycleYear', 'kind', 'source'],
};

/** `onDelete: Cascade` edges: deleting a row of the key removes the child rows whose `fk` equals its id. */
const CASCADES: Record<string, { child: string; fk: string; pk?: string }[]> = {
  user: [
    { child: 'medTrackerCycle', fk: 'userId' },
    { child: 'medSchoolList', fk: 'userId' },
    { child: 'medUserPrefs', fk: 'userId' },
    { child: 'medQaLimitRequest', fk: 'userId' },
    { child: 'medApplicantProfile', fk: 'userId' },
  ],
  medSchool: [
    { child: 'medSchoolAlias', fk: 'schoolId' },
    { child: 'medCycleCount', fk: 'schoolId' },
    { child: 'medCycleEvent', fk: 'schoolId' },
    { child: 'medSchoolStats', fk: 'schoolId' },
    { child: 'medInterviewQuestion', fk: 'schoolId' },
    { child: 'medInterviewProfile', fk: 'schoolId' },
    { child: 'medSdnThread', fk: 'schoolId' },
    { child: 'medAdmitForumThread', fk: 'schoolId' },
    { child: 'medTrackerApplication', fk: 'schoolId' },
    { child: 'medSchoolListItem', fk: 'schoolId' },
    { child: 'medForecast', fk: 'schoolId' },
    { child: 'medWaitCurve', fk: 'schoolId' },
    { child: 'medSecondaryPrompt', fk: 'schoolId' },
    { child: 'medSecondaryCheck', fk: 'schoolId' },
    { child: 'medSchoolAdmissionsPolicy', fk: 'schoolId' },
    { child: 'medSecondaryTurnaround', fk: 'schoolId' },
    { child: 'medSchoolFact', fk: 'schoolId' },
  ],
  medSecondaryPrompt: [{ child: 'medSecondaryObservation', fk: 'promptId' }],
  medTrackerCycle: [{ child: 'medTrackerApplication', fk: 'cycleId' }],
  medTrackerApplication: [{ child: 'medTrackerMilestone', fk: 'applicationId' }],
  medSchoolList: [{ child: 'medSchoolListItem', fk: 'listId' }],
  medApplicantProfile: [
    // The profile's key is `userId`, not `id`.
    { child: 'medMcatAttempt', fk: 'profileId', pk: 'userId' },
    { child: 'medApplicantHours', fk: 'profileId', pk: 'userId' },
    { child: 'medApplicantActivity', fk: 'profileId', pk: 'userId' },
  ],
};

const eq = (a: unknown, b: unknown): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

/** Flatten compound-unique selectors like `{ source_sourceKey: { source, sourceKey } }` into scalar equality. */
function flatten(where: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(where)) {
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && k.includes('_')) {
      Object.assign(out, v);
    } else out[k] = v;
  }
  return out;
}

/** Apply a Prisma-style update payload, including `{ increment: n }`. */
function applyUpdate(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    row[k] =
      v !== null && typeof v === 'object' && 'increment' in v
        ? Number(row[k] ?? 0) +
          Number(
            (
              v as {
                increment: number;
              }
            ).increment,
          )
        : v;
  }
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(flatten(where)).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    if (k === 'NOT') return !(Array.isArray(v) ? (v as Row[]) : [v as Row]).some((w) => matches(row, w));
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'in' in v) {
      return (
        v as {
          in: unknown[];
        }
      ).in.some((x) => eq(row[k], x));
    }
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      const op = v as {
        gte?: Date | number;
        lt?: Date | number;
        not?: unknown;
        startsWith?: string;
      };
      const cell = row[k];
      const n = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
      if ('gte' in op && !(cell !== null && cell !== undefined && n(cell) >= n(op.gte))) return false;
      if ('lt' in op && !(cell !== null && cell !== undefined && n(cell) < n(op.lt))) return false;
      if ('startsWith' in op && !(typeof cell === 'string' && cell.startsWith(op.startsWith ?? ''))) return false;
      if ('not' in op) {
        // `{ not: null }` means "has a value"; absent columns read as null.
        const val = cell === undefined ? null : cell;
        if (eq(val, op.not)) return false;
      }
      return true;
    }
    return eq(row[k], v);
  });
}

export interface FakePrismaOptions {
  /** Awaited at the start of every delegate call, so concurrent transactions interleave (seeded by the test). */
  jitter?: () => Promise<void>;
}

export function createFakePrisma(options: FakePrismaOptions = {}): {
  prisma: MedPrisma;
  writes: unknown[];
  tables: Record<string, unknown[]>;
  /** One entry per transaction, in start order: the advisory-lock keys it acquired, in acquisition order. */
  lockLog: string[][];
} {
  const writes: unknown[] = [];
  const lockLog: string[][] = [];
  const tables: Record<string, Row[]> = {};
  let seq = 0;

  const table = (name: string): Row[] => (tables[name] ??= []);

  function insert(name: string, data: Row): Row {
    const t = table(name);
    const keys = UNIQUE_KEYS[name];
    if (keys && t.some((r) => keys.every((k) => eq(r[k], data[k])))) {
      throw new Error(`Unique constraint failed on ${name} (${keys.join(', ')})`);
    }
    const row: Row = {
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
    t.push(row);
    return row;
  }

  /** Remove the rows matching `pred` from `name` and, like the database, everything that cascades from them. */
  function removeWhere(name: string, pred: (r: Row) => boolean): Row[] {
    const gone = table(name).filter(pred);
    tables[name] = table(name).filter((r) => !pred(r));
    for (const { child, fk, pk } of CASCADES[name] ?? []) {
      const ids = new Set(gone.map((r) => r[pk ?? 'id']));
      removeWhere(child, (r) => ids.has(r[fk]));
    }
    return gone;
  }

  function delegate(name: string): Record<string, (args?: never) => Promise<unknown>> {
    const t = () => table(name);
    const api = {
      async count(args?: { where?: Row }) {
        return t().filter((r) => matches(r, args?.where)).length;
      },
      async findMany(args?: { where?: Row }) {
        return t()
          .filter((r) => matches(r, args?.where))
          .map((r) => ({
            ...r,
          }));
      },
      async findUnique(args: { where: Row }) {
        const hit = t().find((r) => matches(r, args.where));
        return hit
          ? {
              ...hit,
            }
          : null;
      },
      async findFirst(args?: { where?: Row; orderBy?: unknown }) {
        const all = t().filter((r) => matches(r, args?.where));
        // One orderBy key: sort ascending (stable) and take the last for 'desc', the first otherwise.
        const order = Object.entries((args as { orderBy?: Row })?.orderBy ?? {})[0];
        if (order) {
          const [col] = order;
          const n = (x: unknown) => (x instanceof Date ? x.getTime() : typeof x === 'number' ? x : 0);
          all.sort((a, b) => n(a[col]) - n(b[col]));
        }
        const desc = order?.[1] === 'desc';
        const hit = desc ? all[all.length - 1] : all[0];
        return hit
          ? {
              ...hit,
            }
          : null;
      },
      async create(args: { data: Row }) {
        writes.push(args);
        return {
          ...insert(name, args.data),
        };
      },
      async createMany(args: { data: Row[]; skipDuplicates?: boolean }) {
        writes.push(args);
        const keys = UNIQUE_KEYS[name];
        const batch: Row[] = [];
        const clash = (d: Row, rows: Row[]) =>
          keys !== undefined && rows.some((r) => keys.every((k) => eq(r[k], d[k])));
        for (const d of args.data) {
          if (clash(d, t()) || clash(d, batch)) {
            if (!args.skipDuplicates) throw new Error(`Unique constraint failed on ${name} (${keys?.join(', ')})`);
            continue;
          }
          batch.push(d);
        }
        for (const d of batch) insert(name, d);
        const count = batch.length;
        return {
          count,
        };
      },
      async update(args: { where: Row; data: Row }) {
        writes.push(args);
        const hit = t().find((r) => matches(r, args.where));
        if (!hit) throw new Error(`Record not found in ${name}`);
        applyUpdate(hit, args.data);
        return {
          ...hit,
        };
      },
      async updateMany(args: { where?: Row; data: Row }) {
        writes.push(args);
        const hits = t().filter((r) => matches(r, args.where));
        for (const r of hits) applyUpdate(r, args.data);
        return { count: hits.length };
      },
      async upsert(args: { where: Row; create: Row; update: Row }) {
        writes.push(args);
        const hit = t().find((r) => matches(r, args.where));
        if (hit) {
          applyUpdate(hit, args.update);
          return {
            ...hit,
          };
        }
        return {
          ...insert(name, args.create),
        };
      },
      async aggregate(args: { where?: Row; _sum: Record<string, true> }) {
        const hits = t().filter((r) => matches(r, args.where));
        const sum: Record<string, number | null> = {};
        for (const col of Object.keys(args._sum)) {
          const vals = hits.map((r) => r[col]).filter((v): v is number => typeof v === 'number');
          sum[col] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
        }
        return { _sum: sum };
      },
      async delete(args: { where: Row }) {
        writes.push(args);
        const hit = t().find((r) => matches(r, args.where));
        if (!hit) throw new Error(`Record not found in ${name}`);
        removeWhere(name, (r) => r === hit);
        return hit;
      },
      async deleteMany(args: { where: Row }) {
        writes.push(args);
        const count = removeWhere(name, (r) => matches(r, args.where)).length;
        return {
          count,
        };
      },
      /** `groupBy({ by, where, _count: { _all: true } })` only: the grouping the RMH roll-up needs. */
      async groupBy(args: { by: string[]; where?: Row; _count?: unknown }) {
        const groups = new Map<string, { key: Row; n: number }>();
        for (const r of t().filter((x) => matches(x, args.where))) {
          const key = Object.fromEntries(args.by.map((c) => [c, r[c]]));
          const id = JSON.stringify(args.by.map((c) => (r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c])));
          const g = groups.get(id) ?? { key, n: 0 };
          g.n += 1;
          groups.set(id, g);
        }
        return [...groups.values()].map((g) => ({ ...g.key, _count: { _all: g.n } }));
      },
    };
    if (options.jitter) {
      const jitter = options.jitter;
      for (const k of Object.keys(api) as (keyof typeof api)[]) {
        const fn = api[k] as (a?: never) => Promise<unknown>;
        (api as Record<string, unknown>)[k] = async (a?: never) => {
          await jitter();
          return fn(a);
        };
      }
    }
    return api as unknown as Record<string, (args?: never) => Promise<unknown>>;
  }

  const names = [
    'medSchool',
    'medSchoolAlias',
    'medSchoolAliasMiss',
    'medCycle',
    'medCycleCount',
    'medCycleEvent',
    'medForecast',
    'medWaitCurve',
    'medAdmitMember',
    'medAdmitForumThread',
    'medRequestBudget',
    'medInterviewQuestion',
    'medInterviewProfile',
    'medSchoolStats',
    'medSourceRun',
    'medSdnThread',
    'medTrackerCycle',
    'medTrackerApplication',
    'medTrackerMilestone',
    'medSchoolList',
    'medSchoolListItem',
    'medUserPrefs',
    'medQaLimitRequest',
    'medApplicantProfile',
    'medMcatAttempt',
    'medApplicantHours',
    'medApplicantActivity',
    'medSecondaryPrompt',
    'medSecondaryObservation',
    'medSecondaryCheck',
    'medSchoolAdmissionsPolicy',
    'medSecondaryTurnaround',
    'medSchoolFact',
    'user',
    'aiUsage',
  ];
  const prisma = Object.fromEntries(names.map((n) => [n, delegate(n)])) as unknown as MedPrisma;
  // A transaction runs against the same fake (READ COMMITTED: no snapshot isolation). `$executeRaw` is the advisory
  // lock the real code takes (`pg_advisory_xact_lock(hashtextextended(key, 0))`): a recorded mutex, one owner per key,
  // reentrant within a transaction, released when it ends. Outside a transaction it throws, as a lock would be useless.
  // A throw restores every table and the write log, but only when no other transaction was running (a snapshot restore
  // would otherwise clobber its writes), so tests that throw run their transactions one at a time.
  const owner = new Map<string, symbol>();
  const waiters = new Map<string, (() => void)[]>();
  let active = 0;
  const acquire = async (key: string, me: symbol, log: string[]): Promise<void> => {
    if (owner.get(key) === me) return;
    while (owner.has(key)) await new Promise<void>((res) => waiters.set(key, [...(waiters.get(key) ?? []), res]));
    owner.set(key, me);
    log.push(key);
  };
  const release = (me: symbol): void => {
    for (const [key, who] of [...owner]) {
      if (who !== me) continue;
      owner.delete(key);
      const next = waiters.get(key)?.shift();
      next?.();
    }
  };
  (prisma as unknown as Record<string, unknown>).$executeRaw = async () => {
    throw new Error('advisory lock taken outside a transaction');
  };
  (prisma as unknown as Record<string, unknown>).$transaction = async (fn: (tx: MedPrisma) => Promise<unknown>) => {
    const me = Symbol('tx');
    const log: string[] = [];
    lockLog.push(log);
    const tx = Object.create(prisma) as Record<string, unknown>;
    tx.$executeRaw = async (_strings: TemplateStringsArray, key: unknown) => {
      if (options.jitter) await options.jitter();
      await acquire(String(key), me, log);
      return 1;
    };
    const snapshot = Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
    const writeCount = writes.length;
    active += 1;
    try {
      return await fn(tx as unknown as MedPrisma);
    } catch (err) {
      if (active === 1) {
        for (const k of Object.keys(tables)) delete tables[k];
        Object.assign(tables, snapshot);
        writes.length = writeCount;
      }
      throw err;
    } finally {
      active -= 1;
      release(me);
    }
  };
  const view = new Proxy(tables, {
    get: (target, p: string) => target[p] ?? (target[p] = []),
  });
  return {
    prisma,
    writes,
    tables: view as unknown as Record<string, unknown[]>,
    lockLog,
  };
}

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'adapters', 'cycletrack', '__fixtures__');

export function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
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
 * mention, an @handle, an email in a post body, an avatar URL, a signature line and a link-unfurl card carrying a member name).
 */
export const SDN_HOSTILE_NEEDLES = [
  'hostile_author_zq',
  'MentionedUserZQ',
  '@handle_zq77',
  'zq.person@example.com',
  'https://forums.example/data/avatars/zq.jpg',
  'sigzq-contact-line',
  'unfurled_member_zq',
] as const;

/** Every person-shaped string any anonymization test hunts for; pass to `assertNoLeak`. */
export const NEEDLES: string[] = [
  ...new Set<string>([...CYCLETRACK_NEEDLES, ...ADMIT_HOSTILE_NEEDLES, ...SDN_HOSTILE_NEEDLES]),
];

/** Throws naming the needle if anything written contains it (e.g. a raw source id that must be hashed). */
export function assertNoLeak(writes: unknown[], needles: string[]): void {
  const dump = JSON.stringify(writes);
  for (const needle of needles) {
    if (dump.includes(needle)) throw new Error(`Leak: written data contains "${needle}"`);
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

const STATUS_PREFIX = '\u0000status:';
/** A fake-host route value that answers with this HTTP status and an empty body (a WAF's 403, say). */
export const httpStatusRoute = (status: number): string => `${STATUS_PREFIX}${status}`;
const answerFor = (body: string | null): { ok: boolean; status: number; body: string } => {
  if (body === null) return { ok: false, status: 404, body: '' };
  if (body.startsWith(STATUS_PREFIX)) return { ok: false, status: Number(body.slice(STATUS_PREFIX.length)), body: '' };
  return { ok: true, status: 200, body };
};

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
  sessions: Array<{ spacingMs?: number; jitterMs?: number } | undefined>;
} {
  const requested: string[] = [];
  const requestedPosts: Array<{ op: string; variables: unknown }> = [];
  const sessions: Array<{ spacingMs?: number; jitterMs?: number } | undefined> = [];
  const lookup = typeof routes === 'function' ? routes : (p: string) => routes[p] ?? null;
  const host: PoliteHost = {
    session(opts?: { spacingMs?: number; jitterMs?: number }): PoliteClient {
      sessions.push(opts);
      let failures = 0;
      let last: string | null = null;
      const total = () => requested.length + requestedPosts.length;
      return {
        async get(path) {
          if (failures >= maxFailures) throw new SourceHaltedError(last ?? undefined);
          requested.push(path);
          return answerFor(lookup(path));
        },
        async post(path, body) {
          if (failures >= maxFailures) throw new SourceHaltedError(last ?? undefined);
          const parsed = JSON.parse(body) as { operationName: string; variables?: unknown };
          requestedPosts.push({ op: parsed.operationName, variables: parsed.variables ?? {} });
          return answerFor(lookup(gqlKey(path, parsed.operationName, parsed.variables)));
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
