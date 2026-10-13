/**
 * N6 — community census (client-safe, pure).
 *
 * Privacy contract: answers are stored ONLY as per-option tallies; the table that
 * records "this member has answered" holds no answers. So nothing in the database
 * can say what one member chose. Results are additionally withheld until the
 * census is closed AND has at least {@link CENSUS_MIN_RESPONSES} responses — a
 * live tally would let anyone diff two reads and learn the newest respondent's
 * answer.
 */
import { z } from 'zod';

export const CENSUS_MAX_QUESTIONS = 10;
export const CENSUS_MAX_OPTIONS = 8;
export const CENSUS_MIN_RESPONSES = 5;

export const censusQuestionInputSchema = z.object({
  prompt: z.string().trim().min(1).max(140),
  kind: z.enum(['single', 'multi']),
  options: z.array(z.string().trim().min(1).max(60)).min(2).max(CENSUS_MAX_OPTIONS),
});

export const censusCreateSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  questions: z.array(censusQuestionInputSchema).min(1).max(CENSUS_MAX_QUESTIONS),
  closesAt: z.string().datetime().optional(),
});

export const censusAnswerSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().max(24),
        optionIds: z.array(z.string().max(24)).min(1).max(CENSUS_MAX_OPTIONS),
      }),
    )
    .min(1)
    .max(CENSUS_MAX_QUESTIONS),
});

export interface CensusQuestion {
  id: string;
  prompt: string;
  kind: 'single' | 'multi';
  options: { id: string; label: string }[];
}

/** Server-side: give questions and options stable short ids (`q1`, `q1o2`). */
export function buildCensusQuestions(
  input: z.infer<typeof censusQuestionInputSchema>[],
): CensusQuestion[] {
  return input.map((q, qi) => ({
    id: `q${qi + 1}`,
    prompt: q.prompt,
    kind: q.kind,
    options: q.options.map((label, oi) => ({ id: `q${qi + 1}o${oi + 1}`, label })),
  }));
}

/**
 * Validate a submission against the census. Every question must be answered;
 * single-choice takes exactly one option, multi-choice one or more distinct
 * options; unknown ids are refused. Returns the normalised picks or an error.
 */
export function validateCensusAnswers(
  questions: readonly CensusQuestion[],
  answers: readonly { questionId: string; optionIds: readonly string[] }[],
): { ok: true; picks: { questionId: string; optionId: string }[] } | { ok: false; error: string } {
  const byQ = new Map<string, readonly string[]>();
  for (const a of answers) {
    if (byQ.has(a.questionId)) return { ok: false, error: 'Duplicate answer' };
    byQ.set(a.questionId, a.optionIds);
  }
  if (byQ.size !== questions.length) return { ok: false, error: 'Please answer every question' };
  const picks: { questionId: string; optionId: string }[] = [];
  for (const q of questions) {
    const ids = byQ.get(q.id);
    if (!ids) return { ok: false, error: 'Please answer every question' };
    const unique = [...new Set(ids)];
    if (q.kind === 'single' && unique.length !== 1) return { ok: false, error: 'Pick one option' };
    const valid = new Set(q.options.map((o) => o.id));
    if (unique.length === 0 || unique.some((id) => !valid.has(id))) {
      return { ok: false, error: 'Unknown option' };
    }
    for (const optionId of unique) picks.push({ questionId: q.id, optionId });
  }
  return { ok: true, picks };
}

export interface CensusTiming {
  closesAt?: Date | string | null;
  closedAt?: Date | string | null;
}

const ms = (d: Date | string): number => (d instanceof Date ? d.getTime() : Date.parse(d));

export function isCensusClosed(c: CensusTiming, now: number = Date.now()): boolean {
  if (c.closedAt) return true;
  return c.closesAt ? ms(c.closesAt) <= now : false;
}

/** Results are shown only once the census is closed with enough responses. */
export function censusResultsVisible(
  c: CensusTiming & { responseCount: number },
  now: number = Date.now(),
): boolean {
  return isCensusClosed(c, now) && c.responseCount >= CENSUS_MIN_RESPONSES;
}

export interface CensusResultQuestion {
  id: string;
  prompt: string;
  kind: 'single' | 'multi';
  options: { id: string; label: string; count: number; pct: number }[];
}

export function buildCensusResults(
  questions: readonly CensusQuestion[],
  tallies: readonly { questionId: string; optionId: string; count: number }[],
  responseCount: number,
): CensusResultQuestion[] {
  const count = new Map(tallies.map((t) => [`${t.questionId}:${t.optionId}`, t.count]));
  return questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    kind: q.kind,
    options: q.options.map((o) => {
      const c = count.get(`${q.id}:${o.id}`) ?? 0;
      return {
        id: o.id,
        label: o.label,
        count: c,
        pct: responseCount > 0 ? Math.round((c / responseCount) * 100) : 0,
      };
    }),
  }));
}
