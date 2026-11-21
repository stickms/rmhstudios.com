// app/routes/daily/stats.tsx — a member's (or guest's) daily puzzle statistics.
// Personal data: noindex, and listed in EXCLUDED_ROUTES. Inside the `/daily` layout.
import { createFileRoute } from '@tanstack/react-router';
import { DailyStats } from '@/components/daily-puzzles/DailyStats';
import { noindexHead } from '@/lib/seo';

export const Route =
  createFileRoute(
    '/daily/stats',
  )(
    {
      head: () =>
        noindexHead(
          'Daily puzzle statistics',
        ),
      component:
        DailyStats,
    },
  );
