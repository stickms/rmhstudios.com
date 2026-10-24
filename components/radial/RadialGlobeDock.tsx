'use client';

/**
 * A compact globe above the desktop navigation links. Both use SIDEBAR_NAV;
 * the links remain available before the lazy globe loads and at every motion
 * tier. The desktop-navigation setting can hide the globe without changing
 * the reading column's position. Drag, pin selection and in-place eversion
 * retain the same implementation as the full-screen navigator.
 *
 * A destination chosen on it does NOT hand the screen to the full-screen Globe
 * Eversion (the hub's globe does). The page changes at once and the docked globe
 * turns itself inside out in place while it does (`ambient` in LiquidGlobe).
 *
 * The dock is always rendered (CSS reserves its space before hydration).
 * The globe inside it is mounted only once the
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
    <div
      className="rad-rail--globe"
      role="navigation"
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
    </div>
  );
}
