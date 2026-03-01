'use client';

import { LeftSidebar } from './LeftSidebar';
import { MobileNav } from './MobileNav';

interface PageLayoutProps {
  title: string;
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** Element rendered right-aligned in the sticky header row (e.g. filter button) */
  headerRight?: React.ReactNode;
}

export function PageLayout({
  title,
  children,
  rightSidebar,
  headerExtra,
  headerRight,
}: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-site-bg flex justify-center overflow-hidden">
      {/* Left Sidebar - hidden on mobile, icon-only on md, full on lg+ */}
      <div className="hidden md:block md:w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Center Column */}
      <main className="w-full max-w-162 min-w-0 border-r border-site-border pb-16 md:pb-0">
        <div className="flex flex-col">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
            <div className="flex items-center justify-between px-4 py-3">
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
      </main>

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
