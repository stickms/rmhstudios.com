/**
 * Profile Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { ProfileColumn } from '@/components/feed/ProfileColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getSidebarData } from '@/lib/sidebar-data';
import { prisma } from '@/lib/prisma';
import { resolveUserDisplay } from '@/lib/user-display';

const fetchProfileData = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const sidebar = await getSidebarData();

    // Resolve by handle first, then by ID
    let user = await prisma.user.findUnique({
      where: { handle: id },
      select: {
        name: true,
        username: true,
        handle: true,
        image: true,
        profile: {
          select: { displayName: true, customImage: true, bio: true },
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
            select: { displayName: true, customImage: true, bio: true },
          },
        },
      });
    }

    let meta = { title: 'User Not Found | RMH', description: '', ogType: 'profile' as const, ogUrl: '', ogImage: '' };
    if (user) {
      const resolved = resolveUserDisplay(user);
      const name = resolved.name || 'Unknown';
      const handle = user.handle || user.username;
      const title = handle ? `${name} (@${handle}) | RMH` : `${name} | RMH`;
      const description = user.profile?.bio || `${name}'s profile on RMH`;
      meta = {
        title,
        description,
        ogType: 'profile',
        ogUrl: `https://rmhstudios.com/@${handle || id}`,
        ogImage: resolved.image || '',
      };
    }

    return { sidebar, meta };
  });

export const Route = createFileRoute('/profile/$id')({
  loader: ({ params }) => fetchProfileData({ data: params.id }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.meta.title ?? 'Profile | RMH' },
      { name: 'description', content: loaderData?.meta.description ?? '' },
      { property: 'og:type', content: loaderData?.meta.ogType ?? 'profile' },
      { property: 'og:title', content: loaderData?.meta.title ?? '' },
      { property: 'og:description', content: loaderData?.meta.description ?? '' },
      { property: 'og:site_name', content: 'RMH' },
      { property: 'og:url', content: loaderData?.meta.ogUrl ?? '' },
      ...(loaderData?.meta.ogImage ? [{ property: 'og:image', content: loaderData.meta.ogImage }] : []),
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: loaderData?.meta.title ?? '' },
      { name: 'twitter:description', content: loaderData?.meta.description ?? '' },
      ...(loaderData?.meta.ogImage ? [{ name: 'twitter:image', content: loaderData.meta.ogImage }] : []),
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { sidebar } = Route.useLoaderData();
  const { id: userId } = Route.useParams();

  return (
    <>
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <ProfileColumn userId={userId} />
      </AnimatedMain>

      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          curatedBuilds={sidebar.curatedBuilds}
          userBuilds={sidebar.userBuilds}
          recommendedUsers={sidebar.recommendedUsers}
          blogPosts={sidebar.blogPosts}
          newsArticles={sidebar.newsArticles}
          researchArticles={sidebar.researchArticles}
        />
      </aside>
    </>
  );
}
