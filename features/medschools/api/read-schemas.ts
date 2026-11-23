import { z } from 'zod';
import { decodeLiveCursor } from '../engine/public-read';

/** Query schemas for the public reads (server-side importers only; the contract imports types). */

const program = z.enum(['ALL', 'REG', 'PHD']);
const degree = z.enum(['MD', 'DO']);
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
});

export const activityQuery = z.object({
  program: program.optional(),
  cycle: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const historyQuery = z.object({
  program: program.optional(),
  type: chartedType.optional(),
});

export const liveQuery = z.object({
  type: anyType.optional(),
  school: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional(),
  degree: degree.optional(),
  program: z.enum(['ALL', 'REG', 'PHD', 'NONE']).optional(),
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
export type LiveQuery = z.infer<typeof liveQuery>;
export type TodayQuery = z.infer<typeof todayQuery>;
