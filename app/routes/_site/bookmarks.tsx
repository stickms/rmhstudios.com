import { createFileRoute } from '@tanstack/react-router';
import { BookmarksColumn } from '@/components/feed/BookmarksColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

export const Route = createFileRoute('/_site/bookmarks')({
  head: () => ({ meta: [{ title: 'Bookmarks | RMH Studios' }] }),
  component: BookmarksPage,
});

function BookmarksPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
      <BookmarksColumn />
    </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
