import { createFileRoute } from '@tanstack/react-router';
import RIndexPage from '@/components/rmh-research/RIndexPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-research/r-index';
const TITLE = 'The r-index — RMH Research';
const DESC =
  'The r-index measures a body of work by resonance: citations that are independent, that were themselves built on, and that crossed into another field. How it is computed, and how it differs from the h-index.';

export const Route = createFileRoute('/rmh-research/r-index')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: RIndexPage,
});
