import { createFileRoute } from '@tanstack/react-router';
import { DailyMutatorPage } from '@/components/arcade/DailyMutatorPage';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { dailyMutatorQuery } from '@/lib/arcade/daily.queries';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/daily-mutator')({
  head: definePage({
    path: '/daily-mutator',
    title: 'Daily Mutator | RMH Studios',
    description:
      'One arcade game, one twist and one seed for everyone each day. One counted attempt and a leaderboard just for today.',
  }),
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, dailyMutatorQuery()),
  component: DailyMutatorPage,
});
