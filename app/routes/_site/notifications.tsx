import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { NotificationsColumn } from '@/components/feed/NotificationsColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { auth } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications.server';

// Prefetch the first page server-side so the list is present at first paint /
// prefetched on intent instead of fetched on mount. Signed-out visitors get
// `null` and the column falls back to its client path.
const fetchNotifications = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { notifications: null };
  return { notifications: await listNotifications(session.user.id) };
});

export const Route = createFileRoute('/_site/notifications')({
  head: () => ({ meta: [{ title: 'Notifications | RMH Studios' }] }),
  loader: () => fetchNotifications(),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { notifications } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <NotificationsColumn initialData={notifications} />
      </AnimatedMain>

      {/* Trailing gutter to match the blog/feed wide layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
