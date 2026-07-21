import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { MusicGuessColumn } from '@/components/feed/MusicGuessColumn';
import { auth } from '@/lib/auth';
import { getMusicGuessList } from '@/lib/music-guess.server';

// Prefetch the puzzle list server-side so it's present at first paint /
// prefetched on intent instead of fetched on mount. The list is public; a
// signed-in viewer additionally gets their per-puzzle solved state.
const fetchMusicGuess = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
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
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MusicGuessColumn initialData={musicGuess} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
