/**
 * Zod schemas and cursor encoding for `/api/v1/me/notifications*` (s15-10). Pure (no server imports) so the limits
 * and the two cursor forms are testable on their own.
 *
 * The list cursor is `<createdAt ISO>|<id>`: two notifications created in the same millisecond are told apart by id,
 * so a page boundary between them loses neither. The bare `<createdAt ISO>` form the endpoint used to hand out is
 * still accepted (it reads as `createdAt <`, as before), so a client part-way through a walk is not broken.
 */
import { z } from 'zod';

export const PAGE_DEFAULT = 20;
export const PAGE_MAX = 50;
/** Ids one mark-read call may name. */
export const IDS_MAX = 100;
const ID_MAX = 64;
const CURSOR_MAX = 120;

/** A list position: the `createdAt` instant, and the row id that breaks a tie at that instant (absent: old form). */
export interface NotificationCursor {
  createdAt: Date;
  id: string | null;
}

export function encodeNotificationCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

/** Read either cursor form; `null` for anything else. */
export function decodeNotificationCursor(raw: string): NotificationCursor | null {
  const bar = raw.indexOf('|');
  const iso = bar === -1 ? raw : raw.slice(0, bar);
  const id = bar === -1 ? null : raw.slice(bar + 1);
  if (id !== null && (id.length < 1 || id.length > ID_MAX)) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

const instant = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Not a valid time.');

/**
 * `?limit&cursor&unread`. `limit` stays as forgiving as it always was (a bad value is the default, a large one is
 * the cap); `cursor` is checked; `unread` is `true` or `false`.
 */
export const listQuery = z.object({
  limit: z
    .string()
    .optional()
    .transform((raw) => {
      const n = parseInt(raw ?? '', 10);
      return Number.isFinite(n) && n > 0 ? Math.min(n, PAGE_MAX) : PAGE_DEFAULT;
    }),
  cursor: z
    .string()
    .max(CURSOR_MAX)
    .refine((c) => c === '' || decodeNotificationCursor(c) !== null, 'Invalid cursor.')
    .optional(),
  unread: z.enum(['true', 'false']).optional(),
});

export type ListQuery = z.infer<typeof listQuery>;

/** `POST …/read` body: ids of your own notifications, or a time before which everything unread is read. */
export const markReadBody = z.union([
  z.strictObject({ ids: z.array(z.string().min(1).max(ID_MAX)).min(1).max(IDS_MAX) }),
  z.strictObject({ before: instant }),
]);

export type MarkReadBody = z.infer<typeof markReadBody>;
