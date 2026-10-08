import { createFileRoute } from '@tanstack/react-router';
import FacilitiesPage from '@/components/rmh-datacenter/FacilitiesPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-datacenter/facilities';
const TITLE = 'Facilities — RMH Datacenter';
const DESC =
  'Six owned campuses — Ashburn, Dublin, Singapore, Frankfurt, Hillsboro and São Paulo — with hall counts, contracted power, design standard, trailing PUE, cooling, attestations and committed capacity for each.';

export const Route = createFileRoute('/_site/rmh-datacenter/facilities')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: FacilitiesPage,
});
