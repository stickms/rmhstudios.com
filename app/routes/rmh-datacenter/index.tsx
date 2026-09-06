import { createFileRoute } from '@tanstack/react-router';
import HomePage from '@/components/rmh-datacenter/HomePage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-datacenter';
const TITLE = 'RMH Datacenter — Colocation, Bare Metal and Accelerated Compute';
const DESC =
  'RMH Datacenter is the infrastructure arm of RMH Studios: six owned campuses, 148 MW contracted, a private 400G backbone, and colocation, bare metal, liquid-cooled accelerated compute, storage and disaster recovery on top of it.';

export const Route = createFileRoute('/rmh-datacenter/')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: HomePage,
});
