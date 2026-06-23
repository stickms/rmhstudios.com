import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { DeckStudyColumn } from '@/components/feed/DeckStudyColumn';

export const Route = createFileRoute('/_site/study/$deckId')({
  head: () => ({ meta: [{ title: 'Study | RMH Studios' }] }),
  component: DeckPage,
});

function DeckPage() {
  const { deckId } = Route.useParams();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <DeckStudyColumn deckId={deckId} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
