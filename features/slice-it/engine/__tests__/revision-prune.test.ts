/**
 * The nightly prune of Slice It chart revisions. Mission-critical because it deletes a member's work: named and
 * published versions are never touched, the newest 30 autosaves and one autosave a day for 30 days stay, and the raw
 * SQL names the real table (`"ChartRevision"`, no `@@map`) and real quoted columns.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; values: unknown[] }>,
  executes: [] as Array<{ sql: string; values: unknown[] }>,
  charts: [] as string[][],
  autosaves: [] as Array<{ id: bigint; createdAt: Date }>,
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      h.queries.push({ sql, values });
      if (sql.includes('GROUP BY "chartId"')) return h.charts.shift() ? [{ chartId: 'chart-1' }] : [];
      return h.autosaves;
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.executes.push({ sql: strings.join('?'), values });
      return (values[0] as unknown[]).length;
    },
  },
}));

import {
  KEEP_DAILY_DAYS,
  KEEP_NEWEST_AUTOSAVES,
  REVISION_DELETE_BATCH,
  REVISION_PRUNE_CRON,
  REVISION_PRUNE_QUEUE,
  autosaveIdsToDelete,
  pruneChartRevisions,
  pruneRevisions,
} from '../revision-prune.server';

const NOW = new Date('2026-11-25T12:00:00Z');
const HOUR = 3_600_000;
const row = (id: number, hoursAgo: number) => ({
  id: BigInt(id),
  createdAt: new Date(NOW.getTime() - hoursAgo * HOUR),
});

beforeEach(() => {
  h.queries.length = 0;
  h.executes.length = 0;
  h.charts.length = 0;
  h.autosaves.length = 0;
});

describe('autosaveIdsToDelete', () => {
  it('keeps the newest 30 autosaves, however old they are', () => {
    // 30 autosaves a year ago: all kept, nothing is newer.
    const rows = Array.from({ length: KEEP_NEWEST_AUTOSAVES }, (_, i) => row(i + 1, 24 * 365 + i));
    expect(autosaveIdsToDelete(rows, NOW)).toEqual([]);
  });

  it('keeps one autosave a day, the newest of that day, for 30 days beyond the newest 30', () => {
    // 30 autosaves in the last two hours stand for today, then 4 per day for the 5 days before.
    const recent = Array.from({ length: KEEP_NEWEST_AUTOSAVES }, (_, i) => row(1000 + i, i / 20));
    const older: ReturnType<typeof row>[] = [];
    for (let day = 1; day <= 5; day++) {
      for (let k = 0; k < 4; k++) older.push(row(day * 10 + k, day * 24 + k)); // k=0 is the newest of that day
    }
    const doomed = autosaveIdsToDelete([...recent, ...older], NOW);
    const kept = older.filter((r) => !doomed.includes(r.id));
    // Exactly one a day survives among the older rows, and it is each day's newest.
    expect(kept.map((r) => r.id).sort()).toEqual([10n, 20n, 30n, 40n, 50n]);
    expect(doomed).toHaveLength(15);
    // None of the newest 30 is ever doomed.
    for (const r of recent) expect(doomed).not.toContain(r.id);
  });

  it('a day already represented by a kept recent autosave does not keep a second one', () => {
    const recent = Array.from({ length: KEEP_NEWEST_AUTOSAVES }, (_, i) => row(i + 1, i / 10)); // all today
    const sameDay = row(500, 5); // 07:00 today, still today in UTC, older than all 30
    expect(autosaveIdsToDelete([...recent, sameDay], NOW)).toEqual([500n]);
  });

  it('deletes an autosave older than the daily window once it is outside the newest 30', () => {
    const recent = Array.from({ length: KEEP_NEWEST_AUTOSAVES }, (_, i) => row(i + 1, i / 10));
    const old = row(900, 24 * (KEEP_DAILY_DAYS + 2));
    const old2 = row(901, 24 * (KEEP_DAILY_DAYS + 2) + 1);
    expect(autosaveIdsToDelete([...recent, old, old2], NOW).sort()).toEqual([900n, 901n]);
  });

  it('is independent of input order and of ties on time', () => {
    const rows = [...Array.from({ length: KEEP_NEWEST_AUTOSAVES + 5 }, (_, i) => row(i + 1, 24 * 40 + (i % 3)))];
    const forward = autosaveIdsToDelete(rows, NOW);
    const backward = autosaveIdsToDelete(rows.slice().reverse(), NOW);
    expect(backward.slice().sort()).toEqual(forward.slice().sort());
    expect(forward).toHaveLength(5);
  });
});

describe('pruneChartRevisions (the SQL)', () => {
  it('reads metadata only, from the real table and quoted columns, autosaves of this chart only', async () => {
    h.autosaves.push(...Array.from({ length: 40 }, (_, i) => row(i + 1, 24 * 60 + i)));
    const deleted = await pruneChartRevisions('chart-1', NOW);
    expect(deleted).toBe(10);

    const select = h.queries[0]!.sql;
    expect(select).toContain('FROM "ChartRevision"');
    expect(select).toContain('"chartId" = ?::uuid');
    expect(select).toContain(`"kind" = 'autosave'`);
    expect(select).toContain('ORDER BY "createdAt" DESC, "id" DESC');
    expect(select).not.toContain('"notes"');

    const del = h.executes[0]!.sql;
    expect(del).toContain('DELETE FROM "ChartRevision"');
    expect(del).toContain('"id" = ANY(?::text[]::bigint[])');
    // Whatever the id list says, the delete can only remove an autosave of this chart.
    expect(del).toContain('"chartId" = ?::uuid');
    expect(del).toContain(`"kind" = 'autosave'`);
  });

  it('deletes in batches of 1,000', async () => {
    h.autosaves.push(...Array.from({ length: KEEP_NEWEST_AUTOSAVES + 2500 }, (_, i) => row(i + 1, 24 * 60 + i)));
    const deleted = await pruneChartRevisions('chart-1', NOW);
    expect(deleted).toBe(2500);
    expect(REVISION_DELETE_BATCH).toBe(1000);
    expect(h.executes.map((e) => (e.values[0] as unknown[]).length)).toEqual([1000, 1000, 500]);
  });

  it('deletes nothing when everything is kept', async () => {
    h.autosaves.push(...Array.from({ length: 12 }, (_, i) => row(i + 1, i)));
    expect(await pruneChartRevisions('chart-1', NOW)).toBe(0);
    expect(h.executes).toHaveLength(0);
  });
});

describe('pruneRevisions (the sweep)', () => {
  it('only looks at charts with more autosaves than the newest-30 rule keeps, and never counts manual or publish', async () => {
    h.charts.push(['chart-1']);
    h.autosaves.push(...Array.from({ length: 35 }, (_, i) => row(i + 1, 24 * 60 + i)));
    expect(await pruneRevisions(NOW)).toBe(5);
    const page = h.queries[0]!.sql;
    expect(page).toContain('FROM "ChartRevision"');
    expect(page).toContain(`"kind" = 'autosave'`);
    expect(page).toContain('GROUP BY "chartId"');
    expect(page).toContain('HAVING COUNT(*) >');
    expect(h.queries[0]!.values).toContain(KEEP_NEWEST_AUTOSAVES);
  });

  it('does nothing on an empty table', async () => {
    expect(await pruneRevisions(NOW)).toBe(0);
    expect(h.executes).toHaveLength(0);
  });
});

describe('names against the schema', () => {
  const schema = readFileSync(path.resolve(__dirname, '../../../../prisma/schema/games/slice-it.prisma'), 'utf8');
  const model = /model ChartRevision \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';

  it('ChartRevision has no @@map, so the table is "ChartRevision"', () => {
    expect(model).not.toBe('');
    expect(model).not.toContain('@@map');
  });

  it('every column the SQL quotes is a field of the model', () => {
    for (const column of ['id', 'chartId', 'kind', 'createdAt', 'notes', 'label']) {
      expect(model).toMatch(new RegExp(`^\\s+${column}\\s`, 'm'));
    }
  });

  it('the job is one queue on a daily cron', () => {
    expect(REVISION_PRUNE_QUEUE).toBe('slice-it.revision-prune');
    expect(REVISION_PRUNE_CRON.split(' ')).toHaveLength(5);
    expect(REVISION_PRUNE_CRON.endsWith('* * *')).toBe(true);
  });
});
