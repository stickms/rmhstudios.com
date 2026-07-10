import { createFileRoute } from '@tanstack/react-router';
import HomePage from '@/components/rmh-pmc/HomePage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-pmc';
const TITLE = 'RMH PMC — Private Military, Intelligence, and Sovereign Operations';
const DESC =
  'RMH PMC is the private military arm of RMH Studios: tier-one operators delivering protective services, static guarding, training, expeditionary logistics, intelligence, advisory, and sovereign solutions worldwide.';

export const Route = createFileRoute('/rmh-pmc/')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: HomePage,
});
