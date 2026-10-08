/**
 * Matchmaking (P2) — one queue per game, sitting on top of the party contract.
 *
 * ## The gap this closes
 *
 * Thirteen games declare online play and every one of them required that you
 * already knew who you were playing with: a six-character code, typed into a
 * chat, typed back correctly. `lib/lobby-link.ts` exists because that was the
 * only way in. There was no "find me a game" anywhere on the site, which is the
 * real reason a multiplayer game here feels empty — not that nobody is online,
 * but that nothing puts two online strangers in the same room.
 *
 * ## Why it is in memory and not in Redis
 *
 * `server/CLAUDE.md` gotcha 1: all hub state is process-local, there is no
 * socket.io Redis adapter, and the tier is explicitly single-instance. A Redis
 * queue here would be the only distributed thing in a process built on the
 * assumption that nothing is, which buys nothing today and adds a failure mode.
 * If the hub is ever split, this moves with the rooms it creates.
 *
 * ## Why it adds no way to make a room
 *
 * The queue does not create rooms. It assembles a group and hands it to the
 * game's `createRoomForParty`, which is the SAME function the party system
 * calls — so however many ways there are to end up in a room, there is one
 * function that makes one. A matchmade group is a party that was assembled by
 * rating rather than by invitation.
 */

import { logger } from './logger';
import {
  partyGames,
  mintPartyTicket,
  PARTY_ROOM_GRACE_MS,
  type PartyMember,
} from './party-contract';
import { DEFAULT_BANDS, estimateWaitMs, pickGroup, type Band } from '../../lib/matchmaking/bands';

/** How often each non-empty queue tries to form a match. */
const TICK_MS = 2_000;

/** Match times kept per game for the wait estimate. */
const HISTORY = 20;

/** Queues with nobody in them are dropped rather than ticked forever. */
export interface QueueEntry {
  /** Party id when a party queued together, else the lone user's id. */
  key: string;
  members: PartyMember[];
  rating: number;
  joinedAt: number;
  /** Sockets to notify. A party has several; a solo player may have several. */
  socketIds: Set<string>;
}

interface GameQueue {
  entries: Map<string, QueueEntry>;
  recentWaits: number[];
  timer: ReturnType<typeof setInterval> | null;
}

/** Per-game tuning. Absent = the defaults, which suit a 1v1. */
export interface QueueConfig {
  minPlayers: number;
  maxPlayers: number;
  bands: readonly Band[];
}

const QUEUE_CONFIG: Record<string, Partial<QueueConfig>> = {
  // A four-seat brawler: two is a match, four is a better one. Patient, because
  // a bad round is thirty seconds.
  'kowloon-knockout': { minPlayers: 2, maxPlayers: 4 },
  // A table game. Two can play, but an empty table is what kills it, so the
  // bands open faster than the default.
  holdem: {
    minPlayers: 2,
    maxPlayers: 6,
    bands: [
      { afterMs: 0, spread: 200 },
      { afterMs: 10_000, spread: 500 },
      { afterMs: 30_000, spread: null },
    ],
  },
  'synapse-storm': { minPlayers: 2, maxPlayers: 8 },
  'laundry-sort': { minPlayers: 2, maxPlayers: 8 },
  "gabriels-horn": { minPlayers: 2, maxPlayers: 6 },
  'bums-rush': { minPlayers: 2, maxPlayers: 4 },
};

function configFor(game: string): QueueConfig {
  const impl = partyGames.get(game);
  const override = QUEUE_CONFIG[game] ?? {};
  return {
    minPlayers: override.minPlayers ?? 2,
    maxPlayers: override.maxPlayers ?? impl?.maxPartySize ?? 2,
    bands: override.bands ?? DEFAULT_BANDS,
  };
}

const queues = new Map<string, GameQueue>();
/** Which queue a key is in, so LEAVE and disconnect do not have to search. */
const keyToGame = new Map<string, string>();

function queueFor(game: string): GameQueue {
  let q = queues.get(game);
  if (!q) {
    q = { entries: new Map(), recentWaits: [], timer: null };
    queues.set(game, q);
  }
  return q;
}

/** Is this game queueable at all? Only a party-enabled game can be. */
export function isQueueable(game: string): boolean {
  return partyGames.has(game);
}

export interface QueueState {
  game: string;
  /** Entries ahead of this one, oldest first. */
  position: number;
  /** People searching, counting party members individually. */
  searching: number;
  /** Median recent wait, or null when there is not enough history to say. */
  estimateMs: number | null;
  /** Current rating spread, or null once the search accepts anyone. */
  spread: number | null;
}

export function stateFor(game: string, key: string, now = Date.now()): QueueState | null {
  const q = queues.get(game);
  const entry = q?.entries.get(key);
  if (!q || !entry) return null;

  const byWait = [...q.entries.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  const cfg = configFor(game);
  const waited = now - entry.joinedAt;
  let spread: number | null = cfg.bands[0]?.spread ?? null;
  for (const b of cfg.bands) if (waited >= b.afterMs) spread = b.spread;

  return {
    game,
    position: byWait.findIndex((e) => e.key === key),
    searching: [...q.entries.values()].reduce((n, e) => n + e.members.length, 0),
    estimateMs: estimateWaitMs(q.recentWaits),
    spread,
  };
}

/** Queue stats for a game nobody has joined yet — what PEEK answers. */
export function statsFor(game: string): { searching: number; estimateMs: number | null } {
  const q = queues.get(game);
  if (!q) return { searching: 0, estimateMs: null };
  return {
    searching: [...q.entries.values()].reduce((n, e) => n + e.members.length, 0),
    estimateMs: estimateWaitMs(q.recentWaits),
  };
}

export type StatePusher = (entry: QueueEntry, state: QueueState) => void;
/**
 * Called once per MEMBER, not once per entry.
 *
 * A ticket is a single-use bearer token minted for one user id, so the fan-out
 * has to happen where the token is minted. An earlier draft passed the whole
 * entry and let the transport fan out, which delivered every member N copies of
 * the event — each carrying a different member's ticket.
 */
export type MatchNotifier = (
  member: PartyMember,
  game: string,
  roomId: string,
  token: string,
) => void;

let pushState: StatePusher = () => {};
let notifyMatch: MatchNotifier = () => {};

/** Wire the transport once at boot, so this module never imports a socket. */
export function configureMatchmaking(opts: { pushState: StatePusher; notifyMatch: MatchNotifier }) {
  pushState = opts.pushState;
  notifyMatch = opts.notifyMatch;
}

/**
 * Join, or refresh an existing entry's sockets.
 *
 * Re-joining with the same key does NOT reset `joinedAt`. A player who
 * reconnects mid-search keeps the wait they have already served — losing it
 * would mean a flaky connection permanently starves you, and the widening
 * bands make that worse the longer it goes on.
 */
export function join(
  game: string,
  key: string,
  members: PartyMember[],
  rating: number,
  socketIds: string[],
): { ok: true } | { ok: false; reason: string } {
  if (!isQueueable(game)) return { ok: false, reason: 'not-queueable' };

  const cfg = configFor(game);
  if (members.length > cfg.maxPlayers) return { ok: false, reason: 'party-too-big' };

  const existingGame = keyToGame.get(key);
  if (existingGame && existingGame !== game) leave(key);

  const q = queueFor(game);
  const existing = q.entries.get(key);
  if (existing) {
    for (const id of socketIds) existing.socketIds.add(id);
  } else {
    q.entries.set(key, {
      key,
      members,
      rating,
      joinedAt: Date.now(),
      socketIds: new Set(socketIds),
    });
  }
  keyToGame.set(key, game);
  ensureTicking(game);
  return { ok: true };
}

/** Leave whatever queue this key is in. Idempotent. */
export function leave(key: string): void {
  const game = keyToGame.get(key);
  if (!game) return;
  keyToGame.delete(key);
  const q = queues.get(game);
  if (!q) return;
  q.entries.delete(key);
  if (q.entries.size === 0) stopTicking(game);
}

/** Drop a socket from every entry; drop the entry when it has none left. */
export function dropSocket(socketId: string): void {
  for (const [game, q] of queues) {
    for (const [key, entry] of q.entries) {
      if (!entry.socketIds.delete(socketId)) continue;
      if (entry.socketIds.size === 0) {
        q.entries.delete(key);
        keyToGame.delete(key);
      }
    }
    if (q.entries.size === 0) stopTicking(game);
  }
}

function ensureTicking(game: string): void {
  const q = queueFor(game);
  if (q.timer) return;
  q.timer = setInterval(() => tick(game), TICK_MS);
  q.timer.unref?.();
}

function stopTicking(game: string): void {
  const q = queues.get(game);
  if (!q?.timer) return;
  clearInterval(q.timer);
  q.timer = null;
}

/**
 * One pass: form a match if one can be formed, then tell everyone still
 * searching where they stand.
 *
 * Forms at most one match per tick on purpose. Two matches in the same pass
 * would both be assembled against the same pre-match queue, and the second's
 * group could contain an entry the first has already seated.
 */
async function tick(game: string): Promise<void> {
  const q = queues.get(game);
  if (!q || q.entries.size === 0) {
    stopTicking(game);
    return;
  }

  const now = Date.now();
  const cfg = configFor(game);
  const candidates = [...q.entries.values()].map((e) => ({
    entry: e,
    rating: e.rating,
    waitedMs: now - e.joinedAt,
    size: e.members.length,
  }));

  const group = pickGroup(candidates, cfg.minPlayers, cfg.maxPlayers, cfg.bands);
  if (group) {
    // Remove them from the queue BEFORE the await. Room creation is async, and
    // leaving them in means the next tick can seat the same people twice.
    for (const g of group) {
      q.entries.delete(g.entry.key);
      keyToGame.delete(g.entry.key);
    }

    const impl = partyGames.get(game);
    if (impl) {
      const members = group.flatMap((g) => g.entry.members);
      try {
        const ref = await impl.createRoomForParty(members);
        for (const g of group) {
          const waited = now - g.entry.joinedAt;
          q.recentWaits.push(waited);
          if (q.recentWaits.length > HISTORY) q.recentWaits.shift();

          for (const m of g.entry.members) {
            const token = mintPartyTicket({
              partyId: g.entry.key,
              userId: m.userId,
              game,
              roomId: ref.roomId,
            });
            // One call per member, carrying that member's own ticket.
            notifyMatch(m, game, ref.roomId, token);
          }
        }
        logger.info({ event: 'mm_matched', game, roomId: ref.roomId, groups: group.length });

        // Same reclamation the party system does: a matched group that never
        // arrives must not leave a room behind.
        if (impl.reapIfEmpty) {
          const reap = impl.reapIfEmpty.bind(impl);
          const roomId = ref.roomId;
          setTimeout(() => {
            try {
              reap(roomId);
            } catch (err) {
              logger.warn({ event: 'mm_reap_failed', game, roomId, error: String(err) });
            }
          }, PARTY_ROOM_GRACE_MS).unref?.();
        }
      } catch (err) {
        logger.warn({ event: 'mm_room_failed', game, error: String(err) });
        // Put them back rather than dropping them: a game that briefly cannot
        // make a room should cost a couple of seconds, not the whole search.
        for (const g of group) {
          q.entries.set(g.entry.key, g.entry);
          keyToGame.set(g.entry.key, game);
        }
      }
    }
  }

  for (const entry of q.entries.values()) {
    const state = stateFor(game, entry.key);
    if (state) pushState(entry, state);
  }

  if (q.entries.size === 0) stopTicking(game);
}

/** Test seam: drop all state. Never called in production. */
export function __resetMatchmaking(): void {
  for (const game of [...queues.keys()]) stopTicking(game);
  queues.clear();
  keyToGame.clear();
}
