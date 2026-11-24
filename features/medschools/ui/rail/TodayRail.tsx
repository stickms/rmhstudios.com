import { lazy } from 'react';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { TodaySkeleton } from './TodaySkeleton';

// The summary and its queries are their own chunk, fetched only where the column is displayed (>= 1280px).
const TodaySummary = lazy(() => import('./TodaySummary'));

/**
 * The live page's right column (owner 2026-11-24): a "Today" summary in place of the activity rail, which would only
 * repeat the page's own feed. The same frame as the rail (the 320px column from 1280px, the sticky paper panel, the
 * bottom on the main column's line); the panel and a static skeleton are in the server HTML on every width and CSS
 * hides the column below 1280px, so nothing shifts. Below 1280px nothing is loaded or fetched: the summary's chunk is
 * not imported and every query it owns is `enabled` only at 1280px and up, so an invalidation cannot wake it on a phone.
 */
export default function TodayRail() {
  const wide = useMediaQuery('(min-width: 1280px)');
  return (
    <section className="medapp-panel medapp-panel--rail medapp-today" data-today-rail="">
      {wide ? (
        <ArrivalSuspense fallback={<TodaySkeleton />} wrap={false}>
          <TodaySummary enabled={wide} />
        </ArrivalSuspense>
      ) : (
        <TodaySkeleton />
      )}
    </section>
  );
}
