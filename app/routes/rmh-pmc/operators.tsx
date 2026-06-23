import { createFileRoute } from '@tanstack/react-router';
import OperatorsPage from '@/components/rmh-pmc/OperatorsPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-pmc/operators';
const TITLE = 'Operators — RMH PMC';
const DESC =
  'Selection, vetting, and the roles that make up RMH PMC — from assaulters and intelligence analysts to logisticians, medics, and advisory staff drawn from tier-one units worldwide.';

export const Route = createFileRoute('/rmh-pmc/operators')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: OperatorsPage,
});
