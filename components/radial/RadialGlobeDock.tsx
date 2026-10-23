'use client';

/**
 * The docked globe — the desktop shell's default navigation.
 *
 * On a wide screen the text rail (`RadialNavRail`) and the orb's globe were two
 * maps of the same `SIDEBAR_NAV`, one of them always on screen and the other a
 * click away. So by default (Settings → Layout → Desktop navigation) the left
 * track holds the globe itself, always up: it drifts on its own, a sheen sweeps
 * across the glass now and then, and it is driven exactly like the hub's — drag
 * to spin, hold a destination in the reticle, let go to land there, or click a
 * pin outright. The orb is retired at this width (radial.css), since the globe
 * it would open is already here.
 *
 * The aside is always rendered (radial.css decides from the pre-paint
 * `data-desktop-nav` attribute whether it or the rail takes the track, so the
 * grid never reflows on hydration). The globe inside it is mounted only once the
 * client knows it is docked — a phone, or a visitor who chose the rail, never
 * downloads it from here.
 */

import { Suspense, lazy } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useGlobeDestinations, useGlobeDocked } from './globe-dock';

/** Same chunk as the hub's globe: whichever asks first fetches it for both. */
const LiquidGlobe = lazy(() => import('./LiquidGlobe').then((m) => ({ default: m.LiquidGlobe })));

const noop = () => {};

export function RadialGlobeDock() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const docked = useGlobeDocked();
  const items = useGlobeDestinations();

  return (
    <nav
      className="rad-rail rad-rail--globe"
      aria-label={t('globe-navigation-title', { defaultValue: 'Explore with the globe' })}
    >
      <div className="rad-globe-dock">
        {docked && (
          <Suspense fallback={null}>
            <LiquidGlobe items={items} pathname={pathname} onDismiss={noop} tabIndex={0} ambient />
          </Suspense>
        )}
        <span className="rad-globe-dock__shimmer" aria-hidden />
      </div>
    </nav>
  );
}
