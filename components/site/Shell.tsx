'use client';

import { usePathname } from 'next/navigation';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { MobileNav } from '@/components/feed/MobileNav';


export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // gather gameRoutes and internal appRoutes
  const gameRoutes = games.map(game => game.href);
  const appRoutes = apps
    .map(app => app.href)
    .filter(href => href.startsWith('/'));

  const isExcludedPage = [...gameRoutes, ...appRoutes, '/secret', '/login'].some(route => pathname?.startsWith(route));

  if (isExcludedPage) {
    return (
        <main className="min-h-screen">
            {children}
        </main>
    );
  }

  // All other pages get the persistent sidebar shell
  return (
    <div className="min-h-screen bg-site-bg flex justify-center overflow-hidden">
      {/* Left Sidebar - hidden on mobile, icon-only on md, full on lg+ */}
      <div className="hidden md:block md:w-16 lg:w-64 shrink-0 relative">
        <aside className="fixed top-0 bottom-0 w-16 lg:w-64 border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
          <LeftSidebar />
        </aside>
      </div>

      {/* Page content renders as direct flex siblings (AnimatedMain + right sidebar) */}
      {children}

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}

