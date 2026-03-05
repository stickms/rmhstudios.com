import { FeedLayout } from "@/components/feed/FeedLayout";
import { getSidebarData } from "@/lib/sidebar-data";

export const revalidate = 60;

export default async function Home() {
  const {
    curatedBuilds,
    userBuilds,
    recommendedUsers,
    blogPosts,
    newsArticles,
    researchArticles,
  } = await getSidebarData();

  return (
    <FeedLayout
      curatedBuilds={curatedBuilds}
      userBuilds={userBuilds}
      recommendedUsers={recommendedUsers}
      blogPosts={blogPosts}
      newsArticles={newsArticles}
      researchArticles={researchArticles}
    />
  );
}
