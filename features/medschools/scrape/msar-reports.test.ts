import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACT_KINDS } from '../engine/school-facts';
import {
  ensureMsarReportsImported,
  factRow,
  importMsarReports,
  MSAR_REPORTS_JOB,
  msarReportsFileSchema,
  type MsarReportsFile,
} from './msar-reports';
import { createFakePrisma } from './test-support';
import shipped from '../../../data/medschools/msar-reports.json';
import type { MedSchoolFactRow } from './types';

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'data/medschools', name), 'utf8')) as T;
const registry = read<{ schools: { slug: string; degree: string }[] }>('schools.json').schools;
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe('data/medschools/msar-reports.json', () => {
  const parsed = msarReportsFileSchema.safeParse(shipped);

  it('validates against the schema', () => {
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
  });

  it('records the permission, the page, the method and the day it was fetched', () => {
    const f = parsed.data!;
    expect(f.permission).toMatch(/owner states/i);
    expect(f.permission).toMatch(/Source: AAMC MSAR Report for Applicants and Advisors/);
    expect(f.sourceUrl).toMatch(/^https:\/\/students-residents\.aamc\.org\//);
    expect(f.source).toMatch(/not the MSAR school profiles/i);
    expect(f.method).toMatch(/pixels/);
    expect(f.fetchedOn).toBe('2026-11-24');
    expect(f.cycleLabel).toBe('2027 entering class');
  });

  it('names only MD schools of the registry, once each', () => {
    const slugs = parsed.data!.schools.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const md = new Map(registry.map((s) => [s.slug, s.degree]));
    expect(slugs.filter((s) => md.get(s) !== 'MD')).toEqual([]);
  });

  it('matched every US school the reports list (nothing unmatched, nothing guessed)', () => {
    expect(parsed.data!.unmatched).toEqual([]);
    expect(parsed.data!.schools.length).toBe(163);
  });

  it('labels the reports with the year each PDF prints', () => {
    const r = parsed.data!.reports;
    expect(r['7066']!.cycleYear).toBe(2026);
    expect(r['6996']!.cycleYear).toBe(2027);
    expect(r['7046']!.yearPrinted).toBe(false);
  });
});

const tiny = (over: Partial<MsarReportsFile> = {}): MsarReportsFile => ({
  source: 'AAMC reports',
  sourceUrl: shipped.sourceUrl as MsarReportsFile['sourceUrl'],
  permission: 'owner states permission',
  method: 'by hand',
  fetchedOn: '2026-11-24',
  cycleLabel: '2027 entering class',
  reports: {
    '6996': {
      name: 'Applications Accepted Information',
      url: 'https://students-residents.aamc.org/media/6996/download?attachment',
      cycleYear: 2027,
      yearPrinted: true,
      pdfSource: 'Information provided directly by individual medical schools.',
      pages: 28,
    },
    '7071': {
      name: 'Tuition, Fees and Insurance Information',
      url: 'https://students-residents.aamc.org/media/7071/download?attachment',
      cycleYear: 2027,
      yearPrinted: true,
      pdfSource: null,
      pages: 9,
    },
  },
  canadianSchoolsSkipped: 0,
  unmatched: [],
  schools: [
    {
      slug: 'yale',
      names: { '6996': 'Yale School of Medicine', '7071': 'Yale School of Medicine' },
      facts: [
        { report: 6996, kind: 'ACCEPTS_OUT_OF_STATE', page: 3, code: 'YES', note: 'Applications from any state.' },
        { report: 7071, kind: 'COA_IN_STATE', page: 4, num: 90000, text: '$90,000' },
      ],
    },
  ],
  ...over,
});

function setup(slugs = ['yale']) {
  const fake = createFakePrisma();
  fake.tables.medSchool = slugs.map((s) => ({ id: `id-${s}`, slug: s }));
  return fake;
}

describe('importMsarReports', () => {
  it('writes one AAMC_MSAR_REPORT row per fact with its source, page and the report year', async () => {
    const fake = setup();
    const sum = await importMsarReports(fake.prisma, tiny(), log);
    expect(sum).toMatchObject({ schools: 1, facts: 2, removed: 0, missingSchools: [] });
    const rows = fake.tables.medSchoolFact as MedSchoolFactRow[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.kind === 'ACCEPTS_OUT_OF_STATE')).toMatchObject({
      program: 'REG',
      cycleYear: 2027,
      valueText: 'YES',
      valueNum: null,
      note: 'Applications from any state.',
      source: 'AAMC_MSAR_REPORT',
      sourceUrl: 'https://students-residents.aamc.org/media/6996/download?attachment',
      sourceLabel:
        'AAMC MSAR Report for Applicants and Advisors, 2027 entering class, Applications Accepted Information',
      reportId: 6996,
      page: 3,
      checkedOn: new Date('2026-11-24T00:00:00Z'),
    });
    expect(rows.find((r) => r.kind === 'COA_IN_STATE')).toMatchObject({ valueNum: 90000, valueText: '$90,000' });
  });

  it('is idempotent and changes a fact in place', async () => {
    const fake = setup();
    await importMsarReports(fake.prisma, tiny(), log);
    const before = JSON.stringify(fake.tables.medSchoolFact);
    await importMsarReports(fake.prisma, tiny(), log);
    expect(JSON.stringify(fake.tables.medSchoolFact)).toBe(before);
    const changed = tiny();
    changed.schools[0]!.facts[1] = { report: 7071, kind: 'COA_IN_STATE', page: 4, num: 91000, text: '$91,000' };
    await importMsarReports(fake.prisma, changed, log);
    const rows = fake.tables.medSchoolFact as MedSchoolFactRow[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.kind === 'COA_IN_STATE')?.valueNum).toBe(91000);
  });

  it('removes a fact the file no longer holds', async () => {
    const fake = setup();
    await importMsarReports(fake.prisma, tiny(), log);
    const fewer = tiny();
    fewer.schools[0]!.facts.pop();
    const sum = await importMsarReports(fake.prisma, fewer, log);
    expect(sum.removed).toBe(1);
    expect((fake.tables.medSchoolFact as unknown[]).length).toBe(1);
  });

  it('skips a slug the registry does not have, and says so', async () => {
    const fake = setup([]);
    const sum = await importMsarReports(fake.prisma, tiny(), log);
    expect(sum.missingSchools).toEqual(['yale']);
    expect((fake.tables.medSchoolFact ?? []).length).toBe(0);
  });

  it('keeps the printed text beside a code in valueJson', () => {
    const f = tiny();
    f.reports['7036'] = { ...f.reports['6996']!, name: 'Latest and Oldest MCAT Test Administration Dates Considered' };
    const row = factRow(f, {
      report: 7036,
      kind: 'MCAT_LATEST',
      page: 2,
      code: '2026-09-12',
      text: 'September 12, 2026',
    });
    expect(row).toMatchObject({ valueText: '2026-09-12', valueJson: { text: 'September 12, 2026' } });
  });
});

describe('the validator', () => {
  const ok = (f: MsarReportsFile) => msarReportsFileSchema.safeParse(f).success;
  it('accepts the tiny file and rejects broken facts', () => {
    expect(ok(tiny())).toBe(true);
    const wrongReport = tiny();
    wrongReport.schools[0]!.facts[0]!.report = 7071;
    expect(ok(wrongReport)).toBe(false);
    const badCode = tiny();
    badCode.schools[0]!.facts[0]!.code = 'MAYBE';
    expect(ok(badCode)).toBe(false);
    const noText = tiny();
    delete noText.schools[0]!.facts[1]!.text;
    expect(ok(noText)).toBe(false);
    const dup = tiny();
    dup.schools.push(dup.schools[0]!);
    expect(ok(dup)).toBe(false);
    const unknown = tiny();
    unknown.schools[0]!.facts[0]!.kind = 'NOPE';
    expect(ok(unknown)).toBe(false);
    expect(ok(tiny({ sourceUrl: 'https://mec.aamc.org/msar-ui' as never }))).toBe(false);
  });

  it('every kind belongs to a report the catalogue lists', () => {
    for (const k of Object.values(FACT_KINDS)) expect(Object.keys(k)).toContain('report');
  });
});

describe('ensureMsarReportsImported (worker bootstrap)', () => {
  it('imports a new file once, and a restart with the same file does nothing', async () => {
    const fake = setup();
    const raw = tiny();
    expect(await ensureMsarReportsImported(fake.prisma, raw, log)).toBe('imported');
    const runs = () =>
      (fake.tables.medSourceRun as Array<{ job: string; status: string }>).filter((r) => r.job === MSAR_REPORTS_JOB);
    expect(runs().map((r) => r.status)).toEqual(['OK']);
    expect(await ensureMsarReportsImported(fake.prisma, raw, log)).toBe('current');
    expect(runs()).toHaveLength(1);
  });

  it('a changed file imports again', async () => {
    const fake = setup();
    await ensureMsarReportsImported(fake.prisma, tiny(), log);
    expect(await ensureMsarReportsImported(fake.prisma, tiny({ fetchedOn: '2026-12-01' }), log)).toBe('imported');
  });

  it('an invalid file imports nothing and records no run', async () => {
    const fake = setup();
    expect(await ensureMsarReportsImported(fake.prisma, { schools: 'nope' }, log)).toBe('invalid');
    expect((fake.tables.medSourceRun as unknown[] | undefined) ?? []).toHaveLength(0);
  });

  it('the shipped data file is valid and imports (a slice of it: the fake database is quadratic)', async () => {
    const whole = msarReportsFileSchema.parse(shipped);
    expect(whole.schools.length).toBeGreaterThan(100);
    const slice = { ...whole, schools: whole.schools.slice(0, 8) };
    const fake = createFakePrisma();
    fake.tables.medSchool = registry.map((s) => ({ id: `id-${s.slug}`, slug: s.slug }));
    expect(await ensureMsarReportsImported(fake.prisma, slice, log)).toBe('imported');
    expect((fake.tables.medSchoolFact as unknown[]).length).toBe(slice.schools.reduce((n, s) => n + s.facts.length, 0));
  });
});
