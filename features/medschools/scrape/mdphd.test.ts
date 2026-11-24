import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDrawableTimeline, normalisePattern, timelineHasContent } from '../engine/mdphd';
import {
  MDPHD_JOB,
  VETERINARY,
  ensureMdPhdImported,
  importMdPhd,
  mdphdProgramsFileSchema,
  mdphdRows,
  mstpFileSchema,
  type MdPhdProgramsFile,
  type MstpFile,
} from './mdphd';
import { createFakePrisma } from './test-support';
import programsShipped from '../../../data/medschools/mdphd-programs.json';
import mstpShipped from '../../../data/medschools/mstp-t32.json';
import type { MedSchoolFactRow } from './types';

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), 'data/medschools', name), 'utf8')) as T;
const registry = read<{ schools: { slug: string; degree: string; name: string }[] }>('schools.json').schools;
const aliases = read<{ grants: Record<string, { slug: string }>; excluded: Record<string, string> }>(
  'mstp-aliases.json',
);
const log = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe('data/medschools/mdphd-programs.json', () => {
  const parsed = mdphdProgramsFileSchema.safeParse(programsShipped);

  it('validates, and records source, method, date and the owner decisions', () => {
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
    const f = parsed.data!;
    expect(f.checkedOn).toBe('2026-11-24');
    expect(f.source).toMatch(/program page/);
    expect(f.method).toMatch(/verbatim|found on the cited page/);
    expect(f.ownerDecisions.join(' ')).toMatch(/2-4-2/);
    expect(f.ownerDecisions.join(' ')).toMatch(/RePORTER/);
    expect(f.verifier).toMatch(/check-mdphd\.ts/);
  });

  it('names only schools of the registry, once each, each citing an https page', () => {
    const known = new Set(registry.map((s) => s.slug));
    const slugs = parsed.data!.schools.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.filter((s) => !known.has(s))).toEqual([]);
    for (const s of parsed.data!.schools) expect(s.url).toMatch(/^https:\/\//);
  });

  it('holds a timeline only for a program, with normalised patterns and something to show', () => {
    for (const s of parsed.data!.schools) {
      if (!s.timeline) continue;
      expect(s.exists).toBe(true);
      expect(s.timeline.pattern).toBe(normalisePattern(s.timeline.pattern));
      expect(timelineHasContent(s.timeline), s.slug).toBe(true);
      expect(s.timeline.evidence.length).toBeGreaterThan(20);
    }
    const davis = parsed.data!.schools.find((s) => s.slug === 'university-of-california-davis')!;
    expect(davis.timeline?.pattern).toBe('2-4-2');
    const slu = parsed.data!.schools.find((s) => s.slug === 'saint-louis')!;
    expect(slu.timeline?.pattern).toBe('1.5-4-2.5');
    // Mount Sinai's clerkships come before the PhD: the order is the page's.
    const sinai = parsed.data!.schools.find((s) => s.slug === 'mount-sinai')!;
    expect(sinai.timeline!.phases.map((p) => p.phase)).toEqual([
      'other',
      'preclinical',
      'clinical',
      'research',
      'clinical',
    ]);
    expect(isDrawableTimeline(sinai.timeline!.phases)).toBe(true);
  });
});

describe('data/medschools/mstp-t32.json (NIH RePORTER)', () => {
  const parsed = mstpFileSchema.safeParse(mstpShipped);

  it('validates and records source, query, method and date', () => {
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
    expect(parsed.data!.fetchedOn).toBe('2026-11-24');
    expect(parsed.data!.query).toMatch(/T32/);
    expect(parsed.data!.query).toMatch(/NIGMS/);
  });

  it('has no veterinary DVM-PhD grant, and excludes the three by name', () => {
    for (const g of parsed.data!.grants) {
      expect(g.title).not.toMatch(VETERINARY);
      expect(g.organization).not.toMatch(/COLORADO STATE/);
      expect(g.organization === 'CORNELL UNIVERSITY').toBe(false);
    }
    const dvm = parsed.data!.excluded.filter((x) => /DVM-PhD/.test(x.reason)).map((x) => x.core);
    expect(dvm.sort()).toEqual(['T32GM136559', 'T32GM136628', 'T32GM150453']);
  });

  it('maps every grant to a school of the registry by the committed alias map, one grant a school', () => {
    const known = new Set(registry.map((s) => s.slug));
    const slugs = parsed.data!.grants.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const g of parsed.data!.grants) {
      expect(known.has(g.slug), g.slug).toBe(true);
      expect(aliases.grants[g.core]?.slug).toBe(g.slug);
      expect(g.projectNum).toContain(g.core);
    }
    for (const x of parsed.data!.excluded) expect(aliases.excluded[x.core]).toBe(x.reason);
  });

  it('places the multi-school institutions on the school the grant names', () => {
    const by = new Map(parsed.data!.grants.map((g) => [g.slug, g]));
    expect(by.get('university-of-texas-san-antonio')!.title).toMatch(/South Texas/);
    expect(by.get('university-of-texas-houston')!.organization).toMatch(/HOUSTON/);
    expect(by.get('university-of-california-los-angeles')!.title).toMatch(/UCLA-Caltech/);
    expect(by.get('michigan-state-com')!.title).toMatch(/College of Osteopathic Medicine/);
    expect(by.has('michigan-state')).toBe(false);
    expect(by.has('university-of-california-davis')).toBe(false);
  });

  it('never contradicts a program page: no grant for a school whose page says there is no program', () => {
    const programs = mdphdProgramsFileSchema.parse(programsShipped);
    const none = new Set(programs.schools.filter((s) => !s.exists).map((s) => s.slug));
    expect(parsed.data!.grants.filter((g) => none.has(g.slug))).toEqual([]);
  });
});

const programs = (over: Partial<MdPhdProgramsFile> = {}): MdPhdProgramsFile => ({
  source: 'school pages',
  method: 'by hand',
  checkedOn: '2026-11-24',
  ownerDecisions: ['2-4-2 is the typical layout'],
  verifier: 'check-mdphd.ts',
  schools: [
    {
      slug: 'alpha',
      exists: true,
      name: 'Alpha MSTP',
      url: 'https://alpha.edu/mdphd',
      checkedOn: '2026-11-24',
      timeline: {
        pattern: '2-4-2',
        phases: [
          { phase: 'preclinical', years: 2, label: 'Years 1-2' },
          { phase: 'research', years: 4, label: 'Years 3-6' },
          { phase: 'clinical', years: 2, label: 'Years 7-8' },
        ],
        totalYears: 8,
        evidence: 'Years 1-2 preclinical, years 3-6 PhD, years 7-8 clinical.',
        url: 'https://alpha.edu/mdphd',
        checkedOn: '2026-11-24',
      },
    },
    { slug: 'beta', exists: false, name: null, url: 'https://beta.edu/md', checkedOn: '2026-11-24', timeline: null },
    {
      slug: 'gamma',
      exists: true,
      name: 'Gamma MD-PhD',
      url: 'https://gamma.edu/mdphd',
      checkedOn: '2026-11-24',
      timeline: null,
    },
  ],
  ...over,
});

const mstp = (over: Partial<MstpFile> = {}): MstpFile => ({
  source: 'RePORTER',
  sourceUrl: 'https://reporter.nih.gov/',
  query: 'T32 NIGMS',
  fetchedOn: '2026-11-24',
  method: 'by hand',
  grants: [
    {
      slug: 'alpha',
      core: 'T32GM000001',
      projectNum: '5T32GM000001-03',
      applId: 111,
      organization: 'ALPHA UNIVERSITY',
      title: 'Medical Scientist Training Program',
      fiscalYear: 2026,
      projectEnd: '2029-06-30',
    },
    {
      slug: 'delta',
      core: 'T32GM000002',
      projectNum: '5T32GM000002-01',
      applId: 222,
      organization: 'DELTA UNIVERSITY',
      title: 'Medical Scientist Training Program',
      fiscalYear: 2025,
      projectEnd: '2030-06-30',
    },
  ],
  excluded: [],
  ...over,
});

const setup = (slugs = ['alpha', 'beta', 'gamma', 'delta', 'omega']) => {
  const fake = createFakePrisma();
  fake.tables.medSchool = slugs.map((s) => ({ id: `id-${s}`, slug: s }));
  return fake;
};
const facts = (fake: ReturnType<typeof setup>) => (fake.tables.medSchoolFact ?? []) as MedSchoolFactRow[];
const of = (fake: ReturnType<typeof setup>, slug: string) =>
  facts(fake)
    .filter((r) => r.schoolId === `id-${slug}`)
    .map((r) => `${r.kind}:${r.source}:${r.valueText}`)
    .sort();

describe('the validators', () => {
  it('accept the tiny files and reject broken ones', () => {
    expect(mdphdProgramsFileSchema.safeParse(programs()).success).toBe(true);
    expect(mstpFileSchema.safeParse(mstp()).success).toBe(true);
    const noProgramTimeline = programs();
    noProgramTimeline.schools[1] = { ...noProgramTimeline.schools[1]!, timeline: programs().schools[0]!.timeline };
    expect(mdphdProgramsFileSchema.safeParse(noProgramTimeline).success).toBe(false);
    const spaced = programs();
    spaced.schools[0]!.timeline!.pattern = '2 - 4 - 2';
    expect(mdphdProgramsFileSchema.safeParse(spaced).success).toBe(false);
    const http = programs();
    http.schools[0]!.url = 'http://alpha.edu/mdphd';
    expect(mdphdProgramsFileSchema.safeParse(http).success).toBe(false);
    const empty = programs();
    empty.schools[0]!.timeline = {
      ...empty.schools[0]!.timeline!,
      phases: [],
      totalYears: null,
      evidence: 'The page lists courses and nothing else.',
    };
    expect(mdphdProgramsFileSchema.safeParse(empty).success).toBe(false);
    const vet = mstp();
    vet.grants[0]!.title = 'Combined DVM-PhD Medical Scientist Training Program';
    expect(mstpFileSchema.safeParse(vet).success).toBe(false);
    const twice = mstp();
    twice.grants[1]!.slug = 'alpha';
    expect(mstpFileSchema.safeParse(twice).success).toBe(false);
  });

  it('refuses a grant for a school whose page says it has no program', () => {
    const bad = mstp();
    bad.grants[1]!.slug = 'beta';
    expect(() => mdphdRows(programs(), bad)).toThrow(/no program/);
  });
});

describe('importMdPhd', () => {
  it('writes the program, timeline and MSTP rows: PHD, cycle 0, each with its own source', async () => {
    const fake = setup();
    const sum = await importMdPhd(fake.prisma, programs(), mstp(), log);
    expect(sum).toMatchObject({ schools: 4, missingSchools: [], removed: 0 });
    expect(of(fake, 'alpha')).toEqual([
      'MDPHD_PROGRAM:SCHOOL_PAGE:YES',
      'MDPHD_TIMELINE:SCHOOL_PAGE:2-4-2',
      'MSTP_T32:NIH_REPORTER:LISTED',
    ]);
    // A school whose page shows no program: one row, no MSTP status.
    expect(of(fake, 'beta')).toEqual(['MDPHD_PROGRAM:SCHOOL_PAGE:NO']);
    // A program not in RePORTER is "not listed", dated.
    expect(of(fake, 'gamma')).toEqual(['MDPHD_PROGRAM:SCHOOL_PAGE:YES', 'MSTP_T32:NIH_REPORTER:NOT_LISTED']);
    // Known only from its grant: the program exists, sourced to RePORTER, with no timeline.
    expect(of(fake, 'delta')).toEqual(['MDPHD_PROGRAM:NIH_REPORTER:YES', 'MSTP_T32:NIH_REPORTER:LISTED']);
    expect(of(fake, 'omega')).toEqual([]);
    for (const r of facts(fake)) {
      expect(r.program).toBe('PHD');
      expect(r.cycleYear).toBe(0);
      expect(r.checkedOn).toEqual(new Date('2026-11-24T00:00:00Z'));
      expect(r.valueJson).not.toBeNull();
    }
    const t = facts(fake).find((r) => r.kind === 'MDPHD_TIMELINE')!;
    expect(t).toMatchObject({ valueNum: 8, note: 'Years 1-2 preclinical, years 3-6 PhD, years 7-8 clinical.' });
    expect((t.valueJson as { phases: unknown[] }).phases).toHaveLength(3);
    const listed = facts(fake).find((r) => r.kind === 'MSTP_T32' && r.schoolId === 'id-alpha')!;
    expect(listed).toMatchObject({ valueNum: 2026, sourceUrl: 'https://reporter.nih.gov/project-details/111' });
    expect(listed.valueJson).toMatchObject({ grant: 'T32GM000001', projectNum: '5T32GM000001-03' });
  });

  it('is idempotent, and removes what the files drop', async () => {
    const fake = setup();
    await importMdPhd(fake.prisma, programs(), mstp(), log);
    const before = JSON.stringify(facts(fake));
    await importMdPhd(fake.prisma, programs(), mstp(), log);
    expect(JSON.stringify(facts(fake))).toBe(before);
    const fewer = programs();
    fewer.schools[0]!.timeline = null;
    const sum = await importMdPhd(fake.prisma, fewer, mstp({ grants: [mstp().grants[0]!] }), log);
    // alpha's timeline, and delta's program and grant rows
    expect(sum.removed).toBe(3);
    expect(of(fake, 'alpha')).toEqual(['MDPHD_PROGRAM:SCHOOL_PAGE:YES', 'MSTP_T32:NIH_REPORTER:LISTED']);
    expect(of(fake, 'delta')).toEqual([]);
  });

  it('deletes only its own kinds and sources: AAMC, Admit and any other PHD row stay', async () => {
    const fake = setup();
    const other = (id: string, kind: string, source: string, program = 'REG') => ({
      id,
      schoolId: 'id-alpha',
      program,
      cycleYear: 0,
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
      other('admit-phd', 'MDPHD_PROGRAM', 'ADMIT', 'PHD'),
      other('profile', 'MSTP_T32', 'SCHOOL_PROFILE', 'PHD'),
    ];
    await importMdPhd(fake.prisma, programs(), mstp(), log);
    await importMdPhd(fake.prisma, programs({ schools: [] as never }), mstp({ grants: [] as never }), log);
    expect(
      facts(fake)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['aamc', 'admit', 'admit-phd', 'profile']);
  });

  it('removes nothing while a slug is unknown to the registry', async () => {
    const fake = setup();
    await importMdPhd(fake.prisma, programs(), mstp(), log);
    const n = facts(fake).length;
    fake.tables.medSchool = (fake.tables.medSchool as { slug: string }[]).filter((s) => s.slug !== 'delta');
    // gamma left the file, but delta is unknown: nothing is removed until the registry and the files agree.
    const sum = await importMdPhd(fake.prisma, programs({ schools: programs().schools.slice(0, 2) }), mstp(), log);
    expect(sum.missingSchools).toEqual(['delta']);
    expect(sum.removed).toBe(0);
    expect(facts(fake).length).toBe(n);
  });
});

describe('ensureMdPhdImported (worker bootstrap)', () => {
  const runs = (fake: ReturnType<typeof setup>) =>
    ((fake.tables.medSourceRun ?? []) as Array<{ job: string; status: string }>).filter((r) => r.job === MDPHD_JOB);

  it('imports a pair once per hash; a restart with the same files does nothing', async () => {
    const fake = setup();
    expect(await ensureMdPhdImported(fake.prisma, programs(), mstp(), log)).toBe('imported');
    expect(runs(fake).map((r) => r.status)).toEqual(['OK']);
    expect(await ensureMdPhdImported(fake.prisma, programs(), mstp(), log)).toBe('current');
    expect(runs(fake)).toHaveLength(1);
    expect(await ensureMdPhdImported(fake.prisma, programs(), mstp({ fetchedOn: '2026-12-01' }), log)).toBe('imported');
    expect(runs(fake)).toHaveLength(2);
  });

  it('an invalid file imports nothing and records no run', async () => {
    const fake = setup();
    expect(await ensureMdPhdImported(fake.prisma, { schools: 'nope' }, mstp(), log)).toBe('invalid');
    expect(runs(fake)).toHaveLength(0);
    expect(facts(fake)).toHaveLength(0);
  });

  it('the shipped files are valid and import (a slice: the fake database is quadratic)', async () => {
    const p = mdphdProgramsFileSchema.parse(programsShipped);
    const m = mstpFileSchema.parse(mstpShipped);
    const fake = createFakePrisma();
    fake.tables.medSchool = registry.map((s) => ({ id: `id-${s.slug}`, slug: s.slug }));
    const slice = { ...p, schools: p.schools.slice(0, 10) };
    const grants = { ...m, grants: m.grants.filter((g) => slice.schools.some((s) => s.slug === g.slug)) };
    expect(await ensureMdPhdImported(fake.prisma, slice, grants, log)).toBe('imported');
    expect(facts(fake).length).toBe(mdphdRows(slice, grants).length);
  });
});
