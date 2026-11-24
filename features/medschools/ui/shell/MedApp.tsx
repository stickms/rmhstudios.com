import { lazy, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/shared/AppShell';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { CookieConsent } from '@/components/site/CookieConsent';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MedTopBar } from './MedTopBar';
import { useMedModeRoot } from './useMedMode';

// The live activity rail is its own chunk, fetched only where it is displayed (>= 1280px).
const ActivityRail = lazy(() => import('../rail/ActivityRail'));

/**
 * The full-screen app frame for every `/rmh-medschool` page (the layout route `app/routes/rmh-medschool.tsx` renders it
 * around its `<Outlet/>`). It replaces the `_site` shell: the Steel shell, its margin column and its overlays are not
 * here, so this frame mounts what a public page still needs from them: the cookie notice, the toaster (AppShell), and
 * the live rail that used to sit in the shell's margin.
 *
 * The page is a document, `.app-page` (the whole document scrolls), in the `--app-*` palette of `medschools.css`. The
 * painterly wash is that sheet's `background-image` on the same element: in the flow, static, never fixed.
 */
export function MedApp({ children }: { children: ReactNode }) {
  const { t } = useTranslation('medschools');
  useMedModeRoot();
  const railShown = useMediaQuery('(min-width: 1280px)');
  return (
    <AppShell appClassName="medapp-theme">
      <div className="app-page medapp-page">
        <div className="medapp-frame">
          <MedTopBar />
          <div className="medapp-grid">
            <main id="main-content" className="medapp-main">
              {children}
            </main>
            {railShown && (
              <aside className="medapp-rail" aria-label={t('shell-rail-label', { defaultValue: 'Live activity' })}>
                <ArrivalSuspense>
                  <ActivityRail />
                </ArrivalSuspense>
              </aside>
            )}
          </div>
        </div>
      </div>
      <SilentErrorBoundary label="medschools-cookie-consent">
        <CookieConsent />
      </SilentErrorBoundary>
    </AppShell>
  );
}
