import { createFileRoute } from '@tanstack/react-router';
import PowerPage from '@/components/rmh-datacenter/PowerPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-datacenter/power';
const TITLE = 'Power & Cooling — RMH Datacenter';
const DESC =
  'The power train from substation to PDU, trailing twelve-month PUE for every campus including the worst one, three cooling designs chosen by climate, water use, and the waste heat exported into district heating.';

export const Route = createFileRoute('/rmh-datacenter/power')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: PowerPage,
});
