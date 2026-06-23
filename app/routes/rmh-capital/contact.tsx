import { createFileRoute } from '@tanstack/react-router';
import ContactPage from '@/components/rmh-capital/ContactPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-capital/contact';
const TITLE = 'Contact — RMH Capital';
const DESC =
  'Contact RMH Capital. Route your inquiry to investment banking, markets, corporate banking, venture capital, careers, media, or general inquiries.';

export const Route = createFileRoute('/rmh-capital/contact')({
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
