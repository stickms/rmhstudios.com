/**
 * "Your matches" (sprint 14 03), the pure half: the view shapes the endpoint answers with, the place a score takes
 * among a match's players, and the page cursor codec. Client-safe: it imports nothing from the server.
 *
 * Scores in versus matches are reported by each player's game and bounded by the hub, never verified, so nothing in
 * here feeds a board, a quest or an achievement.
 */

export const MATCHES_PAGE_SIZE = 20;

/** A guest's `userId` on the hub: `guest:<socketId>`. Never resolved to an account. */
export const GUEST_PREFIX = 'guest:';
/** The prefix of an erased member's ids: `deleted:<row id>` (one per row, so the unique keys still hold). */
export const TOMBSTONE_PREFIX = 'deleted:';
/** The name an erased member keeps on the rows other players still see. */
export const DELETED_PLAYER_NAME = 'Deleted user';

/** How another player in a match is shown. A name is carried only for `player`; the other two are words the screen owns. */
export interface OtherPlayerView {
  kind: 'player' | 'deleted' | 'anonymous';
  name: string | null;
}

export interface MatchView {
  id: string;
  /** ISO time: the match's end, else the row's last update. */
  endedAt: string;
  /** 1-based; players with an equal score share a place. */
  place: number;
  /** Everyone who took a seat, the member included. */
  players: number;
  score: number;
  maxCombo: number;
  solved: number;
  missed: number;
  /** False when the member left before finishing ("Left early"). */
  finished: boolean;
  others: OtherPlayerView[];
}

export interface MatchesPage {
  matches: MatchView[];
  nextCursor: string | null;
}

/** The place a score takes among all of a match's scores (the member's own included): 1 + the scores above it. */
export function placeByScore(allScores: readonly number[], score: number): number {
  let above = 0;
  for (const s of allScores) if (s > score) above++;
  return above + 1;
}

/** An id on a match row that is a guest's, or an erased member's, rather than an account's. */
export function isGuestId(userId: string): boolean {
  return userId.startsWith(GUEST_PREFIX);
}
export function isTombstoneId(userId: string): boolean {
  return userId.startsWith(TOMBSTONE_PREFIX);
}

export interface MatchesCursor {
  at: Date;
  id: string;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** `(lastUpdateAt, id)` of the last row of a page, as one opaque token. */
export function encodeMatchesCursor(cursor: MatchesCursor): string {
  return toBase64Url(`${cursor.at.getTime()}.${cursor.id}`);
}

/** The cursor a token carries, or null for anything that is not one (the endpoint answers 400). */
export function decodeMatchesCursor(token: string): MatchesCursor | null {
  if (token.length === 0 || token.length > 200) return null;
  try {
    const text = fromBase64Url(token);
    const dot = text.indexOf('.');
    if (dot <= 0) return null;
    const ms = Number(text.slice(0, dot));
    const id = text.slice(dot + 1);
    if (!Number.isSafeInteger(ms) || id.length === 0 || id.length > 64) return null;
    const at = new Date(ms);
    if (Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}
