/**
 * School facts: dated, sourced figures about a school's admissions that are the same for every applicant (does it take
 * out-of-state applicants, when is the deposit due, what does it cost). Pure and client-safe: the importer, the public
 * endpoint and the school page all read the same catalogue, so a kind means one thing everywhere.
 *
 * Sources: Admit.org's curriculum table, the MD-PhD program pages and RePORTER, each school's own class profile
 * (`PROFILE_KINDS`, below), and the AAMC MSAR "Reports for Applicants and Advisors" (`AAMC_MSAR_REPORT`). The owner states
 * that RMH has AAMC's permission to use what is on that page (2026-11-24), and the PDFs say they "may be reproduced and
 * distributed with attribution for individual, educational, and noncommercial purposes only", so every figure carries its
 * source line (`factSourceLine`) with a link to the page. It is NOT the MSAR school profiles (mec.aamc.org/msar-ui),
 * which are not covered and are never fetched. These reports cover MD (AMCAS) schools only.
 *
 * Reading rule (plan section 4): one value per kind and school; a missing kind is "Not published", never a blank, and
 * nothing is averaged or summed across sources.
 */

export const MSAR_PAGE_URL =
  'https://students-residents.aamc.org/medical-school-admission-requirements/medical-school-admission-requirements-reports-applicants-and-advisors';

export const FACT_SOURCES = ['AAMC_MSAR_REPORT', 'SCHOOL_PROFILE', 'ADMIT', 'SCHOOL_PAGE', 'NIH_REPORTER'] as const;
export type FactSourceId = (typeof FACT_SOURCES)[number];

/** The reports structured so far, by AAMC media id, with the name the AAMC page gives each link. */
export const MSAR_REPORTS = {
  6996: 'Applications Accepted Information',
  7031: 'DACA Policies',
  7036: 'Latest and Oldest MCAT Test Administration Dates Considered',
  7046: 'PREview Exam Policies',
  7026: 'Letter of Evaluation Preferences',
  15766: 'Community College Coursework Information',
  7011: 'Secondary Application Information',
  7051: 'Interview Policies',
  7056: 'Waitlist Procedures',
  7066: 'Deposit Due Date',
  7071: 'Tuition, Fees and Insurance Information',
  7061: 'Debt Information',
} as const;
export type MsarReportId = keyof typeof MSAR_REPORTS;
export const MSAR_REPORT_IDS = Object.keys(MSAR_REPORTS).map(Number) as MsarReportId[];

export const msarReportUrl = (id: number): string =>
  `https://students-residents.aamc.org/media/${id}/download?attachment`;

/**
 * How a fact's value is held.
 *  - `accepts`: code YES | NO | CASE_BY_CASE (the report's green tick, red cross and yellow dot).
 *  - `yesno`: code YES | NO.
 *  - `letter`: code ACCEPTED | PREFERRED | NOT_ACCEPTED (the Letter of Evaluation report's own legend).
 *  - `preview`: code NOT_USED | EXPLORING | RECOMMENDED | REQUIRED | SJT_ACCEPTED, with the school's sentence in text.
 *  - `date`: code YYYY-MM-DD or YYYY-MM (a month, when the report gives no day), the printed text beside it.
 *  - `usd` / `percent`: num, the printed text beside it.
 *  - `text`: the school's own words, verbatim.
 */
export type FactType = 'accepts' | 'yesno' | 'letter' | 'preview' | 'date' | 'usd' | 'percent' | 'text';

export const FACT_CODES = {
  accepts: ['YES', 'NO', 'CASE_BY_CASE'],
  yesno: ['YES', 'NO'],
  letter: ['ACCEPTED', 'PREFERRED', 'NOT_ACCEPTED'],
  preview: ['NOT_USED', 'EXPLORING', 'RECOMMENDED', 'REQUIRED', 'SJT_ACCEPTED'],
} as const;

export interface FactKindSpec {
  report: MsarReportId;
  type: FactType;
  /** The column or row heading in the report, used as the row label. */
  label: string;
}

export const FACT_KINDS = {
  ACCEPTS_OUT_OF_STATE: { report: 6996, type: 'accepts', label: 'Out-of-state applicants' },
  ACCEPTS_CANADIAN: { report: 6996, type: 'accepts', label: 'Canadian applicants' },
  ACCEPTS_INTERNATIONAL: { report: 6996, type: 'accepts', label: 'International applicants' },
  ACCEPTS_DACA: { report: 6996, type: 'accepts', label: 'DACA status applicants' },
  DACA_DETAILS: { report: 7031, type: 'text', label: 'DACA details' },
  MCAT_LATEST: { report: 7036, type: 'date', label: 'Latest MCAT date considered' },
  MCAT_OLDEST: { report: 7036, type: 'date', label: 'Oldest MCAT date considered' },
  PREVIEW_POLICY: { report: 7046, type: 'preview', label: 'PREview' },
  LETTER_COMMITTEE: { report: 7026, type: 'letter', label: 'Committee letter' },
  LETTER_PACKETS: { report: 7026, type: 'letter', label: 'Letter packets' },
  LETTER_INDIVIDUAL: { report: 7026, type: 'letter', label: 'Individual letters' },
  CC_UPWARD_TRANSFER: { report: 15766, type: 'yesno', label: 'Community college: upward transfer coursework' },
  CC_ACCELERATED: { report: 15766, type: 'yesno', label: 'Community college: accelerated coursework' },
  CC_SUPPLEMENTAL: { report: 15766, type: 'yesno', label: 'Community college: supplemental coursework' },
  CC_INFO: { report: 15766, type: 'text', label: 'Community college coursework' },
  SECONDARY_REQUIRED: { report: 7011, type: 'yesno', label: 'Secondary application required' },
  SECONDARY_FEE: { report: 7011, type: 'usd', label: 'Secondary application fee' },
  SECONDARY_SENT_TO: { report: 7011, type: 'text', label: 'Secondary sent to' },
  SECONDARY_FEE_WAIVER: { report: 7011, type: 'yesno', label: 'Secondary fee waiver available' },
  SECONDARY_DEADLINE: { report: 7011, type: 'text', label: 'Secondary deadline' },
  INTERVIEW_FORMAT: { report: 7051, type: 'text', label: 'Interview format' },
  INTERVIEW_INVITATIONS: { report: 7051, type: 'text', label: 'Interview invitations sent' },
  INTERVIEW_DAY: { report: 7051, type: 'text', label: 'Typical interview day' },
  INTERVIEW_REGIONAL: { report: 7051, type: 'text', label: 'Regional interviews' },
  INTERVIEW_VIDEO: { report: 7051, type: 'text', label: 'Video interview' },
  WAITLIST_POSITIONS: { report: 7056, type: 'text', label: 'Typical number of waitlist positions' },
  WAITLIST_OFFERS: { report: 7056, type: 'text', label: 'Number of acceptance offers from the waitlist' },
  WAITLIST_PROCEDURES: { report: 7056, type: 'text', label: 'Waitlist procedures' },
  DEPOSIT_IN_STATE: { report: 7066, type: 'usd', label: 'In-state deposit' },
  DEPOSIT_OUT_OF_STATE: { report: 7066, type: 'usd', label: 'Out-of-state deposit' },
  DEPOSIT_REQUIRED: { report: 7066, type: 'yesno', label: 'Deposit required' },
  DEPOSIT_REFUNDABLE_BY: { report: 7066, type: 'date', label: 'Deposit refundable by' },
  DEPOSIT_DUE: { report: 7066, type: 'date', label: 'Deposit due' },
  DEPOSIT_REFUNDABLE: { report: 7066, type: 'yesno', label: 'Deposit refundable' },
  DEPOSIT_APPLIED_TO_TUITION: { report: 7066, type: 'yesno', label: 'Deposit applied to tuition' },
  COA_IN_STATE: { report: 7071, type: 'usd', label: 'Total cost of attendance, in-state' },
  TUITION_IN_STATE: { report: 7071, type: 'usd', label: 'Tuition and fees, in-state' },
  INSURANCE_IN_STATE: { report: 7071, type: 'usd', label: 'Health insurance, in-state' },
  COA_OUT_OF_STATE: { report: 7071, type: 'usd', label: 'Total cost of attendance, out-of-state' },
  TUITION_OUT_OF_STATE: { report: 7071, type: 'usd', label: 'Tuition and fees, out-of-state' },
  INSURANCE_OUT_OF_STATE: { report: 7071, type: 'usd', label: 'Health insurance, out-of-state' },
  DEBT_AID_PERCENT: { report: 7061, type: 'percent', label: 'Students receiving aid' },
  DEBT_AVERAGE: { report: 7061, type: 'usd', label: 'Average graduate indebtedness' },
} as const satisfies Record<string, FactKindSpec>;
export type FactKindId = keyof typeof FACT_KINDS;
export const FACT_KIND_IDS = Object.keys(FACT_KINDS) as FactKindId[];

export const isFactKind = (v: unknown): v is FactKindId => typeof v === 'string' && v in FACT_KINDS;

/** The 2027 entering class is the 2026-2027 application cycle. */
export const factCycleLabel = (cycleYear: number): string => `${cycleYear} entering class`;

/** The PDF's own source line when the schools did not provide the figures themselves. */
const SCHOOLS_THEMSELVES = /^Information provided directly by individual medical schools\.?$/;

/**
 * The attribution line every figure carries. `pdfSource` is the report's own "Source:" line; it is appended when it is not
 * the schools themselves (tuition: the Tuition and Student Fees Survey, academic year 2024-2025).
 */
export function factSourceLine(report: string, cycleYear: number, pdfSource: string | null = null): string {
  const base = `Source: AAMC MSAR Report for Applicants and Advisors, ${factCycleLabel(cycleYear)}, ${report}`;
  return pdfSource && !SCHOOLS_THEMSELVES.test(pdfSource.trim()) ? `${base} (${pdfSource.replace(/\.$/, '')})` : base;
}

/**
 * The curriculum facts of Admit.org's `getAllSchoolCurriculum` (source `ADMIT`). Not part of an AAMC report, so they are
 * a catalogue of their own: no report id, and the entering class does not apply (`CURRICULUM_CYCLE`). A kind is held as
 *  - `grading`: code from `PRECLINICAL_GRADING_CODES` or `CLERKSHIP_GRADING_CODES`, the verbatim string in `printed`;
 *  - `years`: num is the length in years when the string reads "N Year(s)", the verbatim string in `printed`;
 *  - `exams`: code NBME | IN_HOUSE | BOTH | OTHER, the verbatim string in `printed`;
 *  - `yesno`: code YES | NO (Admit leaves it unset when it does not know: then there is no row, never a NO);
 *  - `text`: the verbatim list in `printed`, items joined by "; ".
 * Admit's own `internal_rank` is deliberately not a kind: it is never stored or shown.
 */
export const CURRICULUM_KINDS = {
  CURRICULUM_PRECLINICAL_GRADING: { type: 'grading', label: 'Preclinical grading' },
  CURRICULUM_PRECLINICAL_LENGTH: { type: 'years', label: 'Preclinical length' },
  CURRICULUM_CLERKSHIP_GRADING: { type: 'grading', label: 'Clerkship grading' },
  CURRICULUM_SHELF_EXAMS: { type: 'exams', label: 'Shelf exams' },
  CURRICULUM_MSPE: { type: 'yesno', label: 'MSPE' },
  CURRICULUM_LECTURE_ATTENDANCE: { type: 'yesno', label: 'Lecture attendance required' },
  AOA_CHAPTER: { type: 'yesno', label: 'AOA chapter' },
  HOME_HOSPITALS: { type: 'text', label: 'Home hospitals' },
} as const satisfies Record<string, { type: 'grading' | 'years' | 'exams' | 'yesno' | 'text'; label: string }>;
export type CurriculumKindId = keyof typeof CURRICULUM_KINDS;
export const CURRICULUM_KIND_IDS = Object.keys(CURRICULUM_KINDS) as CurriculumKindId[];
export const isCurriculumKind = (v: unknown): v is CurriculumKindId => typeof v === 'string' && v in CURRICULUM_KINDS;

/** Curriculum facts are not about an entering class; this stands in the unique key so a weekly refresh updates in place. */
export const CURRICULUM_CYCLE = 0;
export const ADMIT_SOURCE_URL = 'https://admit.org';
export const ADMIT_SOURCE_LABEL = 'Admit.org';

export const PRECLINICAL_GRADING_CODES = ['PASS_FAIL', 'TIERED', 'OTHER'] as const;
export const CLERKSHIP_GRADING_CODES = ['H_HP_P_F', 'H_P_F', 'P_F', 'OTHER'] as const;
export const SHELF_EXAM_CODES = ['NBME', 'IN_HOUSE', 'BOTH', 'OTHER'] as const;

const squash = (v: string): string => v.replace(/\s+/g, ' ').trim();

/** Preclinical scale: only "P/F" is pass/fail; a scale of honors or letter grades is tiered; anything else is shown as written. */
export function normalisePreclinicalGrading(raw: string): (typeof PRECLINICAL_GRADING_CODES)[number] {
  const v = squash(raw).toUpperCase();
  if (v === 'P/F') return 'PASS_FAIL';
  if (/^(H|A)(\/[A-Z+]{1,3})+$/.test(v) && /(^|\/)(P|C)(\/|$)/.test(v) && /(^|\/)F$/.test(v)) return 'TIERED';
  return 'OTHER';
}

/** Clerkship scale: the three scales applicants compare, exactly; every other string is `OTHER` and shown as written. */
export function normaliseClerkshipGrading(raw: string): (typeof CLERKSHIP_GRADING_CODES)[number] {
  const v = squash(raw).toUpperCase();
  if (v === 'H/HP/P/F') return 'H_HP_P_F';
  if (v === 'H/P/F') return 'H_P_F';
  if (v === 'P/F') return 'P_F';
  return 'OTHER';
}

export function normaliseShelfExams(raw: string): (typeof SHELF_EXAM_CODES)[number] {
  const v = squash(raw).toLowerCase();
  if (v === 'nbme based') return 'NBME';
  if (v === 'in-house exams') return 'IN_HOUSE';
  if (v === 'both') return 'BOTH';
  return 'OTHER';
}

/** "1.5 Years" -> 1.5, "1 Year" -> 1; any other string has no number and is shown as written. */
export function parseYears(raw: string): number | null {
  const m = /^(\d{1,2}(?:\.\d)?) years?$/i.exec(squash(raw));
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 6 ? n : null;
}

/** A code as words, for the page. */
export const FACT_CODE_LABEL: Record<string, string> = {
  YES: 'Yes',
  NO: 'No',
  CASE_BY_CASE: 'Case by case',
  ACCEPTED: 'Accepted',
  PREFERRED: 'Preferred',
  NOT_ACCEPTED: 'Not accepted',
  NOT_USED: 'Not used',
  EXPLORING: 'Exploring, not used this cycle',
  RECOMMENDED: 'Recommended',
  REQUIRED: 'Required',
  SJT_ACCEPTED: 'Accepted in place of a situational judgment test',
};

/** Curriculum codes in plain words (the page's wording is i18n; these are the English defaults the importer tests read). */
export const CURRICULUM_CODE_LABEL: Record<string, string> = {
  PASS_FAIL: 'Pass / fail',
  TIERED: 'Tiered grades',
  H_HP_P_F: 'Honors, high pass, pass, fail',
  H_P_F: 'Honors, pass, fail',
  P_F: 'Pass / fail',
  NBME: 'NBME shelf exams',
  IN_HOUSE: 'In-house exams',
  BOTH: 'NBME and in-house exams',
  OTHER: '',
};

/**
 * Entering-class statistics from each school's OWN class-profile page (source `SCHOOL_PROFILE`, phase C step 2;
 * `data/medschools/class-profiles.json`). One row per figure the page states, never computed: no acceptance rate, no
 * ratio, no rounding. The page's string is always kept (`valueText`, the DTO's `value`) and is what the page shows;
 * `num` is parsed only where the string is a plain number of its kind.
 *  - `score`: an MCAT total ("517"); `gpa`: a grade point average ("3.89"); `count`: a number of people ("7,412");
 *    `percent`: a share ("38%"); `range`: a range as written ("500-525", "3.41–4.0"); `text`: anything else.
 * MCAT and GPA kinds keep the page's statistic apart: median, mean and range are different kinds, and a figure whose
 * statistic the page does not name is `MCAT_SCORE`, `GPA_SCORE` or `SGPA_SCORE` (plain "MCAT", "GPA").
 */
export const PROFILE_KINDS = {
  MCAT_MEDIAN: { type: 'score', label: 'Median MCAT' },
  MCAT_MEAN: { type: 'score', label: 'Mean MCAT' },
  MCAT_RANGE: { type: 'range', label: 'MCAT range' },
  MCAT_10_90: { type: 'range', label: 'MCAT 10th to 90th percentile' },
  GPA_MEDIAN: { type: 'gpa', label: 'Median GPA' },
  GPA_MEAN: { type: 'gpa', label: 'Mean GPA' },
  GPA_RANGE: { type: 'range', label: 'GPA range' },
  SGPA_MEDIAN: { type: 'gpa', label: 'Median science GPA' },
  SGPA_MEAN: { type: 'gpa', label: 'Mean science GPA' },
  // The page gives the figure but not whether it is a mean or a median: shown as plain "MCAT", "GPA", never guessed.
  MCAT_SCORE: { type: 'score', label: 'MCAT' },
  GPA_SCORE: { type: 'gpa', label: 'GPA' },
  SGPA_SCORE: { type: 'gpa', label: 'Science GPA' },
  APPLICANTS: { type: 'count', label: 'Applicants' },
  INTERVIEWED: { type: 'count', label: 'Interviewed' },
  MATRICULANTS: { type: 'count', label: 'Class size' },
  IN_STATE_PCT: { type: 'percent', label: 'In state' },
  IN_STATE_COUNT: { type: 'count', label: 'In state' },
  OTHER: { type: 'text', label: '' },
} as const satisfies Record<string, { type: 'score' | 'gpa' | 'count' | 'percent' | 'range' | 'text'; label: string }>;
export type ProfileKindId = keyof typeof PROFILE_KINDS;
export const PROFILE_KIND_IDS = Object.keys(PROFILE_KINDS) as ProfileKindId[];
export const isProfileKind = (v: unknown): v is ProfileKindId => typeof v === 'string' && v in PROFILE_KINDS;

/**
 * The stored `kind` of a profile figure: `PROFILE_<KIND>`, and `PROFILE_<KIND>#<n>` for the n-th figure of the same kind
 * in one class and program (a page lists several `OTHER` figures). The unique key is school x program x cycle x kind x
 * source, so the ordinal is what lets one class hold them all without a migration; `#` occurs in no kind id, so the
 * split is unambiguous.
 */
export const PROFILE_KIND_PREFIX = 'PROFILE_';
export function profileStoredKind(kind: ProfileKindId, ordinal: number): string {
  return ordinal <= 1 ? `${PROFILE_KIND_PREFIX}${kind}` : `${PROFILE_KIND_PREFIX}${kind}#${ordinal}`;
}
/** The catalogue kind of a stored kind, or null for anything this source does not own. */
export function profileKindOf(stored: string): ProfileKindId | null {
  const m = /^PROFILE_([A-Z0-9_]+?)(?:#([2-9]|[1-9]\d))?$/.exec(stored);
  return m && isProfileKind(m[1]) ? m[1] : null;
}

/** An undated class (the page says "current" or "most recent"): this stands in the unique key; the label is kept. */
export const PROFILE_UNDATED_CYCLE = 0;
/** The oldest entering class kept (the research dropped older ones; the validator holds the line). */
export const PROFILE_OLDEST_CLASS = 2024;

const PLAIN_COUNT = /^\d{1,3}(?:,\d{3})+$|^\d+$/;

/**
 * The number in a figure's string where the string is a plain number of its kind, else null (the string is shown
 * either way). Never reads an approximate ("~600", "approximately 230"), a bound ("6,000+", "more than 14,000"), words
 * ("Fifty-four percent") or a range as a number.
 */
export function parseProfileNumber(kind: ProfileKindId, raw: string): number | null {
  const v = raw.trim();
  switch (PROFILE_KINDS[kind].type) {
    case 'score': {
      if (!/^\d{3}(?:\.\d)?$/.test(v)) return null;
      const n = Number(v);
      return n >= 472 && n <= 528 ? n : null;
    }
    case 'gpa': {
      if (!/^\d\.\d{1,3}$/.test(v)) return null;
      const n = Number(v);
      return n > 0 && n <= 4.5 ? n : null;
    }
    case 'count':
      return PLAIN_COUNT.test(v) ? Number(v.replace(/,/g, '')) : null;
    case 'percent': {
      const m = /^(\d{1,3}(?:\.\d+)?)\s?%$/.exec(v);
      if (!m) return null;
      const n = Number(m[1]);
      return n <= 100 ? n : null;
    }
    default:
      return null;
  }
}

/** The value's digits, comma-free, as the verifier compares them: '7,412' -> '7412', '3.41–4.0' -> '3.41 4.0'. */
const digitsOf = (x: string): string =>
  x
    .normalize('NFKC')
    .replace(/,/g, '')
    .replace(/[^0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * True when the evidence carries the value: its digits in order (a value in words, "Fifty-four percent", must appear in
 * the evidence as written). The research verifier's rule, so a slip in the file is caught before import.
 */
export function evidenceHasValue(value: string, evidence: string): boolean {
  const v = digitsOf(value);
  if (v === '' || v === '.') return evidence.toLowerCase().includes(value.trim().toLowerCase());
  const e = digitsOf(evidence);
  return ` ${e} `.includes(` ${v} `) || e.replace(/ /g, '').includes(v.replace(/ /g, ''));
}

/**
 * Whether a figure is for the combined MD-PhD (DO-PhD, MSTP) program only, from its qualifier: then it is stored under
 * program PHD and shown apart. A figure that counts both programs ("MD & MD/PhD Applicants", "incl. MD/PhD") is REG.
 */
export function isPhdOnlyQualifier(qualifier: string | null): boolean {
  if (!qualifier) return false;
  if (!/\bMSTP\b|\bM\.?D\.?\s?[-/]\s?Ph\.?D\b|\bD\.?O\.?\s?[-/]\s?Ph\.?D\b/i.test(qualifier)) return false;
  return !/\bincl|&|\band\b|,/i.test(qualifier);
}

/**
 * Words that only restate a figure's kind (the page's own wording of "Average MCAT", "new matriculants", "Overall Grade
 * Point Average"): a qualifier made of nothing else says no more than the tile's label and is not shown under it.
 */
const RESTATING = new Set(
  (
    'mcat gpa gpas score scores exam class average avg mean median overall cumulative total grade point undergraduate ' +
    'undergrad ug science bcpm composite matriculating matriculants matriculated entering students student new ' +
    'applicants applicant applications application received interviewed interviews interview enrolled enrollment size ' +
    'incoming number of the is and for a an highest standard granted completed amcas candidates in state in-state ' +
    'resident residents currently faq answer'
  ).split(' '),
);

/**
 * The qualifier as a reader sees it under a figure, or null when it adds nothing to the kind's own label: a research
 * note on the page's wording ("labelled Average MCAT", "PDF label …", "row …"), or the page's words for the kind itself
 * ("MCAT Exam Class Average", "new matriculants"; `RESTATING`). A note about the page's spelling ("(page spells …)",
 * "; page says …") is dropped. The rest is the page's own scope and is shown ("five-year average", "among those
 * accepted", "virtual interviews", "Oregon Campus column", "North Carolina").
 */
export function profileQualifierNote(qualifier: string | null): string | null {
  if (!qualifier) return null;
  const q = qualifier
    .replace(/\s*\(page [^)]*\)/gi, '')
    .replace(/;\s*page says.*$/i, '')
    .trim();
  if (q === '' || /^(labelled|labeled|pdf label|row )/i.test(q)) return null;
  const words = q
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w !== '');
  if (words.every((w) => RESTATING.has(w) || /^20\d\d$/.test(w))) return null;
  return q;
}
