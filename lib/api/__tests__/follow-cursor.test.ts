import { describe, expect, it } from 'vitest';
import { encodeFollowCursor, followCursorWhere, parseFollowCursor } from '../follow-cursor';

type Row = { id: string; createdAt: Date };

/** Evaluates the exact where fragment the routes hand to Prisma, over in-memory rows. */
function matches(row: Row, where: ReturnType<typeof followCursorWhere>): boolean {
  const w = where as {
    createdAt?: { lt: Date };
    OR?: Array<{ createdAt: Date | { lt: Date }; id?: { lt: string } }>;
  };
  const t = (r: Row, c: Date | { lt: Date }, id?: { lt: string }) => {
    if (c instanceof Date) return r.createdAt.getTime() === c.getTime() && (!id || r.id < id.lt);
    return r.createdAt.getTime() < c.lt.getTime();
  };
  if (w.OR) return w.OR.some((c) => t(row, c.createdAt, c.id));
  if (w.createdAt) return t(row, w.createdAt);
  return true;
}

function pageThrough(rows: Row[], limit: number, firstCursor: string | null = null): string[] {
  const sorted = [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
  const seen: string[] = [];
  let cursor = firstCursor;
  for (let guard = 0; guard < 100; guard++) {
    const where = followCursorWhere(parseFollowCursor(cursor));
    const page = sorted.filter((r) => matches(r, where)).slice(0, limit);
    seen.push(...page.map((r) => r.id));
    if (page.length < limit) break;
    cursor = encodeFollowCursor(page[page.length - 1]);
  }
  return seen;
}

describe('follow keyset cursor', () => {
  // 25 rows over 4 distinct timestamps: every page boundary lands inside a tie.
  const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
    id: `c${String(i).padStart(3, '0')}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(i / 7))),
  }));

  it.each([1, 2, 3, 5, 7, 8, 20])('ties neither drop nor duplicate rows (limit %i)', (limit) => {
    const seen = pageThrough(rows, limit);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it('the old createdAt-only cursor drops tied rows (regression being fixed)', () => {
    const last = rows.filter((r) => r.createdAt.getTime() === rows[20].createdAt.getTime());
    expect(last.length).toBeGreaterThan(1);
    const legacy = followCursorWhere(parseFollowCursor(last[0].createdAt.toISOString()));
    expect(rows.filter((r) => matches(r, legacy)).every((r) => r.createdAt < last[0].createdAt)).toBe(true);
  });

  it('still accepts a bare ISO cursor from an older client', () => {
    const iso = new Date(Date.UTC(2026, 0, 1, 0, 0, 2)).toISOString();
    expect(parseFollowCursor(iso)).toEqual({ createdAt: new Date(iso), id: null });
    const seen = pageThrough(rows, 5, iso);
    expect(seen.every((id) => rows.find((r) => r.id === id)!.createdAt < new Date(iso))).toBe(true);
  });

  it('round-trips and rejects garbage', () => {
    const row = { id: 'cm0abc', createdAt: new Date('2026-03-04T05:06:07.089Z') };
    expect(parseFollowCursor(encodeFollowCursor(row))).toEqual(row);
    expect(parseFollowCursor('not-a-date')).toBeNull();
    expect(parseFollowCursor('')).toBeNull();
    expect(followCursorWhere(null)).toEqual({});
  });
});
