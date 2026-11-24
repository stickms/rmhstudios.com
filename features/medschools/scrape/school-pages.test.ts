import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_TEXT } from '../engine/secondaries/text';
import { buildSchoolView, type StoredPrompt } from '../engine/secondaries/view';
import {
  importSchoolPages,
  ensureSchoolPagesImported,
  SCHOOL_PAGES_JOB,
  isThirdPartyHost,
  promptsOf,
  schoolPagesFileSchema,
  type SchoolPagesFile,
} from './school-pages';
import { createFakePrisma } from './test-support';
import shipped from '../../../data/medschools/school-pages.json';
import type { MedSecondaryObservationRow, MedSecondaryPromptRow } from './types';

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'data/medschools', name), 'utf8')) as T;
const raw = read<unknown>('school-pages.json');
const registry = read<{ schools: { slug: string }[] }>('schools.json').schools;
const log = { info: () => undefined, warn: () => undefined };

describe('data/medschools/school-pages.json', () => {
  const parsed = schoolPagesFileSchema.safeParse(raw);

  it('validates against the schema', () => {
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
  });

  it('records its source and method, and the day it was read', () => {
    const f = parsed.data!;
    expect(f.source).toMatch(/own/i);
    expect(f.method).toMatch(/verbatim/i);
    expect(f.checkedOn).toBe('2026-11-23');
  });

  it('names only schools in the registry, once each', () => {
    const slugs = parsed.data!.schools.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const known = new Set(registry.map((s) => s.slug));
    expect(slugs.filter((s) => !known.has(s))).toEqual([]);
  });

  it('uses https URLs on school-owned hosts only', () => {
    for (const s of parsed.data!.schools) {
      for (const u of [s.secondary.url, s.admissions.url]) {
        if (u === null) continue;
        const url = new URL(u);
        expect(url.protocol, s.slug).toBe('https:');
        expect(isThirdPartyHost(url.hostname), `${s.slug} ${url.hostname}`).toBe(false);
      }
    }
  });

  it('imports every prompt except one that is too long for a prompt (counted, never stored)', async () => {
    const fake = createFakePrisma();
    fake.tables.medSchool = registry.map((s) => ({ id: `id-${s.slug}`, slug: s.slug }));
    const sum = await importSchoolPages(fake.prisma, parsed.data!, log);
    expect(sum.missingSchools).toEqual([]);
    const all = parsed.data!.schools.flatMap((s) => s.secondary.prompts);
    const tooLong = all.filter((p) => p.text.length > MAX_TEXT).length;
    expect(sum.rejected).toBe(tooLong);
    expect(sum.checks).toBe(parsed.data!.schools.length);
    expect(sum.prompts).toBe(all.length - tooLong);
  });
});

describe('isThirdPartyHost', () => {
  it('rejects the known third-party sites, their subdomains, IPs and bare names', () => {
    for (const h of [
      'med.admit.org',
      'forums.studentdoctor.net',
      'www.reddit.com',
      '127.0.0.1',
      'localhost',
      'a_b.edu',
    ])
      expect(isThirdPartyHost(h), h).toBe(true);
    for (const h of ['www.belmont.edu', 'medicine.yale.edu']) expect(isThirdPartyHost(h), h).toBe(false);
  });
});

const entry = (over: Partial<SchoolPagesFile['schools'][number]> = {}): SchoolPagesFile['schools'][number] => ({
  slug: 'harvard',
  checkedOn: '2026-11-23',
  secondary: {
    url: 'https://hms.example.edu/secondary',
    cycleYear: 2027,
    prompts: [
      { program: 'REG', text: 'Describe a challenge you faced.', limitKind: 'WORDS', limitValue: 250, optional: false },
      { program: 'PHD', text: 'Why an MD-PhD?', limitKind: null, limitValue: null, optional: true },
    ],
  },
  admissions: {
    url: 'https://hms.example.edu/admissions',
    rolling: { REG: true, PHD: false },
    evidence: { REG: 'Decisions are made on a rolling basis.', PHD: 'Decisions are sent on March 1.' },
  },
  ...over,
});

const file = (...schools: SchoolPagesFile['schools']): SchoolPagesFile => ({
  source: 'own pages',
  method: 'verbatim',
  checkedOn: '2026-11-23',
  schools,
});

function setup(slugs = ['harvard']) {
  const fake = createFakePrisma();
  fake.tables.medSchool = slugs.map((s) => ({ id: `id-${s}`, slug: s }));
  return fake;
}

describe('importSchoolPages', () => {
  it('records SCHOOL observations with the page url, a check and the admissions policy', async () => {
    const fake = setup();
    const sum = await importSchoolPages(fake.prisma, file(entry()), log);
    expect(sum).toMatchObject({ schools: 1, prompts: 2, created: 2, rejected: 0, checks: 1, policies: 2 });
    const obs = fake.tables.medSecondaryObservation as MedSecondaryObservationRow[];
    expect(obs).toHaveLength(2);
    for (const o of obs) {
      expect(o.source).toBe('SCHOOL');
      expect(o.sourceRef).toBe('https://hms.example.edu/secondary');
      expect(o.cycleYear).toBe(2027);
      expect(o.lastCheckedAt).toEqual(new Date('2026-11-23T00:00:00Z'));
    }
    expect(fake.tables.medSecondaryCheck).toMatchObject([{ source: 'SCHOOL', status: 'OK', promptCount: 2 }]);
    expect(fake.tables.medSchoolAdmissionsPolicy).toMatchObject([
      { program: 'REG', rolling: true, source: 'SCHOOL', url: 'https://hms.example.edu/admissions' },
      { program: 'PHD', rolling: false },
    ]);
  });

  it('is idempotent: a second run adds no rows and changes no value', async () => {
    const fake = setup();
    await importSchoolPages(fake.prisma, file(entry()), log);
    const before = JSON.stringify(fake.tables);
    const again = await importSchoolPages(fake.prisma, file(entry()), log);
    expect(again.created).toBe(0);
    expect(JSON.stringify(fake.tables)).toBe(before);
  });

  it('a rerun never rewinds a later check or an admin correction (idempotent across a correction)', async () => {
    const fake = setup();
    await importSchoolPages(fake.prisma, file(entry()), log);
    const obs = fake.tables.medSecondaryObservation as MedSecondaryObservationRow[];
    const CORRECTED = new Date('2026-12-05T10:00:00Z');
    // An admin corrects one prompt's limit, and a later check of the school and its policy is recorded.
    const first = obs.find((o) => o.limitKind === 'WORDS')!;
    first.limitValue = 300;
    first.lastCheckedAt = CORRECTED;
    (fake.tables.medSecondaryCheck as { checkedAt: Date }[])[0]!.checkedAt = CORRECTED;
    (fake.tables.medSchoolAdmissionsPolicy as { checkedOn: Date; rolling: boolean }[])[0]!.checkedOn = CORRECTED;
    (fake.tables.medSchoolAdmissionsPolicy as { checkedOn: Date; rolling: boolean }[])[0]!.rolling = false;
    const corrected = JSON.stringify(fake.tables);
    const again = await importSchoolPages(fake.prisma, file(entry()), log);
    expect(again.created).toBe(0);
    expect(JSON.stringify(fake.tables)).toBe(corrected);
    expect(first.limitValue).toBe(300);
    expect(first.lastCheckedAt).toEqual(CORRECTED);
    // And a third run is the same: nothing moves.
    await importSchoolPages(fake.prisma, file(entry()), log);
    expect(JSON.stringify(fake.tables)).toBe(corrected);
  });

  it('a later file day still refreshes the checks forward', async () => {
    const fake = setup();
    await importSchoolPages(fake.prisma, file(entry()), log);
    await importSchoolPages(fake.prisma, file(entry({ checkedOn: '2026-12-01' })), log);
    const obs = fake.tables.medSecondaryObservation as MedSecondaryObservationRow[];
    for (const o of obs) expect(o.lastCheckedAt).toEqual(new Date('2026-12-01T00:00:00Z'));
    expect((fake.tables.medSecondaryCheck as { checkedAt: Date }[])[0]!.checkedAt).toEqual(
      new Date('2026-12-01T00:00:00Z'),
    );
  });

  it('puts a page that names no cycle in the cycle in progress on the day it was read', async () => {
    const e = entry();
    e.secondary.cycleYear = null;
    expect(promptsOf(e).map((p) => p.cycleYear)).toEqual([2027, 2027]);
    e.checkedOn = '2026-05-20';
    expect(promptsOf(e).map((p) => p.cycleYear)).toEqual([2026, 2026]);
  });

  it('writes a check even when the school has no page, and no policy without a stated fact', async () => {
    const fake = setup();
    const none = entry({
      secondary: { url: null, cycleYear: null, prompts: [] },
      admissions: { url: null, rolling: { REG: null, PHD: null }, evidence: { REG: null, PHD: null } },
    });
    const sum = await importSchoolPages(fake.prisma, file(none), log);
    expect(sum).toMatchObject({ prompts: 0, checks: 1, policies: 0 });
    expect(fake.tables.medSecondaryCheck).toMatchObject([{ status: 'EMPTY', promptCount: 0 }]);
    expect(fake.tables.medSecondaryObservation ?? []).toHaveLength(0);
  });

  it('skips a slug the registry does not have and says so', async () => {
    const fake = setup([]);
    const sum = await importSchoolPages(fake.prisma, file(entry()), log);
    expect(sum.missingSchools).toEqual(['harvard']);
    expect(sum.checks).toBe(0);
  });

  it('shows up in the school view as a current SCHOOL prompt', async () => {
    const fake = setup();
    await importSchoolPages(fake.prisma, file(entry()), log);
    const prompts = fake.tables.medSecondaryPrompt as MedSecondaryPromptRow[];
    const obs = fake.tables.medSecondaryObservation as MedSecondaryObservationRow[];
    const stored: StoredPrompt[] = prompts.map((p) => ({
      id: p.id,
      program: p.program,
      text: p.text,
      themes: p.themes,
      observations: obs
        .filter((o) => o.promptId === p.id)
        .map((o) => ({
          cycleYear: o.cycleYear,
          source: o.source,
          limit: o.limitKind && o.limitValue ? { kind: o.limitKind, value: o.limitValue } : null,
          optional: o.optional,
          sourceRef: o.sourceRef,
          lastCheckedAt: o.lastCheckedAt,
        })),
    }));
    const view = buildSchoolView(stored, 2027);
    expect(view.map((v) => [v.program, v.state, v.prompts.length])).toEqual([
      ['REG', 'current', 1],
      ['PHD', 'current', 1],
    ]);
  });

  it('rejects a third-party url, an http url and a prompt with no page', () => {
    const bad = (e: SchoolPagesFile['schools'][number]) => schoolPagesFileSchema.safeParse(file(e)).success;
    expect(bad(entry())).toBe(true);
    const a = entry();
    a.secondary.url = 'https://med.admit.org/secondary-essays/harvard';
    expect(bad(a)).toBe(false);
    const b = entry();
    b.secondary.url = 'http://hms.example.edu/secondary';
    expect(bad(b)).toBe(false);
    const c = entry();
    c.secondary.url = null;
    expect(bad(c)).toBe(false);
  });
});

describe('ensureSchoolPagesImported (worker bootstrap)', () => {
  const logs = { info: () => undefined, warn: () => undefined, error: () => undefined };

  it('imports a new file once, and a restart with the same file does nothing', async () => {
    const fake = setup();
    const raw = file(entry());
    expect(await ensureSchoolPagesImported(fake.prisma, raw, logs)).toBe('imported');
    const runs = () =>
      (fake.tables.medSourceRun as Array<{ job: string; status: string }>).filter((r) => r.job === SCHOOL_PAGES_JOB);
    expect(runs().map((r) => r.status)).toEqual(['OK']);
    expect(await ensureSchoolPagesImported(fake.prisma, raw, logs)).toBe('current');
    expect(runs()).toHaveLength(1);
  });

  it('a changed file imports again', async () => {
    const fake = setup();
    await ensureSchoolPagesImported(fake.prisma, file(entry()), logs);
    const changed = file({ ...entry(), checkedOn: '2026-11-24' });
    expect(await ensureSchoolPagesImported(fake.prisma, changed, logs)).toBe('imported');
  });

  it('an invalid file imports nothing and records no run', async () => {
    const fake = setup();
    expect(await ensureSchoolPagesImported(fake.prisma, { schools: 'nope' }, logs)).toBe('invalid');
    expect((fake.tables.medSourceRun as unknown[] | undefined) ?? []).toHaveLength(0);
  });

  it('the shipped data file is valid', () => {
    expect(schoolPagesFileSchema.safeParse(shipped).success).toBe(true);
  });
});
