/**
 * RMHLadder — the application answer bank (client-safe schema + pure logic).
 *
 * RMHLadder finds jobs well and tracks applications well. The middle — the
 * actual applying — is where a user retypes their work authorization, notice
 * period and the same three essays into a Greenhouse form for the fortieth
 * time. The answer bank is the canonical copy of those answers: entered once,
 * assembled per application into a packet ordered to match the target ATS's own
 * form (`ats-fields.ts`), and reused as the source of STAR stories the interview
 * prep sheet matches against a posting.
 *
 * Two rules this module exists to keep:
 *
 *  1. **Nothing is ever submitted on the user's behalf.** The packet is a copy
 *     surface. The final button is always pressed by the user, on the
 *     employer's site. There is no automation path here and none is planned —
 *     a browser extension that fills third-party forms is a separate product
 *     decision with per-ATS terms-of-service implications, not a feature.
 *  2. **Some of these answers are sensitive personal data.** Salary
 *     expectation, work authorization and sponsorship need are exactly the
 *     fields that must ride the account export and delete flows —
 *     `SENSITIVE_FIELDS` names them so no surface has to guess.
 *
 * The zod limits mirror the `LadderAnswerBank` column widths so a value that
 * validates always stores.
 */

import { z } from 'zod';
import { httpUrl } from '@/lib/url-safety';

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Empty string means "cleared", and clearing a field must persist as `NULL`
 * rather than as an empty varchar — otherwise "unset" and "set to nothing"
 * become two states the UI has to tell apart forever.
 */
const blankToNull = (max: number) =>
  z
    .union([z.string(), z.null()])
    .transform((v) => {
      const trimmed = typeof v === 'string' ? v.trim() : '';
      return trimmed === '' ? null : trimmed;
    })
    .pipe(z.string().max(max).nullable());

const optionalUrl = (max: number) =>
  z
    .union([z.string(), z.null()])
    .transform((v) => {
      const trimmed = typeof v === 'string' ? v.trim() : '';
      return trimmed === '' ? null : trimmed;
    })
    .pipe(httpUrl(max).nullable());

/** One repeated essay: the ATS question, and the answer the user reuses. */
export const essayAnswerSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(4000),
});
export type EssayAnswer = z.infer<typeof essayAnswerSchema>;

/** One STAR story. The prep sheet matches these to a posting. */
export const starStorySchema = z.object({
  title: z.string().trim().min(1).max(120),
  situation: z.string().trim().max(1200).default(''),
  task: z.string().trim().max(1200).default(''),
  action: z.string().trim().max(1200).default(''),
  result: z.string().trim().max(1200).default(''),
});
export type StarStory = z.infer<typeof starStorySchema>;

export const MAX_ESSAYS = 20;
export const MAX_STORIES = 20;

export const answerBankSchema = z.object({
  workAuthorization: blankToNull(120),
  needsSponsorship: z.boolean().nullable(),
  noticePeriod: blankToNull(60),
  salaryExpectation: blankToNull(60),
  locationPreference: blankToNull(120),
  linkedinUrl: optionalUrl(300),
  portfolioUrl: optionalUrl(300),
  essays: z.array(essayAnswerSchema).max(MAX_ESSAYS),
  stories: z.array(starStorySchema).max(MAX_STORIES),
});

export type AnswerBank = z.infer<typeof answerBankSchema>;

export const EMPTY_ANSWER_BANK: AnswerBank = {
  workAuthorization: null,
  needsSponsorship: null,
  noticePeriod: null,
  salaryExpectation: null,
  locationPreference: null,
  linkedinUrl: null,
  portfolioUrl: null,
  essays: [],
  stories: [],
};

/**
 * The scalar fields, with the metadata every surface needs: what to call it,
 * whether it is sensitive personal data, and a hint of what the ATS expects.
 * Declared once so the editor, the packet and the privacy copy cannot drift.
 */
export type ScalarFieldKey =
  | 'workAuthorization'
  | 'needsSponsorship'
  | 'noticePeriod'
  | 'salaryExpectation'
  | 'locationPreference'
  | 'linkedinUrl'
  | 'portfolioUrl';

export interface ScalarFieldDef {
  key: ScalarFieldKey;
  label: string;
  placeholder: string;
  kind: 'text' | 'boolean' | 'url';
  /**
   * Personal data with real consequences if it leaks or is inferred from —
   * salary anchors a negotiation, and authorization/sponsorship are
   * immigration status by another name. Flagged so the UI can say so and the
   * export/delete flows can be checked against a list rather than a memory.
   */
  sensitive: boolean;
}

export const SCALAR_FIELDS: readonly ScalarFieldDef[] = [
  {
    key: 'workAuthorization',
    label: 'Work authorization',
    placeholder: 'e.g. Authorized to work in the US for any employer',
    kind: 'text',
    sensitive: true,
  },
  {
    key: 'needsSponsorship',
    label: 'Will you require sponsorship?',
    placeholder: '',
    kind: 'boolean',
    sensitive: true,
  },
  {
    key: 'noticePeriod',
    label: 'Notice period',
    placeholder: 'e.g. Two weeks',
    kind: 'text',
    sensitive: false,
  },
  {
    key: 'salaryExpectation',
    label: 'Salary expectation',
    placeholder: 'e.g. $95,000–$110,000',
    kind: 'text',
    sensitive: true,
  },
  {
    key: 'locationPreference',
    label: 'Location preference',
    placeholder: 'e.g. Remote (US) or Rochester, NY',
    kind: 'text',
    sensitive: false,
  },
  {
    key: 'linkedinUrl',
    label: 'LinkedIn',
    placeholder: 'https://…',
    kind: 'url',
    sensitive: false,
  },
  {
    key: 'portfolioUrl',
    label: 'Portfolio / GitHub',
    placeholder: 'https://…',
    kind: 'url',
    sensitive: false,
  },
] as const;

/**
 * The fields that must appear in the account export and be removed on account
 * delete. Referenced by the privacy copy rather than restated in it.
 */
export const SENSITIVE_FIELDS: readonly ScalarFieldKey[] = SCALAR_FIELDS.filter(
  (f) => f.sensitive,
).map((f) => f.key);

/* -------------------------------------------------------------------------- */
/* Coercion from the stored Json columns                                      */
/* -------------------------------------------------------------------------- */

/**
 * `essays` and `stories` are `Json` columns, so what comes back is `unknown` no
 * matter how carefully it went in — an older shape, a hand-edited row, a
 * partially-written array. Coerce leniently and drop what will not parse: one
 * bad essay must cost that essay, not the whole panel.
 */
export function coerceEssays(value: unknown): EssayAnswer[] {
  if (!Array.isArray(value)) return [];
  const out: EssayAnswer[] = [];
  for (const row of value) {
    const parsed = essayAnswerSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= MAX_ESSAYS) break;
  }
  return out;
}

export function coerceStories(value: unknown): StarStory[] {
  if (!Array.isArray(value)) return [];
  const out: StarStory[] = [];
  for (const row of value) {
    const parsed = starStorySchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= MAX_STORIES) break;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Completeness                                                               */
/* -------------------------------------------------------------------------- */

export interface AnswerBankCompleteness {
  filled: number;
  total: number;
  /** 0–100, rounded. */
  percent: number;
  /** Field keys still empty, in declaration order — the UI's "next" list. */
  missing: ScalarFieldKey[];
  hasEssays: boolean;
  hasStories: boolean;
}

/**
 * How much of the bank is usable. Counts the seven scalars plus "at least one
 * essay" and "at least one story" — nine slots, because a bank with no stories
 * cannot feed a prep sheet however complete its scalars are.
 */
export function answerBankCompleteness(bank: AnswerBank): AnswerBankCompleteness {
  const missing: ScalarFieldKey[] = [];
  let filled = 0;
  for (const field of SCALAR_FIELDS) {
    const value = bank[field.key];
    const isSet =
      field.kind === 'boolean' ? value !== null : typeof value === 'string' && value !== '';
    if (isSet) filled++;
    else missing.push(field.key);
  }

  const hasEssays = bank.essays.length > 0;
  const hasStories = bank.stories.length > 0;
  if (hasEssays) filled++;
  if (hasStories) filled++;

  const total = SCALAR_FIELDS.length + 2;
  return {
    filled,
    total,
    percent: Math.round((filled / total) * 100),
    missing,
    hasEssays,
    hasStories,
  };
}

/* -------------------------------------------------------------------------- */
/* Deterministic story matching                                               */
/* -------------------------------------------------------------------------- */

/**
 * Words too common to carry signal when overlapping a job posting. Short and
 * boring on purpose: this is a ranking aid, not a search engine, and an
 * aggressive stop list starts eating real skill words ("lead", "own", "scale").
 */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'has',
  'had',
  'was',
  'were',
  'are',
  'our',
  'their',
  'they',
  'them',
  'you',
  'your',
  'will',
  'would',
  'should',
  'could',
  'about',
  'into',
  'over',
  'than',
  'then',
  'when',
  'what',
  'which',
  'while',
  'been',
  'being',
  'each',
  'more',
  'most',
  'other',
  'some',
  'such',
  'only',
  'also',
  'very',
  'work',
  'working',
  'team',
  'teams',
  'role',
  'job',
  'company',
  'candidate',
  'candidates',
  'experience',
  'years',
  'ability',
]);

/** Lowercase word tokens of length ≥ 3, stop words removed. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^[.]+|[.]+$/g, ''))
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/** The distinct vocabulary of a story — every STAR field pooled. */
export function storyKeywords(story: StarStory): Set<string> {
  return new Set(
    tokenize([story.title, story.situation, story.task, story.action, story.result].join(' ')),
  );
}

export interface StoryMatch {
  story: StarStory;
  /** Count of distinct posting terms the story also uses. */
  score: number;
  /** The overlapping terms, for "matched on: latency, migration, on-call". */
  overlap: string[];
}

/**
 * Rank the user's own stories against a posting by vocabulary overlap.
 *
 * Deliberately dumb and deliberately deterministic: it is both the fallback for
 * when the AI is unconfigured or refuses, and the sanity check on what the AI
 * returns. A model that proposes a story the user does not have is a
 * hallucination the prep sheet must never surface, and the only way to know is
 * to hold the real list next to it.
 */
export function matchStories(
  stories: readonly StarStory[],
  postingText: string,
  limit = 5,
): StoryMatch[] {
  const posting = new Set(tokenize(postingText));
  if (posting.size === 0) return [];

  return (
    stories
      .map((story) => {
        const overlap = [...storyKeywords(story)].filter((w) => posting.has(w));
        return { story, score: overlap.length, overlap: overlap.slice(0, 8) };
      })
      .filter((m) => m.score > 0)
      // Ties broken by title so the order is stable across renders and runs.
      .sort((a, b) => b.score - a.score || a.story.title.localeCompare(b.story.title))
      .slice(0, Math.max(0, limit))
  );
}
