/**
 * Profile Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { ProfileColumn } from '@/components/feed/ProfileColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getSidebarData } from '@/lib/sidebar-data';
import { getRequestSession } from '@/lib/auth-session.server';
import { getProfile } from '@/lib/profile.server';

const fetchProfileData = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    // Request-memoized session (perf audit §4.2) — shares the SSR session
    // resolution with the root loader / sidebar instead of re-running it.
    const session = await getRequestSession().catch(() => null);
    const viewer = {
      id: session?.user?.id ?? null,
      isAdmin: Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin),
    };

    // Fetch the profile itself alongside the sidebar so the main column is
    // present at first paint (and prefetched on hover) instead of fetched
    // client-side after mount.
    const [sidebar, profile] = await Promise.all([getSidebarData(), getProfile(id, viewer)]);

    let meta = {
      title: 'User Not Found | RMH',
      description: '',
      ogType: 'profile' as const,
      ogUrl: '',
      ogImage: '',
    };
    if (profile) {
      const name = profile.name || 'Unknown';
      const handle = profile.handle || profile.username;
      const title = handle ? `${name} (@${handle}) | RMH` : `${name} | RMH`;
      const description = profile.bio || `${name}'s profile on RMH`;
      meta = {
        title,
        description,
        ogType: 'profile',
        ogUrl: `https://rmhstudios.com/u/${handle || id}`,
        ogImage: profile.image || '',
      };
    }

    return { sidebar, meta, profile };
  });

export const Route = createFileRoute('/_site/profile/$id')({
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
      ...(loaderData?.meta.ogImage
        ? [{ property: 'og:image', content: loaderData.meta.ogImage }]
        : []),
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: loaderData?.meta.title ?? '' },
      { name: 'twitter:description', content: loaderData?.meta.description ?? '' },
      ...(loaderData?.meta.ogImage
        ? [{ name: 'twitter:image', content: loaderData.meta.ogImage }]
        : []),
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { sidebar, profile } = Route.useLoaderData();
  const { id: userId } = Route.useParams();

  return (
    <>
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-dock">
        {/* `key` remounts the column on profile→profile navigation so it re-seeds
            cleanly from the new loader data (no stale-state carryover). */}
        <ProfileColumn key={userId} userId={userId} initialProfile={profile} />
      </AnimatedMain>

      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          officialBuilds={sidebar.officialBuilds}
          userBuilds={sidebar.userBuilds}
          recommendedUsers={sidebar.recommendedUsers}
          blogPosts={sidebar.blogPosts}
        />
      </aside>
    </>
  );
}
