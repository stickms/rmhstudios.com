/**
 * Post Detail Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { PostDetail } from '@/components/feed/PostDetail';
import { getSidebarData } from '@/lib/sidebar-data';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, ogCardPath, SITE_URL } from '@/lib/seo';

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
    const handle = (rmhark.user as { handle?: string | null }).handle ?? null;

    // Only a public, free post may put its own words in a meta tag. This gate
    // used to cover the card image alone, so a followers-only or paid post
    // still emitted its body as `description` and `og:description` — readable
    // by any crawler, and by anyone who viewed source, without ever meeting the
    // audience rule or paying the unlock. The gate now covers the text too.
    const isPublicFree = rmhark.audience === 'PUBLIC' && (rmhark.unlockPrice ?? 0) === 0;

    let description: string;
    if (!isPublicFree) {
      description = `A post by ${userName} on RMH.`;
    } else if (rmhark.content) {
      description = rmhark.content;
    } else if (rmhark.poll) {
      description = `Poll: ${rmhark.poll.question}`;
    } else if (rmhark.gifUrl) {
      description = 'Shared a GIF';
    } else {
      description = 'Post on RMH';
    }

    const title =
      isPublicFree && rmhark.content
        ? `${userName} on RMH: "${rmhark.content.length > 80 ? rmhark.content.slice(0, 80) + '...' : rmhark.content}"`
        : `${userName} on RMH`;

    const ogImage = isPublicFree ? ogCardPath('post', postid) : user.image;

    return {
      title,
      description,
      userImage: user.image,
      ogImage,
      postId: postid,
      handle,
      // Restricted posts are excluded from the sitemap, but a link shared into a
      // public channel is enough for a crawler to find one — so say it on the
      // page as well.
      indexable: isPublicFree && Boolean(handle),
    };
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
    //
    // `$userid` accepts an id, a handle, or a handle with a legacy `@` prefix,
    // so one post has at least three working URLs — and the RSS feeds link to a
    // fourth, `/thread/{id}`. Every one of them served the same body with no
    // canonical, which is four competing candidates for the same content. The
    // author's handle is the canonical form; `postUrl` (which echoes whichever
    // alias was requested) is still what oEmbed and `og:url` describe, because
    // those identify the page that was actually fetched.
    const postUrl = `${SITE_URL}/u/${params.userid}/post/${params.postid}`;
    const canonicalUrl = meta.handle ? `${SITE_URL}/u/${meta.handle}/post/${params.postid}` : null;
    return {
      meta: [
        { title: meta.title },
        ...(meta.indexable ? [] : [{ name: 'robots', content: 'noindex, follow' }]),
        { name: 'description', content: meta.description },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: meta.title },
        { property: 'og:description', content: meta.description },
        { property: 'og:site_name', content: 'RMH' },
        { property: 'og:url', content: postUrl },
        ...(ogImage ? [{ property: 'og:image', content: ogImage }] : []),
        // Only the rendered card has known dimensions — the fallback is the
        // author's avatar, whatever size they uploaded it at.
        ...(isCard
          ? [
              { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) },
              { property: 'og:image:height', content: String(OG_IMAGE_HEIGHT) },
            ]
          : []),
        ...(ogImage ? [{ property: 'og:image:alt', content: meta.title }] : []),
        { name: 'twitter:card', content: isCard ? 'summary_large_image' : 'summary' },
        { name: 'twitter:title', content: meta.title },
        { name: 'twitter:description', content: meta.description },
        ...(ogImage ? [{ name: 'twitter:image', content: ogImage }] : []),
      ],
      links: [
        ...(canonicalUrl ? [{ rel: 'canonical', href: canonicalUrl }] : []),
        ...(isCard
          ? [
              {
                rel: 'alternate',
                type: 'application/json+oembed',
                href: `${SITE_URL}/api/embed/oembed?url=${encodeURIComponent(postUrl)}&format=json`,
                title: meta.title,
              },
            ]
          : []),
      ],
    };
  },
  component: PostPage,
});

function PostPage() {
  const { postid } = Route.useParams();
  const { sidebar } = Route.useLoaderData();

  return (
    <PageFrame
      rightSidebar={
        <RightSidebar
          officialBuilds={sidebar.officialBuilds}
          userBuilds={sidebar.userBuilds}
          recommendedUsers={sidebar.recommendedUsers}
          blogPosts={sidebar.blogPosts}
        />
      }
    >
        <PostDetail postId={postid} />
    </PageFrame>
  );
}
