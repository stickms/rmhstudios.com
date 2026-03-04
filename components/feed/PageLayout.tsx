'use client';

import { LeftSidebar } from './LeftSidebar';
import { MobileNav } from './MobileNav';
import { AnimatedMain } from './AnimatedMain';
import { DEFAULT_WIDTH, WIDE_WIDTH } from '@/lib/layout-width';

interface PageLayoutProps {
  title: string;
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** Element rendered right-aligned in the sticky header row (e.g. filter button) */
  headerRight?: React.ReactNode;
  /** Use a wider center column (800 px) – useful for grid-heavy pages like Builds. */
  wide?: boolean;
}

export function PageLayout({
  title,
  children,
  rightSidebar,
  headerExtra,
  headerRight,
  wide,
}: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-site-bg flex justify-center overflow-hidden">
      {/* Left Sidebar - hidden on mobile, icon-only on md, full on lg+ */}
      <div className="hidden md:block md:w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Center Column – width animates between pages */}
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={wide ? WIDE_WIDTH : DEFAULT_WIDTH}
      >
        <div className="flex flex-col">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 h-15 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
            <div className="h-full flex items-center justify-between px-4 py-3">
              <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2">
                <span className="md:hidden text-site-accent">RMH</span>
                <span className="md:hidden w-px h-5 bg-site-border" aria-hidden="true" />
                {title}
              </h1>
              {headerRight}
            </div>
            {headerExtra}
          </div>

          {/* Page Content */}
          {children}
        </div>
      </AnimatedMain>

      {/* Right Sidebar - hidden below lg */}
      {rightSidebar && (
        <aside className="hidden lg:block w-80 shrink-0 self-start">
          {rightSidebar}
        </aside>
      )}

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
