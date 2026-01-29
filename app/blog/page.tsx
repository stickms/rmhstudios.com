import { getAllPosts } from "@/lib/blog";
import { BlogList } from "@/components/blog/BlogList";

export const metadata = {
  title: "Devlog | RMH Studios",
  description: "Behind the scenes of our game development journey.",
};

export default function BlogIndexPage() {
  const posts = getAllPosts(["title", "date", "slug", "description", "image", "tags"]);

  return (
    <main className="min-h-screen pt-32 pb-20 px-4 bg-black relative overflow-hidden bg-gradient-to-b from-black via-[var(--neon-purple)]/10 to-black">
        {/* Background Effects */}
        <div className="absolute inset-0 noise opacity-50 pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-1/2 h-[50vh] bg-[var(--neon-blue)]/5 blur-[100px] pointer-events-none" />

        <BlogList initialPosts={posts} />
    </main>
  );
}
