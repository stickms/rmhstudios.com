/**
 * Zod schemas and cursor encoding for `/api/v1/tournaments*` and `/api/v1/me/tournaments`.
 * Pure (no server imports) so the limits are testable on their own.
 */
import { z } from 'zod';

export const PAGE_MAX = 100;
export const PAGE_DEFAULT = 25;
/** A bracket is read in rounds and slots; one page of matches may be larger than a list page. */
export const MATCH_PAGE_MAX = 200;
export const MATCH_PAGE_DEFAULT = 100;
const ID_MAX = 64;

export const TOURNAMENT_STATUSES = ['REGISTRATION', 'LIVE', 'COMPLETE', 'CANCELLED'] as const;

const idParam = z.string().min(1).max(ID_MAX);
const cursor = z.string().min(1).max(300).optional();
const pageLimit = (max: number, fallback: number) => z.coerce.number().int().min(1).max(max).default(fallback);
/** A status filter is one value: a repeated parameter does not survive, so a list is not offered. */
const status = z.enum(TOURNAMENT_STATUSES).optional();

export const tournamentPath = z.object({
  id: idParam,
});
export const matchPath = z.object({
  id: idParam,
  matchId: idParam,
});

/** `?status&game&limit&cursor`. Without `status`, cancelled tournaments are left out (as the site's list does). */
export const listQuery = z.object({
  status,
  game: idParam.optional(),
  limit: pageLimit(PAGE_MAX, PAGE_DEFAULT),
  cursor,
});

export const matchesQuery = z.object({
  limit: pageLimit(MATCH_PAGE_MAX, MATCH_PAGE_DEFAULT),
  cursor,
});

export const myTournamentsQuery = z.object({
  status,
  limit: pageLimit(PAGE_MAX, PAGE_DEFAULT),
  cursor,
});

/**
 * The key owner reports a match: `me` or `opponent` won. The site's claim has no score field, so
 * none is accepted (the body is strict: an unknown field is a 400).
 */
export const claimBody = z
  .object({
    winner: z.enum(['me', 'opponent']),
  })
  .strict();

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): string | null => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

/** A list position: a millisecond instant and the row id that breaks ties. */
export interface TimeCursor {
  ms: number;
  id: string;
}

export const encodeTimeCursor = (c: TimeCursor): string => b64(`${c.ms}|${c.id}`);

export function decodeTimeCursor(raw: string): TimeCursor | null {
  const s = unb64(raw);
  if (s === null) return null;
  const [a, ...rest] = s.split('|');
  const id = rest.join('|');
  const ms = Number(a);
  if (!id || id.length > ID_MAX || !Number.isFinite(ms)) return null;
  return {
    ms,
    id,
  };
}

/** A bracket position: the round and the slot within it. */
export interface SlotCursor {
  round: number;
  slot: number;
}

export const encodeSlotCursor = (c: SlotCursor): string => b64(`${c.round}|${c.slot}`);

export function decodeSlotCursor(raw: string): SlotCursor | null {
  const s = unb64(raw);
  if (s === null) return null;
  const [a, b, ...extra] = s.split('|');
  const round = Number(a);
  const slot = Number(b);
  if (extra.length || !Number.isInteger(round) || !Number.isInteger(slot)) return null;
  return {
    round,
    slot,
  };
}
