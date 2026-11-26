/**
 * Rivals (sprint 15 15), the pure half: the record against one named player, the rules for who may be a rival, and
 * the view shapes the endpoint answers with. Client-safe: it imports nothing from the server.
 *
 * A rival is another signed-in account the member finished at least one versus match with. Guests, erased members,
 * blocked members (either direction), banned members and members who turned leaderboards off are never listed: a win
 * and loss record against a named person is a ranking, and a rivalry with an unnamed opponent says nothing.
 *
 * Scores in versus matches are reported by each player's game and never verified, so nothing here feeds a board, a
 * quest or an achievement. No account id is in a view: a rival is named by `key`, the rival's own `SSPlayerMatch` row
 * id from the latest shared match, which the server resolves and checks.
 */
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { DELETED_PLAYER_NAME, isGuestId, isTombstoneId } from './matches';

/** The most rivals one answer carries. */
export const RIVALS_LIMIT = 50;

/** The longest `with` key the endpoint accepts (a cuid is 25 characters). */
export const RIVAL_KEY_MAX = 64;

/** One rival: the record of the member against them, over the matches both of them finished. */
export interface RivalView {
  /** The rival's `SSPlayerMatch` row id from the latest shared match; `with=<key>` opens the shared matches. */
  key: string;
  name: string;
  /** Matches together: `wins + losses + ties`. */
  matches: number;
  /** Matches the member finished ahead of the rival, by score. */
  wins: number;
  losses: number;
  ties: number;
  /** ISO time of the latest shared match. */
  lastAt: string;
}

export interface RivalsPage {
  rivals: RivalView[];
}

export interface Tally {
  matches: number;
  wins: number;
  losses: number;
  ties: number;
}

/** The win, loss and tie count of the member's scores against the rival's, one pair per shared match. */
export function tallyScores(pairs: ReadonlyArray<{ mine: number; theirs: number }>): Tally {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const { mine, theirs } of pairs) {
    if (mine > theirs) wins++;
    else if (mine < theirs) losses++;
    else ties++;
  }
  return { matches: pairs.length, wins, losses, ties };
}

/** An id on a match row that can name a rival at all: an account, never a guest's or an erased member's. */
export function isRivalAccountId(userId: string): boolean {
  return userId.length > 0 && !isGuestId(userId) && !isTombstoneId(userId);
}

/** The account facts the rival rules need. */
export interface RivalUser {
  id: string;
  name: string | null;
  bannedUntil: Date | null;
  banReason: string | null;
}

/**
 * Whether a player may be listed as a rival (or opened by key): a live, named, signed-in account that is neither
 * across a block either way, nor under a ban, nor hidden from the boards.
 */
export function isListableRival(
  userId: string,
  user: RivalUser | undefined,
  blockedIds: ReadonlySet<string>,
  hiddenIds: ReadonlySet<string>,
  now: Date,
): boolean {
  if (!isRivalAccountId(userId)) return false;
  if (!user) return false;
  if (user.id === DELETED_USER_ID || user.banReason === DELETED_ACCOUNT_BAN_REASON) return false;
  if (!user.name || user.name === DELETED_PLAYER_NAME) return false;
  if (blockedIds.has(userId) || hiddenIds.has(userId)) return false;
  if (user.bannedUntil && user.bannedUntil.getTime() > now.getTime()) return false;
  return true;
}

/** Most matches together first, then the latest; the order of the list. */
export function compareRivals(a: Pick<RivalView, 'matches' | 'lastAt'>, b: Pick<RivalView, 'matches' | 'lastAt'>) {
  return b.matches - a.matches || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0);
}
