import { createFileRoute } from '@tanstack/react-router';
import BusinessesPage from '@/components/rmh-capital/BusinessesPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-capital/businesses';
const TITLE = 'Our Businesses — RMH Capital';
const DESC =
  'Six integrated businesses — investment banking, markets, corporate banking, venture capital, management consulting, and private equity — on one platform.';

export const Route = createFileRoute('/rmh-capital/businesses')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH, image: '/images/elon-main.webp' }),
    links: [buildCanonical(PATH)],
  }),
  component: BusinessesPage,
});
