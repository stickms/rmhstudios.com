// TODO: Metadata removed — use TanStack Start route meta instead
import { RightSidebar } from '@/components/feed/RightSidebar';
import { ProfileColumn } from '@/components/feed/ProfileColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getSidebarData } from '@/lib/sidebar-data';
import { prisma } from '@/lib/prisma';
import { resolveUserDisplay } from '@/lib/user-display';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<any> {
  const { id } = await params;

  // Resolve by handle first, then by ID
  let user = await prisma.user.findUnique({
    where: { handle: id },
    select: {
      name: true,
      username: true,
      handle: true,
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
    user = await prisma.user.findUnique({
      where: { id },
      select: {
        name: true,
        username: true,
        handle: true,
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
  }

  if (!user) {
    return { title: 'User Not Found | RMH' };
  }

  const resolved = resolveUserDisplay(user);
  const name = resolved.name || 'Unknown';
  const handle = user.handle || user.username;
  const title = handle ? `${name} (@${handle}) | RMH` : `${name} | RMH`;
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
      url: `${baseUrl}/@${handle || id}`,
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
  const {
    curatedBuilds,
    userBuilds,
    recommendedUsers,
    blogPosts,
    newsArticles,
    researchArticles,
  } = await getSidebarData();

  return (
    <>
      {/* Center - Profile */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <ProfileColumn userId={userId} />
      </AnimatedMain>

      {/* Right Sidebar */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          curatedBuilds={curatedBuilds}
          userBuilds={userBuilds}
          recommendedUsers={recommendedUsers}
          blogPosts={blogPosts}
          newsArticles={newsArticles}
          researchArticles={researchArticles}
        />
      </aside>
    </>
  );
}
