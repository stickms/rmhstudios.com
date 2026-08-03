import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from '@/components/feed/ContextRail';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { DeckStudyColumn } from '@/components/feed/DeckStudyColumn';
import { auth } from '@/lib/auth';
import { getDeck, type DeckDetail } from '@/lib/study.server';
import { buildCanonical, buildMeta } from '@/lib/seo';

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
  /**
   * A public deck is a genuine search landing page — someone looking for
   * flashcards on a topic should be able to find one. It needs the deck's own
   * title to be that. A private deck loads as `null` for anyone but its owner,
   * which is also the signal to keep it out of the index.
   */
  // Annotated for the inference quirk documented on `/games/$gameId`.
  head: ({
    loaderData,
    params,
  }: {
    loaderData?: { deck: DeckDetail | null };
    params: { deckId: string };
  }) => {
    const deck = loaderData?.deck?.deck;
    if (!deck) {
      return {
        meta: [{ title: 'Deck | RMHStudy' }, { name: 'robots', content: 'noindex, follow' }],
      };
    }
    const path = `/study/${params.deckId}`;
    return {
      meta: buildMeta({
        title: `${deck.title} — flashcards | RMHStudy`,
        description:
          deck.description ||
          `A ${deck.cardCount}-card flashcard deck on RMHStudy. Study it with spaced repetition, or clone it into your own library.`,
        path,
      }),
      links: [buildCanonical(path)],
    };
  },
  loader: ({ params }) => fetchDeck({ data: params.deckId }),
  component: DeckPage,
});

function DeckPage() {
  const { deckId } = Route.useParams();
  const { deck } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain className="w-full min-w-0 pb-dock">
        {/* `key` remounts the column on deck→deck navigation so it re-seeds
            cleanly from the new loader data. */}
        <DeckStudyColumn key={deckId} deckId={deckId} initialData={deck} />
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
