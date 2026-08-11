import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

const DIFFICULTY_FIELDS = {
  easy: 'highScoreEasy',
  normal: 'highScoreNormal',
  hard: 'highScoreHard',
  lunatic: 'highScoreLunatic',
} as const;

type Difficulty = keyof typeof DIFFICULTY_FIELDS;

export const Route = createFileRoute('/api/dream-rift/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'dream-rift-leaderboard' },
          // Same policy, same reasoning as `void-breaker/leaderboard`: a global
          // top-N with no per-caller branch. `?difficulty=` varies the URL, which
          // is the cache key, so each difficulty caches independently.
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
        },
        async ({ request }) => {
          try {
            const { searchParams } = new URL(request.url);
            const difficultyParam = (searchParams.get('difficulty') || 'normal').toLowerCase();
            const difficulty: Difficulty =
              difficultyParam in DIFFICULTY_FIELDS ? (difficultyParam as Difficulty) : 'normal';
            const scoreField = DIFFICULTY_FIELDS[difficulty];

            const rows = await prisma.dreamRiftPlayer.findMany({
              take: 20,
              orderBy: { [scoreField]: 'desc' },
              select: {
                username: true,
                [scoreField]: true,
                bestStage: true,
                character: true,
                spellsCaptured: true,
                user: { select: { id: true, handle: true, name: true, image: true } },
              },
            });

            // Surface the linked RMH account (avatar + profile link) alongside each row.
            const leaderboard = rows.map((r) => {
              const { user, ...rest } = r as typeof r & {
                user: {
                  id: string;
                  handle: string | null;
                  name: string | null;
                  image: string | null;
                } | null;
              };
              return {
                ...rest,
                account: user
                  ? { id: user.id, handle: user.handle, name: user.name, image: user.image }
                  : null,
              };
            });

            return Response.json(leaderboard);
          } catch (e) {
            console.error('Dream Rift leaderboard fetch failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
