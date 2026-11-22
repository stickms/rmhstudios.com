/**
 * Tournament seeding, the server side (s05-18).
 *
 * `orderForStart` runs inside `startTournament`'s transaction, after the start
 * lock and the claim, so the method, the manual order and the ratings it reads
 * are the ones the bracket is built from. The result is recorded as
 * `TournamentEntrant.seed` 1..n, which is also the audit trail for a random
 * seeding: the shuffle is reproduced by reading the stored seeds.
 *
 * `updateSeeding` (host only) takes the same per-tournament lock and claims the
 * row while it is still REGISTRATION, so a change racing the start is either
 * seen by it or refused. `projectedSeeds` is the pre-start view.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { TournamentError } from '@/lib/tournaments/tournament-error';
import {
  cryptoRng,
  isSeedingMethod,
  manualOrderOf,
  orderEntrants,
  ratingSeedingAvailable,
  type Rng,
  type SeedEntrant,
  type SeedingMethod,
  type SeedingView,
} from '@/lib/tournaments/seeding';
import type { UpdateSeedingInput } from '@/lib/tournaments/seeding-schema';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

/** Elo rating for `game` by user id; a member with none is simply absent. */
async function loadRatings(
  db: Pick<Tx, 'eloRating'>,
  game: string,
  userIds: readonly string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.eloRating.findMany({
    where: { game, userId: { in: [...userIds] } },
    select: { userId: true, rating: true },
  });
  return new Map(rows.map((r) => [r.userId, r.rating]));
}

/**
 * The field in seed order for the start. `entrants` is the field in sign-up
 * order (check-in no-shows already removed); anything the stored method does
 * not know is treated as sign-up order, like a tournament made before seeding.
 */
export async function orderForStart<E extends SeedEntrant & { manualSeed: number | null }>(
  tx: Tx,
  t: { gameId: string; seeding: string | null | undefined },
  entrants: readonly E[],
  rng: Rng = cryptoRng,
): Promise<E[]> {
  const method: SeedingMethod = isSeedingMethod(t.seeding) ? t.seeding : 'join';
  const ratings =
    method === 'rating'
      ? await loadRatings(
          tx,
          t.gameId,
          entrants.map((e) => e.userId),
        )
      : new Map<string, number>();
  return orderEntrants(method, entrants, ratings, manualOrderOf(entrants), rng);
}

type Actor = { byUserId: string; isAdmin?: boolean };

/**
 * The host (or an admin) changes the method and/or the hand order while
 * registration is open. A hand order lists entrant ids, first seed first; every
 * id must belong to this tournament. It replaces the previous order (an id left
 * out is appended in sign-up order at the start).
 */
export async function updateSeeding(
  opts: Actor & { tournamentId: string } & UpdateSeedingInput,
  db: Db = prisma,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockKey(tx, `tournament:${opts.tournamentId}`);
    const t = await tx.tournament.findUnique({
      where: { id: opts.tournamentId },
      select: { id: true, createdById: true, status: true, gameId: true },
    });
    if (!t) throw new TournamentError('Tournament not found', 'NOT_FOUND', 404);
    if (t.createdById !== opts.byUserId && !opts.isAdmin) {
      throw new TournamentError('Only the host can do this', 'FORBIDDEN', 403);
    }
    if (t.status !== 'REGISTRATION') {
      throw new TournamentError('Seeding is locked once the tournament starts', 'STARTED', 409);
    }
    if (opts.method === 'rating' && !ratingSeedingAvailable(t.gameId)) {
      throw new TournamentError('Rating seeding is only for ranked games', 'RATING_UNAVAILABLE', 400);
    }
    // Compare-and-set on the status, so nothing below runs for a started tournament.
    const claimed = await tx.tournament.updateMany({
      where: { id: t.id, status: 'REGISTRATION' },
      data: { updatedAt: new Date(), ...(opts.method ? { seeding: opts.method } : {}) },
    });
    if (claimed.count === 0) {
      throw new TournamentError('Seeding is locked once the tournament starts', 'STARTED', 409);
    }
    const order = opts.order;
    if (!order) return;
    const field = await tx.tournamentEntrant.findMany({
      where: { tournamentId: t.id },
      select: { id: true },
    });
    const known = new Set(field.map((e) => e.id));
    if (order.some((id) => !known.has(id)) || new Set(order).size !== order.length) {
      throw new TournamentError('The order lists someone who is not an entrant', 'UNKNOWN_ENTRANT', 400);
    }
    await tx.tournamentEntrant.updateMany({
      where: { tournamentId: t.id },
      data: { manualSeed: null },
    });
    for (let i = 0; i < order.length; i++) {
      await tx.tournamentEntrant.updateMany({
        where: { id: order[i], tournamentId: t.id },
        data: { manualSeed: i + 1 },
      });
    }
  });
}

/**
 * The pre-start view: the entrants in the order the start would seed them.
 * `join` and `rating` are knowable (a rating is public on the ranked board);
 * `random` is not decided until the start; a `manual` order is the host's alone,
 * so anyone else sees the entrants in sign-up order with no seeds. Once the
 * tournament has started the stored seeds are shown to everyone.
 */
export async function projectedSeeds(
  opts: { tournamentId: string; viewerId?: string | null; isAdmin?: boolean },
  db: Db = prisma,
): Promise<SeedingView | null> {
  const t = await db.tournament.findUnique({
    where: { id: opts.tournamentId },
    select: { id: true, gameId: true, status: true, seeding: true, createdById: true },
  });
  if (!t) return null;
  const method: SeedingMethod = isSeedingMethod(t.seeding) ? t.seeding : 'join';
  const canManage = (!!opts.viewerId && opts.viewerId === t.createdById) || !!opts.isAdmin;
  const field = await db.tournamentEntrant.findMany({
    where: { tournamentId: t.id },
    orderBy: { joinedAt: 'asc' },
    select: { id: true, userId: true, seed: true, manualSeed: true },
  });

  if (t.status !== 'REGISTRATION') {
    const bySeed = [...field].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    return {
      method,
      canManage,
      entrants: bySeed.map((e) => ({ id: e.id, rating: null, projectedSeed: e.seed })),
    };
  }

  const ratings =
    method === 'rating'
      ? await loadRatings(
          db,
          t.gameId,
          field.map((e) => e.userId),
        )
      : new Map<string, number>();
  const shown = method !== 'random' && (method !== 'manual' || canManage);
  const ordered = shown ? orderEntrants(method, field, ratings, manualOrderOf(field)) : field;
  return {
    method,
    canManage,
    entrants: ordered.map((e, i) => ({
      id: e.id,
      rating: method === 'rating' ? (ratings.get(e.userId) ?? null) : null,
      projectedSeed: shown ? i + 1 : null,
    })),
  };
}
