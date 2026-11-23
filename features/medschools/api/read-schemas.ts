import { z } from 'zod';
import { decodeLiveCursor } from '../engine/public-read';

/** Query schemas for the public reads (server-side importers only; the contract imports types). */

const program = z.enum(['ALL', 'REG', 'PHD']);
const degree = z.enum(['MD', 'DO']);
/** `programs=md,do-phd`: one to four of the program keys, comma separated (any order; the reader canonicalises). */
const programsParam = z
  .string()
  .max(40)
  .regex(/^(md|md-phd|do|do-phd)(,(md|md-phd|do|do-phd)){0,3}$/);
const state = z.string().regex(/^[A-Z]{2}$/);
const chartedType = z.enum(['INTERVIEW', 'SECONDARY', 'WAITLIST', 'REJECTION', 'ACCEPTANCE']);
const anyType = z.enum(['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE', 'WITHDRAWN', 'HOLD']);

export const listSchoolsQuery = z.object({
  q: z.string().max(80).optional(),
  degree: degree.optional(),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  program: program.optional(),
  programs: programsParam.optional(),
});

export const activityQuery = z.object({
  program: program.optional(),
  cycle: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const historyQuery = z.object({
  program: program.optional(),
  type: chartedType.optional(),
});

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

export const todayQuery = z.object({ program: program.optional(), degree: degree.optional() });

export type ListSchoolsQuery = z.infer<typeof listSchoolsQuery>;
export type ActivityQuery = z.infer<typeof activityQuery>;
export type HistoryQuery = z.infer<typeof historyQuery>;
export type ArrivalsQuery = z.infer<typeof arrivalsQuery>;
export type LiveQuery = z.infer<typeof liveQuery>;
export type TodayQuery = z.infer<typeof todayQuery>;
