/**
 * Admit's curriculum row -> school facts (pure). Each published field becomes at most one fact: a normalised code where
 * the vocabulary is safe, the verbatim string always, and nothing at all for a field Admit leaves null (unknown is not
 * "no"). `internal_rank` is not selected by the query, so it cannot reach this file.
 */
import {
  normaliseClerkshipGrading,
  normalisePreclinicalGrading,
  normaliseShelfExams,
  parseYears,
  type CurriculumKindId,
} from '../../../engine/school-facts';
import type { z } from 'zod';
import type { curriculumRow } from './schemas';

export interface CurriculumFact {
  kind: CurriculumKindId;
  /** The normalised code (`P_F`, `YES`...); null when the kind has none (a length, the hospital list). */
  code: string | null;
  num: number | null;
  /** Admit's string exactly as sent (whitespace squashed), shown whenever the code cannot say it all. */
  verbatim: string | null;
}

export interface AdmitCurriculum {
  schoolKey: string;
  facts: CurriculumFact[];
}

const MAX_TEXT = 120;
const MAX_HOSPITALS = 12;
const clean = (s: string | null | undefined): string | null => {
  const v = (s ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return v === '' ? null : v.slice(0, MAX_TEXT);
};

export function mapCurriculumRow(row: z.output<typeof curriculumRow>): AdmitCurriculum {
  const facts: CurriculumFact[] = [];
  const yesno = (kind: CurriculumKindId, v: boolean | null) => {
    if (v !== null) facts.push({ kind, code: v ? 'YES' : 'NO', num: null, verbatim: null });
  };
  const pc = clean(row.pc_grades);
  if (pc)
    facts.push({
      kind: 'CURRICULUM_PRECLINICAL_GRADING',
      code: normalisePreclinicalGrading(pc),
      num: null,
      verbatim: pc,
    });
  const len = clean(row.pc_length);
  if (len) facts.push({ kind: 'CURRICULUM_PRECLINICAL_LENGTH', code: null, num: parseYears(len), verbatim: len });
  const clerk = clean(row.clerk_grades);
  if (clerk)
    facts.push({
      kind: 'CURRICULUM_CLERKSHIP_GRADING',
      code: normaliseClerkshipGrading(clerk),
      num: null,
      verbatim: clerk,
    });
  const shelf = clean(row.nbme_or_in_house);
  if (shelf)
    facts.push({ kind: 'CURRICULUM_SHELF_EXAMS', code: normaliseShelfExams(shelf), num: null, verbatim: shelf });
  yesno('CURRICULUM_MSPE', row.mspe);
  yesno('CURRICULUM_LECTURE_ATTENDANCE', row.lecture_attendance_required);
  yesno('AOA_CHAPTER', row.aoa);
  const hospitals = [...new Set((row.home_hospital ?? []).map(clean).filter((h): h is string => h !== null))].slice(
    0,
    MAX_HOSPITALS,
  );
  if (hospitals.length > 0)
    facts.push({ kind: 'HOME_HOSPITALS', code: null, num: null, verbatim: hospitals.join('; ') });
  return { schoolKey: row.school.slug, facts };
}
