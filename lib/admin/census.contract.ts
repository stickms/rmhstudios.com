/**
 * Contracts for /api/admin/census (third-pass audit DT1). Client-safe: types only.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  Census,
  CensusBaseline,
  CensusSnapshotSummary,
  CensusSource,
} from '@/lib/admin/census';

export interface AdminCensusResponse {
  /** `live`: taken for this request (cached for a minute). Otherwise how the stored month was written. */
  source: 'live' | CensusSource;
  census: Census;
  /** The write counters of the stored snapshot this census is compared with, or null when none is old enough. */
  baseline: CensusBaseline | null;
  /** The stored months, newest first. */
  snapshots: CensusSnapshotSummary[];
}

/** The census: live, or the stored snapshot for `month` ('YYYY-MM'; 404 when that month has none). */
export const getAdminCensusApi = endpoint<{
  query: { month?: string | undefined };
  res: AdminCensusResponse;
}>()({ method: 'GET', path: '/api/admin/census' });

/** Take the census now and store it as the current month's snapshot, replacing one already there. */
export const takeAdminCensusSnapshotApi = endpoint<{
  body: Record<string, never>;
  res: { snapshot: CensusSnapshotSummary };
}>()({ method: 'POST', path: '/api/admin/census' });
