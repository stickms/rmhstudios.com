import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { BookmarksColumn } from '@/components/feed/BookmarksColumn';
import { auth } from '@/lib/auth';
import { listBookmarks } from '@/lib/bookmarks.server';

// Prefetch the first page server-side (present at first paint / prefetched on
// intent). Signed-out visitors get `null` and the column shows its empty state.
const fetchBookmarks = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { bookmarks: null };
  return { bookmarks: await listBookmarks(session.user.id) };
});

export const Route = createFileRoute('/_site/bookmarks')({
  head: () => ({ meta: [{ title: 'Bookmarks | RMH Studios' }] }),
  loader: () => fetchBookmarks(),
  component: BookmarksPage,
});

function BookmarksPage() {
  const { bookmarks } = Route.useLoaderData();
  return (
    <>
      <PageFrame>
        <BookmarksColumn initialData={bookmarks} />
      </PageFrame>
    </>
  );
}
