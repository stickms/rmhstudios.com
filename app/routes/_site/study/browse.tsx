import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
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
  head: () => ({ meta: [{ title: 'Browse decks | RMH Studios' }] }),
  loader: () => fetchMarketplace(),
  component: BrowsePage,
});

function BrowsePage() {
  const initialData = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <DeckMarketplaceColumn initialData={initialData} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
