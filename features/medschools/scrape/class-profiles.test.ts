import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROFILE_UNDATED_CYCLE,
  evidenceHasValue,
  isPhdOnlyQualifier,
  parseProfileNumber,
  profileKindOf,
  profileQualifierNote,
  profileStoredKind,
} from '../engine/school-facts';
import {
  CLASS_PROFILES_JOB,
  classProfileRows,
  classProfilesFileSchema,
  ensureClassProfilesImported,
  importClassProfiles,
  type ClassProfilesFile,
} from './class-profiles';
import { createFakePrisma } from './test-support';
import shipped from '../../../data/medschools/class-profiles.json';
import type { MedSchoolFactRow } from './types';

const registry = (
  JSON.parse(readFileSync(join(process.cwd(), 'data/medschools/schools.json'), 'utf8')) as {
    schools: { slug: string }[];
  }
).schools;
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe('data/medschools/class-profiles.json', () => {
  const parsed = classProfilesFileSchema.safeParse(shipped);

  it('validates, and records source, method, date, rules and the checker', () => {
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
    const f = parsed.data!;
    expect(f.source).toBe("Each school's own class-profile page");
    expect(f.checkedOn).toBe('2026-11-24');
    expect(f.method).toMatch(/MarlonJack\/1\.0/);
    expect(f.method).toMatch(/robots\.txt/);
    expect(f.method).toMatch(/not worked around/);
    expect(f.method).toMatch(/verbatim/);
    const rules = f.rules.join(' ');
    expect(rules).toMatch(/MSAR/);
    expect(rules).toMatch(/US News/);
    expect(rules).toMatch(/Admit\.org/);
    expect(rules).toMatch(/never computed/);
    expect(rules).toMatch(/2024/);
    expect(f.verifier).toMatch(/check-class-profiles\.ts/);
  });

  it('names only schools of the registry, sorted by slug, once each', () => {
    const known = new Set(registry.map((s) => s.slug));
    const slugs = parsed.data!.schools.map((s) => s.slug);
    expect(slugs.filter((s) => !known.has(s))).toEqual([]);
    expect([...slugs].sort()).toEqual(slugs);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBe(94);
    expect(parsed.data!.schools.flatMap((s) => s.classes.flatMap((c) => c.stats)).length).toBe(523);
  });

  it('cites only school-owned https pages and keeps no class before 2024', () => {
    for (const s of parsed.data!.schools)
      for (const c of s.classes) {
        expect(c.url).toMatch(/^https:\/\//);
        expect(c.url).not.toMatch(/aamc\.org|admit\.org|usnews|studentdoctor|reddit/);
        if (c.enteringYear !== null) expect(c.enteringYear).toBeGreaterThanOrEqual(2024);
      }
  });

  it('produces rows that fit the unique key: no two rows of one school share program, cycle and kind', () => {
    const rows = classProfileRows(parsed.data!);
    expect(rows).toHaveLength(523);
    const keys = rows.map((r) => `${r.slug}|${r.program}|${r.cycleYear}|${r.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

const file = (over: Partial<ClassProfilesFile> = {}): ClassProfilesFile => ({
  source: "Each school's own class-profile page",
  method: 'curl, by hand',
  checkedOn: '2026-11-24',
  rules: ['official pages only'],
  verifier: 'check-class-profiles.ts',
  schools: [
    {
      slug: 'alpha',
      checkedOn: '2026-11-24',
      classes: [
        {
          label: 'Class of 2030',
          enteringYear: 2026,
          url: 'https://alpha.edu/class-profile',
          stats: [
            { kind: 'MCAT_MEDIAN', value: '517', unit: null, qualifier: null, evidence: 'Median MCAT 517' },
            { kind: 'APPLICANTS', value: '7,412', unit: null, qualifier: null, evidence: 'Applicants 7,412' },
            {
              kind: 'OTHER',
              value: '22%',
              unit: null,
              qualifier: 'first-generation college students',
              evidence: 'First generation 22%',
            },
            { kind: 'OTHER', value: '31%', unit: null, qualifier: 'rural', evidence: 'Rural 31%' },
            {
              kind: 'APPLICANTS',
              value: '562',
              unit: null,
              qualifier: 'M.D.-Ph.D. program',
              evidence: 'M.D.-Ph.D. applicants 562',
            },
          ],
        },
        {
          label: 'Class of 2029',
          enteringYear: 2025,
          url: 'https://alpha.edu/class-profile',
          stats: [{ kind: 'MCAT_MEDIAN', value: '516', unit: null, qualifier: null, evidence: 'Median MCAT 516' }],
        },
      ],
    },
    {
      slug: 'beta',
      checkedOn: '2026-11-24',
      classes: [
        {
          label: 'Current class (no year stated)',
          enteringYear: null,
          url: 'https://med.beta.edu/profile.pdf',
          stats: [{ kind: 'GPA_MEAN', value: '3.81', unit: null, qualifier: null, evidence: 'Average GPA 3.81' }],
        },
      ],
    },
  ],
  ...over,
});

describe('the validator', () => {
  const school0 = () => file().schools[0]!;
  const withStat = (stat: Record<string, unknown>) => {
    const f = file();
    f.schools[0]!.classes[0]!.stats[0] = { ...f.schools[0]!.classes[0]!.stats[0]!, ...stat } as never;
    return f;
  };
  const withUrl = (url: string) => {
    const f = file();
    f.schools[0]!.classes[0]!.url = url;
    return f;
  };

  it('accepts the tiny file', () => {
    expect(classProfilesFileSchema.safeParse(file()).success).toBe(true);
  });

  it('refuses http, third-party hosts and bare addresses', () => {
    for (const url of [
      'http://alpha.edu/class-profile',
      'https://mec.aamc.org/msar-ui/',
      'https://med.admit.org/school/alpha',
      'https://www.usnews.com/best-graduate-schools/alpha',
      'https://forums.studentdoctor.net/threads/alpha',
      'https://www.reddit.com/r/premed',
      'https://192.168.0.1/profile',
    ])
      expect(classProfilesFileSchema.safeParse(withUrl(url)).success, url).toBe(false);
  });

  it('refuses a kind outside the catalogue, an empty value and evidence without the value', () => {
    expect(classProfilesFileSchema.safeParse(withStat({ kind: 'ACCEPTANCE_RATE' })).success).toBe(false);
    expect(classProfilesFileSchema.safeParse(withStat({ value: ' ' })).success).toBe(false);
    expect(classProfilesFileSchema.safeParse(withStat({ value: '518' })).success).toBe(false);
    expect(classProfilesFileSchema.safeParse(withStat({ kind: 'OTHER', qualifier: null })).success).toBe(false);
  });

  it('refuses a class before 2024, two classes of one year and a school listed twice', () => {
    const old = file();
    old.schools[0]!.classes[1]!.enteringYear = 2023;
    expect(classProfilesFileSchema.safeParse(old).success).toBe(false);
    const same = file();
    same.schools[0]!.classes[1]!.enteringYear = 2026;
    expect(classProfilesFileSchema.safeParse(same).success).toBe(false);
    const twice = file({ schools: [school0(), school0()] });
    expect(classProfilesFileSchema.safeParse(twice).success).toBe(false);
  });

  it('reads the value in the evidence by its digits, or as written for a value in words', () => {
    expect(evidenceHasValue('7,412', 'Applicants 7412')).toBe(true);
    expect(evidenceHasValue('3.41–4.0', 'GPA range 3.41 – 4.0')).toBe(true);
    expect(evidenceHasValue('38%', 'In state 38 %')).toBe(true);
    expect(evidenceHasValue('517', 'Median MCAT 518')).toBe(false);
    expect(evidenceHasValue('Fifty-four percent', 'Fifty-four percent of the class are Colorado residents')).toBe(true);
    expect(evidenceHasValue('Fifty-four percent', 'Most of the class')).toBe(false);
  });
});

describe('the catalogue helpers', () => {
  it('keeps the printed string and parses only plain numbers of the kind', () => {
    expect(parseProfileNumber('MCAT_MEDIAN', '517')).toBe(517);
    expect(parseProfileNumber('MCAT_MEAN', '511.7')).toBe(511.7);
    expect(parseProfileNumber('MCAT_MEAN', '98th percentile')).toBeNull();
    expect(parseProfileNumber('GPA_MEAN', '3.89')).toBe(3.89);
    expect(parseProfileNumber('GPA_MEAN', 'approximately 3.78')).toBeNull();
    expect(parseProfileNumber('APPLICANTS', '7,412')).toBe(7412);
    expect(parseProfileNumber('APPLICANTS', '~600')).toBeNull();
    expect(parseProfileNumber('APPLICANTS', '6,000+')).toBeNull();
    expect(parseProfileNumber('IN_STATE_PCT', '38%')).toBe(38);
    expect(parseProfileNumber('IN_STATE_PCT', 'Fifty-four percent')).toBeNull();
    expect(parseProfileNumber('MCAT_RANGE', '500-525')).toBeNull();
    expect(parseProfileNumber('OTHER', '22')).toBeNull();
  });

  it('stores a kind with an ordinal for a repeat, and reads it back', () => {
    expect(profileStoredKind('OTHER', 1)).toBe('PROFILE_OTHER');
    expect(profileStoredKind('OTHER', 3)).toBe('PROFILE_OTHER#3');
    expect(profileKindOf('PROFILE_OTHER#3')).toBe('OTHER');
    expect(profileKindOf('PROFILE_MCAT_10_90')).toBe('MCAT_10_90');
    expect(profileKindOf('PROFILE_ACCEPTANCE_RATE')).toBeNull();
    expect(profileKindOf('MCAT_MEDIAN')).toBeNull();
    expect(profileKindOf('PROFILE_OTHER#1')).toBeNull();
  });

  it('marks a figure MD-PhD only from its qualifier, never one that counts both programs', () => {
    for (const q of ['MD-PhD (MSTP)', 'M.D.-Ph.D. program', 'MSTP incoming students', 'DO-PhD only'])
      expect(isPhdOnlyQualifier(q), q).toBe(true);
    for (const q of [
      'MD & MD/PhD Applicants',
      'Total MD & MD/PhD Entering',
      'incl. MD/PhD',
      'incl. MD, MD/PhD and OMS students',
      'M.D. program',
      'B.A./M.D. program',
      null,
    ])
      expect(isPhdOnlyQualifier(q), String(q)).toBe(false);
  });

  it('drops research notes on the wording from the qualifier a reader sees', () => {
    expect(profileQualifierNote('labelled Average MCAT')).toBeNull();
    expect(profileQualifierNote('PDF label AVERAGE MCAT SCORE')).toBeNull();
    expect(profileQualifierNote('row MCAT Score under Average / Score column')).toBeNull();
    expect(profileQualifierNote('five-year average')).toBe('five-year average');
    expect(profileQualifierNote("Hawai'i residents (page spells with okina)")).toBe("Hawai'i residents");
    expect(profileQualifierNote(null)).toBeNull();
    // The page's own words for the kind say no more than the tile's label.
    expect(profileQualifierNote('MCAT Exam Class Average')).toBeNull();
    expect(profileQualifierNote('Overall Grade Point Average')).toBeNull();
    expect(profileQualifierNote('new matriculants')).toBeNull();
    expect(profileQualifierNote('accepted applications')).toBe('accepted applications');
    expect(profileQualifierNote('virtual interviews')).toBe('virtual interviews');
    expect(profileQualifierNote('North Carolina')).toBe('North Carolina');
    expect(profileQualifierNote('Arkansas applicants only; page says "in 2026"')).toBe('Arkansas applicants only');
  });
});

const setup = (slugs = ['alpha', 'beta', 'gamma']) => {
  const fake = createFakePrisma();
  fake.tables.medSchool = slugs.map((s) => ({ id: `id-${s}`, slug: s }));
  return fake;
};
const facts = (fake: ReturnType<typeof setup>) => (fake.tables.medSchoolFact ?? []) as MedSchoolFactRow[];
const of = (fake: ReturnType<typeof setup>, slug: string) =>
  facts(fake)
    .filter((r) => r.schoolId === `id-${slug}` && r.source === 'SCHOOL_PROFILE')
    .map((r) => `${r.program}:${r.cycleYear}:${r.kind}:${r.valueText}`)
    .sort();

describe('importClassProfiles', () => {
  it('writes one row per figure: both classes, repeats by ordinal, the MD-PhD figure under PHD, undated as cycle 0', async () => {
    const fake = setup();
    const sum = await importClassProfiles(fake.prisma, file(), log);
    expect(sum).toMatchObject({ schools: 2, missingSchools: [], facts: 7, removed: 0 });
    expect(of(fake, 'alpha')).toEqual([
      'PHD:2026:PROFILE_APPLICANTS:562',
      'REG:2025:PROFILE_MCAT_MEDIAN:516',
      'REG:2026:PROFILE_APPLICANTS:7,412',
      'REG:2026:PROFILE_MCAT_MEDIAN:517',
      'REG:2026:PROFILE_OTHER#2:31%',
      'REG:2026:PROFILE_OTHER:22%',
    ]);
    expect(of(fake, 'beta')).toEqual([`REG:${PROFILE_UNDATED_CYCLE}:PROFILE_GPA_MEAN:3.81`]);
    const applicants = facts(fake).find((r) => r.kind === 'PROFILE_APPLICANTS' && r.program === 'REG')!;
    expect(applicants).toMatchObject({
      valueNum: 7412,
      note: 'Applicants 7,412',
      sourceUrl: 'https://alpha.edu/class-profile',
      reportId: null,
      page: null,
      checkedOn: new Date('2026-11-24T00:00:00Z'),
    });
    expect(applicants.valueJson).toEqual({
      text: '7,412',
      label: 'Class of 2030',
      qualifier: null,
      evidence: 'Applicants 7,412',
      url: 'https://alpha.edu/class-profile',
      unit: null,
      order: 1,
    });
    const undated = facts(fake).find((r) => r.schoolId === 'id-beta')!;
    expect((undated.valueJson as { label: string }).label).toBe('Current class (no year stated)');
  });

  it('is idempotent, and removes what the file drops', async () => {
    const fake = setup();
    await importClassProfiles(fake.prisma, file(), log);
    const before = JSON.stringify(facts(fake));
    await importClassProfiles(fake.prisma, file(), log);
    expect(JSON.stringify(facts(fake))).toBe(before);
    const fewer = file();
    fewer.schools[0]!.classes.pop();
    const sum = await importClassProfiles(fake.prisma, fewer, log);
    expect(sum.removed).toBe(1);
    expect(of(fake, 'alpha').filter((k) => k.includes(':2025:'))).toEqual([]);
  });

  it('deletes only its own source: AAMC, Admit, school-page and RePORTER rows stay', async () => {
    const fake = setup();
    const other = (id: string, kind: string, source: string, program = 'REG') => ({
      id,
      schoolId: 'id-alpha',
      program,
      cycleYear: 2026,
      kind,
      valueText: 'YES',
      valueNum: null,
      valueJson: null,
      note: null,
      source,
      sourceUrl: 'https://example.org',
      sourceLabel: 'x',
      reportId: null,
      page: null,
      checkedOn: new Date('2026-11-24T00:00:00Z'),
    });
    fake.tables.medSchoolFact = [
      other('aamc', 'ACCEPTS_OUT_OF_STATE', 'AAMC_MSAR_REPORT'),
      other('admit', 'AOA_CHAPTER', 'ADMIT'),
      other('page', 'MDPHD_PROGRAM', 'SCHOOL_PAGE', 'PHD'),
      other('nih', 'MSTP_T32', 'NIH_REPORTER', 'PHD'),
      other('profile-mcat-like', 'PROFILE_MCAT_MEDIAN', 'ADMIT'),
    ];
    await importClassProfiles(fake.prisma, file(), log);
    await importClassProfiles(fake.prisma, file({ schools: [] as never }), log);
    expect(
      facts(fake)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['aamc', 'admit', 'nih', 'page', 'profile-mcat-like']);
  });

  it('removes nothing while a slug is unknown to the registry', async () => {
    const fake = setup();
    await importClassProfiles(fake.prisma, file(), log);
    const n = facts(fake).length;
    fake.tables.medSchool = (fake.tables.medSchool as { slug: string }[]).filter((s) => s.slug !== 'beta');
    const fewer = file();
    fewer.schools[0]!.classes.pop();
    const sum = await importClassProfiles(fake.prisma, fewer, log);
    expect(sum.missingSchools).toEqual(['beta']);
    expect(sum.removed).toBe(0);
    expect(facts(fake).length).toBe(n);
  });
});

describe('ensureClassProfilesImported (worker bootstrap)', () => {
  const runs = (fake: ReturnType<typeof setup>) =>
    ((fake.tables.medSourceRun ?? []) as Array<{ job: string; status: string }>).filter(
      (r) => r.job === CLASS_PROFILES_JOB,
    );

  it('imports once per hash; a restart with the same file does nothing', async () => {
    const fake = setup();
    expect(await ensureClassProfilesImported(fake.prisma, file(), log)).toBe('imported');
    expect(runs(fake).map((r) => r.status)).toEqual(['OK']);
    expect(await ensureClassProfilesImported(fake.prisma, file(), log)).toBe('current');
    expect(runs(fake)).toHaveLength(1);
    expect(await ensureClassProfilesImported(fake.prisma, file({ checkedOn: '2026-12-01' }), log)).toBe('imported');
    expect(runs(fake)).toHaveLength(2);
  });

  it('an invalid file imports nothing and records no run', async () => {
    const fake = setup();
    expect(await ensureClassProfilesImported(fake.prisma, { schools: 'nope' }, log)).toBe('invalid');
    expect(runs(fake)).toHaveLength(0);
    expect(facts(fake)).toHaveLength(0);
  });

  it('the shipped file is valid and imports (a slice: the fake database is quadratic)', async () => {
    const f = classProfilesFileSchema.parse(shipped);
    const fake = createFakePrisma();
    fake.tables.medSchool = registry.map((s) => ({ id: `id-${s.slug}`, slug: s.slug }));
    const slice = { ...f, schools: f.schools.slice(0, 12) };
    expect(await ensureClassProfilesImported(fake.prisma, slice, log)).toBe('imported');
    expect(facts(fake).length).toBe(classProfileRows(slice).length);
  });
});
