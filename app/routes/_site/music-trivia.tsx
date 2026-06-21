import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { MusicGuessColumn } from '@/components/feed/MusicGuessColumn';

export const Route = createFileRoute('/_site/music-trivia')({
  head: () => ({ meta: [{ title: 'Guess the Song | RMH Studios' }] }),
  component: MusicTriviaPage,
});

function MusicTriviaPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MusicGuessColumn />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
