import { createFileRoute } from '@tanstack/react-router';
import { DailyMutatorPage } from '@/components/arcade/DailyMutatorPage';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/daily-mutator')({
  head: definePage({
    path: '/daily-mutator',
    title: 'Daily Mutator | RMH Studios',
    description:
      'One arcade game, one twist and one seed for everyone each day. One counted attempt and a leaderboard just for today.',
  }),
  component: DailyMutatorPage,
});
