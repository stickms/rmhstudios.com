'use client';

import { Suspense } from 'react';
import { Await } from '@tanstack/react-router';
import { RightSidebar } from './RightSidebar';
import { FeedColumn, type InitialFeed } from './FeedColumn';
import { AnimatedMain } from './AnimatedMain';
import { Skeleton } from '@/components/ui/skeleton';

/** The right-sidebar payload, streamed from the route loader. */
export interface SidebarData {
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

interface FeedLayoutProps {
  /** Server-streamed right-sidebar payload (deferred so it never blocks the feed). */
  sidebar?: Promise<SidebarData> | null;
  /** Server-streamed first feed page, forwarded to seed the timeline. */
  initialFeed?: Promise<InitialFeed> | null;
}

/** Lightweight placeholder shown while the right sidebar streams in. */
function RightSidebarSkeleton() {
  return (
    <div className="space-y-4 p-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 rounded-site border border-site-border bg-site-surface p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function FeedLayout({ sidebar, initialFeed }: FeedLayoutProps) {
  return (
    <>
      {/* Center Feed – width animates when arriving from a wide page */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-dock">
        <FeedColumn initialFeed={initialFeed} />
      </AnimatedMain>

      {/* Right Sidebar - hidden below lg, scrolls with page. Streamed in its own
          Suspense slot so the sidebar's DB reads never delay the feed column. */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        {sidebar ? (
          <Suspense fallback={<RightSidebarSkeleton />}>
            <Await promise={sidebar}>
              {(data) => (
                <RightSidebar
                  officialBuilds={data.officialBuilds}
                  userBuilds={data.userBuilds}
                  recommendedUsers={data.recommendedUsers}
                  blogPosts={data.blogPosts}
                />
              )}
            </Await>
          </Suspense>
        ) : (
          <RightSidebarSkeleton />
        )}
      </aside>
    </>
  );
}
