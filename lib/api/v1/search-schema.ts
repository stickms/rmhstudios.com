/**
 * Zod schemas and cursor helpers for `GET /api/v1/search/posts` and `GET /api/v1/search/people` (s08-14).
 * Pure (no server imports) so the limits and the cursor are testable on their own.
 */
import { z } from 'zod';

export const SEARCH_POSTS_LIMIT_MAX = 50;
export const SEARCH_POSTS_LIMIT_DEFAULT = 20;
export const SEARCH_PEOPLE_LIMIT_MAX = 25;
export const SEARCH_PEOPLE_LIMIT_DEFAULT = 10;
export const SEARCH_POSTS_Q_MAX = 200;
export const SEARCH_PEOPLE_Q_MAX = 100;

/** An empty parameter reads as absent, as the other v1 list routes treat `?cursor=`. */
const blankAsAbsent = (v: unknown) => (v === '' || v === null ? undefined : v);

const limitOf = (max: number, def: number) =>
  z.preprocess(
    blankAsAbsent,
    z.coerce
      .number({
        message: 'limit must be a whole number.',
      })
      .int('limit must be a whole number.')
      .min(1, `limit must be between 1 and ${max}.`)
      .max(max, `limit must be between 1 and ${max}.`)
      .default(def),
  );

const queryOf = (max: number) =>
  z
    .string({
      message: 'q is required.',
    })
    .trim()
    .min(1, 'q is required.')
    .max(max, `q must be at most ${max} characters.`);

export const searchPostsQuery = z.object({
  q: queryOf(SEARCH_POSTS_Q_MAX),
  limit: limitOf(SEARCH_POSTS_LIMIT_MAX, SEARCH_POSTS_LIMIT_DEFAULT),
  cursor: z.preprocess(blankAsAbsent, z.string().max(300, 'cursor is not valid.').optional()),
});

export const searchPeopleQuery = z.object({
  q: queryOf(SEARCH_PEOPLE_Q_MAX),
  limit: limitOf(SEARCH_PEOPLE_LIMIT_MAX, SEARCH_PEOPLE_LIMIT_DEFAULT),
});

/**
 * A page boundary. With free text results are ranked, so the cursor is the last hit's score and id (`s`, `id`);
 * with operators only they are newest first, so it is the last hit's time and id (`t`, `id`).
 */
export type SearchCursor =
  | {
      s: number;
      id: string;
    }
  | {
      t: string;
      id: string;
    };

export function encodeSearchCursor(c: SearchCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

/** Decode a cursor; `null` when it is not one this API issued. */
export function decodeSearchCursor(raw: string): SearchCursor | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 64) return null;
    if (typeof o.s === 'number' && Number.isFinite(o.s))
      return {
        s: o.s,
        id: o.id,
      };
    if (typeof o.t === 'string' && !Number.isNaN(Date.parse(o.t)))
      return {
        t: o.t,
        id: o.id,
      };
    return null;
  } catch {
    return null;
  }
}
