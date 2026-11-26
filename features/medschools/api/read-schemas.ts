import { z } from 'zod';
import { MAX_SCHOOLS_FILTER } from '../engine/mine';
import { decodeLiveCursor } from '../engine/public-read';
import { MAX_STATES } from '../engine/search';
import { HOME_STATE_CODES } from '../engine/tracker';

const KNOWN_STATES = new Set(HOME_STATE_CODES);

/** Query schemas for the public reads (server-side importers only; the contract imports types). */

const program = z.enum(['ALL', 'REG', 'PHD']);
const degree = z.enum(['MD', 'DO']);
/** `programs=md,do-phd`: one to four of the program keys, comma separated (any order; the reader canonicalises). */
const programsParam = z
  .string()
  .max(40)
  .regex(/^(md|md-phd|do|do-phd)(,(md|md-phd|do|do-phd)){0,3}$/);
/**
 * `state=CA,NY`: one to `MAX_STATES` known codes (the 50 states, DC and the territories), comma separated. The readers
 * dedupe and sort, so the filter is user-independent and one choice reads the same however it was written.
 */
const state = z
  .string()
  .max(3 * MAX_STATES)
  .regex(new RegExp(`^[A-Z]{2}(,[A-Z]{2}){0,${MAX_STATES - 1}}$`))
  .refine((v) => v.split(',').every((c) => KNOWN_STATES.has(c)), 'unknown state');
/**
 * `schools=a,b,c` (owner 2026-11-24, "My cycle" / "My lists"): one to `MAX_SCHOOLS_FILTER` school slugs, comma
 * separated. The browser decides WHICH schools from the member's private tracker or lists; the endpoint sees only a
 * list anyone could type, so it stays user-independent. The readers dedupe and sort; an unknown slug matches nothing.
 */
const schools = z
  .string()
  .max(81 * MAX_SCHOOLS_FILTER)
  .regex(new RegExp(`^[a-z0-9-]{1,80}(,[a-z0-9-]{1,80}){0,${MAX_SCHOOLS_FILTER - 1}}$`));
/** `source=cycletrack|admit`: which source the totals and primary series follow (`engine/source-pref.ts`). Lower case. */
const sourcePref = z.enum(['cycletrack', 'admit']);
const chartedType = z.enum(['INTERVIEW', 'SECONDARY', 'WAITLIST', 'REJECTION', 'ACCEPTANCE']);
const anyType = z.enum(['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE', 'WITHDRAWN', 'HOLD']);

export const listSchoolsQuery = z.object({
  q: z.string().max(80).optional(),
  degree: degree.optional(),
  state: state.optional(),
  program: program.optional(),
  programs: programsParam.optional(),
  source: sourcePref.optional(),
});

export const activityQuery = z.object({
  program: program.optional(),
  cycle: z.coerce.number().int().min(2000).max(2100).optional(),
  source: sourcePref.optional(),
});

export const historyQuery = z.object({
  program: program.optional(),
  type: chartedType.optional(),
});

/** The forecast read follows the reader's CycleTrack / Admit.org choice: one stored forecast per source, never summed. */
export const forecastQuery = historyQuery.extend({ source: sourcePref.optional() });

export const arrivalsQuery = historyQuery;

export const liveQuery = z.object({
  type: anyType.optional(),
  school: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional(),
  degree: degree.optional(),
  program: z.enum(['ALL', 'REG', 'PHD', 'NONE']).optional(),
  programs: programsParam.optional(),
  /** The activity rail's search: school name or short name, or a state code. */
  q: z.string().trim().min(1).max(80).optional(),
  state: state.optional(),
  schools: schools.optional(),
  /** Several event types at once (`types=acceptance,rejection`), upper or lower case. */
  types: z
    .string()
    .max(80)
    .regex(/^[A-Za-z]+(,[A-Za-z]+){0,6}$/)
    .refine((v) => v.split(',').every((w) => anyType.safeParse(w.toUpperCase()).success), 'unknown event type')
    .optional(),
  cursor: z
    .string()
    .max(200)
    .refine((c) => decodeLiveCursor(c) !== null)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** The live page's "Today" column: the live feed's program set and states (no type: the column counts every type). */
export const liveSummaryQuery = z.object({
  programs: programsParam.optional(),
  state: state.optional(),
  schools: schools.optional(),
});

export const todayQuery = z.object({ program: program.optional(), degree: degree.optional() });

export type ListSchoolsQuery = z.infer<typeof listSchoolsQuery>;
export type ActivityQuery = z.infer<typeof activityQuery>;
export type HistoryQuery = z.infer<typeof historyQuery>;
export type ForecastQuery = z.infer<typeof forecastQuery>;
export type ArrivalsQuery = z.infer<typeof arrivalsQuery>;
export type LiveQuery = z.infer<typeof liveQuery>;
export type LiveSummaryQuery = z.infer<typeof liveSummaryQuery>;
export type TodayQuery = z.infer<typeof todayQuery>;
