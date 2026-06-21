import { createFileRoute } from '@tanstack/react-router';
import CareersPage from '@/components/rmh-capital/CareersPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-capital/careers';
const TITLE = 'Careers — RMH Capital';
const DESC =
  'Build a career across the full company arc. Analyst programs, experienced hires, engineering & technology, and campus recruiting at RMH Capital.';

export const Route = createFileRoute('/rmh-capital/careers')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH, image: '/images/elon-right.webp' }),
    links: [buildCanonical(PATH)],
  }),
  component: CareersPage,
});
