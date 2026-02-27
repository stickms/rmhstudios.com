import { Suspense } from "react";
import { getAllPosts } from "@/lib/blog";
import { BlogList } from "@/components/blog/BlogList";

export const metadata = {
  title: "Devlog | RMH Studios",
  description: "Behind the scenes of our game development journey.",
};

export default function BlogIndexPage() {
  const posts = getAllPosts(["title", "date", "slug", "description", "image", "tags"]);

  return (
    <main className="min-h-screen pt-32 pb-20 px-4 bg-site-bg relative overflow-hidden">
        <Suspense fallback={
          <div className="container mx-auto max-w-6xl relative z-10 text-center py-20">
            <div className="text-site-text-dim animate-pulse">Loading archive...</div>
          </div>
        }>
          <BlogList initialPosts={posts} />
        </Suspense>
    </main>
  );
}
