'use client';

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
}

export function PageLayout({
  title,
  children,
  rightSidebar,
  headerExtra,
  headerRight,
  wide,
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
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 h-15 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
            <div className="h-full flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                {/* Mobile: always show the sidebar button in the top-left */}
                <MobileMenuButton />
                <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2">
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
