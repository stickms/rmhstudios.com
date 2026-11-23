/**
 * Cursed Logic's storage adapter (registered in `lib/game/adapters.server.ts`).
 *
 * The run is stored in the shared `GameStat` table (no migration): the generic adapter keeps the personal best, the
 * play count and the deepest duel count. What this adds is the record run's shape — sector, victory, pacts — kept
 * in `meta` and read back by the game's own board, with only the keys this game writes (anything else a caller
 * sends is dropped before it reaches the row).
 */
import type { GameAdapter, SubmitContext } from '@/lib/game/adapters.server';
import { genericAdapter, genericLeaderboardRows } from '@/lib/game/generic-adapter.server';
import { prismaRead } from '@/lib/prisma.server';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { userNotHiddenWhere } from '@/lib/game/leaderboard-privacy';
import type { CursedLogicBoardRow } from '@features/cursed-logic/engine/cursed-logic.contract';

export const CURSED_LOGIC_ID = 'cursed-logic';

/** The meta keys a Cursed Logic row carries, and their bounds. */
const META_BOUNDS = { sector: 5, victory: 1, pacts: 4 } as const;

export function cleanMeta(meta: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, max] of Object.entries(META_BOUNDS)) {
    const v = meta?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(max, Math.max(0, Math.round(v)));
  }
  return out;
}

// Built on first use, not at import: `lib/game/adapters.server.ts` imports this module while the registry it
// reads may still be loading.
let generic: GameAdapter | null = null;
const base = (): GameAdapter => (generic ??= genericAdapter(CURSED_LOGIC_ID));

export const cursedLogicAdapter: GameAdapter = {
  metric: 'highScore',
  submit: (ctx: SubmitContext) => base().submit!({ ...ctx, meta: cleanMeta(ctx.meta) }),
  leaderboard: (limit) => genericLeaderboardRows(CURSED_LOGIC_ID, { take: limit }),
  personalBest: (userId) => base().personalBest!(userId),
  rankOf: (score) => base().rankOf!(score),
};

/** The game's own board: the shared rows plus the record run's sector, victory and pacts. */
export async function cursedLogicBoard(limit: number): Promise<CursedLogicBoardRow[]> {
  const hidden = await leaderboardHiddenUserIds();
  const rows = await prismaRead.gameStat.findMany({
    where: {
      gameId: CURSED_LOGIC_ID,
      score: { gt: 0 },
      ...(hidden.size > 0 ? { AND: [userNotHiddenWhere(hidden)] } : {}),
    },
    orderBy: [{ score: 'desc' }, { updatedAt: 'asc' }],
    take: limit,
    select: {
      username: true,
      score: true,
      progress: true,
      meta: true,
    },
  });
  return rows.map((r, i) => {
    const meta = cleanMeta((r.meta ?? {}) as Record<string, number>);
    return {
      rank: i + 1,
      // The score route stores the account name with every run, so the row's own name is the display name.
      username: r.username ?? 'Player',
      score: r.score,
      duels: r.progress,
      sector: meta.sector ?? 1,
      victory: meta.victory === 1,
      pacts: meta.pacts ?? 0,
    };
  });
}
