'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackToTop } from '@/components/ui/back-to-top';
import { MobileSidebarShell } from './MobileSidebarShell';
import { ShellLayoutContext } from './shell-context';
import { MobileDock, SiteNavigation } from './SiteNavigation';

interface SiteShellProps {
  children: ReactNode;
  /** Global dialogs/notices that must share the shell's floating-stack context. */
  overlays?: ReactNode;
}

/** Mobile-first application frame shared by every standard route. */
export function SiteShell({ children, overlays }: SiteShellProps) {
  const { t } = useTranslation('common');

  return (
    <ShellLayoutContext.Provider value>
      <div className="vibe-app site-shell">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[var(--site-control-radius)] focus:bg-site-accent focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:uppercase focus:text-site-accent-fg"
        >
          {t('skipToContent', { defaultValue: 'Skip to content' })}
        </a>

        <MobileSidebarShell>
          <SiteNavigation />
          <main id="main-content" tabIndex={-1} className="site-shell__main page-root">
            {children}
          </main>
          <MobileDock />
        </MobileSidebarShell>

        {overlays}
        <BackToTop />
      </div>
    </ShellLayoutContext.Provider>
  );
}
