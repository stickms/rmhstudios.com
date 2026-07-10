import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { DeckStudyColumn } from '@/components/feed/DeckStudyColumn';
import { auth } from '@/lib/auth';
import { getDeck } from '@/lib/study.server';

// Fetch the deck (with cards + this viewer's due count) server-side so the main
// column is present at first paint / prefetched on hover instead of fetched
// client-side after mount. `null` means not-found / private for this viewer.
const fetchDeck = createServerFn({ method: 'GET' })
  .validator((deckId: string) => deckId)
  .handler(async ({ data: deckId }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    return { deck: await getDeck(deckId, { id: session?.user?.id ?? null }) };
  });

export const Route = createFileRoute('/_site/study/$deckId')({
  head: () => ({ meta: [{ title: 'Study | RMH Studios' }] }),
  loader: ({ params }) => fetchDeck({ data: params.deckId }),
  component: DeckPage,
});

function DeckPage() {
  const { deckId } = Route.useParams();
  const { deck } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {/* `key` remounts the column on deck→deck navigation so it re-seeds
            cleanly from the new loader data. */}
        <DeckStudyColumn key={deckId} deckId={deckId} initialData={deck} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
