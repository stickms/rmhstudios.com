/**
 * Matchmaking (P2) — the socket surface over `../matchmaking`.
 *
 * Thin on purpose: identity, party resolution and rate limiting here, every
 * decision about who plays whom in the queue module, and all of the arithmetic
 * in `lib/matchmaking/bands.ts` where it can be tested without a socket.
 */

import type { Server, Socket } from 'socket.io';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { MM_C2S, MM_S2C } from '../../../lib/matchmaking/events';
import { BASE_RATING } from '../../../lib/ranked/elo';
import {
  configureMatchmaking,
  dropSocket,
  isQueueable,
  join,
  leave,
  stateFor,
  statsFor,
  type QueueEntry,
  type QueueState,
} from '../matchmaking';
import { partyGames, type PartyMember } from '../party-contract';

/** Every live socket for a user id. Mirrors the party handler's helper. */
function socketsForUser(io: Server, userId: string): Socket[] {
  const out: Socket[] = [];
  for (const s of io.sockets.sockets.values()) {
    if ((s.data as { userId?: string }).userId === userId) out.push(s);
  }
  return out;
}

let wired = false;

/** Wire the queue's two outbound callbacks to socket.io, once. */
export function initializeMatchmaking(io: Server): void {
  if (wired) return;
  wired = true;
  configureMatchmaking({
    pushState: (entry: QueueEntry, state: QueueState) => {
      for (const id of entry.socketIds) io.sockets.sockets.get(id)?.emit(MM_S2C.STATE, state);
    },
    notifyMatch: (member, game, roomId, token) => {
      // Addressed to the member, not the socket that queued: someone who joined
      // on their phone and moved to a laptop should still be seated. The token
      // is this member's own — see MatchNotifier for why that matters.
      for (const s of socketsForUser(io, member.userId)) {
        s.emit(MM_S2C.MATCHED, { game, roomId, token });
      }
    },
  });
}

/**
 * A player's rating for a game, or the base rating when they have none.
 *
 * Read from `EloRating`, the same table the ranked ladder uses, so a queue and
 * a ladder cannot disagree about how good somebody is. A read failure is not
 * fatal: an unrated match is much better than a refused one.
 */
async function ratingFor(userId: string, game: string): Promise<number> {
  try {
    const row = await getPrismaClient().eloRating.findUnique({
      where: { userId_game: { userId, game } },
      select: { rating: true },
    });
    return row?.rating ?? BASE_RATING;
  } catch (err) {
    logger.warn({ event: 'mm_rating_lookup_failed', game, error: String(err) });
    return BASE_RATING;
  }
}

export function registerMatchmakingHandlers(io: Server, socket: Socket): void {
  initializeMatchmaking(io);

  const selfId = (): string =>
    typeof socket.data.userId === 'string' && socket.data.userId
      ? socket.data.userId
      : `guest:${socket.id}`;

  socket.on(MM_C2S.JOIN, async (payload: { game?: string }) => {
    if (!checkRateLimit(socket.id, MM_C2S.JOIN)) return;
    const game = typeof payload?.game === 'string' ? payload.game : '';
    if (!isQueueable(game)) {
      socket.emit(MM_S2C.ERROR, { message: 'That game cannot be queued for yet' });
      return;
    }

    const userId = selfId();
    const name = typeof socket.data.userName === 'string' ? socket.data.userName : undefined;

    // A party queues as one entry and is never split — the reason P1 comes
    // first. `partyEntryFor` returns null for someone queueing alone.
    const party = partyEntryFor(userId);
    const members: PartyMember[] = party?.members ?? [{ userId, name }];
    const key = party?.key ?? userId;

    const impl = partyGames.get(game);
    if (impl && members.length > impl.maxPartySize) {
      socket.emit(MM_S2C.ERROR, {
        message: `Your party is too big for this game (max ${impl.maxPartySize})`,
      });
      return;
    }

    // The group's rating is its best member's, not its average: a strong player
    // carrying two beginners is a strong group, and averaging is how a smurf
    // queue gets built by accident.
    const ratings = await Promise.all(members.map((m) => ratingFor(m.userId, game)));
    const rating = Math.max(...ratings);

    const socketIds = members.flatMap((m) =>
      m.userId === userId ? [socket.id] : socketsForUser(io, m.userId).map((s) => s.id),
    );

    const result = join(game, key, members, rating, socketIds);
    if (!result.ok) {
      socket.emit(MM_S2C.ERROR, { message: 'Could not join that queue' });
      logger.info({ event: 'mm_join_refused', game, reason: result.reason });
      return;
    }

    const state = stateFor(game, key);
    if (state) socket.emit(MM_S2C.STATE, state);
    logger.info({ event: 'mm_joined', game, size: members.length });
  });

  socket.on(MM_C2S.LEAVE, () => {
    if (!checkRateLimit(socket.id, MM_C2S.LEAVE)) return;
    const userId = selfId();
    leave(partyEntryFor(userId)?.key ?? userId);
  });

  socket.on(MM_C2S.PEEK, (payload: { game?: string }) => {
    if (!checkRateLimit(socket.id, MM_C2S.PEEK)) return;
    const game = typeof payload?.game === 'string' ? payload.game : '';
    if (!isQueueable(game)) return;
    socket.emit(MM_S2C.STATS, { game, ...statsFor(game) });
  });

  socket.on('disconnect', () => handleMatchmakingDisconnect(socket));
}

export function handleMatchmakingDisconnect(socket: Socket): void {
  dropSocket(socket.id);
}

/* -------------------------------------------------------------------------- */

/**
 * The party a user is leading, if any.
 *
 * Resolved through the party handler's own exported lookup rather than a second
 * copy of its state — there is one party registry and this reads it.
 */
function partyEntryFor(userId: string): { key: string; members: PartyMember[] } | null {
  return lookupParty?.(userId) ?? null;
}

type PartyLookup = (userId: string) => { key: string; members: PartyMember[] } | null;
let lookupParty: PartyLookup | null = null;

/**
 * Injected by the party handler at import time, so matchmaking can see parties
 * without importing the party handler's module-level maps (which would make the
 * two modules mutually dependent for no gain).
 */
export function setPartyLookup(fn: PartyLookup): void {
  lookupParty = fn;
}
