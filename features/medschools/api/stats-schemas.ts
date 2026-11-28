/**
 * Bodies of the private stats endpoints (phase D) and of the list builder. Strict: an unknown key is refused, so nothing
 * the member did not mean to send is ever stored. Every field is optional; the rules are `engine/applicant.ts`'s.
 */
import { z } from 'zod';
import { SCHOOL_SLUG_RE } from '../engine/school-slug';
import {
  GRADUATE_TYPES,
  HOURS_CATEGORIES,
  MISSIONS,
  POSTBACC_TYPES,
  STATS_LIMITS,
  attemptProblem,
  gpaOk,
  withTotal,
  type McatAttempt,
} from '../engine/applicant';
import { normalizeHomeState } from '../engine/tracker';

const noControl = (s: string) => !/[^\P{Cc}\n\r\t]/u.test(s);

/** Free text the member writes: trimmed, no control characters; empty is no note. */
const note = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((s) => s.trim())
    .refine((s) => [...s].length <= max, 'too long')
    .refine(noControl, 'control characters')
    .nullable()
    .optional()
    .transform((s) => (s ? s : null));

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const gpa = z.number().refine(gpaOk, 'a GPA is 0.00 to 4.00 with two decimals').nullable().optional();
const section = int(STATS_LIMITS.section.min, STATS_LIMITS.section.max).nullable().optional();

const attempt = z
  .object({
    year: int(STATS_LIMITS.year.min, STATS_LIMITS.year.max),
    month: int(1, 12),
    day: int(1, 31).nullable().optional(),
    total: int(STATS_LIMITS.total.min, STATS_LIMITS.total.max).nullable().optional(),
    cpbs: section,
    cars: section,
    bbls: section,
    psbb: section,
  })
  .strict()
  .transform(
    (a): McatAttempt => ({
      year: a.year,
      month: a.month,
      day: a.day ?? null,
      total: a.total ?? null,
      cpbs: a.cpbs ?? null,
      cars: a.cars ?? null,
      bbls: a.bbls ?? null,
      psbb: a.psbb ?? null,
    }),
  )
  .superRefine((a, ctx) => {
    const problem = attemptProblem(a);
    if (problem) ctx.addIssue({ code: 'custom', message: `mcat ${problem}` });
  })
  .transform(withTotal);

const activity = z
  .object({
    title: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => s.length > 0 && [...s].length <= STATS_LIMITS.title, 'title')
      .refine(noControl, 'control characters'),
    hours: int(0, STATS_LIMITS.hours).nullable().optional(),
    note: note(STATS_LIMITS.note),
  })
  .strict()
  .transform((a) => ({ title: a.title, hours: a.hours ?? null, note: a.note ?? null }));

const hoursRow = z
  .object({
    category: z.enum(HOURS_CATEGORIES),
    hours: int(0, STATS_LIMITS.hours).nullable().optional(),
    note: note(STATS_LIMITS.note),
    activities: z.array(activity).max(STATS_LIMITS.activitiesPerCategory).optional(),
  })
  .strict()
  .transform((h) => ({ category: h.category, hours: h.hours ?? null, note: h.note ?? null, activities: h.activities ?? [] }));

/** `PUT /api/medschools/me/stats`: the whole stats, replacing what was stored. */
export const putStatsBody = z
  .object({
    mcat: z.array(attempt).max(STATS_LIMITS.attempts).optional(),
    gpa: z
      .object({
        cumulative: gpa,
        science: gpa,
        postbacc: gpa,
        postbaccType: z.enum(POSTBACC_TYPES).nullable().optional(),
        graduate: gpa,
        graduateType: z.enum(GRADUATE_TYPES).nullable().optional(),
      })
      .strict()
      .optional(),
    hours: z
      .array(hoursRow)
      .max(HOURS_CATEGORIES.length)
      .optional()
      .refine((rows) => new Set((rows ?? []).map((r) => r?.category)).size === (rows ?? []).length, 'duplicate category')
      .refine(
        (rows) => (rows ?? []).reduce((n, r) => n + (r?.activities?.length ?? 0), 0) <= STATS_LIMITS.activities,
        'too many activities',
      ),
    /** The home-state preference (written to `MedUserPrefs`); absent leaves it as it is. */
    homeState: z
      .string()
      .max(8)
      .nullable()
      .optional()
      .refine((v) => normalizeHomeState(v) !== 'invalid', 'invalid home state'),
    missions: z
      .array(z.enum(MISSIONS))
      .max(MISSIONS.length)
      .optional()
      .transform((m) => [...new Set(m ?? [])]),
    publications: int(0, STATS_LIMITS.count).nullable().optional(),
    presentations: int(0, STATS_LIMITS.count).nullable().optional(),
  })
  .strict();
export type PutStatsBody = z.infer<typeof putStatsBody>;

/** `PUT /api/medschools/me/stats/onboarding`: the member pressed "Skip for now". */
export const putOnboardingBody = z.object({ state: z.literal('skipped') }).strict();

/** `POST /api/medschools/me/list-builder`: the member's request in words, whether to use their stats, thinking. */
export const buildListBody = z
  .object({
    request: z.string().trim().min(3).max(400).refine(noControl, 'control characters'),
    useStats: z.boolean().optional(),
    think: z.boolean().optional(),
  })
  .strict();
export type BuildListBody = z.infer<typeof buildListBody>;

/** `POST /api/medschools/me/list-builder/save`: a new list holding the ticked schools. */
export const saveBuiltListBody = z
  .object({
    name: z.string().trim().min(1).max(60).refine(noControl, 'control characters'),
    items: z
      .array(z.object({ slug: z.string().regex(SCHOOL_SLUG_RE), program: z.enum(['ANY', 'REG', 'PHD']).optional() }).strict())
      .min(1)
      .max(60),
  })
  .strict();
export type SaveBuiltListBody = z.infer<typeof saveBuiltListBody>;
