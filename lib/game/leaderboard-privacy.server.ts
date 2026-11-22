/**
 * Leaderboard privacy — the server half (sprint 05 #01).
 *
 * One helper answers "who is left off a public board": members who turned
 * `UserProfile.hideFromLeaderboards` on, and members whose `bannedUntil` is still in the future
 * (their rows are kept, so an unban puts them back). Every board reads it: the unified boards in
 * `adapters.server.ts` and `generic-adapter.server.ts`, the friends and community scopes, the
 * per-game top-ten routes, the developer API and the site XP board.
 *
 * The set is the same for every caller, so the routes that declare `cache: { visibility: 'public' }`
 * stay anonymous-invariant. It is cached in-process for 60 s, so a switch takes effect on the next
 * board read in this process and within a minute everywhere else.
 */

import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { HIDDEN_ID_CAP } from '@/lib/game/leaderboard-privacy';

export const LEADERBOARD_HIDDEN_CACHE_KEY = 'leaderboard:hidden-users';
export const LEADERBOARD_HIDDEN_TTL_MS = 60_000;

/** Ids left off every public game board, capped at {@link HIDDEN_ID_CAP}. */
export async function leaderboardHiddenUserIds(): Promise<ReadonlySet<string>> {
  // Stored as an array: cached values may be shared through JSON, and a Set does not survive that.
  const ids = await cached<string[]>(
    LEADERBOARD_HIDDEN_CACHE_KEY,
    LEADERBOARD_HIDDEN_TTL_MS,
    async () => {
      const [optedOut, banned] = await Promise.all([
        prisma.userProfile.findMany({
          where: { hideFromLeaderboards: true },
          select: { userId: true },
          take: HIDDEN_ID_CAP,
        }),
        prisma.user.findMany({
          where: { bannedUntil: { gt: new Date() } },
          select: { id: true },
          take: HIDDEN_ID_CAP,
        }),
      ]);
      const all = new Set<string>([...optedOut.map((r) => r.userId), ...banned.map((r) => r.id)]);
      return [...all].slice(0, HIDDEN_ID_CAP);
    },
    { l2: false },
  );
  return new Set(ids);
}

/**
 * The operations that erase a member from every game board, for `anonymizeAccount`'s transaction.
 * Accounts are anonymised in place, so `onDelete: Cascade` never fires: every player table and the
 * shared `GameStat` are cleared here, and the co-op run keeps its row but loses its host. The names
 * typed into a run's `players` snapshot are out of scope (the host typed them).
 *
 * `LEADERBOARD_ERASED_MODELS` in the test lists these, and a DMMF check fails when a new player
 * table is not in it.
 */
export function leaderboardErasureOps(userId: string) {
  const where = { where: { userId } };
  return [
    prisma.laundryPlayer.deleteMany(where),
    prisma.voidBreakerPlayer.deleteMany(where),
    prisma.neonDriftwayPlayer.deleteMany(where),
    prisma.nightrailPlayer.deleteMany(where),
    prisma.signalForgePlayer.deleteMany(where),
    prisma.vegaPlayer.deleteMany(where),
    prisma.dreamRiftPlayer.deleteMany(where),
    prisma.gabrielsHornPlayer.deleteMany(where),
    prisma.player.deleteMany(where),
    prisma.globeSetPlayer.deleteMany(where),
    prisma.synapseStormPlayer.deleteMany(where),
    prisma.songLeaderboard.deleteMany(where),
    prisma.altairPlayer.deleteMany(where),
    prisma.gameStat.deleteMany(where),
    prisma.dreamRiftCoopRun.updateMany({
      where: { hostUserId: userId },
      data: { hostUserId: null },
    }),
  ];
}
