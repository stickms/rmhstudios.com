'use client';

import { RightSidebar } from './RightSidebar';
import { FeedColumn } from './FeedColumn';
import { AnimatedMain } from './AnimatedMain';

interface FeedLayoutProps {
  officialBuilds: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    href: string;
    status?: string;
  }[];
  userBuilds: {
    id: string;
    slug: string;
    title: string;
    thumbnailUrl: string | null;
    likeCount: number;
    commentCount: number;
    viewCount: number;
    creator?: {
      id: string;
      handle: string | null;
      username: string | null;
      name: string | null;
      image: string | null;
    };
  }[];
  recommendedUsers: {
    id: string;
    handle: string | null;
    username: string | null;
    name: string | null;
    image: string | null;
    followerCount: number;
  }[];
  blogPosts: {
    slug: string;
    title: string;
    date: string;
  }[];
}

export function FeedLayout({
  officialBuilds,
  userBuilds,
  recommendedUsers,
  blogPosts,
}: FeedLayoutProps) {
  return (
    <>
      {/* Center Feed – width animates when arriving from a wide page */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <FeedColumn />
      </AnimatedMain>

      {/* Right Sidebar - hidden below lg, scrolls with page */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          officialBuilds={officialBuilds}
          userBuilds={userBuilds}
          recommendedUsers={recommendedUsers}
          blogPosts={blogPosts}
        />
      </aside>
    </>
  );
}
