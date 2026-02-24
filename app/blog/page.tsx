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
    <main className="min-h-screen pt-32 pb-20 px-4 bg-black relative overflow-hidden bg-linear-to-b from-black via-(--neon-purple)/10 to-black">
        {/* Background Effects */}
        <div className="absolute inset-0 noise opacity-50 pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-1/2 h-[50vh] bg-(--neon-blue)/5 blur-[100px] pointer-events-none" />

        <Suspense fallback={
          <div className="container mx-auto max-w-6xl relative z-10 text-center py-20">
            <div className="text-white/30 animate-pulse">Loading archive...</div>
          </div>
        }>
          <BlogList initialPosts={posts} />
        </Suspense>
    </main>
  );
}
