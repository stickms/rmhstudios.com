'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { FeedColumn } from './FeedColumn';
import { MobileNav } from './MobileNav';
import { DEFAULT_WIDTH, getLastCenterWidth, setLastCenterWidth } from '@/lib/layout-width';
import type { NewsArticle } from '@/lib/news';
import type { ResearchArticle } from '@/lib/research';

interface FeedLayoutProps {
  newsArticles: Partial<NewsArticle>[];
  researchArticles: ResearchArticle[];
}

export function FeedLayout({ newsArticles, researchArticles }: FeedLayoutProps) {
  const pathname = usePathname();
  const initialWidth = getLastCenterWidth();

  useEffect(() => {
    setLastCenterWidth(DEFAULT_WIDTH);
  }, []);

  return (
    <div className="min-h-screen bg-site-bg flex justify-center overflow-hidden">
      {/* Left Sidebar - hidden on mobile, icon-only on md, full on lg+ */}
      <div className="hidden md:block md:w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Center Feed – width animates when arriving from a wide page */}
      <motion.main
        key={pathname}
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        initial={{ maxWidth: initialWidth }}
        animate={{ maxWidth: DEFAULT_WIDTH }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      >
        <FeedColumn />
      </motion.main>

      {/* Right Sidebar - hidden below lg, scrolls with page */}
      <aside className="hidden lg:block w-80 shrink-0 self-start">
        <RightSidebar
          newsArticles={newsArticles}
          researchArticles={researchArticles}
        />
      </aside>

      {/* Mobile bottom nav + floating post button */}
      <MobileNav />
    </div>
  );
}
