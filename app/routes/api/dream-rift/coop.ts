import { createFileRoute } from '@tanstack/react-router';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const DIFFICULTIES = ['easy', 'normal', 'hard', 'lunatic'] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

const METRICS = {
  combined: 'combinedScore',
  time: 'timeSurvived',
} as const;
type Metric = keyof typeof METRICS;

const MAX_COMBINED_SCORE = 40_000_000; // 4 players * 10M per-player cap
const MAX_TIME_SURVIVED = 6 * 60 * 60; // 6h sanity ceiling, in seconds

interface CoopPlayer {
  name: string;
  charId: string;
  score: number;
  // Linked RMH account snapshot (null for guests / local players).
  account: { id: string; handle: string | null; name: string | null; image: string | null } | null;
}

export const Route = createFileRoute('/api/dream-rift/coop')({
  server: {
    handlers: {
      // ── Co-op leaderboards: top runs by combined score or time survived ──
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'dream-rift-coop-get' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        try {
          const { searchParams } = new URL(request.url);
          const difficultyParam = (searchParams.get('difficulty') || 'normal').toLowerCase();
          const difficulty: Difficulty = (DIFFICULTIES as readonly string[]).includes(difficultyParam)
            ? (difficultyParam as Difficulty)
            : 'normal';
          const metricParam = (searchParams.get('metric') || 'combined').toLowerCase();
          const metric: Metric = metricParam in METRICS ? (metricParam as Metric) : 'combined';
          const orderField = METRICS[metric];

          const runs = await prisma.dreamRiftCoopRun.findMany({
            where: { difficulty },
            take: 20,
            orderBy: [{ [orderField]: 'desc' }, { createdAt: 'desc' }],
            select: {
              combinedScore: true,
              timeSurvived: true,
              stageReached: true,
              cleared: true,
              playerCount: true,
              players: true,
              createdAt: true,
            },
          });

          return Response.json(runs);
        } catch (e) {
          console.error('Dream Rift co-op leaderboard fetch failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      // ── Submit a completed co-op run (host only, authenticated) ──
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'dream-rift-coop-post' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          const userId = session?.user?.id;
          if (!userId) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const body = await request.json();
          const { difficulty, combinedScore, timeSurvived, stageReached, cleared, players } = body;

          const difficultyKey: Difficulty = (typeof difficulty === 'string' && (DIFFICULTIES as readonly string[]).includes(difficulty.toLowerCase()))
            ? (difficulty.toLowerCase() as Difficulty)
            : 'normal';

          if (typeof combinedScore !== 'number' || combinedScore < 0 || combinedScore > MAX_COMBINED_SCORE) {
            return Response.json({ error: 'Invalid combined score' }, { status: 400 });
          }
          if (typeof timeSurvived !== 'number' || timeSurvived < 0 || timeSurvived > MAX_TIME_SURVIVED) {
            return Response.json({ error: 'Invalid time survived' }, { status: 400 });
          }
          if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
            return Response.json({ error: 'Co-op runs require 2-4 players' }, { status: 400 });
          }

          const rawPlayers = players.slice(0, 4).map((p: unknown) => {
            const obj = (p ?? {}) as Record<string, unknown>;
            return {
              name: String(obj.name ?? 'Dreamer').slice(0, 24),
              charId: String(obj.charId ?? 'bllm').slice(0, 16),
              score: typeof obj.score === 'number' && obj.score >= 0 ? Math.round(Math.min(obj.score, 10_000_000)) : 0,
              userId: typeof obj.userId === 'string' && obj.userId.length > 0 && obj.userId !== 'local' ? obj.userId : null,
            };
          });

          // Resolve linked RMH accounts (avatar + profile link) for any real userIds.
          const ids = [...new Set(rawPlayers.map((p) => p.userId).filter((v): v is string => !!v))];
          const accounts = ids.length
            ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, handle: true, name: true, image: true } })
            : [];
          const accountById = new Map(accounts.map((a) => [a.id, a]));

          const cleanPlayers: CoopPlayer[] = rawPlayers.map((p) => ({
            name: p.name,
            charId: p.charId,
            score: p.score,
            account: p.userId && accountById.has(p.userId) ? accountById.get(p.userId)! : null,
          }));

          const safeStage = typeof stageReached === 'number' && stageReached >= 1 ? Math.round(stageReached) : 1;

          await prisma.dreamRiftCoopRun.create({
            data: {
              difficulty: difficultyKey,
              combinedScore: Math.round(combinedScore),
              timeSurvived: Math.round(timeSurvived),
              stageReached: safeStage,
              cleared: !!cleared,
              playerCount: cleanPlayers.length,
              // CoopPlayer[] is JSON-serializable, but its named-interface shape
              // lacks the index signature Prisma's InputJsonValue requires.
              players: cleanPlayers as unknown as Prisma.InputJsonValue,
              hostUserId: userId,
            },
          });

          return Response.json({ success: true });
        } catch (e) {
          console.error('Failed to submit dream-rift co-op run:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
