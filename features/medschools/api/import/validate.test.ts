import { describe, expect, it } from 'vitest';
import { promptText } from './extract.server';
import { validateImport, type AliasIndex, type ImportSchool } from './validate';

const NOW = new Date('2026-11-23T15:00:00Z');
const school = (slug: string, name: string, shortName: string, degree: 'MD' | 'DO' = 'MD'): ImportSchool => ({
  slug,
  name,
  shortName,
  state: 'MA',
  interviewFormat: null,
  degree,
});
const DIR = [
  school('harvard', 'Harvard Medical School', 'Harvard'),
  school('johns-hopkins', 'Johns Hopkins University School of Medicine', 'Johns Hopkins'),
  school('kcu-com', 'Kansas City University College of Osteopathic Medicine', 'KCU-COM', 'DO'),
  // two schools sharing a short name: ambiguous by name alone
  school('rowan-do', 'Rowan-Virtua School of Osteopathic Medicine', 'Rowan', 'DO'),
  school('rowan-md', 'Cooper Medical School of Rowan University', 'Rowan'),
];
const ALIASES: AliasIndex = new Map([['hopkins', ['johns-hopkins']], ['u of x', ['harvard', 'johns-hopkins']]]);

const TEXT = [
  'School | Program | Submitted | Complete | Secondary received | Interview | Decision',
  'Harvard Medical School | MD | 2026-06-12 | 2026-07-08 | 2026-07-20 | 2026-10-05 | Accepted 2026-12-15',
  'Johns Hopkins | MD | 6/12 | 7/9',
  'Hopkins | MD-PhD | June 15',
  'Why medicine? When I was a child I watched my grandmother tend her garden.',
].join('\n');

const run = (rows: unknown[], over: { text?: string; cycleHint?: number | null; now?: Date } = {}) =>
  validateImport({ rows, cycleHint: over.cycleHint ?? null }, { text: over.text ?? TEXT, dir: DIR, aliases: ALIASES, now: over.now ?? NOW });

const ms = (type: string, date: string | null, raw: string) => ({ type, date, raw });

describe('validateImport: dates are grounded', () => {
  it('keeps a date whose quote is in the text and says the date', () => {
    const v = run([
      { schoolName: 'Harvard Medical School', program: 'MD', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12'), ms('SECONDARY', '2026-07-20', '2026-07-20')] },
    ]);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]!.milestones.map((m) => [m.type, m.date, m.yearInferred])).toEqual([
      ['SUBMITTED', '2026-06-12', false],
      ['SECONDARY', '2026-07-20', false],
    ]);
    expect(v.cycleYear).toBe(2027);
    expect(v.cycleFrom).toBe('dates');
    expect(v.dropped).toBe(0);
  });

  it('drops an invented date: the quote is not in the file', () => {
    const v = run([{ schoolName: 'Harvard Medical School', program: 'MD', milestones: [ms('INTERVIEW', '2026-10-30', '2026-10-30'), ms('SUBMITTED', '2026-06-12', '2026-06-12')] }]);
    expect(v.rows[0]!.milestones.map((m) => m.type)).toEqual(['SUBMITTED']);
    expect(v.dropped).toBe(1);
  });

  it('drops an invented date that rides on a real quote that does not say it (a header cell)', () => {
    const v = run([{ schoolName: 'Harvard Medical School', program: 'MD', milestones: [ms('COMPLETE', '2026-09-09', 'Complete'), ms('SUBMITTED', '2026-06-12', '2026-06-12')] }]);
    expect(v.rows[0]!.milestones.map((m) => m.type)).toEqual(['SUBMITTED']);
    expect(v.dropped).toBe(1);
  });

  it('a quote that writes another year than the date does is dropped', () => {
    const v = run([{ schoolName: 'Harvard Medical School', program: 'MD', milestones: [ms('SUBMITTED', '2025-06-12', '2026-06-12')] }]);
    expect(v.rows).toHaveLength(0);
    expect(v.dropped).toBe(1);
  });

  it('drops a null date, an unreal day, an unknown type and a missing quote', () => {
    const v = run([
      {
        schoolName: 'Harvard Medical School',
        milestones: [
          ms('SUBMITTED', null, '2026-06-12'),
          ms('COMPLETE', '2026-02-30', '2026-07-08'),
          ms('ESSAY', '2026-07-08', '2026-07-08'),
          { type: 'SECONDARY', date: '2026-07-20' },
          ms('INTERVIEW', '2026-10-05', '2026-10-05'),
        ],
      },
    ]);
    expect(v.rows[0]!.milestones.map((m) => m.type)).toEqual(['INTERVIEW']);
    expect(v.dropped).toBe(4);
  });

  it('a date outside the cycle window is dropped', () => {
    const v = run(
      [{ schoolName: 'Harvard Medical School', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12'), ms('REJECTION', '2024-01-05', '2024-01-05')] }],
      { text: `${TEXT}\nRejected 2024-01-05` },
    );
    expect(v.rows[0]!.milestones.map((m) => m.type)).toEqual(['SUBMITTED']);
    expect(v.dropped).toBe(1);
  });

  it('a date in the future is dropped', () => {
    const v = run(
      [{ schoolName: 'Harvard Medical School', milestones: [ms('INTERVIEW', '2027-02-10', '2027-02-10'), ms('SUBMITTED', '2026-06-12', '2026-06-12')] }],
      { text: `${TEXT}\nInterview 2027-02-10` },
    );
    expect(v.rows[0]!.milestones.map((m) => m.type)).toEqual(['SUBMITTED']);
  });
});

describe('validateImport: the year a file leaves out', () => {
  it('is chosen by the cycle rules and flagged', () => {
    const v = run([
      { schoolName: 'Johns Hopkins', program: 'MD', milestones: [ms('SUBMITTED', '2024-06-12', '6/12'), ms('COMPLETE', '2030-07-09', '7/9')] },
      { schoolName: 'Harvard Medical School', program: 'MD', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12')] },
    ]);
    const hop = v.rows.find((r) => r.school?.slug === 'johns-hopkins')!;
    // the model's years (2024, 2030) are not used: the cycle (2027, from Harvard's dated row) decides
    expect(hop.milestones.map((m) => [m.date, m.yearInferred])).toEqual([
      ['2026-06-12', true],
      ['2026-07-09', true],
    ]);
  });

  it('a January decision belongs to the cycle ending that year; a December one to the cycle before', () => {
    const jan = run([{ schoolName: 'Harvard Medical School', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12'), ms('WAITLIST', '2020-01-20', 'Jan 20')] }], { text: `${TEXT}\nJan 20`, now: new Date('2027-03-01T00:00:00Z') });
    expect(jan.rows[0]!.milestones.find((m) => m.type === 'WAITLIST')!.date).toBe('2027-01-20');
    const dec = run([{ schoolName: 'Harvard Medical School', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12'), ms('ACCEPTANCE', '2020-12-15', 'Dec 15')] }], { text: `${TEXT}\nDec 15`, now: new Date('2027-03-01T00:00:00Z') });
    expect(dec.rows[0]!.milestones.find((m) => m.type === 'ACCEPTANCE')!.date).toBe('2026-12-15');
  });

  it('with no year anywhere the model\'s hint decides, else the current cycle', () => {
    const rows = [{ schoolName: 'Johns Hopkins', milestones: [ms('SUBMITTED', '2000-06-12', '6/12')] }];
    expect(run(rows, { cycleHint: 2026, text: 'Johns Hopkins | 6/12' })).toMatchObject({ cycleYear: 2026, cycleFrom: 'hint' });
    expect(run(rows, { text: 'Johns Hopkins | 6/12' })).toMatchObject({ cycleYear: 2027, cycleFrom: 'default' });
    expect(run(rows, { cycleHint: 1990, text: 'Johns Hopkins | 6/12' })).toMatchObject({ cycleYear: 2027, cycleFrom: 'default' });
  });

  it('flags a numeric date that reads two ways, and not an ISO or a named one', () => {
    const v = run([{ schoolName: 'Johns Hopkins', milestones: [ms('SUBMITTED', '2026-06-12', '6/12'), ms('COMPLETE', '2026-07-09', '7/9'), ms('SECONDARY', '2026-07-20', '2026-07-20')] }], {
      text: 'Johns Hopkins | 6/12 | 7/9 | 2026-07-20\nHarvard 2026-07-20',
    });
    expect(v.rows[0]!.milestones.map((m) => [m.type, m.ambiguous])).toEqual([
      ['SUBMITTED', true],
      ['COMPLETE', true],
      ['SECONDARY', false],
    ]);
  });
});

describe('validateImport: schools are resolved by the server', () => {
  it('matches by name, short name and alias, and flags what it cannot match', () => {
    const v = run([
      { schoolName: 'Harvard Medical School', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12')] },
      { schoolName: 'Hopkins', program: 'MD-PhD', milestones: [ms('SUBMITTED', '2026-06-15', 'June 15')] },
      { schoolName: 'Springfield Academy of Healing', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12')] },
      { schoolName: 'Rowan', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12')] },
      { schoolName: 'U of X', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12')] },
    ]);
    const by = (name: string) => v.rows.find((r) => r.schoolName === name)!;
    expect(by('Harvard Medical School').school?.slug).toBe('harvard');
    expect(by('Hopkins').school?.slug).toBe('johns-hopkins');
    expect(by('Hopkins').program).toBe('PHD');
    // not in the directory, shared by two schools, an alias of two schools: all "couldn't match"
    expect(by('Springfield Academy of Healing').school).toBeNull();
    expect(by('Rowan').school).toBeNull();
    expect(by('U of X').school).toBeNull();
  });

  it('never uses a slug or an id the model supplies', () => {
    const v = run([{ schoolName: 'Springfield Academy of Healing', slug: 'harvard', schoolId: 'x', school: { slug: 'harvard' }, milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12')] }]);
    expect(v.rows[0]!.school).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"harvard"');
  });

  it('merges the same school and program, keeping the first date of a type', () => {
    const v = run([
      { schoolName: 'Harvard Medical School', program: 'MD', milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12')] },
      { schoolName: 'Harvard', program: 'MD', milestones: [ms('SUBMITTED', '2026-07-08', '2026-07-08'), ms('COMPLETE', '2026-07-08', '2026-07-08')] },
    ]);
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]!.milestones.map((m) => [m.type, m.date])).toEqual([
      ['SUBMITTED', '2026-06-12'],
      ['COMPLETE', '2026-07-08'],
    ]);
  });

  it('a row with no surviving date is not a row', () => {
    expect(run([{ schoolName: 'Harvard Medical School', milestones: [ms('SUBMITTED', '2026-09-09', 'made up')] }]).rows).toEqual([]);
  });
});

describe('validateImport: essay text and junk never come out', () => {
  const ESSAY = 'When I was a child I watched my grandmother tend her garden';
  it('the output holds no `notes`, no essay, and the quote is cut to 40 characters', () => {
    const v = run([
      {
        schoolName: 'Harvard Medical School',
        notes: ESSAY,
        milestones: [ms('SUBMITTED', '2026-06-12', '2026-06-12'), ms('COMPLETE', '2026-07-08', `${ESSAY} 2026-07-08 and more words after it`)],
      },
    ], { text: `${TEXT}\n${ESSAY} 2026-07-08 and more words after it` });
    const out = JSON.stringify(v);
    expect(out).not.toContain('grandmother');
    expect(out).not.toContain('notes');
    for (const m of v.rows[0]!.milestones) expect(m.from.length).toBeLessThanOrEqual(40);
  });

  it('a quote over 80 characters is refused outright', () => {
    const long = `${ESSAY} 2026-07-08 ${'x'.repeat(60)}`;
    const v = run([{ schoolName: 'Harvard Medical School', milestones: [ms('COMPLETE', '2026-07-08', long)] }], { text: `${TEXT}\n${long}` });
    expect(v.rows).toEqual([]);
  });

  it('survives garbage from the model', () => {
    for (const bad of [null, 'text', 42, [], {}, { rows: 'x' }, { rows: [null, 3, 'a', { milestones: 5 }] }]) {
      expect(validateImport(bad, { text: TEXT, dir: DIR, aliases: ALIASES, now: NOW }).rows).toEqual([]);
    }
  });
});

describe('promptText', () => {
  it('cleans each line and keeps the rows apart', () => {
    const r = promptText('Harvard | 6/12   https://x.example/a \n\n @someone​ | 7/9');
    expect(r.text).toBe('Harvard | 6/12\n| 7/9');
    expect(r.truncated).toBe(false);
  });
});
