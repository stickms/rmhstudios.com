import type { Metadata } from 'next';
import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { ProfileColumn } from '@/components/feed/ProfileColumn';
import { MobileNav } from '@/components/feed/MobileNav';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getAllNewsArticles } from '@/lib/news';
import { getAllArticles } from '@/lib/research';
import { prisma } from '@/lib/prisma';
import { resolveUserDisplay } from '@/lib/user-display';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      name: true,
      username: true,
      image: true,
      profile: {
        select: {
          displayName: true,
          customImage: true,
          bio: true,
        },
      },
    },
  });

  if (!user) {
    return { title: 'User Not Found | RMH' };
  }

  const resolved = resolveUserDisplay(user);
  const name = resolved.name || 'Unknown';
  const title = user.username ? `${name} (@${user.username}) | RMH` : `${name} | RMH`;
  const description = user.profile?.bio || `${name}'s profile on RMH`;
  const baseUrl = 'https://rmhstudios.com';

  return {
    title,
    description,
    openGraph: {
      type: 'profile',
      title,
      description,
      siteName: 'RMH',
      url: `${baseUrl}/profile/${id}`,
      ...(resolved.image ? { images: [resolved.image] } : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
      ...(resolved.image ? { images: [resolved.image] } : {}),
    },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = await params;
  const newsArticles = (await getAllNewsArticles()).slice(0, 5);
  const researchArticles = getAllArticles().slice(0, 3);

  return (
    <div className="min-h-screen bg-site-bg flex justify-center overflow-hidden">
      {/* Left Sidebar - hidden on mobile */}
      <div className="hidden md:block md:w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Center - Profile */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <ProfileColumn userId={userId} />
      </AnimatedMain>

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
