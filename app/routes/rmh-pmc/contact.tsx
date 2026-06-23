import { createFileRoute } from '@tanstack/react-router';
import ContactPage from '@/components/rmh-pmc/ContactPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-pmc/contact';
const TITLE = 'Contact — RMH PMC';
const DESC =
  'Request a briefing from RMH PMC. Route your inquiry to protective services, intelligence, logistics, the sovereign desk, recruiting, or media.';

export const Route = createFileRoute('/rmh-pmc/contact')({
  validateSearch: (search: Record<string, unknown>): { type?: string } => ({
    type: typeof search.type === 'string' ? search.type : undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: ContactRoute,
});

function ContactRoute() {
  const { type } = Route.useSearch();
  return <ContactPage initialType={type} />;
}
