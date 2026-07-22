/**
 * Profile Page Route (/u/$userid)
 * Accepts a handle or id (with optional legacy @ prefix) and renders the profile.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { ProfileColumn } from '@/components/feed/ProfileColumn';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getSidebarData } from '@/lib/sidebar-data';
import { personSchema, jsonLdScript } from '@/lib/schema';
import { SITE_URL } from '@/lib/seo';
import { getRequestSession } from '@/lib/auth-session.server';
import { getProfile } from '@/lib/profile.server';
import { WIDE_WIDTH } from '@/lib/layout-width';

const fetchProfileData = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: rawId }) => {
    const id = rawId.replace(/^@/, '');
    // Resolve the session once, then fetch the complete viewer-aware profile
    // alongside the sidebar. The same payload seeds the first paint and SEO,
    // avoiding the old duplicate user lookup + client refetch.
    const session = await getRequestSession().catch(() => null);
    const viewer = {
      id: session?.user?.id ?? null,
      isAdmin: Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin),
    };

    const [sidebar, profile] = await Promise.all([getSidebarData(), getProfile(id, viewer)]);

    let meta = {
      title: 'User Not Found | RMH',
      description: '',
      ogType: 'profile' as const,
      ogUrl: '',
      ogImage: '',
      avatarImage: '',
      name: '',
      handle: null as string | null,
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
        // Dynamic branded share card (1200×630) instead of a bare avatar.
        ogImage: `${SITE_URL}/api/og/profile/${handle || id}`,
        avatarImage: profile.image || '',
        name,
        handle: handle ?? null,
      };
    }

    return { sidebar, meta, profile };
  });

export const Route = createFileRoute('/_site/u/$userid/')({
  loader: ({ params }) => fetchProfileData({ data: params.userid }),
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
      {
        name: 'twitter:card',
        content: loaderData?.meta.ogImage ? 'summary_large_image' : 'summary',
      },
      { name: 'twitter:title', content: loaderData?.meta.title ?? '' },
      { name: 'twitter:description', content: loaderData?.meta.description ?? '' },
      ...(loaderData?.meta.ogImage
        ? [{ name: 'twitter:image', content: loaderData.meta.ogImage }]
        : []),
    ],
    links: loaderData?.meta.ogUrl ? [{ rel: 'canonical', href: loaderData.meta.ogUrl }] : [],
    scripts: loaderData?.meta.name
      ? [
          jsonLdScript(
            personSchema({
              name: loaderData.meta.name,
              handle: loaderData.meta.handle,
              description: loaderData.meta.description,
              path: loaderData.meta.ogUrl,
              image: loaderData.meta.avatarImage || undefined,
            }),
          ),
        ]
      : [],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { sidebar, profile } = Route.useLoaderData();
  const { userid } = Route.useParams();
  const userId = userid.replace(/^@/, '');

  return (
    <>
      <AnimatedMain className="w-full min-w-0 pb-dock" targetWidth={WIDE_WIDTH}>
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
