/**
 * Profile Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { ContextRail } from '@/components/feed/ContextRail';
import { ProfileColumn } from '@/components/feed/ProfileColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getSidebarData } from '@/lib/sidebar-data';
import { getRequestSession } from '@/lib/auth-session.server';
import { getProfile } from '@/lib/profile.server';
import { WIDE_WIDTH } from '@/lib/layout-width';
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, ogCardPath, SITE_URL } from '@/lib/seo';

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
        ogUrl: `${SITE_URL}/u/${handle || id}`,
        // The profile card, not the bare avatar. `/u/$userid` already used it;
        // this route — the same page under a different URL — was still sharing a
        // cropped 400px square, so the same profile unfurled two different ways.
        ogImage: `${SITE_URL}${ogCardPath('profile', handle || id)}`,
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
        ? [
            { property: 'og:image', content: loaderData.meta.ogImage },
            { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) },
            { property: 'og:image:height', content: String(OG_IMAGE_HEIGHT) },
            { property: 'og:image:alt', content: loaderData.meta.title },
          ]
        : []),
      { name: 'twitter:card', content: loaderData?.meta.ogImage ? 'summary_large_image' : 'summary' },
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
      <AnimatedMain className="w-full min-w-0 pb-dock">
        {/* `key` remounts the column on profile→profile navigation so it re-seeds
            cleanly from the new loader data (no stale-state carryover). */}
        <ProfileColumn key={userId} userId={userId} initialProfile={profile} />
      </AnimatedMain>

      <ContextRail>
        <RightSidebar
          officialBuilds={sidebar.officialBuilds}
          userBuilds={sidebar.userBuilds}
          recommendedUsers={sidebar.recommendedUsers}
          blogPosts={sidebar.blogPosts}
        />
      </ContextRail>
    </>
  );
}
