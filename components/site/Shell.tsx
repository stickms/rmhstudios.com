import { useLocation } from '@tanstack/react-router';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { LeftSidebar } from '@/components/feed/LeftSidebar';
import { MobileNav } from '@/components/feed/MobileNav';


export function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  
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

  // Check if we should render the left sidebar
  // Hide on `/user-builds/[slug]` and `/builds/[slug]` (which handles games/apps dynamically).
  // The base pages `/builds`, `/builds/games`, `/builds/apps`, and `/user-builds` SHOULD show the sidebar.
  const isUserBuildsSlug = pathname?.startsWith('/user-builds/') && pathname !== '/user-builds';
  const isBuildsSlug = pathname?.startsWith('/builds/') && !['/builds/games', '/builds/apps'].includes(pathname);
  const hideLeftSidebar = isUserBuildsSlug || isBuildsSlug;

  return (
    <div className="min-h-screen bg-site-bg flex overflow-hidden">
      {hideLeftSidebar ? (
        <div className="flex min-w-0 w-full justify-center">
          {children}
        </div>
      ) : (
        <>
          {/* Desktop/tablet: center sidebar + middle + optional right sidebar as one horizontal group */}
          <div className="hidden md:flex min-w-0 w-full justify-center">
            <div className="md:w-16 xl:w-64 shrink-0 relative">
              <aside className="fixed top-0 md:w-16 xl:w-64 h-screen border-r border-site-border bg-site-bg overflow-y-auto z-30 flex flex-col">
                <LeftSidebar />
              </aside>
            </div>
            {children}
          </div>

          {/* Mobile: sidebar hidden, keep content centered */}
          <div className="flex md:hidden min-w-0 w-full justify-center">
            {children}
          </div>
        </>
      )}

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
