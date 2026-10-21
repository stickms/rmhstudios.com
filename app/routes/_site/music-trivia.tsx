import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { MusicGuessColumn } from '@/components/feed/MusicGuessColumn';
import { getRequestSession } from '@/lib/auth-session.server';
import { getMusicGuessList } from '@/lib/music-guess.server';

// Prefetch the puzzle list server-side so it's present at first paint /
// prefetched on intent instead of fetched on mount. The list is public; a
// signed-in viewer additionally gets their per-puzzle solved state.
const fetchMusicGuess = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return { musicGuess: await getMusicGuessList(session?.user.id ?? null) };
});

export const Route = createFileRoute('/_site/music-trivia')({
  head: () => ({ meta: [{ title: 'Guess the Song | RMH Studios' }] }),
  loader: () => fetchMusicGuess(),
  component: MusicTriviaPage,
});

function MusicTriviaPage() {
  const { musicGuess } = Route.useLoaderData();
  return (
    <>
      <PageFrame>
        <MusicGuessColumn initialData={musicGuess} />
      </PageFrame>
    </>
  );
}
