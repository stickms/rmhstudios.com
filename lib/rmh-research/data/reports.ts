/**
 * Long-form reports that are their own pages on the site. Both were standalone
 * pages before RMH Research returned (`/optimization`, `/covid`) and were
 * merged into it; they are listed in the archive like any paper and link out
 * to the full page through `href`.
 */
import type { Paper } from '../types';

export const REPORT_OPTIMIZATION_ID = 'speed-and-optimization';
export const REPORT_FEATURE_LEAK_ID = 'feature-leak';

export const REPORTS: readonly Paper[] = [
  {
    id: REPORT_OPTIMIZATION_ID,
    kind: 'report',
    href: '/rmh-research/reports/optimization',
    title: 'Speed & Optimization: How RMH Studios Stays Fast',
    authors: [],
    byline: 'RMH Studios Platform Engineering',
    year: 2026,
    field: 'computer-science',
    venue: 'RMH Research Reports',
    abstract:
      'A measured account of the runtime and build-time work behind the platform: a server-seeded first paint, intent prefetching and optimistic writes at runtime, and a parallel, cache-warm build and deploy pipeline. Every claim is reported with its before and after numbers.',
    keywords: ['performance', 'web', 'first paint', 'prefetching', 'build pipeline', 'measurement'],
    refs: [],
  },
  {
    id: REPORT_FEATURE_LEAK_ID,
    kind: 'report',
    href: '/rmh-research/reports/feature-leak',
    title: 'Feature Leak: The True Origins of X',
    authors: [],
    byline: 'Office of Platform Integrity',
    year: 2026,
    field: 'social-sciences',
    venue: 'RMH Research Reports',
    abstract:
      'A finding from the RMH Studios Office of Platform Integrity on the provenance of a competing product: five facts, a ship-date ledger, and nine departing engineers.',
    keywords: ['platform integrity', 'provenance', 'ship dates', 'product history'],
    refs: [],
  },
];
