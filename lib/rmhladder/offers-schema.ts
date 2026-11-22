/**
 * Validation for the offer endpoints (sprint 03, feature 17). Amounts are digit
 * strings of minor units, at most 10^12; days are `YYYY-MM-DD`.
 */
import { z } from 'zod';
import { parseDay } from '@/lib/calendar/tz';
import { CURRENCY_CODES, MAX_MINOR_UNITS, PAY_PERIODS, REMOTE_POLICIES } from '@/lib/rmhladder/offers';

const minorUnits = z
  .string()
  .regex(/^\d{1,13}$/)
  .refine((value) => Number(value) <= MAX_MINOR_UNITS, 'Amount is too large');

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => parseDay(value) !== null, 'Not a calendar day');

const fields = {
  currency: z.enum(CURRENCY_CODES),
  basePay: minorUnits,
  payPeriod: z.enum(PAY_PERIODS),
  hoursPerWeek: z.number().int().min(1).max(168).nullable(),
  bonusAmount: minorUnits.nullable(),
  bonusPercent: z.number().int().min(0).max(1000).nullable(),
  signOn: minorUnits.nullable(),
  equityGrant: minorUnits.nullable(),
  equityYears: z.number().int().min(1).max(20).nullable(),
  equityNote: z.string().max(300).nullable(),
  location: z.string().max(120).nullable(),
  remote: z.enum(REMOTE_POLICIES).nullable(),
  ptoDays: z.number().int().min(0).max(365).nullable(),
  startDate: day.nullable(),
  deadline: day.nullable(),
  notes: z.string().max(2000).nullable(),
};

/** Record an offer on an application. Cross-field rules (`offerProblems`) run in the service. */
export const offerBody = z.object({
  applicationId: z.string().min(1).max(100),
  ...fields,
});

/** Change an offer: any subset of the fields. */
export const offerPatchBody = z.object(fields).partial();

export const decideBody = z.object({
  decision: z.enum(['accept', 'decline']),
  /** Applications to withdraw on accept; nothing is withdrawn unless listed. */
  withdrawApplicationIds: z.array(z.string().min(1).max(100)).max(200),
});
