/**
 * Zod schemas and cursor encoding for `/api/v1/me/homes/*` (RMH Homes; scopes `read:homes` and `write:homes`).
 * Pure (no server imports) so the limits are testable on their own.
 *
 * What a key may write is two things on a saved home: the member's private note and the price-drop alert. Nothing
 * else about a listing is addressable here, and an unknown key in a body is a 400.
 */
import { z } from 'zod';

export const PAGE_MAX = 50;
export const PAGE_DEFAULT = 25;
export const NOTE_MAX = 1000;
const ID_MAX = 64;

/** `?limit&cursor` of the saved-homes list. */
export const savedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
  cursor: z.string().min(1).max(300).optional(),
});

export const listingPath = z.object({ listingId: z.string().min(1).max(ID_MAX) });

/**
 * `PUT` body: both fields optional (an empty body just saves). `note` is trimmed and an empty note becomes `null`
 * (clears it); `priceAlerts` turns the "tell me if the price drops" alert on or off.
 */
export const putSavedBody = z.strictObject({
  note: z
    .string()
    .trim()
    .max(NOTE_MAX, `A note is at most ${NOTE_MAX} characters.`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v)),
  priceAlerts: z.boolean().optional(),
});

export type PutSavedBody = z.infer<typeof putSavedBody>;

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): string | null => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

/** A list position: the `createdAt` instant in milliseconds and the row id that breaks ties. */
export interface SavedCursor {
  ms: number;
  id: string;
}

export const encodeSavedCursor = (c: SavedCursor): string => b64(`${c.ms}|${c.id}`);

export function decodeSavedCursor(raw: string): SavedCursor | null {
  const s = unb64(raw);
  if (s === null) return null;
  const [a, ...rest] = s.split('|');
  const id = rest.join('|');
  const ms = Number(a);
  if (!id || id.length > ID_MAX || !a || !Number.isFinite(ms)) return null;
  return { ms, id };
}
