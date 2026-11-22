import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { DeckEditor } from '@/components/study/DeckEditor';
import { getRequestSession } from '@/lib/auth-session.server';
import { getDeck } from '@/lib/study.server';

// Owner only: a signed-out visitor, someone else's deck and a missing deck all
// answer 404, so the editor's existence is not disclosed.
const fetchOwnedDeck = createServerFn({ method: 'GET' })
  .validator((deckId: string) => deckId)
  .handler(async ({ data: deckId }) => {
    const session = await getRequestSession();
    const userId = session?.user?.id ?? null;
    const detail = userId ? await getDeck(deckId, { id: userId }) : null;
    if (!detail?.deck.isOwner) throw notFound();
    return { detail };
  });

export const Route = createFileRoute('/_site/study/$deckId_/edit')({
  head: () => ({
    meta: [{ title: 'Edit deck | RMHStudy' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  loader: ({ params }) => fetchOwnedDeck({ data: params.deckId }),
  component: EditDeckPage,
});

function EditDeckPage() {
  const { deckId } = Route.useParams();
  const { detail } = Route.useLoaderData();
  // `key` re-seeds the editor when the loader data changes (another deck).
  return <DeckEditor key={deckId} deckId={deckId} initial={detail} />;
}
