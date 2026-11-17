import { createFileRoute } from '@tanstack/react-router';
import PsychologyPage from '@/components/rmh-research/PsychologyPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-research/psychology';

// The research behind how the site behaves. This was the standalone /psychology
// page; it is the Psychology & Behaviour section of RMH Research now, and
// /psychology redirects here.
export const Route = createFileRoute('/rmh-research/psychology')({
  head: () => ({
    meta: buildMeta({
      title: 'Psychology — RMH Research',
      description:
        'The psychology research behind how RMH Studios works, the people who did it, and the things we choose not to do.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
  }),
  component: PsychologyPage,
});
