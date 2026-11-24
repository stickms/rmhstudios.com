import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/shared/AppShell';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { CookieConsent } from '@/components/site/CookieConsent';
import { MedTopBar } from './MedTopBar';
import { useMedModeRoot } from './useMedMode';

import ActivityRail from '../rail/ActivityRail';

/**
 * The full-screen app frame for every `/med` page (the layout route `app/routes/med.tsx` renders it
 * around its `<Outlet/>`). It replaces the `_site` shell: the Steel shell, its margin column and its overlays are not
 * here, so this frame mounts what a public page still needs from them: the cookie notice, the toaster (AppShell), and
 * the live rail that used to sit in the shell's margin. The rail's frame and skeleton render on the server at every
 * width and CSS shows the column from 1280px; its list and query load only there (`rail/ActivityRail`).
 *
 * The page is a document, `.app-page` (the whole document scrolls), in the `--app-*` palette of `medschools.css`. The
 * painterly wash is that sheet's `background-image` on the same element: in the flow, static, never fixed.
 */
export function MedApp({ children }: { children: ReactNode }) {
  const { t } = useTranslation('medschools');
  useMedModeRoot();
  return (
    <AppShell appClassName="medapp-theme">
      <div className="app-page medapp-page">
        <div className="medapp-frame">
          <div className="medapp-grid">
            {/* The top bar spans the main column only, so the rail starts level with it (owner 2026-11-24). */}
            <div className="medapp-col">
              <MedTopBar />
              <main id="main-content" className="medapp-main">
                {children}
              </main>
            </div>
            <aside className="medapp-rail" aria-label={t('shell-rail-label', { defaultValue: 'Live activity' })}>
              <ActivityRail />
            </aside>
          </div>
        </div>
      </div>
      <SilentErrorBoundary label="medschools-cookie-consent">
        <CookieConsent />
      </SilentErrorBoundary>
    </AppShell>
  );
}
