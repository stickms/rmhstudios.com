import { createFileRoute } from '@tanstack/react-router';
import PlatformPage from '@/components/rmh-datacenter/PlatformPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-datacenter/platform';
const TITLE = 'Platform — RMH Datacenter';
const DESC =
  'Five ways to take delivery of the same building: colocation by drawn kilowatts, single-tenant bare metal, liquid-cooled accelerated compute, block/object/archive storage, and a rehearsed second site.';

export const Route = createFileRoute('/rmh-datacenter/platform')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: PlatformPage,
});
