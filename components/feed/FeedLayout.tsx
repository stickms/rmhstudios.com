'use client';

import { RightSidebar } from './RightSidebar';
import { FeedColumn } from './FeedColumn';
import { AnimatedMain } from './AnimatedMain';
import type { NewsArticle } from '@/lib/news';
import type { ResearchArticle } from '@/lib/research';

interface FeedLayoutProps {
  newsArticles: Partial<NewsArticle>[];
  researchArticles: ResearchArticle[];
}

export function FeedLayout({ newsArticles, researchArticles }: FeedLayoutProps) {
  return (
    <>
      {/* Center Feed – width animates when arriving from a wide page */}
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
        <FeedColumn />
      </AnimatedMain>

      {/* Right Sidebar - hidden below lg, scrolls with page */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          newsArticles={newsArticles}
          researchArticles={researchArticles}
        />
      </aside>
    </>
  );
}

