import { createFileRoute } from '@tanstack/react-router';
import { HelpPage } from '@/components/assistant/HelpPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

export const Route = createFileRoute('/_site/help')({
  head: () => ({
    meta: buildMeta({
      title: 'Help & Concierge | RMH Studios',
      description:
        'Ask the concierge about games, apps, coins, settings, and where things are.',
      path: '/help',
    }),
    links: [buildCanonical('/help')],
  }),
  component: HelpPage,
});
