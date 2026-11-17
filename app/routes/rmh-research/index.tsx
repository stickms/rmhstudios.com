import { createFileRoute } from '@tanstack/react-router';
import HomePage from '@/components/rmh-research/HomePage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-research';
const TITLE = 'RMH Research — Twelve Fields, One Archive';
const DESC =
  'RMH Research is the research institute of RMH Studios: work across every major scientific field, an open archive of its papers, and the r-index, a measure of how far a result travelled.';

export const Route = createFileRoute('/rmh-research/')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: HomePage,
});
