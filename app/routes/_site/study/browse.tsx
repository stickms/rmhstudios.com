import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { DeckMarketplaceColumn } from '@/components/feed/DeckMarketplaceColumn';
import { auth } from '@/lib/auth';
import { listMarketplaceDecks } from '@/lib/study.server';

// SSR the default (unfiltered) marketplace listing so the page paints on load;
// searches are fetched client-side.
const fetchMarketplace = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  return await listMarketplaceDecks(session?.user.id ?? null, null);
});

export const Route = createFileRoute('/_site/study/browse')({
  head: () => ({
    meta: buildMeta({
      title: 'Browse decks | RMH Studios',
      description:
        'Browse public flashcard decks shared by the RMH Studios community and clone any of them into your own library.',
      path: '/study/browse',
    }),
    links: [buildCanonical('/study/browse')],
  }),
  loader: () => fetchMarketplace(),
  component: BrowsePage,
});

function BrowsePage() {
  const initialData = Route.useLoaderData();
  return (
    <PageFrame>
      <DeckMarketplaceColumn initialData={initialData} />
    </PageFrame>
  );
}
