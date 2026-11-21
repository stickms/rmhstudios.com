import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { PageFrame } from '@/components/feed/PageLayout';
import { PracticeTest } from '@/components/study/PracticeTest';
import { getRequestSession } from '@/lib/auth-session.server';
import { getDeck } from '@/lib/study.server';
import { noindexHead } from '@/lib/seo';

// The owner's deck, or a public one: anyone may take a test of a public deck, signed in or not (only a
// signed-in student's result is saved). A private deck of someone else loads as `null`, which the page
// shows as not found.
const fetchTestDeck = createServerFn({ method: 'GET' })
  .validator((deckId: string) => deckId)
  .handler(async ({ data: deckId }) => {
    const session = await getRequestSession();
    const detail = await getDeck(deckId, { id: session?.user?.id ?? null });
    return {
      data: detail
        ? {
            deck: { id: detail.deck.id, title: detail.deck.title },
            cards: detail.cards,
            signedIn: detail.signedIn,
          }
        : null,
    };
  });

export const Route = createFileRoute('/_site/study/$deckId_/practice')({
  head: () => noindexHead('Practice test'),
  loader: ({ params }) => fetchTestDeck({ data: params.deckId }),
  component: PracticeTestPage,
});

function PracticeTestPage() {
  const { deckId } = Route.useParams();
  const { data } = Route.useLoaderData();
  return (
    <PageFrame>
      {/* `key` restarts the test when navigating from one deck's test to another's. */}
      <PracticeTest key={deckId} deckId={deckId} data={data} />
    </PageFrame>
  );
}
