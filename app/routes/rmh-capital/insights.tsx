import { createFileRoute } from '@tanstack/react-router';
import InsightsPage from '@/components/rmh-capital/InsightsPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-capital/insights';
const TITLE = 'Insights — RMH Capital';
const DESC =
  'Research and commentary from RMH Capital across markets, investment banking, venture capital, private equity, technology, strategy, and risk & regulation.';

export const Route = createFileRoute('/rmh-capital/insights')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: InsightsPage,
});
