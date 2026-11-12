/**
 * The provider stack of a separately built island (redesign audit B1).
 *
 * An island is a game or app delivered outside the site's route graph: no
 * router, no radial shell, no site `Providers`. What it shares with the site is
 * the `components/ui` layer and the session cookie, so this provides exactly
 * what that layer and shared game code read:
 *
 *  - i18n — the site's own client instance (`AppI18nProvider`), so namespaces
 *    load per namespace on demand exactly as on the site;
 *  - the session — the same `SessionCtx` the site provides, from a
 *    session-only Better Auth client, seeded with the user the server resolved
 *    (`useEffectiveSession`), so a signed-in player never sees "Sign in" flash;
 *  - the app-tier flag (`AppTierContext`), framer-motion's lazy features and
 *    `MotionConfig`, the site's `<SiteToaster>`, and `TwemojiProvider` (the root
 *    wraps every page in it, so a game's emoji draw as the same images);
 *  - client error reporting and Core Web Vitals, and the two per-title trackers the site
 *    mounts globally: Recents and the playtime heartbeat.
 *
 * Everything else the site's `Providers` does is for site pages (theme
 * application, command palette, calls, the globe) and is deliberately absent.
 */
import { type ReactNode, useEffect } from 'react';
import { LazyMotion, MotionConfig } from 'framer-motion';
import { AppI18nProvider } from '@/components/i18n/AppI18nProvider';
import {
  SessionCtx,
  useEffectiveSession,
  type SessionCtxValue,
} from '@/components/session/session-context';
import { AppTierContext } from '@/components/ui/app-tier-context';
import { SiteToaster } from '@/components/ui/site-toaster';
import { TwemojiProvider } from '@/components/ui/TwemojiProvider';
import { usePlaytimeHeartbeat } from '@/hooks/usePlaytimeHeartbeat';
import { recordRecent } from '@/hooks/useRecents';
import { sessionAuthClient } from '@/lib/auth-session-client';
import { installGlobalErrorHandlers } from '@/lib/client-errors';
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';
import { initWebVitals } from '@/lib/rum';
import type { IslandData } from './island-data';

// The same lazy feature bundle the site's Providers loads (framer-motion's drivers stay out of the entry).
const loadMotionFeatures = () => import('@/lib/motion-features').then((mod) => mod.default);

function IslandSession({ data, children }: { data: IslandData; children: ReactNode }) {
  const live = sessionAuthClient.useSession() as unknown as SessionCtxValue;
  const session = useEffectiveSession(live, data.user, data.sessionResolved);
  const signedIn = !!session.data?.user;
  usePlaytimeHeartbeat(data.catalog?.id ?? null, signedIn);
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>;
}

export function IslandProviders({ data, children }: { data: IslandData; children: ReactNode }) {
  const lang = typeof document === 'undefined' ? DEFAULT_LOCALE : document.documentElement.lang;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;

  useEffect(() => {
    installGlobalErrorHandlers();
    initWebVitals();
    const c = data.catalog;
    if (c)
      recordRecent({
        href: c.href,
        title: c.title,
        gradient: c.gradient,
        image: c.image,
        kind: c.kind,
      });
  }, [data.catalog]);

  const dark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('style-graphite');

  return (
    <AppI18nProvider locale={locale} resources={data.resources}>
      <LazyMotion features={loadMotionFeatures}>
        <MotionConfig reducedMotion="never">
          <IslandSession data={data}>
            <AppTierContext.Provider value>
              <TwemojiProvider>{children}</TwemojiProvider>
            </AppTierContext.Provider>
          </IslandSession>
          <SiteToaster theme={dark ? 'dark' : 'light'} />
        </MotionConfig>
      </LazyMotion>
    </AppI18nProvider>
  );
}
