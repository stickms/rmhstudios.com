import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export interface MusicGuessListItem {
  id: string;
  artist: string;
  plays: number;
  solves: number;
  createdAt: string;
  author: ReturnType<typeof resolveUser>;
  solved: boolean;
}

/**
 * Puzzle list (no answers) plus, for a signed-in viewer, which puzzles they've
 * already solved. Shared by the `/api/rmhmusic/guess` GET handler and the
 * `/music-trivia` route loader so the list is server-rendered / prefetched
 * instead of fetched client-side on mount. Pass `null` for a signed-out viewer.
 */
export async function getMusicGuessList(
  userId: string | null
): Promise<{ puzzles: MusicGuessListItem[]; signedIn: boolean }> {
  const puzzles = await prisma.musicGuessPuzzle.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, artist: true, plays: true, solves: true, createdAt: true, author: { select: userDisplaySelect } },
  });

  let solvedIds = new Set<string>();
  if (userId) {
    const attempts = await prisma.musicGuessAttempt.findMany({
      where: { userId, puzzleId: { in: puzzles.map((p) => p.id) }, solved: true },
      select: { puzzleId: true },
    });
    solvedIds = new Set(attempts.map((a) => a.puzzleId));
  }

  return {
    puzzles: puzzles.map((p) => ({
      id: p.id,
      artist: p.artist,
      plays: p.plays,
      solves: p.solves,
      createdAt: p.createdAt.toISOString(),
      author: resolveUser(p.author),
      solved: solvedIds.has(p.id),
    })),
    signedIn: !!userId,
  };
}
