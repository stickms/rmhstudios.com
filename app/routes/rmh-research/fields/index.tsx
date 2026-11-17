import { createFileRoute } from '@tanstack/react-router';
import FieldsPage from '@/components/rmh-research/FieldsPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-research/fields';
const TITLE = 'Fields — RMH Research';
const DESC =
  'The twelve fields RMH Research publishes in, from mathematics and physics to medicine, psychology and the social sciences, grouped in four divisions.';

export const Route = createFileRoute('/rmh-research/fields/')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: FieldsPage,
});
