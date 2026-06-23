import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { FlashcardsColumn } from '@/components/feed/FlashcardsColumn';

export const Route = createFileRoute('/_site/study/')({
  head: () => ({ meta: [{ title: 'Flashcards | RMH Studios' }] }),
  component: StudyPage,
});

function StudyPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <FlashcardsColumn />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
