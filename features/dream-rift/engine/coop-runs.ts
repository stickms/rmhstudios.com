/**
 * Co-op runs the hub vouches for (sprint 15 09), the pure half: the finish window, the shapes the board and "Your
 * co-op runs" answer with, the slot-to-account rule, how a slot is shown, and the page cursor. Client-safe: it imports
 * nothing from the server.
 *
 * Scores are the host's claim and are never verified (the host's game is authoritative, as for every Dream Rift score).
 * What the hub vouches for is who sat in the lobby and when the run began.
 */
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';

/** The host has this long after the hub started a run to post it. */
export const COOP_FINISH_WINDOW_MS = 6 * 60 * 60_000;

/** A run started and never finished is deleted by the nightly job once it is this old. */
export const COOP_UNFINISHED_TTL_MS = 24 * 60 * 60_000;

/** Rows a page of "Your co-op runs" holds. */
export const COOP_MINE_PAGE_SIZE = 20;

/** Rows the board holds. */
export const COOP_BOARD_SIZE = 20;

/** Lobby seats: `memberIds` is indexed by slot, so it is never longer than this. */
export const COOP_MAX_SLOTS = 4;

/** The name an erased member keeps on every run, and the word the screens show for one. */
export const COOP_DELETED_NAME = 'Deleted user';

/** The earliest `startedAt` a run can have and still be finished now. */
export function finishCutoff(now: Date): Date {
  return new Date(now.getTime() - COOP_FINISH_WINDOW_MS);
}

/** The latest `startedAt` that makes an unfinished run old enough to delete. */
export function pruneCutoff(now: Date): Date {
  return new Date(now.getTime() - COOP_UNFINISHED_TTL_MS);
}

/** The lobby's roster as the hub holds it: slot and the socket session's account id (`'guest'` when signed out). */
export interface RosterSeat {
  slot: number;
  userId: string;
}

/**
 * The signed-in members' ids by slot, guests and empty seats as `''`. The ids come from the socket server's session
 * (`socket.data.userId`), never from a client payload; anything that is not a real account id becomes `''`.
 */
export function memberIdsBySlot(roster: readonly RosterSeat[]): string[] {
  const out: string[] = Array.from({ length: COOP_MAX_SLOTS }, () => '');
  for (const seat of roster) {
    if (!Number.isInteger(seat.slot) || seat.slot < 0 || seat.slot >= COOP_MAX_SLOTS) continue;
    const id = seat.userId;
    out[seat.slot] = typeof id === 'string' && id !== '' && id !== 'guest' && id !== 'local' ? id : '';
  }
  return out;
}

/** What the board (and a member's list) hold for one slot of a run. Stored on `DreamRiftCoopRun.players`. */
export interface StoredPlayer {
  slot: number | null;
  name: string;
  charId: string;
  score: number;
  /** Rows written before the feature kept a snapshot here. It is never read: the id is resolved live. */
  account: { id?: unknown } | null;
}

/** A stored `players` value as a list of slots. Tolerant of anything the JSON column could hold. */
export function readStoredPlayers(raw: unknown): StoredPlayer[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredPlayer[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const account = o.account !== null && typeof o.account === 'object' ? (o.account as { id?: unknown }) : null;
    out.push({
      slot: typeof o.slot === 'number' && Number.isInteger(o.slot) ? o.slot : null,
      name: typeof o.name === 'string' ? o.name : '',
      charId: typeof o.charId === 'string' ? o.charId : 'bllm',
      score: typeof o.score === 'number' && Number.isFinite(o.score) ? o.score : 0,
      account,
    });
  }
  return out;
}

/**
 * The account behind one slot of a run, or null for a guest. A run the hub started (`startedAt` set) takes it from
 * `memberIds` by slot; a row written before the feature has only the old snapshot, whose `id` is used and nothing else
 * of it (the name, handle and image in it are ignored and resolved live).
 */
export function slotAccountId(
  run: { startedAt: Date | null; memberIds: readonly string[] },
  player: StoredPlayer,
): string | null {
  if (run.startedAt !== null) {
    if (player.slot === null) return null;
    const id = run.memberIds[player.slot];
    return typeof id === 'string' && id !== '' ? id : null;
  }
  const id = player.account?.id;
  return typeof id === 'string' && id !== '' ? id : null;
}

/** The account columns the resolution reads. */
export interface CoopUserLookup {
  id: string;
  handle: string | null;
  name: string | null;
  image: string | null;
  bannedUntil: Date | null;
  banReason: string | null;
}

/**
 * How one slot is shown. `name`, `handle` and `image` are carried only for `player`, and `name` for `guest` (the
 * typed name); `deleted` and `anonymous` are words the screen owns, so they are translated, not stored. No account id
 * is ever part of it.
 */
export interface CoopPlayerView {
  kind: 'player' | 'guest' | 'anonymous' | 'deleted';
  name: string | null;
  handle: string | null;
  image: string | null;
  charId: string;
  score: number;
}

/** What hides a member from the viewer: the leaderboard switch or a ban (the board's hidden set), and blocks on a member's own list. */
export interface CoopHiding {
  hidden: ReadonlySet<string>;
  blocked?: ReadonlySet<string>;
}

/**
 * Resolve one slot at read time: the current name and handle for a member, "A player" for a member who turned boards off,
 * is banned or (on a member's own list) is across a block, "Deleted user" for an erased account, and the typed name for a
 * guest. Pure, so each rule is tested row by row.
 */
export function resolvePlayerView(
  player: StoredPlayer,
  accountId: string | null,
  users: ReadonlyMap<string, CoopUserLookup>,
  hiding: CoopHiding,
  now: Date,
): CoopPlayerView {
  const base = { charId: player.charId, score: player.score };
  if (accountId === null) {
    return { ...base, kind: 'guest', name: player.name.slice(0, 24) || null, handle: null, image: null };
  }
  const user = users.get(accountId);
  if (
    !user ||
    user.id === DELETED_USER_ID ||
    user.banReason === DELETED_ACCOUNT_BAN_REASON ||
    user.name === COOP_DELETED_NAME
  ) {
    return { ...base, kind: 'deleted', name: null, handle: null, image: null };
  }
  const banned = user.bannedUntil !== null && user.bannedUntil.getTime() > now.getTime();
  if (hiding.hidden.has(accountId) || hiding.blocked?.has(accountId) || banned || !user.name) {
    return { ...base, kind: 'anonymous', name: null, handle: null, image: null };
  }
  return { ...base, kind: 'player', name: user.name, handle: user.handle, image: user.image };
}

/** One run on the co-op board. */
export interface CoopBoardEntry {
  combinedScore: number;
  timeSurvived: number;
  stageReached: number;
  cleared: boolean;
  playerCount: number;
  players: CoopPlayerView[];
  createdAt: string;
}

/** One run on a member's own list. `endedAt` is the finish time (the creation time for a row from before the feature). */
export interface MyCoopRun extends CoopBoardEntry {
  id: string;
  difficulty: string;
  endedAt: string;
}

export interface MyCoopRunsPage {
  runs: MyCoopRun[];
  nextCursor: string | null;
}

export {
  type TimeIdCursor as CoopCursor,
  encodeTimeIdCursor as encodeCoopCursor,
  decodeTimeIdCursor as decodeCoopCursor,
} from '@/lib/core/time-id-cursor';
