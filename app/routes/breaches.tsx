import { createFileRoute } from '@tanstack/react-router';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { BreachesPage } from '@/components/breaches/BreachesPage';

/**
 * /breaches — the public incident log, sibling to /security. Top-level rather
 * than under `_site/` for the same reason /security is: it renders its own
 * full-bleed shell and nav, not the radial site chrome.
 */
export const Route = createFileRoute('/breaches')({
  head: () => ({
    meta: buildMeta({
      title: 'Breaches | RMH Studios',
      description:
        'Our public incident log, starting with a Discord webhook URL that sat in the repo for nine days.',
      path: '/breaches',
    }),
    links: [buildCanonical('/breaches')],
  }),
  component: BreachesPage,
});
