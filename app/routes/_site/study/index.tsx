import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
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
  head: () => ({ meta: [{ title: 'Flashcards | RMH Studios' }] }),
  loader: () => fetchDecks(),
  component: StudyPage,
});

function StudyPage() {
  const { decks } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <FlashcardsColumn initialData={decks} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
