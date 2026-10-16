import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { games } from '@/lib/games';
import { getGameAdapter } from '@/lib/game/adapters.server';
import { renderBadge } from '@/lib/devplatform/badge';

const TTL_MS = 10 * 60_000;

async function buildSvg(userKey: string, gameId: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userKey }, { handle: userKey }] },
    select: { id: true },
  });
  if (!user) return renderBadge('rmhstudios', 'unknown player', '#9f9f9f');

  if (gameId === 'streak') {
    const s = await prisma.dailyStreak.findUnique({
      where: { userId: user.id },
      select: { current: true },
    });
    return renderBadge('daily streak', `${s?.current ?? 0} days`, '#fe7d37');
  }

  const game = games.find((g) => g.id === gameId);
  const adapter = game ? getGameAdapter(gameId) : undefined;
  if (!game || !adapter?.personalBest) return renderBadge('rmhstudios', 'unknown game', '#9f9f9f');
  const best = await adapter.personalBest(user.id).catch(() => null);
  if (best == null) return renderBadge(game.title, 'no score yet', '#9f9f9f');
  const rank = adapter.rankOf ? await adapter.rankOf(best).catch(() => null) : null;
  return renderBadge(
    game.title,
    rank ? `${best.toLocaleString('en-US')} · #${rank}` : best.toLocaleString('en-US'),
  );
}

/**
 * GET /api/badge/:userId/:gameId.svg — public README badge (best score + rank),
 * or `streak.svg` for the daily check-in streak. `:userId` is an id or @handle.
 */
export const Route = createFileRoute('/api/badge/$userId/$gameId')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          cache: {
            visibility: 'public',
            maxAge: 3600,
            sMaxAge: 86_400,
            staleWhileRevalidate: 86_400,
          },
        },
        async ({ params }) => {
          const userKey = (params.userId ?? '').slice(0, 64);
          const gameId = (params.gameId ?? '').replace(/\.svg$/i, '').slice(0, 64);
          const key = `badge:${userKey}:${gameId}`;
          let svg = apiCache.get<string>(key);
          if (!svg) {
            svg = await buildSvg(userKey, gameId);
            apiCache.set(key, svg, TTL_MS);
          }
          return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
        },
      ),
    },
  },
});
