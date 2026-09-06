import { createFileRoute } from '@tanstack/react-router';
import ContactPage from '@/components/rmh-datacenter/ContactPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-datacenter/contact';
const TITLE = 'Contact — RMH Datacenter';
const DESC =
  'Request capacity from RMH Datacenter: the colocation, bare metal, accelerated compute, peering, site-tour and sustainability-reporting desks, with what each one commits to answering in.';

export const Route = createFileRoute('/rmh-datacenter/contact')({
  validateSearch: (search: Record<string, unknown>): { intent?: string } => ({
    intent: typeof search.intent === 'string' ? search.intent : undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: ContactRoute,
});

function ContactRoute() {
  const { intent } = Route.useSearch();
  return <ContactPage initialIntent={intent} />;
}
