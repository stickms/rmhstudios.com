import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { PostDetail } from '@/components/feed/PostDetail';
import { MobileNav } from '@/components/feed/MobileNav';
import { getAllNewsArticles } from '@/lib/news';
import { getAllArticles } from '@/lib/research';

export default async function PostPage({
  params,
}: {
  params: Promise<{ postid: string }>;
}) {
  const { postid } = await params;
  const newsArticles = getAllNewsArticles([
    'title', 'date', 'slug', 'description', 'category', 'sourcePublisher', 'image',
  ]).slice(0, 5);
  const researchArticles = getAllArticles().slice(0, 3);

  return (
    <div className="min-h-screen bg-site-bg flex justify-center">
      {/* Left Sidebar - hidden on mobile */}
      <div className="hidden md:block md:w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Center - Post Detail */}
      <main className="w-full max-w-162 min-w-0 border-r border-site-border pb-16 md:pb-0">
        <PostDetail postId={postid} />
      </main>

      {/* Right Sidebar */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          newsArticles={newsArticles}
          researchArticles={researchArticles}
        />
      </aside>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
