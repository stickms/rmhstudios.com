/**
 * Post Detail Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { PostDetail } from '@/components/feed/PostDetail';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getSidebarData } from '@/lib/sidebar-data';
import { prisma } from '@/lib/prisma';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

const fetchPostMeta = createServerFn({ method: 'GET' })
  .inputValidator((postid: string) => postid)
  .handler(async ({ data: postid }) => {
    const rmhark = await prisma.rMHark.findUnique({
      where: { id: postid },
      select: {
        content: true,
        gifUrl: true,
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

    return { title, description, userImage: user.image };
  });

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  return getSidebarData();
});

export const Route = createFileRoute('/_site/$userid/post/$postid')({
  loader: async ({ params }) => {
    const [meta, sidebar] = await Promise.all([
      fetchPostMeta({ data: params.postid }),
      fetchSidebarData(),
    ]);
    return { meta, sidebar };
  },
  head: ({ loaderData }) => {
    const meta = loaderData?.meta;
    if (!meta) return { meta: [{ title: 'Post Not Found | RMH' }] };
    return {
      meta: [
        { title: meta.title },
        { name: 'description', content: meta.description },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: meta.title },
        { property: 'og:description', content: meta.description },
        { property: 'og:site_name', content: 'RMH' },
        ...(meta.userImage ? [{ property: 'og:image', content: meta.userImage }] : []),
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: meta.title },
        { name: 'twitter:description', content: meta.description },
        ...(meta.userImage ? [{ name: 'twitter:image', content: meta.userImage }] : []),
      ],
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
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
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
