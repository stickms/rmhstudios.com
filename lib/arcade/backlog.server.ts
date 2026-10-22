import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { games } from '@/lib/games';
import { FINISH_STATUSES } from '@/lib/arcade/backlog';

export const isKnownGame = (id: string) => games.some((g) => g.id === id);

export interface CompletionStats {
  medianMinutes: number | null;
  count: number;
}

/** Median completion time from finished entries; one grouped read, cached. */
export function completionStats(gameId: string): Promise<CompletionStats> {
  return cached(`arcade:median:${gameId}`, 300_000, async () => {
    const rows = await prisma.$queryRaw<{ median: number | null; n: bigint }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "finishMinutes") AS median,
             COUNT(*) AS n
      FROM game_play_status
      WHERE "gameId" = ${gameId}
        AND status = ANY(${[...FINISH_STATUSES]})
        AND "finishMinutes" IS NOT NULL`;
    const r = rows[0];
    return {
      medianMinutes: r?.median == null ? null : Math.round(Number(r.median)),
      count: Number(r?.n ?? 0),
    };
  });
}
