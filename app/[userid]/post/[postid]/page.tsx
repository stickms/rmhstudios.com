import type { Metadata } from 'next';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { PostDetail } from '@/components/feed/PostDetail';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { getSidebarData } from '@/lib/sidebar-data';
import { prisma } from '@/lib/prisma';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userid: string; postid: string }>;
}): Promise<Metadata> {
  const { postid } = await params;

  const rmhark = await prisma.rMHark.findUnique({
    where: { id: postid },
    select: {
      content: true,
      gifUrl: true,
      user: { select: userDisplaySelect },
      poll: { select: { question: true } },
    },
  });

  if (!rmhark) {
    return { title: 'Post Not Found | RMH' };
  }

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

  const baseUrl = 'https://rmhstudios.com';

  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title,
      description,
      siteName: 'RMH',
      url: `${baseUrl}/@${user.handle || user.id}/post/${postid}`,
      ...(user.image ? { images: [user.image] } : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
      ...(user.image ? { images: [user.image] } : {}),
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ postid: string }>;
}) {
  const { postid } = await params;
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
      {/* Center - Post Detail */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <PostDetail postId={postid} />
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
