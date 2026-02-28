import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { ProfileColumn } from '@/components/feed/ProfileColumn';
import { getAllNewsArticles } from '@/lib/news';
import { getAllArticles } from '@/lib/research';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;
  const newsArticles = getAllNewsArticles([
    'title', 'date', 'slug', 'description', 'category', 'sourcePublisher', 'image',
  ]).slice(0, 5);
  const researchArticles = getAllArticles().slice(0, 3);

  return (
    <div className="min-h-screen bg-site-bg flex justify-center">
      {/* Left Sidebar */}
      <div className="w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Center - Profile */}
      <main className="w-full max-w-162 min-w-0 border-r border-site-border">
        <ProfileColumn userId={userId} />
      </main>

      {/* Right Sidebar */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          newsArticles={newsArticles}
          researchArticles={researchArticles}
        />
      </aside>
    </div>
  );
}
