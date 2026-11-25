/**
 * RMHLadder own jobs — the zod half (sprint 13, feature 08). The API handlers and the lazy-loaded dialog import this;
 * the contract and the pipeline route import only types from it, so zod stays off the route's critical path.
 */
import { z } from 'zod';
import {
  OWN_JOB_COMPANY_MAX,
  OWN_JOB_EMPLOYMENT_TYPES,
  OWN_JOB_LINK_MAX,
  OWN_JOB_LOCATION_MAX,
  OWN_JOB_PAY_MAX,
  OWN_JOB_PAY_PERIODS,
  OWN_JOB_REMOTE_STATUSES,
  OWN_JOB_TITLE_MAX,
  annualizePay,
  collapseWhitespace,
  deadlineToDate,
  deadlineToDay,
  normalizeOwnJobLink,
} from './own-jobs';

const text = (max: number) => z.string().transform(collapseWhitespace).pipe(z.string().min(1).max(max));
const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => (value ? collapseWhitespace(value) : null))
    .pipe(z.string().max(max).nullable());

/** Largest stored annual figure (a 32-bit column holds 2,147,483,647). */
const MAX_ANNUAL_PAY = 2_000_000_000;

const pay = z.number().int().min(0).max(OWN_JOB_PAY_MAX).nullable();

/** A calendar day typed in a date field. */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => deadlineToDay(deadlineToDate(value)) === value && value.slice(0, 4) >= '2000');

const link = z
  .string()
  .nullish()
  .transform((value) => (value ? value.trim() : null))
  .pipe(
    z
      .string()
      .max(OWN_JOB_LINK_MAX)
      .nullable()
      .refine((value) => value === null || normalizeOwnJobLink(value) !== null, { message: 'link' }),
  )
  .transform((value) => (value === null ? null : normalizeOwnJobLink(value)));

const fields = {
  title: text(OWN_JOB_TITLE_MAX),
  company: text(OWN_JOB_COMPANY_MAX),
  link,
  location: optionalText(OWN_JOB_LOCATION_MAX),
  remoteStatus: z.enum(OWN_JOB_REMOTE_STATUSES).default('onsite'),
  employmentType: z.enum(OWN_JOB_EMPLOYMENT_TYPES).default('internship'),
  deadline: day.nullish().transform((value) => value ?? null),
  payMin: pay.optional().transform((value) => value ?? null),
  payMax: pay.optional().transform((value) => value ?? null),
  payPeriod: z.enum(OWN_JOB_PAY_PERIODS).default('year'),
  payCurrency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .default('USD'),
};

type PayCheck = { payMin: number | null; payMax: number | null };
const payOrdered = (v: PayCheck) => v.payMin === null || v.payMax === null || v.payMin <= v.payMax;
/** The annual figure is stored in a 32-bit column: a typed rate that overflows it is refused. */
const payFits = (v: PayCheck & { payPeriod: 'year' | 'month' | 'hour' }) =>
  [v.payMin, v.payMax].every((n) => n === null || annualizePay(n, v.payPeriod) <= MAX_ANNUAL_PAY);

/** `POST /api/rmhladder/own-jobs`. */
export const ownJobBody = z
  .object(fields)
  .refine(payOrdered, { path: ['payMax'], message: 'payOrder' })
  .refine(payFits, { path: ['payMax'], message: 'payTooLarge' });

/** `PATCH /api/rmhladder/own-jobs/$id`: the whole job again (the dialog edits every field), so one rule set. */
export const ownJobPatchBody = ownJobBody;

export type OwnJobBody = z.infer<typeof ownJobBody>;
