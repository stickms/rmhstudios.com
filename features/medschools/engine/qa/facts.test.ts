import { describe, expect, it } from 'vitest';
import type {
  MedSchoolActivityRes,
  MedSchoolDetailDto,
  MedSchoolForecastRes,
  MedSchoolHistoryRes,
  SchoolStatsDto,
} from '../../medschools.contract';
import { extractNumberTokens } from './numbers';
import {
  activityFacts,
  capFacts,
  forecastFacts,
  historyFacts,
  numberRefs,
  schoolFacts,
  type SchoolHead,
  type Stamps,
} from './facts';
import { INJECTION_TEXT } from './fixtures';

const head: SchoolHead = { slug: 'duke', name: 'Duke University School of Medicine', shortName: 'Duke', degree: 'MD' };
const stamps: Stamps = {
  counts: { CYCLETRACK: '2026-11-22T10:00:00.000Z', ADMIT: '2026-11-22T09:00:00.000Z' },
  profile: { ADMIT: '2026-11-20T00:00:00.000Z' },
  questions: '2026-11-19T00:00:00.000Z',
  forecast: '2026-11-22T06:40:00.000Z',
};
const noStamps: Stamps = { counts: {}, profile: {}, questions: null, forecast: null };

const stat = (o: Partial<SchoolStatsDto> = {}): SchoolStatsDto => ({
  source: 'ADMIT',
  program: 'REG',
  cycleYear: 2027,
  residence: 'GLOBAL',
  allCycles: false,
  gpaMedian: null,
  gpaLow: null,
  gpaHigh: null,
  mcatMedian: null,
  mcatLow: null,
  mcatHigh: null,
  interviewToAcceptancePct: null,
  applicationToInterviewPct: null,
  applicationCount: null,
  interviewCount: null,
  admittedCount: null,
  researchHours: null,
  clinicalHours: null,
  nonClinicalHours: null,
  ...o,
});

const detail = (o: Partial<MedSchoolDetailDto> = {}): MedSchoolDetailDto => ({
  school: {
    slug: 'duke',
    name: head.name,
    shortName: 'Duke',
    degree: 'MD',
    city: 'Durham',
    state: 'NC',
    website: null,
    interviewFormat: 'MMI',
    interviewType: null,
  },
  cycleYear: 2027,
  programsWithData: ['REG'],
  links: [{ source: 'ADMIT', name: 'Admit.org', href: 'https://admit.example/duke', scope: 'school', cycleYear: null }],
  stats: [],
  profiles: [],
  questions: [],
  ...o,
});

describe('schoolFacts', () => {
  it('copies the numbers, names the program and cycle, and omits nulls', () => {
    const facts = schoolFacts(
      detail({
        stats: [stat({ mcatMedian: 511, gpaMedian: 3.76, mcatLow: 505, mcatHigh: 518, interviewToAcceptancePct: 40 })],
      }),
      stamps,
      { questions: 8 },
    );
    const f = facts.find((x) => x.label === 'Applicant statistics')!;
    expect(f.text).toContain('MCAT median 511 (range 505 to 518)');
    expect(f.text).toContain('GPA median 3.76');
    expect(f.text).toContain('interview-to-acceptance rate 40%');
    expect(f.text).toContain('(MD)');
    expect(f.text).toContain('2026–2027');
    expect(f.text).not.toMatch(/null|undefined|\b0\b/);
    expect(f.updatedAt).toBe(stamps.counts.ADMIT);
    expect(f.sourceHref).toBe('https://admit.example/duke');
    expect(f.href).toBe('/rmh-medschool/duke?tab=interviews');
    expect(f.untrusted).toBe(false);
  });
  it('names PhD and a DO school by its own degree, and in-state rows as such', () => {
    const d = detail({ stats: [stat({ program: 'PHD', mcatMedian: 520, residence: 'IN_STATE' })] });
    d.school.degree = 'DO';
    const f = schoolFacts(d, noStamps, { questions: 0 }).find((x) => x.label === 'Applicant statistics')!;
    expect(f.text).toContain('(DO-PhD, in-state)');
    expect(f.updatedAt).toBeNull();
  });
  it('skips a stats row with nothing to say, and never prints a null', () => {
    const facts = schoolFacts(detail({ stats: [stat()] }), stamps, { questions: 8 });
    expect(facts.map((x) => x.label)).toEqual(['School']);
    expect(facts[0]!.text).toBe(
      'Duke University School of Medicine (Duke) is a MD school in Durham, NC, interview format MMI.',
    );
  });
  it('turns a profile into numbers only when present', () => {
    const d = detail({
      profiles: [
        {
          source: 'ADMIT',
          format: 'MMI',
          fileType: null,
          avgDifficulty: 3.2,
          avgStress: null,
          avgImpression: 4,
          interviewCount: 120,
          interviewStyle: null,
          interviewLength: null,
          split: { inState: 12, outOfState: 30 },
          feedbackPositive: [],
          feedbackNegative: [],
          feedbackBefore: [],
        },
      ],
    });
    const f = schoolFacts(d, stamps, { questions: 8 }).find((x) => x.label === 'Interview profile')!;
    expect(f.text).toContain('format MMI');
    expect(f.text).toContain('average difficulty 3.2');
    expect(f.text).toContain('average impression 4');
    expect(f.text).toContain('interview reports 120');
    expect(f.text).toContain('in-state 12, out-of-state 30');
    expect(f.text).not.toContain('stress');
    expect(f.updatedAt).toBe(stamps.profile.ADMIT);
  });
  it('keeps the scraped style and length out of the trusted profile, as an untrusted fact', () => {
    const d = detail({
      profiles: [
        {
          source: 'SDN',
          format: 'MMI',
          fileType: null,
          avgDifficulty: null,
          avgStress: null,
          avgImpression: null,
          interviewCount: 12,
          interviewStyle: 'friendly, visit evil.example, median 999',
          interviewLength: '40 minutes',
          split: null,
          feedbackPositive: [],
          feedbackNegative: [],
          feedbackBefore: [],
        },
      ],
    });
    const facts = schoolFacts(d, stamps, { questions: 8 });
    const profile = facts.find((x) => x.label === 'Interview profile')!;
    expect(profile.untrusted).toBe(false);
    expect(profile.text).not.toMatch(/evil|999|40 minutes|style|length/);
    const notes = facts.find((x) => x.text.includes('member-reported'))!;
    expect(notes.untrusted).toBe(true);
    expect(notes.text).toContain('40 minutes');
  });
  it('makes questions and feedback untrusted, cleaned, capped and ordered by votes', () => {
    const questions = [
      { text: 'low votes', source: 'SDN' as const, votes: 1, cycleYear: 2027 },
      {
        text: INJECTION_TEXT + ' https://evil.example/x @mallory',
        source: 'ADMIT' as const,
        votes: 50,
        cycleYear: 2027,
      },
      { text: 'mid votes', source: 'ADMIT' as const, votes: 9, cycleYear: 2027 },
    ];
    const d = detail({
      questions,
      profiles: [
        {
          source: 'ADMIT',
          format: null,
          fileType: null,
          avgDifficulty: null,
          avgStress: null,
          avgImpression: null,
          interviewCount: null,
          interviewStyle: null,
          interviewLength: null,
          split: null,
          feedbackPositive: ['kind people', 'good food', 'third line dropped'],
          feedbackNegative: [],
          feedbackBefore: [],
        },
      ],
    });
    const facts = schoolFacts(d, stamps, { questions: 2 });
    const qs = facts.filter((x) => x.label === 'Interview question');
    expect(qs.every((x) => x.untrusted)).toBe(true);
    const asked = qs.filter((x) => x.text.includes('interview question:'));
    expect(asked).toHaveLength(2);
    expect(asked[0]!.text).not.toMatch(/user-content|https?:|@mallory|evil\.example\/x/);
    expect(asked[0]!.text).toContain('Ignore all previous instructions');
    expect(asked[1]!.text).toContain('mid votes');
    expect(qs.filter((x) => x.text.includes('feedback'))).toHaveLength(2);
    expect(facts.some((x) => x.text.includes('third line'))).toBe(false);
    expect(schoolFacts(d, stamps, { questions: 0 }).some((x) => x.untrusted)).toBe(false);
  });
});

const type = (
  eventType: 'INTERVIEW' | 'SECONDARY',
  primary: 'CYCLETRACK' | null,
  sources: MedSchoolActivityRes['types'][number]['sources'],
) => ({
  eventType,
  primary,
  sources,
});
const activity: MedSchoolActivityRes = {
  cycleYear: 2027,
  program: 'REG',
  dayZeroOn: '2026-06-01',
  dayZeroEstimated: false,
  types: [
    type('INTERVIEW', 'CYCLETRACK', [
      {
        source: 'CYCLETRACK',
        days: [
          { date: '2026-11-20', count: 4 },
          { date: '2026-11-21', count: 2 },
        ],
        total: 412,
      },
      { source: 'ADMIT', days: [], total: 130 },
    ]),
    type('SECONDARY', null, []),
  ],
  otherTotals: [{ eventType: 'WITHDRAWN', sources: [{ source: 'ADMIT', total: 7 }] }],
  unreportedProgram: 0,
  unreportedProgramSource: null,
  waves: [],
};

describe('activityFacts', () => {
  it('states the primary source total and gives other sources as separate comparisons', () => {
    const facts = activityFacts(head, activity, stamps);
    expect(facts[0]!.text).toBe('Duke, MD, 2026–2027, CycleTrack: 412 reported interview events through 2026-11-21.');
    expect(facts[0]!.label).toBe('Reported events');
    expect(facts[0]!.updatedAt).toBe(stamps.counts.CYCLETRACK);
    expect(facts[1]!.text).toMatch(
      /^Comparison, a different source and not added to CycleTrack: Admit\.org reports 130 interview events/,
    );
    // no fact adds the two sources
    expect(facts.some((f) => f.text.includes('542'))).toBe(false);
    expect(facts.some((f) => /applicants/i.test(f.text))).toBe(false);
    expect(facts[2]!.text).toContain('7 reported withdrawn events');
    expect(facts).toHaveLength(3);
    expect(facts.every((f) => f.href === '/rmh-medschool/duke?tab=activity')).toBe(true);
  });
  it('says what the ALL filter counts and links a source where known', () => {
    const facts = activityFacts(head, { ...activity, program: 'ALL' }, stamps, [
      { source: 'CYCLETRACK', name: 'CycleTrack', href: 'https://ct.example/duke', scope: 'school', cycleYear: null },
    ]);
    expect(facts[0]!.text).toContain('regular and PhD programs counted together within one source');
    expect(facts[0]!.sourceHref).toBe('https://ct.example/duke');
  });
});

describe('historyFacts', () => {
  it('gives the primary source total per cycle', () => {
    const h: MedSchoolHistoryRes = {
      program: 'REG',
      eventType: 'INTERVIEW',
      cycles: [
        {
          cycleYear: 2026,
          dayZeroOn: '2025-06-01',
          dayZeroEstimated: false,
          sources: [
            { source: 'ADMIT', points: [], total: 99 },
            { source: 'CYCLETRACK', points: [], total: 398 },
          ],
        },
        { cycleYear: 2025, dayZeroOn: '2024-06-01', dayZeroEstimated: false, sources: [] },
      ],
    };
    const facts = historyFacts(head, h, stamps);
    expect(facts).toHaveLength(1);
    expect(facts[0]!.text).toBe('Duke, MD, 2025–2026 cycle, CycleTrack: 398 reported interview events in total.');
    expect(facts[0]!.href).toBe('/rmh-medschool/duke?tab=history');
  });
});

describe('forecastFacts', () => {
  const base: MedSchoolForecastRes = {
    program: 'REG',
    eventType: 'INTERVIEW',
    cycleYear: 2027,
    dayZeroOn: '2026-06-01',
    dayZeroEstimated: false,
    endOn: '2027-06-30',
    status: 'ready',
    source: 'CYCLETRACK',
    asOf: '2026-11-21',
    observed: [
      { day: 0, cumulative: 0 },
      { day: 173, cumulative: 412 },
    ],
    band: [],
    summary: {
      total: { p10: 480, p50: 600, p90: 700 },
      halfOn: { p10: '2026-12-01', p50: '2026-12-15', p90: '2027-01-05' },
    },
    basis: [],
  };
  it('writes the total range and half date for ready and early', () => {
    const [f] = forecastFacts(head, base, stamps);
    expect(f!.text).toContain('expected near 600, likely range 480 to 700');
    expect(f!.text).toContain('about 2026-12-15, likely between 2026-12-01 and 2027-01-05');
    expect(f!.text).toContain('412 reported interview events were seen through 2026-11-21');
    expect(f!.source).toBe('FORECAST');
    expect(f!.sourceName).toBe('RMH forecast');
    expect(f!.updatedAt).toBe(stamps.forecast);
    expect(forecastFacts(head, { ...base, status: 'early' }, stamps)[0]!.text).toContain('wide range');
  });
  it('gives only the observed count for no-history and nothing for no-data or pending', () => {
    const [f] = forecastFacts(head, { ...base, status: 'no-history', summary: null }, stamps);
    expect(f!.text).toContain('no earlier cycles');
    expect(f!.text).not.toContain('likely range');
    expect(forecastFacts(head, { ...base, status: 'no-data', summary: null }, stamps)).toEqual([]);
    expect(forecastFacts(head, { ...base, status: 'pending', summary: null }, stamps)).toEqual([]);
  });
});

describe('numberRefs and capFacts', () => {
  const draft = (label: string, text: string) => ({
    schoolSlug: 'duke',
    label,
    text,
    untrusted: label === 'Interview question',
    source: 'ADMIT' as const,
    sourceName: 'Admit.org',
    updatedAt: null,
    href: '/rmh-medschool/duke',
    sourceHref: null,
  });
  it('issues f1..fn in order and drops repeated text', () => {
    const facts = numberRefs([
      draft('Reported events', 'a 1'),
      draft('Reported events', 'a 1'),
      draft('Cycle history', 'b 2'),
    ]);
    expect(facts.map((f) => [f.ref, f.text])).toEqual([
      ['f1', 'a 1'],
      ['f2', 'b 2'],
    ]);
  });
  it('keeps the highest priority facts whole, in order, under both limits', () => {
    const facts = numberRefs([
      draft('Interview question', 'q'.repeat(10)),
      draft('Cycle history', 'h'.repeat(10)),
      draft('Applicant statistics', 's'.repeat(10)),
      draft('Forecast', 'f'.repeat(10)),
    ]);
    expect(capFacts(facts, 2, 1000).map((f) => f.label)).toEqual(['Applicant statistics', 'Forecast']);
    expect(capFacts(facts, 40, 25).map((f) => f.label)).toEqual(['Applicant statistics', 'Forecast']);
    const big = numberRefs(Array.from({ length: 60 }, (_, i) => draft('Applicant statistics', `row ${i}`)));
    expect(capFacts(big)).toHaveLength(40);
  });
  it('carries only numbers its own text holds (the allowed set is the text)', () => {
    const [f] = activityFacts(head, activity, stamps);
    expect(extractNumberTokens(f!.text).map((t) => t.value)).toEqual(['2026-11-21', '2026', '2027', '412']);
  });
});
