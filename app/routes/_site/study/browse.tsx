import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { DeckMarketplaceColumn } from '@/components/feed/DeckMarketplaceColumn';
import { getRequestSession } from '@/lib/auth-session.server';
import { listMarketplaceDecks } from '@/lib/study.server';
import { DEFAULT_DECK_SORT, isDeckSort, parseDeckSort, type DeckSort } from '@/lib/study/deck-ratings';

// SSR the default (unfiltered) marketplace listing, in the order the URL names (`?sort=`), so the page paints on
// load; searches are fetched client-side.
const fetchMarketplace = createServerFn({ method: 'GET' })
  .validator((sort: DeckSort) => parseDeckSort(sort))
  .handler(async ({ data: sort }) => {
    const session = await getRequestSession();
    return await listMarketplaceDecks(session?.user.id ?? null, null, sort);
  });

export const Route = createFileRoute('/_site/study/browse')({
  head: () => ({
    meta: buildMeta({
      title: 'Browse decks | RMH Studios',
      description:
        'Browse public flashcard decks and clone any of them into your library.',
      path: '/study/browse',
    }),
    links: [buildCanonical('/study/browse')],
  }),
  // The default order is the bare URL: only "Best rated" and "Most copied" are written to it.
  validateSearch: (search: Record<string, unknown>): { sort?: DeckSort } =>
    isDeckSort(search.sort) && search.sort !== DEFAULT_DECK_SORT ? { sort: search.sort } : {},
  loaderDeps: ({ search }) => ({ sort: search.sort ?? DEFAULT_DECK_SORT }),
  loader: ({ deps }) => fetchMarketplace({ data: deps.sort }),
  component: BrowsePage,
});

function BrowsePage() {
  const initialData = Route.useLoaderData();
  const { sort = DEFAULT_DECK_SORT } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <PageFrame>
      <DeckMarketplaceColumn
        initialData={initialData}
        sort={sort}
        onSortChange={(next) =>
          void navigate({
            to: '/study/browse',
            search: next === DEFAULT_DECK_SORT ? {} : { sort: next },
            replace: true,
          })
        }
      />
    </PageFrame>
  );
}
