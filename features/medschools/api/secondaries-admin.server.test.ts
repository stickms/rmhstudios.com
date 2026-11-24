import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../scrape/test-support';

const fake = vi.hoisted(() => ({ current: null as null | { prisma: unknown } }));
vi.mock('@/lib/prisma.server', () => ({
  get prisma() {
    return fake.current?.prisma;
  },
}));

import { recordSchoolPrompts } from './secondaries-admin.server';

const NOW = new Date('2026-11-23T12:00:00Z');
let f: ReturnType<typeof createFakePrisma>;
const body = (over = {}) => ({
  schoolId: 's1',
  program: 'PHD' as const,
  cycleYear: 2027,
  sourceUrl: 'https://med.duke.edu/secondary',
  prompts: [
    { text: 'Why do you want an MD-PhD and what is your research goal? (500 words)' },
    { text: 'Optional: anything else we should know?', limitKind: 'CHARS' as const, limitValue: 1000, optional: true },
  ],
  ...over,
});

beforeEach(() => {
  f = createFakePrisma();
  fake.current = f;
  f.tables.medSchool.push({ id: 's1', slug: 'duke', name: 'Duke', active: true });
});

describe('recordSchoolPrompts', () => {
  it('writes SCHOOL observations for that school and program with the page url, and a check', async () => {
    expect(await recordSchoolPrompts(body(), NOW)).toEqual({ prompts: 2, created: 2, rejected: 0 });
    const obs = f.tables.medSecondaryObservation as {
      source: string;
      sourceRef: string;
      limitKind: string;
      limitValue: number;
      optional: boolean;
    }[];
    expect(obs.map((o) => [o.source, o.sourceRef, o.limitKind, o.limitValue, o.optional])).toEqual([
      ['SCHOOL', 'https://med.duke.edu/secondary', 'WORDS', 500, false],
      ['SCHOOL', 'https://med.duke.edu/secondary', 'CHARS', 1000, true],
    ]);
    expect((f.tables.medSecondaryPrompt as { program: string }[]).every((p) => p.program === 'PHD')).toBe(true);
    expect(f.tables.medSecondaryCheck).toMatchObject([{ source: 'SCHOOL', status: 'OK', promptCount: 2 }]);
  });

  it('an unknown school is not-found and writes nothing', async () => {
    expect(await recordSchoolPrompts(body({ schoolId: 'zz' }), NOW)).toBe('not-found');
    expect(f.writes).toHaveLength(0);
  });

  it('a cycle in the future is rejected, not stored', async () => {
    expect(await recordSchoolPrompts(body({ cycleYear: 2030 }), NOW)).toMatchObject({ prompts: 0, rejected: 2 });
  });
});
