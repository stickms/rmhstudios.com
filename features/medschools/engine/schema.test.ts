import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PERSON_LIKE = /user.*name|author|avatar|display/i;

interface Parsed {
  model: string;
  fields: string[];
  body: string;
}

function parseModels(schemaText: string): Parsed[] {
  const out: Parsed[] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const m of schemaText.matchAll(re)) {
    const body = m[2] ?? '';
    const fields: string[] = [];
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      // Relation fields are not columns; the scalar FK beside them is.
      if (line.includes('@relation') || /\[\]/.test(line)) continue;
      const name = line.split(/\s+/)[0];
      if (name) fields.push(name);
    }
    out.push({ model: m[1] ?? '', fields, body });
  }
  return out;
}

/** `Model.field` for every column that could hold a person identifier. */
function forbiddenColumns(schemaText: string): string[] {
  const hits: string[] = [];
  for (const { model, fields } of parseModels(schemaText)) {
    const allowsUserId = model.startsWith('MedTracker') || model === 'MedSchoolFollow';
    for (const f of fields) {
      if (PERSON_LIKE.test(f) || (f === 'userId' && !allowsUserId)) hits.push(`${model}.${f}`);
    }
  }
  return hits;
}

const schema = () => readFileSync('prisma/schema/medschools.prisma', 'utf8');

describe('medschools anonymization schema', () => {
  it('medschools.prisma has no person-like columns', () => {
    expect(forbiddenColumns(schema())).toEqual([]);
  });

  it('the checker catches the columns it exists to catch', () => {
    const bad = `
model MedCycleEvent {
  id String @id
  authorName String
  username String
  avatarUrl String
  displayName String
  userId String
}
model MedTrackerCycle {
  id String @id
  userId String
}
`;
    const hits = forbiddenColumns(bad);
    expect(hits).toEqual([
      'MedCycleEvent.authorName',
      'MedCycleEvent.username',
      'MedCycleEvent.avatarUrl',
      'MedCycleEvent.displayName',
      'MedCycleEvent.userId',
    ]);
    expect(hits).not.toContain('MedTrackerCycle.userId');
  });

  it("MedCycleEvent has exactly the spec's columns", () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedCycleEvent');
    expect(m?.fields).toEqual([
      'id',
      'schoolId',
      'cycleYear',
      'eventType',
      'occurredAt',
      'source',
      'dedupeHash',
      'inState',
      'ingestedAt',
    ]);
  });

  it('MedCycleCount unique key is (school, program, cycle, date, type, source)', () => {
    const m = parseModels(schema()).find((x) => x.model === 'MedCycleCount');
    const line = m?.body.split('\n').find((l) => l.includes('@@unique'));
    expect(line).toBeDefined();
    const fields = /\[([^\]]+)\]/.exec(line ?? '')?.[1]?.split(',').map((s) => s.trim());
    expect(fields).toEqual(['schoolId', 'program', 'cycleYear', 'date', 'eventType', 'source']);
  });
});
