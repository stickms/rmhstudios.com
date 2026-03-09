'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import { AnimatedMain } from './AnimatedMain';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { DEFAULT_WIDTH, WIDE_NO_RIGHT_SIDEBAR_WIDTH, WIDE_WIDTH } from '@/lib/layout-width';

interface PageLayoutProps {
  title: string;
  children: React.ReactNode;
  rightSidebar?: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** Element rendered right-aligned in the sticky header row (e.g. filter button) */
  headerRight?: React.ReactNode;
  /** Use a wider center column (800 px) – useful for grid-heavy pages like Builds. */
  wide?: boolean;
  /** Optional back button href to show in the header */
  backHref?: string;
}

export function PageLayout({
  title,
  children,
  rightSidebar,
  headerExtra,
  headerRight,
  wide,
  backHref,
}: PageLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasRightSidebar = Boolean(rightSidebar);
  const targetWidth = wide
    ? (hasRightSidebar ? WIDE_WIDTH : WIDE_NO_RIGHT_SIDEBAR_WIDTH)
    : DEFAULT_WIDTH;

  return (
    <>
      {/* Center Column – width animates between pages */}
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={targetWidth}
      >
        <div className="flex flex-col">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 h-15 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
            <div className="h-full flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                {/* Mobile: sandwich menu or back button */}
                {backHref ? (
                  <Link to={backHref} className="md:hidden p-1 -ml-1 text-site-text-muted hover:text-site-text rounded-md hover:bg-site-surface transition-colors flex shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                  </Link>
                ) : (
                  <button
                    onClick={() => setDrawerOpen(true)}
                    className="md:hidden p-2 -ml-2 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
                    aria-label="Open menu"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                )}
                {/* Desktop: back button */}
                {backHref && (
                  <Link to={backHref} className="hidden md:flex p-1 -ml-1 text-site-text-muted hover:text-site-text rounded-md hover:bg-site-surface transition-colors shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                  </Link>
                )}
                <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2">
                  {/* Mobile: centered RMH + title handled via flex */}
                  <span className="md:hidden text-site-accent">RMH</span>
                  <span className="md:hidden w-px h-5 bg-site-border" aria-hidden="true" />
                  {title}
                </h1>
              </div>
              {headerRight}
            </div>
            {headerExtra}
          </div>

          {/* Page Content */}
          {children}
        </div>
      </AnimatedMain>

      {/* Right Sidebar or Spacer - hidden below lg */}
      {hasRightSidebar ? (
        <aside className="hidden lg:block w-80 shrink-0 self-start">
          {rightSidebar}
        </aside>
      ) : !wide ? (
        <div className="hidden lg:block w-80 shrink-0" />
      ) : (
        // Keep the same trailing gutter feel as the right sidebar layout.
        <div className="hidden lg:block w-4 shrink-0" />
      )}

      {/* Mobile sidebar drawer */}
      <MobileSidebarDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
