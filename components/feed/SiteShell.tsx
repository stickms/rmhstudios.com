'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackToTop } from '@/components/ui/back-to-top';
import { LeftSidebar } from './LeftSidebar';
import { MobileSidebarShell } from './MobileSidebarShell';
import { ShellLayoutContext } from './shell-context';

interface SiteShellProps {
  children: ReactNode;
  /** Global dialogs/notices that must share the shell's floating-stack context. */
  overlays?: ReactNode;
}

/**
 * Responsive chrome for every standard website route.
 *
 * The shell owns the only main landmark, desktop navigation rail, mobile drawer,
 * safe-area behavior, and floating overlay stack. Route components only provide
 * their center column and optional context rail, which keeps games and standalone
 * apps out of this layout entirely.
 */
export function SiteShell({ children, overlays }: SiteShellProps) {
  const { t } = useTranslation('common');
  const { t: tf } = useTranslation('feed');

  return (
    <ShellLayoutContext.Provider value>
      <div className="vibe-app site-shell">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-site-sm focus:bg-site-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-site-accent-fg"
        >
          {t('skipToContent', { defaultValue: 'Skip to content' })}
        </a>

        <div className="site-shell__rail-slot">
          <aside
            className="site-shell__rail"
            aria-label={tf('open-menu', { defaultValue: 'Navigation menu' })}
          >
            <div className="site-shell__rail-glass glass-chrome--aside">
              <LeftSidebar />
            </div>
          </aside>
        </div>

        <MobileSidebarShell>
          <main id="main-content" tabIndex={-1} className="contents page-root">
            {children}
          </main>
        </MobileSidebarShell>

        {overlays}
        <BackToTop />
      </div>
    </ShellLayoutContext.Provider>
  );
}
