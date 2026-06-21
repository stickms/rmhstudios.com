import { createFileRoute } from '@tanstack/react-router';
import FirmPage from '@/components/rmh-capital/FirmPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-capital/firm';
const TITLE = 'Our Firm — RMH Capital';
const DESC =
  'RMH Capital is built around the client, not the product: one integrated platform organized for judgment, risk discipline, and long-term partnership across the full company arc.';

export const Route = createFileRoute('/rmh-capital/firm')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH, image: '/images/elon-right.webp' }),
    links: [buildCanonical(PATH)],
  }),
  component: FirmPage,
});
