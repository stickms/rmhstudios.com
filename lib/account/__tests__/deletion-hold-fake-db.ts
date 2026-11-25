/**
 * A small in-memory stand-in for Prisma, shared by the deletion-pause and deletion-restore tests (s09-14).
 * It understands the `where` shapes those features use: equality, `null`, `{ in }`, `{ not }`, `{ gte, lte }`,
 * `OR`, and array `NOT`-free filters. Rows are plain objects; every call is recorded in `calls`.
 */
import { vi } from 'vitest';

export type Row = Record<string, unknown>;

function cmp(value: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    const c = cond as Record<string, unknown>;
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('isEmpty' in c) return (Array.isArray(value) ? value.length === 0 : true) === c.isEmpty;
    let ok = true;
    if ('not' in c) ok &&= c.not === null ? value !== null && value !== undefined : value !== c.not;
    if ('gte' in c) ok &&= value instanceof Date && value.getTime() >= (c.gte as Date).getTime();
    if ('lte' in c) ok &&= value instanceof Date && value.getTime() <= (c.lte as Date).getTime();
    return ok;
  }
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  return value === cond;
}

export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    return cmp(row[k], cond);
  });
}

export function makeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  const calls: { model: string; op: string; args: Row }[] = [];
  const rows = (name: string) => (tables[name] ??= []);

  const model = (name: string) => ({
    findMany: vi.fn(async (args: Row = {}) => {
      calls.push({ model: name, op: 'findMany', args });
      return rows(name)
        .filter((r) => matches(r, args.where as Row))
        .map((r) => ({ ...r }));
    }),
    findUnique: vi.fn(async (args: Row) => {
      calls.push({ model: name, op: 'findUnique', args });
      const r = rows(name).find((x) => matches(x, args.where as Row));
      return r ? { ...r } : null;
    }),
    count: vi.fn(async (args: Row = {}) => {
      calls.push({ model: name, op: 'count', args });
      return rows(name).filter((r) => matches(r, args.where as Row)).length;
    }),
    updateMany: vi.fn(async (args: Row) => {
      calls.push({ model: name, op: 'updateMany', args });
      const hit = rows(name).filter((r) => matches(r, args.where as Row));
      for (const r of hit) Object.assign(r, args.data);
      return { count: hit.length };
    }),
    deleteMany: vi.fn(async (args: Row = {}) => {
      calls.push({ model: name, op: 'deleteMany', args });
      const keep = rows(name).filter((r) => !matches(r, args.where as Row));
      const count = rows(name).length - keep.length;
      tables[name] = keep;
      return { count };
    }),
    upsert: vi.fn(async (args: Row) => {
      calls.push({ model: name, op: 'upsert', args });
      const found = rows(name).find((r) => matches(r, args.where as Row));
      if (found) Object.assign(found, args.update);
      else rows(name).push({ ...(args.create as Row) });
      return {};
    }),
  });

  const models: Record<string, ReturnType<typeof model>> = {};
  const db = new Proxy(
    {
      $transaction: vi.fn(async (arg: unknown) => {
        if (typeof arg === 'function') return (arg as (tx: unknown) => Promise<unknown>)(db);
        return Promise.all(arg as Promise<unknown>[]);
      }),
    } as Record<string, unknown>,
    {
      get: (t, key: string) => (key in t ? t[key] : (models[key] ??= model(key))),
    },
  );
  return { db, tables, calls, rows };
}
