import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * D1: `features/medschools/api/share-sync.server.ts` is the only code that writes the tracker tables or an RMH
 * `MedCycleEvent`. A cascade deletes milestones without application code seeing them, and an event is found only through
 * a milestone id, so a second writer is how an event outlives the thing it hangs from.
 */

const TRACKER_WRITE =
  /\.(medTrackerMilestone|medTrackerApplication|medTrackerCycle)\s*\.\s*(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/;
const EVENT_WRITE = /\.medCycleEvent\s*\.\s*(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/;
const RAW_TRACKER_WRITE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?med_tracker_(cycle|application|milestone)\b/i;

/** Source files (not tests) that may write, each with the reason. */
const ALLOWED: Record<string, string> = {
  'features/medschools/api/share-sync.server.ts': 'the one writer',
  'lib/account/erasure-medschools.server.ts':
    'deleteMany of MedTrackerCycle in the erasure transaction, after eraseSharedMedEvents has removed the events',
};

export function violations(file: string, text: string): string[] {
  const hits: string[] = [];
  if (TRACKER_WRITE.test(text)) hits.push('writes a tracker table');
  if (RAW_TRACKER_WRITE.test(text)) hits.push('writes a tracker table with raw SQL');
  // An RMH event write: a medCycleEvent write with 'RMH' anywhere in the next 600 characters of the call.
  for (const m of text.matchAll(new RegExp(EVENT_WRITE.source, 'g'))) {
    const window = text.slice(m.index ?? 0, (m.index ?? 0) + 600);
    if (/['"]RMH['"]/.test(window)) hits.push('writes an RMH event');
  }
  return hits.map((h) => `${file}: ${h}`);
}

const ROOTS = ['features', 'lib', 'server', 'scripts', 'app', 'components', 'hooks', 'stores'];
const SKIP_DIR = new Set(['node_modules', 'generated', '__fixtures__', '.git', 'dist']);

function walk(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((n) => {
    if (SKIP_DIR.has(n)) return [];
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|mts|mjs|js)$/.test(n) && !/\.(test|spec)\.[tj]sx?$/.test(n) && n !== 'test-support.ts' ? [p] : [];
  });
}

describe('share-sync is the only writer (D1)', () => {
  it('no other source file writes a tracker table or an RMH event', () => {
    const found = ROOTS.flatMap((r) => walk(join(process.cwd(), r))).flatMap((abs) => {
      const rel = relative(process.cwd(), abs);
      if (rel in ALLOWED) return [];
      return violations(rel, readFileSync(abs, 'utf8'));
    });
    expect(found).toEqual([]);
  });

  it('the allowlist names files that exist and still write', () => {
    for (const rel of Object.keys(ALLOWED)) {
      const text = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(violations(rel, text), rel).not.toEqual([]);
    }
  });

  it('the scan catches the writes it exists to catch', () => {
    expect(violations('a.ts', 'await prisma.medTrackerMilestone.delete({ where })')).toHaveLength(1);
    expect(violations('a.ts', 'tx.medTrackerCycle.updateMany({})')).toHaveLength(1);
    expect(violations('a.ts', "await db.medCycleEvent.create({ data: { source: 'RMH' } })")).toHaveLength(1);
    expect(violations('a.ts', 'await db.$executeRaw`DELETE FROM "med_tracker_milestone" WHERE true`')).toHaveLength(1);
  });

  it('and passes the reads and the other sources', () => {
    expect(violations('a.ts', 'await prisma.medTrackerCycle.findMany({})')).toEqual([]);
    expect(violations('a.ts', "await db.medCycleEvent.create({ data: { source: 'SDN' } })")).toEqual([]);
    expect(violations('a.ts', "await db.medCycleEvent.findMany({ where: { source: 'RMH' } })")).toEqual([]);
  });
});
