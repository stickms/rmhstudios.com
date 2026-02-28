'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { FeedbackModal } from './FeedbackModal';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';


export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // gather gameRoutes and internal appRoutes
  const gameRoutes = games.map(game => game.href);
  const appRoutes = apps
    .map(app => app.href)
    .filter(href => href.startsWith('/'));

  const isExcludedPage = [...gameRoutes, ...appRoutes, '/secret'].some(route => pathname?.startsWith(route));
  const isHomepage = pathname === '/';

  if (isExcludedPage) {
    return (
        <main className="min-h-screen">
            {children}
        </main>
    );
  }

  // Homepage, profile pages, and post detail pages use their own layout (no Navbar/Footer)
  const isPostDetailPage = /^\/[^/]+\/post\/[^/]+$/.test(pathname ?? '');
  if (isHomepage || pathname?.startsWith('/profile') || isPostDetailPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="pt-16 min-h-screen">
        {children}
      </main>
      <FeedbackModal />
    </>
  );
}
