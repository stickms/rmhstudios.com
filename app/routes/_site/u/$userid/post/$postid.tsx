/**
 * Post Detail Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { PostDetail } from '@/components/feed/PostDetail';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getSidebarData } from '@/lib/sidebar-data';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { SITE_URL } from '@/lib/seo';

const fetchPostMeta = createServerFn({ method: 'GET' })
  .validator((postid: string) => postid)
  .handler(async ({ data: postid }) => {
    const rmhark = await prisma.rMHark.findUnique({
      where: { id: postid },
      select: {
        content: true,
        gifUrl: true,
        audience: true,
        unlockPrice: true,
        user: { select: userDisplaySelect },
        poll: { select: { question: true } },
      },
    });

    if (!rmhark) return null;

    const user = resolveUser(rmhark.user as any);
    const userName = user.name || 'Someone';

    let description: string;
    if (rmhark.content) {
      description = rmhark.content;
    } else if (rmhark.poll) {
      description = `Poll: ${rmhark.poll.question}`;
    } else if (rmhark.gifUrl) {
      description = 'Shared a GIF';
    } else {
      description = 'Post on RMH';
    }

    const title = rmhark.content
      ? `${userName} on RMH: "${rmhark.content.length > 80 ? rmhark.content.slice(0, 80) + '...' : rmhark.content}"`
      : `${userName} on RMH`;

    // Use the dynamic OG card only for public, free posts; otherwise fall back
    // to the author avatar so private/paid content never leaks into previews.
    const isPublicFree = rmhark.audience === 'PUBLIC' && (rmhark.unlockPrice ?? 0) === 0;
    const ogImage = isPublicFree ? `/api/og/post/${postid}` : user.image;

    return { title, description, userImage: user.image, ogImage, postId: postid };
  });

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  return getSidebarData();
});

export const Route = createFileRoute('/_site/u/$userid/post/$postid')({
  loader: async ({ params }) => {
    const [meta, sidebar] = await Promise.all([
      fetchPostMeta({ data: params.postid }),
      fetchSidebarData(),
    ]);
    return { meta, sidebar };
  },
  head: ({ loaderData, params }) => {
    const meta = loaderData?.meta;
    if (!meta) return { meta: [{ title: 'Post Not Found | RMH' }] };
    const rawImage = meta.ogImage ?? meta.userImage;
    const ogImage = rawImage
      ? rawImage.startsWith('http')
        ? rawImage
        : `${SITE_URL}${rawImage}`
      : undefined;
    const isCard = !!meta.ogImage && meta.ogImage.startsWith('/api/og/');
    // Only free, public posts are embeddable — advertise oEmbed for those so
    // Discord/Slack/WordPress unfurl them richly via /api/embed/oembed.
    const postUrl = `${SITE_URL}/u/${params.userid}/post/${params.postid}`;
    return {
      meta: [
        { title: meta.title },
        { name: 'description', content: meta.description },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: meta.title },
        { property: 'og:description', content: meta.description },
        { property: 'og:site_name', content: 'RMH' },
        ...(ogImage ? [{ property: 'og:image', content: ogImage }] : []),
        { name: 'twitter:card', content: isCard ? 'summary_large_image' : 'summary' },
        { name: 'twitter:title', content: meta.title },
        { name: 'twitter:description', content: meta.description },
        ...(ogImage ? [{ name: 'twitter:image', content: ogImage }] : []),
      ],
      links: isCard
        ? [
            {
              rel: 'alternate',
              type: 'application/json+oembed',
              href: `${SITE_URL}/api/embed/oembed?url=${encodeURIComponent(postUrl)}&format=json`,
              title: meta.title,
            },
          ]
        : [],
    };
  },
  component: PostPage,
});

function PostPage() {
  const { postid } = Route.useParams();
  const { sidebar } = Route.useLoaderData();

  return (
    <>
      {/* Center - Post Detail */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-dock">
        <PostDetail postId={postid} />
      </AnimatedMain>

      {/* Right Sidebar */}
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
