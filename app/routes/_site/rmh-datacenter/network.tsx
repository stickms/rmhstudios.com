import { createFileRoute } from '@tanstack/react-router';
import NetworkPage from '@/components/rmh-datacenter/NetworkPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-datacenter/network';
const TITLE = 'Network — RMH Datacenter';
const DESC =
  'One autonomous system across six campuses: a 400G private backbone, a measured campus-to-campus latency matrix, 640+ settlement-free peers, four transit providers, cloud on-ramps and 18 Tbps of always-on scrubbing.';

export const Route = createFileRoute('/_site/rmh-datacenter/network')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: NetworkPage,
});
