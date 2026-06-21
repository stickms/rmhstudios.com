import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { NotificationsColumn } from '@/components/feed/NotificationsColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { getSidebarData } from '@/lib/sidebar-data';

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  return getSidebarData();
});

export const Route = createFileRoute('/_site/notifications')({
  loader: () => fetchSidebarData(),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { officialBuilds, userBuilds, recommendedUsers, blogPosts } = Route.useLoaderData();

  return (
    <>
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <NotificationsColumn />
      </AnimatedMain>

      {/* Right Sidebar - hidden below lg, scrolls with page */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          officialBuilds={officialBuilds}
          userBuilds={userBuilds}
          recommendedUsers={recommendedUsers}
          blogPosts={blogPosts}
        />
      </aside>
    </>
  );
}
