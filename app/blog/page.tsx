import { getAllPosts } from "@/lib/blog";
import { getSidebarData } from '@/lib/sidebar-data';
import { BlogRightSidebar } from './sidebar';
import { BlogPageContent } from './content';

export const metadata = {
  title: "Devlog | RMH Studios",
  description: "Behind the scenes of our game development journey.",
};

export const revalidate = 60;

export default async function BlogIndexPage() {
  const posts = getAllPosts(["title", "date", "slug", "description", "image", "tags"]);
  const { newsArticles, researchArticles } = await getSidebarData();

  const allTags = Array.from(
    new Set(posts.flatMap(p => p.tags ?? []))
  ).slice(0, 10);

  return (
    <BlogPageContent
      posts={posts}
      rightSidebar={<BlogRightSidebar newsArticles={newsArticles} researchArticles={researchArticles} tags={allTags} />}
    />
  );
}
