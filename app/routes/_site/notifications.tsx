import { createFileRoute } from '@tanstack/react-router';
import { NotificationsColumn } from '@/components/feed/NotificationsColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

export const Route = createFileRoute('/_site/notifications')({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <NotificationsColumn />
      </AnimatedMain>

      {/* Trailing gutter to match the blog/feed wide layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
