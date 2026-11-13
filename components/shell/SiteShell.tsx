import type { ReactNode } from 'react';
import { ShellLayoutContext } from '@/components/feed/shell-context';
import { GlobeNav } from './GlobeNav';
import { MarginColumn } from './MarginColumn';
import { MarginSlotProvider } from './margin-slot';
import { ShellEffects } from './ShellEffects';
import { Sidebar } from './Sidebar';
import { SkipLink } from './SkipLink';
import './site-shell.css';

interface SiteShellProps {
  children: ReactNode;
  /** Global dialogs and notices (cookie notice, first-run modals, shortcuts). */
  overlays?: ReactNode;
}

/**
 * The frame every standard route sits in (Steel section 9, L1 to L7).
 *
 * Phone: one column, the page title scrolls, the globe is the only fixed element. Desktop: a sidebar of the
 * sections, the content, and a margin; the frame is capped at 1240px (site-shell.css), and the globe is in the
 * sidebar's own sticky box, so it moves with the sidebar and nothing on a desktop page is fixed.
 *
 * This file is markup: it calls no hook, and which columns show is CSS (grid and media queries), so the shell is
 * complete with scripting off (B1). The pieces that need the client (the signed-in handle, the unread count, the
 * globe's open state) are children, each of which renders its complete resting state on the server.
 *
 * `children` and `overlays` are unchanged from the old shell, so `_site.tsx` and the router's pending fallback keep working.
 */
export function SiteShell({ children, overlays }: SiteShellProps) {
  return (
    <ShellLayoutContext.Provider value>
      <MarginSlotProvider>
        <div className="vibe-app site-shell">
          <SkipLink />
          <div className="site-shell__frame">
            <Sidebar />
            <main id="main-content" tabIndex={-1} className="site-main page-root">
              {children}
            </main>
            <MarginColumn />
            {/* Inside the frame: on desktop the globe's box is a grid item laid over the sidebar's cell (globe-nav.css). */}
            <GlobeNav />
          </div>
          <ShellEffects />
          {overlays}
        </div>
      </MarginSlotProvider>
    </ShellLayoutContext.Provider>
  );
}
