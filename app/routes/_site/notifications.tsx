import { createFileRoute } from '@tanstack/react-router';
import { NotificationsColumn } from '@/components/feed/NotificationsColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';

export const Route = createFileRoute('/_site/notifications')({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
      <NotificationsColumn />
    </AnimatedMain>
  );
}
