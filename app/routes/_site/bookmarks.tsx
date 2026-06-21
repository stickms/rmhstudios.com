import { createFileRoute } from '@tanstack/react-router';
import { BookmarksColumn } from '@/components/feed/BookmarksColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';

export const Route = createFileRoute('/_site/bookmarks')({
  head: () => ({ meta: [{ title: 'Bookmarks | RMH Studios' }] }),
  component: BookmarksPage,
});

function BookmarksPage() {
  return (
    <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
      <BookmarksColumn />
    </AnimatedMain>
  );
}
