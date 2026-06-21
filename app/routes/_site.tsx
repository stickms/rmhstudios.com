/**
 * Site Layout Route (pathless)
 *
 * Wraps all standard pages with the left sidebar and mobile navigation.
 * Game routes, /secret, and /login are NOT nested under this layout,
 * so they render full-screen without any sidebar.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { MobileNav } from '@/components/feed/MobileNav';
import { MobileSidebarShell } from '@/components/feed/MobileSidebarShell';
import '@/components/feed/feed.css';

export const Route = createFileRoute('/_site')({
  component: SiteLayout,
});

function SiteLayout() {
  return (
    <div className="vibe-app min-h-dvh bg-site-bg flex flex-col md:flex-row">
      {/* Desktop/tablet: fixed left sidebar + centered content */}
      <div className="hidden md:flex min-w-0 w-full justify-center">
        <div className="md:w-16 xl:w-64 shrink-0 relative">
          <aside className="fixed top-0 md:w-16 xl:w-64 h-screen border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
            <LeftSidebar />
          </aside>
        </div>
        <Outlet />
      </div>

      {/* Mobile: page content slides right to reveal the left sidebar */}
      <MobileSidebarShell>
        <Outlet />
      </MobileSidebarShell>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
