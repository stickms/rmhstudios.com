'use client';

import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { AnimatedMain } from './AnimatedMain';
import { MobileMenuButton } from './MobileMenuButton';
import { MobileBrandPrefix } from './MobileHeader';
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
  /**
   * When set, a back arrow appears at the start of the header linking here.
   * Especially useful on nested pages (e.g. admin sub-pages) and on mobile,
   * where there's otherwise no obvious way back to the parent.
   */
  backTo?: string;
  /** Accessible label for the back arrow (defaults to "Back"). */
  backLabel?: string;
}

export function PageLayout({
  title,
  children,
  rightSidebar,
  headerExtra,
  headerRight,
  wide,
  backTo,
  backLabel,
}: PageLayoutProps) {
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
          {/* Sticky Header — frosted glass chrome, unified on .vibe-glass so it
              matches the mobile top bar and nav across all themes. */}
          <div className="vibe-glass sticky top-0 z-10 h-18 border-b border-site-border">
            <div className="h-full flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile: always show the sidebar button in the top-left */}
                <MobileMenuButton />
                {backTo && (
                  <Link
                    to={backTo}
                    aria-label={backLabel ?? 'Back'}
                    className="shrink-0 -ml-1 rounded-full p-1.5 text-site-text-muted transition-colors hover:bg-site-surface hover:text-site-text active:scale-95"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Link>
                )}
                <h1 className="font-(family-name:--site-font-display) font-semibold text-2xl tracking-[-0.022em] text-site-text flex items-center gap-2 min-w-0 truncate">
                  {/* Mobile: "RMH |" brand prefix before the page title */}
                  <MobileBrandPrefix />
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
    </>
  );
}
