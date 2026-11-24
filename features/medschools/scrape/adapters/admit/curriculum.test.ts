import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normaliseClerkshipGrading,
  normalisePreclinicalGrading,
  normaliseShelfExams,
  parseYears,
} from '../../../engine/school-facts';
import { ADMIT_GRAPHQL_PATH } from '../../sources';
import { createFakeHost, gqlKey } from '../../test-support';
import { AdmitResponseError, createAdmitClient } from './client';
import { SCHOOL_CURRICULUM } from './queries';

const body = readFileSync(join(__dirname, '__fixtures__', 'curriculum-all.json'), 'utf8');
const KEY = gqlKey(ADMIT_GRAPHQL_PATH, 'getAllSchoolCurriculum', {});

function setup(reply: string | null) {
  const fake = createFakeHost({ [KEY]: reply });
  const client = createAdmitClient(fake.host.session(), { secret: '' });
  return { ...fake, client };
}

describe('the curriculum query', () => {
  it('takes no arguments, never selects internal_rank, and is a read-only query', () => {
    expect(SCHOOL_CURRICULUM.operationName).toBe('getAllSchoolCurriculum');
    expect(SCHOOL_CURRICULUM.query).not.toContain('internal_rank');
    expect(SCHOOL_CURRICULUM.query.startsWith('query ')).toBe(true);
    expect(SCHOOL_CURRICULUM.variables).toEqual({});
  });
});

describe('fetchCurriculum, from the probe fixture', () => {
  it('makes one request and maps every valid row, dropping and counting the malformed ones', async () => {
    const t = setup(body);
    const { schools, malformedRows } = await t.client.fetchCurriculum();
    expect(t.requestedPosts).toHaveLength(1);
    expect(malformedRows).toBe(2);
    expect(schools.map((s) => s.schoolKey)).toEqual([
      'fixture-alpha',
      'fixture-bravo',
      'fixture-charlie',
      'fixture-delta',
      'fixture-echo',
      'fixture-foxtrot',
      'fixture-golf',
    ]);
  });

  it('keeps the code and the verbatim string, and a number only for a length it can read', async () => {
    const { schools } = await setup(body).client.fetchCurriculum();
    const by = (slug: string) =>
      Object.fromEntries(schools.find((s) => s.schoolKey === slug)!.facts.map((f) => [f.kind, f]));
    const alpha = by('fixture-alpha');
    expect(alpha.CURRICULUM_PRECLINICAL_GRADING).toMatchObject({ code: 'PASS_FAIL', verbatim: 'P/F' });
    expect(alpha.CURRICULUM_CLERKSHIP_GRADING).toMatchObject({ code: 'P_F', verbatim: 'P/F' });
    expect(alpha.CURRICULUM_PRECLINICAL_LENGTH).toMatchObject({ code: null, num: 1.5, verbatim: '1.5 Years' });
    expect(alpha.CURRICULUM_SHELF_EXAMS).toMatchObject({ code: 'BOTH', verbatim: 'Both' });
    expect(alpha.CURRICULUM_LECTURE_ATTENDANCE).toMatchObject({ code: 'YES' });
    expect(alpha.AOA_CHAPTER).toMatchObject({ code: 'NO' });
    expect(alpha.CURRICULUM_MSPE).toMatchObject({ code: 'NO' });
    expect(alpha.HOME_HOSPITALS!.verbatim!.split('; ')).toHaveLength(5);
    expect(alpha.HOME_HOSPITALS!.verbatim).toContain('Children’s');
    expect(by('fixture-bravo').CURRICULUM_CLERKSHIP_GRADING).toMatchObject({ code: 'H_HP_P_F' });
    // whitespace around a value is squashed, and the value still normalises
    expect(by('fixture-charlie').CURRICULUM_CLERKSHIP_GRADING).toMatchObject({ code: 'H_P_F', verbatim: 'H/P/F' });
    expect(by('fixture-charlie').CURRICULUM_SHELF_EXAMS).toMatchObject({ code: 'NBME', verbatim: 'NBME Based' });
    expect(by('fixture-delta').CURRICULUM_PRECLINICAL_GRADING).toMatchObject({ code: 'TIERED', verbatim: 'A/B/C/D/F' });
    expect(by('fixture-delta').CURRICULUM_CLERKSHIP_GRADING).toMatchObject({ code: 'OTHER', verbatim: 'H/HP/SP/MP/F' });
    expect(by('fixture-echo').CURRICULUM_PRECLINICAL_GRADING).toMatchObject({
      code: 'OTHER',
      verbatim: 'P, ID, IDP, IDF',
    });
    expect(by('fixture-foxtrot').CURRICULUM_CLERKSHIP_GRADING).toMatchObject({ code: 'OTHER', verbatim: 'H/S+/S/F' });
  });

  it('makes no fact for a field Admit leaves null: unknown is never "no"', async () => {
    const { schools } = await setup(body).client.fetchCurriculum();
    const golf = schools.find((s) => s.schoolKey === 'fixture-golf')!;
    expect(golf.facts.map((f) => f.kind)).toEqual(['CURRICULUM_PRECLINICAL_LENGTH']);
  });

  it('a reply with no valid row is a failure, never an empty table', async () => {
    const t = setup(JSON.stringify({ data: { getAllSchoolCurriculum: [{ nope: 1 }] } }));
    await expect(t.client.fetchCurriculum()).rejects.toBeInstanceOf(AdmitResponseError);
    await expect(setup(JSON.stringify({ data: {} })).client.fetchCurriculum()).rejects.toBeInstanceOf(
      AdmitResponseError,
    );
    await expect(setup(null).client.fetchCurriculum()).rejects.toBeInstanceOf(AdmitResponseError);
  });

  it('carries nothing person-shaped and no rank into a fact', async () => {
    const raw = JSON.parse(body) as { data: { getAllSchoolCurriculum: Record<string, unknown>[] } };
    raw.data.getAllSchoolCurriculum[0] = { ...raw.data.getAllSchoolCurriculum[0], internal_rank: 7 };
    const { schools } = await setup(JSON.stringify(raw)).client.fetchCurriculum();
    expect(JSON.stringify(schools)).not.toMatch(/internal_rank|rank/i);
  });
});

describe('normalisation', () => {
  it('preclinical: P/F, tiered, or other', () => {
    expect(normalisePreclinicalGrading('P/F')).toBe('PASS_FAIL');
    for (const v of ['H/P/F', 'H/HP/P/F', 'H/HP/P/BP/F', 'H/NH/P/F', 'A/B/C/D/F', 'A/B/C/F'])
      expect(normalisePreclinicalGrading(v), v).toBe('TIERED');
    for (const v of ['P, ID, IDP, IDF', 'S/SAR/US/W', '', 'Pass'])
      expect(normalisePreclinicalGrading(v), v).toBe('OTHER');
  });
  it('clerkship: only the three exact scales; the rest is other', () => {
    expect(normaliseClerkshipGrading('H/HP/P/F')).toBe('H_HP_P_F');
    expect(normaliseClerkshipGrading('H/P/F')).toBe('H_P_F');
    expect(normaliseClerkshipGrading('P/F')).toBe('P_F');
    for (const v of ['H/NH/HP/P/F', 'H/HP/LP/F', 'H/PF', 'A/B/C/F', 'H/HP/P/LP/F'])
      expect(normaliseClerkshipGrading(v), v).toBe('OTHER');
  });
  it('shelf exams and length', () => {
    expect(normaliseShelfExams('NBME Based')).toBe('NBME');
    expect(normaliseShelfExams('In-House Exams')).toBe('IN_HOUSE');
    expect(normaliseShelfExams('Both')).toBe('BOTH');
    expect(normaliseShelfExams('Something new')).toBe('OTHER');
    expect(parseYears('1 Year')).toBe(1);
    expect(parseYears('1.5 Years')).toBe(1.5);
    expect(parseYears('2 Years')).toBe(2);
    expect(parseYears('Varies')).toBeNull();
    expect(parseYears('99 Years')).toBeNull();
  });
});
