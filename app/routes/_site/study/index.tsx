import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { FlashcardsColumn } from '@/components/feed/FlashcardsColumn';
import { auth } from '@/lib/auth';
import { listDecks } from '@/lib/study.server';

// Prefetch the deck list server-side so it's present at first paint / prefetched
// on intent instead of fetched on mount. Signed-out visitors get `null` and the
// column falls back to its client path.
const fetchDecks = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { decks: null };
  return { decks: await listDecks(session.user.id) };
});

export const Route = createFileRoute('/_site/study/')({
  head: () => ({
    meta: buildMeta({
      title: 'Flashcards | RMH Studios',
      description: 'Build and drill flashcard decks with spaced repetition on RMHStudy.',
      path: '/study',
    }),
    links: [buildCanonical('/study')],
  }),
  loader: () => fetchDecks(),
  component: StudyPage,
});

function StudyPage() {
  const { decks } = Route.useLoaderData();
  return (
    <PageFrame>
      <FlashcardsColumn initialData={decks} />
    </PageFrame>
  );
}
