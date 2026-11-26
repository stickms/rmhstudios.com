import type { QueryClient } from '@tanstack/react-query';
import { connectionClass, prefersLessData } from '@/lib/network-quality';
import { CHARTED_TYPES } from '../engine/public-read';
import type { MedChartedTypeId } from '../medschools.contract';
import {
  activityQuery,
  arrivalsQuery,
  forecastQuery,
  historyQuery,
  schoolFactsQuery,
  secondariesQuery,
  sourceParamOf,
} from '../medschools.queries';
import type { SchoolSearch } from './school-search';
import type { SourcePref } from '../engine/source-pref';

/** The gap between two background requests, so they never queue ahead of what the reader just asked for. */
const STAGGER_MS = 150;

const whenIdle = (fn: () => void) => {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 2000 });
  else window.setTimeout(fn, 200);
};

/**
 * Once a school page has drawn its tab, fetch the other tabs' public data in the background (owner 2026-11-24), with
 * the same query factories the tabs read, so a tab switch renders straight from the cache, no skeleton. One wave per
 * school visit: at idle, one request at a time, staggered; nothing is cancelled when the reader moves on (the data
 * stays useful for 30 minutes). Skipped when the reader asked for less data (Save-Data, the site's Data Saver) or the
 * link is 2G or offline. Not `shouldSpeculate`: that one guards fetching a route the reader may never open, this is
 * the page they are on, a few small JSON answers.
 * Public, cacheable GETs only: no `me/**` (the private chance line is the reader's own and loads with its tab), and
 * nothing that costs a model call. Returns a cancel for the not-yet-started requests (the page unmounting).
 */
export function prefetchSchoolTabs(
  qc: QueryClient,
  slug: string,
  search: SchoolSearch,
  /** The header's source choice, so the activity keys are the ones the tabs will ask for. */
  pref?: SourcePref,
): () => void {
  const link = connectionClass();
  if (prefersLessData() || link === 'slow' || link === 'offline') return () => undefined;
  const type: MedChartedTypeId = CHARTED_TYPES.includes(search.type) ? (search.type as MedChartedTypeId) : 'INTERVIEW';
  const program = search.program;
  const source = sourceParamOf(pref);
  const jobs = [
    () => qc.prefetchQuery(activityQuery(slug, { program, cycle: search.cycle, ...source })),
    () => qc.prefetchQuery(historyQuery(slug, { program, type })),
    () => qc.prefetchQuery(forecastQuery(slug, { program: program === 'PHD' ? 'PHD' : 'REG', type, ...source })),
    // Interviews reads this cycle's activity; History draws when results arrive.
    () => qc.prefetchQuery(activityQuery(slug, { program, cycle: undefined, ...source })),
    () => qc.prefetchQuery(arrivalsQuery(slug, { program, type })),
    () => qc.prefetchQuery(secondariesQuery(slug, { program })),
    () => qc.prefetchQuery(schoolFactsQuery(slug)),
  ];
  let stopped = false;
  const next = (i: number) => {
    if (stopped || i >= jobs.length) return;
    whenIdle(() => {
      if (stopped) return;
      // A cached, fresh key is a no-op; the request itself is never cancelled.
      void jobs[i]!().finally(() => window.setTimeout(() => next(i + 1), STAGGER_MS));
    });
  };
  next(0);
  return () => {
    stopped = true;
  };
}
