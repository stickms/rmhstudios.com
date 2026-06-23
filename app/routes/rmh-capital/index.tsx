import { createFileRoute } from '@tanstack/react-router';
import HomePage from '@/components/rmh-capital/HomePage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-capital';
const TITLE = 'RMH Capital — Capital, Advisory, and Intelligence Across the Full Company Arc';
const DESC =
  'RMH Capital is an integrated investment bank and financial platform partnering with founders, corporations, and institutions across investment banking, markets, corporate banking, venture, consulting, and private equity.';

export const Route = createFileRoute('/rmh-capital/')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: HomePage,
});
