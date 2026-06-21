import { createFileRoute } from '@tanstack/react-router';
import CapabilitiesPage from '@/components/rmh-pmc/CapabilitiesPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-pmc/capabilities';
const TITLE = 'Capabilities — RMH PMC';
const DESC =
  'Seven integrated lines of operation — protective services, static guarding, training, expeditionary logistics, intelligence & ISR, strategic advisory, and sovereign solutions — under one command.';

export const Route = createFileRoute('/rmh-pmc/capabilities')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: CapabilitiesPage,
});
