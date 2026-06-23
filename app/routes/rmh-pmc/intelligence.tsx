import { createFileRoute } from '@tanstack/react-router';
import IntelligencePage from '@/components/rmh-pmc/IntelligencePage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-pmc/intelligence';
const TITLE = 'Intelligence — RMH PMC';
const DESC =
  'Assessments and dispatches from the RMH PMC intelligence cell across threat, geopolitics, maritime, cyber, and stabilization — the same product our clients act on.';

export const Route = createFileRoute('/rmh-pmc/intelligence')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: IntelligencePage,
});
