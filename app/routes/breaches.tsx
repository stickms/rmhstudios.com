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
        'Our public incident log. In March 2026 a Discord webhook URL was committed to this repository in plain text and sat in the default branch for nine days — how it got there, why nobody caught it, and why deleting the line did not undo it.',
      path: '/breaches',
    }),
    links: [buildCanonical('/breaches')],
  }),
  component: BreachesPage,
});
