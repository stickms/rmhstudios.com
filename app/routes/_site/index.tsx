/**
 * Home / Feed Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { FeedLayout } from '@/components/feed/FeedLayout';
import { getSidebarData } from '@/lib/sidebar-data';

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  return getSidebarData();
});

export const Route = createFileRoute('/_site/')({
  loader: () => fetchSidebarData(),
  component: Home,
});

function Home() {
  const {
    officialBuilds,
    userBuilds,
    recommendedUsers,
    blogPosts,
  } = Route.useLoaderData();

  return (
    <FeedLayout
      officialBuilds={officialBuilds}
      userBuilds={userBuilds}
      recommendedUsers={recommendedUsers}
      blogPosts={blogPosts}
    />
  );
}
