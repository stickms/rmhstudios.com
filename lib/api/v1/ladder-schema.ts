/**
 * Zod schemas and cursor encoding for `/api/v1/me/ladder/*` (RMHLadder; scopes `read:ladder` and `write:ladder`).
 * Pure (no server imports) so the limits are testable on their own.
 *
 * What a key may change is a short list on purpose: status, the three dates and notes of an application, and the
 * fields of an own job. Offers, pay, resumes, referral names, contact e-mails, cover letters and outcomes are not
 * addressable here: an unknown key in a body is a 400, so a tool cannot write one by accident.
 */
import { z } from 'zod';

export const PAGE_MAX = 50;
export const PAGE_DEFAULT = 25;
const ID_MAX = 64;

export const LADDER_STATUSES = [
  'not_applied',
  'planning',
  'applied',
  'networking',
  'interviewing',
  'final_round',
  'rejected',
  'offer',
  'withdrawn',
] as const;

const idParam = z.string().min(1).max(ID_MAX);

/** `?limit&cursor&status`: `status` is one status or a comma-separated list of them (a repeated parameter would not survive). */
export const applicationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
  cursor: z.string().min(1).max(300).optional(),
  status: z
    .string()
    .max(200)
    .optional()
    .transform((raw) =>
      raw
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    )
    .pipe(z.array(z.enum(LADDER_STATUSES)).max(LADDER_STATUSES.length)),
});

export const applicationPath = z.object({ id: idParam });

/** A calendar day (`2026-12-02`) or an instant (`2026-12-02T15:00:00Z`). */
const when = z
  .string()
  .min(8)
  .max(40)
  .refine((v) => /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v) && !Number.isNaN(Date.parse(v)), {
    message: 'Dates are YYYY-MM-DD or an ISO 8601 instant.',
  });

/** `PATCH`: at least one of the five fields; `null` clears a date or the notes. */
export const patchApplicationBody = z
  .strictObject({
    status: z.enum(LADDER_STATUSES).optional(),
    appliedDate: when.nullable().optional(),
    followUpDate: when.nullable().optional(),
    interviewDates: z.array(when).max(25).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Send at least one field to change.' });

export type PatchApplicationBody = z.infer<typeof patchApplicationBody>;

/**
 * `POST own-jobs`: the public fields of an own job only. Pay is not accepted (an unknown key is a 400); the site's
 * own `ownJobBody` then does the real validation and normalisation of what is here.
 */
export const createOwnJobBody = z.strictObject({
  title: z.string(),
  company: z.string(),
  link: z.string().nullish(),
  location: z.string().nullish(),
  remoteStatus: z.string().optional(),
  employmentType: z.string().optional(),
  deadline: z.string().nullish(),
});

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): string | null => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

/** A list position: the `updatedAt` instant in milliseconds and the id that breaks ties. */
export interface ApplicationCursor {
  ms: number;
  id: string;
}

export const encodeApplicationCursor = (c: ApplicationCursor): string => b64(`${c.ms}|${c.id}`);

export function decodeApplicationCursor(raw: string): ApplicationCursor | null {
  const s = unb64(raw);
  if (s === null) return null;
  const [a, ...rest] = s.split('|');
  const id = rest.join('|');
  const ms = Number(a);
  if (!id || id.length > ID_MAX || !a || !Number.isFinite(ms)) return null;
  return { ms, id };
}
