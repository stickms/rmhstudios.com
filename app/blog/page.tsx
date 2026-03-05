import { getAllPosts } from "@/lib/blog";
import { BlogPageContent } from './content';

export const metadata = {
  title: "Devlog | RMH Studios",
  description: "Behind the scenes of our game development journey.",
};

export const dynamic = 'force-dynamic';

export default async function BlogIndexPage() {
  const posts = await getAllPosts(["title", "date", "slug", "description", "image", "tags"]);

  const allTags = Array.from(
    new Set(posts.flatMap(p => p.tags ?? []))
  ).slice(0, 10);

  return (
    <BlogPageContent
      posts={posts}
    />
  );
}
