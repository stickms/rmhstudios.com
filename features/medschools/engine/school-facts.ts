/**
 * School facts: dated, sourced figures about a school's admissions that are the same for every applicant (does it take
 * out-of-state applicants, when is the deposit due, what does it cost). Pure and client-safe: the importer, the public
 * endpoint and the school page all read the same catalogue, so a kind means one thing everywhere.
 *
 * The one source today is the AAMC MSAR "Reports for Applicants and Advisors" (`AAMC_MSAR_REPORT`). The owner states
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

export const FACT_SOURCES = ['AAMC_MSAR_REPORT', 'SCHOOL_PROFILE'] as const;
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
