import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getTodayEST, formatDateKey } from '@/lib/daily-puzzles/seed';
import { getOrCreateDailyPuzzle, isAIPuzzleMode } from '@/lib/daily-puzzles/generate.server';

// How far back a puzzle may be requested/generated on demand. The history UI
// only exposes the last 14 days; this bound keeps generation from being driven
// for arbitrary far-past dates.
const MAX_PAST_DAYS = 60;

export const Route = createFileRoute('/api/daily-puzzles/puzzle')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 60,
          windowMs: 60_000,
          prefix: 'daily-puzzle-content',
        });
        if (!allowed) {
          return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          );
        }

        try {
          const { searchParams } = new URL(request.url);
          const gameMode = searchParams.get('gameMode') ?? '';
          const dateKey = searchParams.get('date') ?? '';

          if (!isAIPuzzleMode(gameMode)) {
            return Response.json({ error: 'Invalid game mode' }, { status: 400 });
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
            return Response.json({ error: 'Invalid date' }, { status: 400 });
          }

          // Only today or the recent past — never a future day (which would let
          // players peek at an unreleased puzzle).
          const today = getTodayEST();
          const todayKey = formatDateKey(today);
          const minDate = new Date(today);
          minDate.setDate(minDate.getDate() - MAX_PAST_DAYS);
          const minKey = formatDateKey(minDate);
          if (dateKey > todayKey || dateKey < minKey) {
            return Response.json({ error: 'Date out of range' }, { status: 400 });
          }

          const { data } = await getOrCreateDailyPuzzle(gameMode, dateKey);

          return Response.json(
            { puzzle: data },
            {
              // Stable per (mode, date): safe to cache briefly at the edge/browser.
              headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
            },
          );
        } catch (e) {
          console.error('Daily puzzle content fetch failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
