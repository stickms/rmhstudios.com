'use client';

/**
 * The desktop live rail — the right flank of the shell frame.
 *
 * Wide screens get the ambient, glanceable half of the site: who is online, the
 * daily loop, friends you can join, what is trending, who to follow. It is the
 * counterweight to the nav rail: navigation on the left, situation on the right,
 * content in the middle.
 *
 * Cost discipline, because this mounts on *every* page:
 *  - **the contents are a lazy chunk** behind the same 1440px query that reveals
 *    the rail, so a phone never downloads or hydrates them at all. This file is
 *    only the frame plus the page's portal slot;
 *  - the fetches inside are additionally gated on `useIdleReady()`, so they
 *    never compete with hydration even on a wide screen;
 *  - the `/api/explore` payload is memoised at module scope, so moving between
 *    pages re-renders the rail without re-fetching it;
 *  - the only repeating timer is the online-count poll, once a minute.
 *
 * It owns its own scroll (`rad-rail__scroll`) so a tall rail can never stretch
 * the frame or spill over the content column.
 */

import { Suspense, lazy, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/**
 * The rail's ambient content, behind a lazy boundary.
 *
 * `radial.css` gives `.rad-rail` `display: none` and reveals `.rad-rail--live`
 * only at `min-width: 1440px`, so below that width every byte of this chunk
 * renders a column the visitor cannot see. Splitting it out is what stops a
 * phone downloading, parsing and hydrating it — see the module header in
 * `RadialLiveRailContent.tsx` for why gating only the fetches (which this file
 * already did) was not enough.
 *
 * No intent-preload warm-up here, unlike the panels and the globe: nothing the
 * visitor does reveals this rail — a media query does — so by the time the
 * boundary renders at all, the viewport is already wide enough. It is ambient
 * content with no interaction waiting on it, so a Suspense frame costs nothing.
 */
const RadialLiveRailContent = lazy(() =>
  import('./RadialLiveRailContent').then((m) => ({ default: m.RadialLiveRailContent })),
);

/** The width at which radial.css actually reveals the rail (`min-width: 1440px`). */
const RAIL_QUERY = '(min-width: 1440px)';

export function RadialLiveRail({ children }: { children?: ReactNode }) {
  const { t } = useTranslation('feed');
  // Deliberately the rail's OWN breakpoint, not the shared `xl` one: gating on a
  // wider query than the CSS reveal would starve the rail, and on a narrower one
  // would pay for a column the viewer cannot see.
  const visible = useMediaQuery(RAIL_QUERY);

  return (
    <aside
      className="rad-rail rad-rail--live"
      aria-label={t('discover', { defaultValue: 'Discover' })}
    >
      <div className="rad-rail__scroll">
        {/* Page-contributed content (PageLayout's `rightSidebar`) lands here. It
            stays mounted at every width — and stays OUT of the lazy chunk — so
            the portal target exists as soon as the shell does, which is what
            `rail-slot.tsx` relies on. */}
        {children}

        {visible && (
          <Suspense fallback={null}>
            <RadialLiveRailContent />
          </Suspense>
        )}
      </div>
    </aside>
  );
}
