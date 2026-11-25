/**
 * Zod schemas and cursor encoding for `/api/v1/me/characters*` and `/api/v1/me/parties*` (RMHCharacters, read only).
 * Pure (no server imports) so the limits are testable on their own.
 */
import { z } from 'zod';

export const PAGE_MAX = 50;
export const PAGE_DEFAULT = 25;
const ID_MAX = 64;

const idParam = z.string().min(1).max(ID_MAX);

/** `?limit&cursor`. A character list is `updatedAt` newest first. */
export const charactersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
  cursor: z.string().min(1).max(300).optional(),
});

export const characterPath = z.object({ id: idParam });
export const partyPath = z.object({ id: idParam });

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): string | null => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

/** A list position: the `updatedAt` instant in milliseconds and the id that breaks ties. */
export interface CharacterCursor {
  ms: number;
  id: string;
}

export const encodeCharacterCursor = (c: CharacterCursor): string => b64(`${c.ms}|${c.id}`);

export function decodeCharacterCursor(raw: string): CharacterCursor | null {
  const s = unb64(raw);
  if (s === null) return null;
  const [a, ...rest] = s.split('|');
  const id = rest.join('|');
  const ms = Number(a);
  if (!id || id.length > ID_MAX || !a || !Number.isFinite(ms)) return null;
  return { ms, id };
}
