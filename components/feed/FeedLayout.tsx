'use client';

import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { FeedColumn } from './FeedColumn';
import type { NewsArticle } from '@/lib/news';
import type { ResearchArticle } from '@/lib/research';

interface FeedLayoutProps {
  newsArticles: Partial<NewsArticle>[];
  researchArticles: ResearchArticle[];
}

export function FeedLayout({ newsArticles, researchArticles }: FeedLayoutProps) {
  return (
    <div className="min-h-screen bg-site-bg flex justify-center">
      {/* Left Sidebar - fixed, positioned relative to its reserved space */}
      <div className="w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Center Feed - 648px */}
      <main className="w-full max-w-162 min-w-0 border-r border-site-border">
        <FeedColumn />
      </main>

      {/* Right Sidebar - hidden below lg, scrolls with page */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          newsArticles={newsArticles}
          researchArticles={researchArticles}
        />
      </aside>
    </div>
  );
}
