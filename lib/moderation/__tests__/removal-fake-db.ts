/**
 * An in-memory `contentRemoval` for the removal tests (sprint 15, feature 16). It answers the filters the code writes
 * (equality, `null`, `{ not: null }`, `{ gte }`, `OR`) with the same compare-and-set meaning Postgres gives them, so a
 * lost race is a real `count: 0`. Wrap the client that holds it in `shapeChecked` so a query the schema rejects fails.
 */
import { vi } from 'vitest';

export interface RemovalRow {
  id: string;
  reportId: string;
  entityType: string;
  entityId: string;
  authorId: string;
  removedAt: Date;
  reversible: boolean;
  reviewRequestedAt: Date | null;
  reviewNote: string | null;
  reviewDecidedAt: Date | null;
  reviewOutcome: string | null;
  reviewedById: string | null;
}

type Where = Record<string, unknown>;

function fieldMatches(actual: unknown, cond: unknown): boolean {
  if (cond === null) return actual === null;
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime();
  if (typeof cond === 'object' && cond !== null) {
    const c = cond as { not?: unknown; gte?: Date; in?: unknown[] };
    if ('not' in c) return c.not === null ? actual !== null : actual !== c.not;
    if (c.gte) return actual instanceof Date && actual.getTime() >= c.gte.getTime();
    if (c.in) return c.in.includes(actual);
    throw new Error(`the fake does not know this filter: ${JSON.stringify(cond)}`);
  }
  return actual === cond;
}

function matches(row: RemovalRow, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    return fieldMatches((row as unknown as Record<string, unknown>)[key], cond);
  });
}

export function makeRemovalDb() {
  const rows: RemovalRow[] = [];
  let seq = 0;
  const author = {
    id: 'author',
    name: 'Ann',
    image: null,
    username: 'ann',
    handle: 'ann',
    profile: null,
    inventory: [],
  };
  const contentRemoval = {
    findFirst: vi.fn(async ({ where }: { where: Where }) => rows.find((r) => matches(r, where)) ?? null),
    findUnique: vi.fn(async ({ where }: { where: Where }) => rows.find((r) => matches(r, where)) ?? null),
    findMany: vi.fn(async ({ where, take }: { where: Where; take?: number }) =>
      rows
        .filter((r) => matches(r, where))
        .slice(0, take)
        .map((r) => ({ ...r, author: { ...author, id: r.authorId } })),
    ),
    count: vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length),
    create: vi.fn(async ({ data }: { data: Partial<RemovalRow> & { reportId: string } }) => {
      if (rows.some((r) => r.reportId === data.reportId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      const row: RemovalRow = {
        id: `rem-${++seq}`,
        entityType: '',
        entityId: '',
        authorId: '',
        removedAt: new Date(),
        reversible: false,
        reviewRequestedAt: null,
        reviewNote: null,
        reviewDecidedAt: null,
        reviewOutcome: null,
        reviewedById: null,
        ...data,
      };
      rows.push(row);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<RemovalRow> }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      const keep = rows.filter((r) => !matches(r, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    }),
  };
  return { rows, contentRemoval };
}
