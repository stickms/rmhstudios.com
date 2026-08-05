/**
 * RMHLadder — per-ATS field order, and the application packet built from it.
 *
 * The adapters already know which applicant tracking system a job came from
 * (`LadderSource.platform` / `LadderJob.sourcePlatform`). Greenhouse, Lever,
 * Ashby, SmartRecruiters and Workday each ask for the same handful of things in
 * a *different order*, and the cost of a copy-paste workflow is almost entirely
 * in hunting: the user has the answer, they just have to find which of their
 * fourteen saved values the form wants next. Ordering the packet to match the
 * form on screen turns that into a top-to-bottom pass.
 *
 * ─────────────────────────────── scope ──────────────────────────────────────
 * This is a **copy surface and nothing else**. It produces ordered, labelled
 * text. It does not build prefilled URLs that post data, does not drive a form,
 * and cannot submit: automating third-party form submission is a per-ATS
 * terms-of-service question and a separate product decision (the spec's piece
 * 3), explicitly out of scope here. The user presses the final button on the
 * employer's site, every time.
 *
 * Client-safe: pure data plus one assembly function, no Prisma, no network.
 */

import type { AnswerBank, EssayAnswer } from './answer-bank';

/* -------------------------------------------------------------------------- */
/* Platforms                                                                  */
/* -------------------------------------------------------------------------- */

/** Mirrors the `LadderPlatform` enum. Kept as a local union so this module
 *  stays importable from client code without pulling in the Prisma client. */
export type AtsPlatform =
  'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'workday' | 'manual' | 'generic';

export const ATS_PLATFORMS: readonly AtsPlatform[] = [
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'workday',
  'manual',
  'generic',
] as const;

const PLATFORM_LABELS: Record<AtsPlatform, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  workday: 'Workday',
  manual: 'Company site',
  generic: 'Company site',
};

export function atsPlatformLabel(platform: AtsPlatform): string {
  return PLATFORM_LABELS[platform] ?? PLATFORM_LABELS.generic;
}

/** Normalize whatever the job row carries into a platform we have an order for. */
export function resolveAtsPlatform(value: string | null | undefined): AtsPlatform {
  if (!value) return 'generic';
  const key = value.toLowerCase().trim();
  return (ATS_PLATFORMS as readonly string[]).includes(key) ? (key as AtsPlatform) : 'generic';
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

export type PacketFieldKey =
  | 'fullName'
  | 'email'
  | 'phone'
  | 'resume'
  | 'coverLetter'
  | 'linkedinUrl'
  | 'portfolioUrl'
  | 'locationPreference'
  | 'workAuthorization'
  | 'needsSponsorship'
  | 'salaryExpectation'
  | 'noticePeriod'
  | 'referralName'
  | 'essay';

export type PacketFieldKind =
  /** A one-line value — copy button, single row. */
  | 'text'
  /** A paragraph — copy button, expandable block. */
  | 'longtext'
  /** Yes/no — rendered as a word, because forms ask it as a word. */
  | 'choice'
  /** Not copyable: an upload slot. The value is the reminder of WHICH file. */
  | 'file';

interface FieldDef {
  label: string;
  kind: PacketFieldKind;
  sensitive: boolean;
}

const FIELD_DEFS: Record<Exclude<PacketFieldKey, 'essay'>, FieldDef> = {
  fullName: { label: 'Full name', kind: 'text', sensitive: false },
  email: { label: 'Email', kind: 'text', sensitive: true },
  phone: { label: 'Phone', kind: 'text', sensitive: true },
  resume: { label: 'Resume', kind: 'file', sensitive: false },
  coverLetter: { label: 'Cover letter', kind: 'longtext', sensitive: false },
  linkedinUrl: { label: 'LinkedIn', kind: 'text', sensitive: false },
  portfolioUrl: { label: 'Portfolio / GitHub', kind: 'text', sensitive: false },
  locationPreference: { label: 'Location', kind: 'text', sensitive: false },
  workAuthorization: { label: 'Work authorization', kind: 'text', sensitive: true },
  needsSponsorship: { label: 'Requires sponsorship', kind: 'choice', sensitive: true },
  salaryExpectation: { label: 'Salary expectation', kind: 'text', sensitive: true },
  noticePeriod: { label: 'Notice period', kind: 'text', sensitive: false },
  referralName: { label: 'Referred by', kind: 'text', sensitive: false },
};

/**
 * The order each ATS's application form asks for things, top to bottom.
 *
 * Every list is a permutation of the same key set (checked by the test suite),
 * so switching platforms reorders the packet and never drops a field — a
 * missing row would read as "this ATS does not want it", which is a worse lie
 * than showing it in the wrong place.
 *
 * `essay` always sits last: the repeated free-text questions live at the bottom
 * of every one of these forms, and their own order comes from the user's bank.
 */
export const ATS_FIELD_ORDER: Record<AtsPlatform, readonly PacketFieldKey[]> = {
  // Greenhouse: identity, then attachments, then the links and the questions.
  greenhouse: [
    'fullName',
    'email',
    'phone',
    'resume',
    'coverLetter',
    'linkedinUrl',
    'portfolioUrl',
    'locationPreference',
    'workAuthorization',
    'needsSponsorship',
    'salaryExpectation',
    'noticePeriod',
    'referralName',
    'essay',
  ],
  // Lever puts the profile links immediately under the resume, and asks about
  // referral early because its referral flow is a first-class field.
  lever: [
    'fullName',
    'email',
    'phone',
    'resume',
    'linkedinUrl',
    'portfolioUrl',
    'referralName',
    'coverLetter',
    'locationPreference',
    'workAuthorization',
    'needsSponsorship',
    'salaryExpectation',
    'noticePeriod',
    'essay',
  ],
  // Ashby leads with the resume (it parses it to prefill), then confirms
  // details, and treats the cover letter as optional near the end.
  ashby: [
    'fullName',
    'email',
    'resume',
    'phone',
    'linkedinUrl',
    'portfolioUrl',
    'locationPreference',
    'workAuthorization',
    'needsSponsorship',
    'salaryExpectation',
    'noticePeriod',
    'coverLetter',
    'referralName',
    'essay',
  ],
  // SmartRecruiters asks for location as part of the identity block.
  smartrecruiters: [
    'fullName',
    'email',
    'phone',
    'locationPreference',
    'resume',
    'linkedinUrl',
    'portfolioUrl',
    'coverLetter',
    'workAuthorization',
    'needsSponsorship',
    'noticePeriod',
    'salaryExpectation',
    'referralName',
    'essay',
  ],
  // Workday's wizard front-loads contact + eligibility before attachments.
  workday: [
    'fullName',
    'email',
    'phone',
    'locationPreference',
    'workAuthorization',
    'needsSponsorship',
    'resume',
    'coverLetter',
    'linkedinUrl',
    'portfolioUrl',
    'salaryExpectation',
    'noticePeriod',
    'referralName',
    'essay',
  ],
  // No adapter knowledge — a neutral, conventional order.
  manual: [
    'fullName',
    'email',
    'phone',
    'resume',
    'coverLetter',
    'linkedinUrl',
    'portfolioUrl',
    'locationPreference',
    'workAuthorization',
    'needsSponsorship',
    'salaryExpectation',
    'noticePeriod',
    'referralName',
    'essay',
  ],
  generic: [
    'fullName',
    'email',
    'phone',
    'resume',
    'coverLetter',
    'linkedinUrl',
    'portfolioUrl',
    'locationPreference',
    'workAuthorization',
    'needsSponsorship',
    'salaryExpectation',
    'noticePeriod',
    'referralName',
    'essay',
  ],
};

/** Every key an order is expected to contain. Used by the ordering test. */
export const ALL_PACKET_FIELD_KEYS: readonly PacketFieldKey[] = [
  ...(Object.keys(FIELD_DEFS) as Exclude<PacketFieldKey, 'essay'>[]),
  'essay',
];

/* -------------------------------------------------------------------------- */
/* The packet                                                                 */
/* -------------------------------------------------------------------------- */

export interface PacketField {
  /** Stable id for React keys and copy telemetry. Essays get `essay:<n>`. */
  id: string;
  key: PacketFieldKey;
  /** What the form calls it — for essays, the user's own question text. */
  label: string;
  value: string;
  kind: PacketFieldKind;
  /** `false` when the user has not filled this in; the UI prompts instead of copying. */
  filled: boolean;
  /** Sensitive personal data — the UI masks it until revealed. */
  sensitive: boolean;
}

export interface PacketApplicant {
  fullName: string | null;
  email: string | null;
  phone: string | null;
}

export interface PacketApplication {
  /** Free-text name of the resume version selected for this application. */
  resumeVersion: string | null;
  coverLetter: string | null;
  referralName: string | null;
}

export interface BuildPacketInput {
  bank: AnswerBank;
  applicant: PacketApplicant;
  application: PacketApplication;
  platform: AtsPlatform;
}

function boolWord(value: boolean | null): string {
  if (value === null) return '';
  return value ? 'Yes' : 'No';
}

function essayFields(essays: readonly EssayAnswer[]): PacketField[] {
  return essays.map((essay, i) => ({
    id: `essay:${i}`,
    key: 'essay' as const,
    label: essay.question,
    value: essay.answer,
    kind: 'longtext' as const,
    filled: essay.answer.trim().length > 0,
    sensitive: false,
  }));
}

/**
 * Assemble the copy-me-in-order packet for one application.
 *
 * Unfilled fields are KEPT rather than dropped, with `filled: false`. A gap the
 * user can see ("Salary expectation — not set, add it") is the whole value of
 * doing this in our product instead of in the form; a silently shorter list
 * just moves the surprise to the employer's page.
 */
export function buildApplicationPacket(input: BuildPacketInput): PacketField[] {
  const { bank, applicant, application, platform } = input;

  const values: Record<Exclude<PacketFieldKey, 'essay'>, string> = {
    fullName: applicant.fullName ?? '',
    email: applicant.email ?? '',
    phone: applicant.phone ?? '',
    resume: application.resumeVersion ?? '',
    coverLetter: application.coverLetter ?? '',
    linkedinUrl: bank.linkedinUrl ?? '',
    portfolioUrl: bank.portfolioUrl ?? '',
    locationPreference: bank.locationPreference ?? '',
    workAuthorization: bank.workAuthorization ?? '',
    needsSponsorship: boolWord(bank.needsSponsorship),
    salaryExpectation: bank.salaryExpectation ?? '',
    noticePeriod: bank.noticePeriod ?? '',
    referralName: application.referralName ?? '',
  };

  const order = ATS_FIELD_ORDER[platform] ?? ATS_FIELD_ORDER.generic;

  const fields: PacketField[] = [];
  for (const key of order) {
    if (key === 'essay') {
      fields.push(...essayFields(bank.essays));
      continue;
    }
    const def = FIELD_DEFS[key];
    const value = values[key];
    fields.push({
      id: key,
      key,
      label: def.label,
      value,
      kind: def.kind,
      filled: value.trim().length > 0,
      sensitive: def.sensitive,
    });
  }
  return fields;
}

/**
 * The packet as one block of text, for the user who would rather paste into a
 * scratch buffer than copy field by field. Unfilled fields are marked rather
 * than omitted, for the same reason they are kept above.
 */
export function packetAsText(fields: readonly PacketField[]): string {
  return fields.map((f) => `${f.label}:\n${f.filled ? f.value : '(not set)'}`).join('\n\n');
}
