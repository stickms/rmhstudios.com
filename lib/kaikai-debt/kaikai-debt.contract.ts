/**
 * Contracts for the Kaikai debt counter's JSON endpoints (redesign audit C1). The
 * streamed `/ask` answer stays a raw fetch. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { DebtEntryDto, DebtLedgerPage } from '@/lib/kaikai-debt/debt';
import type { AddDebtInput } from '@/lib/kaikai-debt/schema';
import type { DebtStats } from '@/lib/kaikai-debt/stats';

/** One page of the infinite log, older than `cursor` (epoch millis) when given. */
export const debtLedgerApi = endpoint<{
  query: { cursor?: string | undefined };
  res: DebtLedgerPage;
}>()({ method: 'GET', path: '/api/kaikai-debt/ledger' });

/** Every aggregate the analytics section draws. */
export const debtStatsApi = endpoint<{ res: DebtStats }>()({
  method: 'GET',
  path: '/api/kaikai-debt/stats',
});

/** The `/entries` response, narrowed to the fields the page updates from. */
export interface AddDebtResult {
  entry: DebtEntryDto;
  basisCents: number;
  contributorCount: number;
}

/** Add a line to the tab. 422 carries the appraiser's own sentence in `error`. */
export const addDebtEntryApi = endpoint<{
  body: AddDebtInput;
  res: AddDebtResult;
}>()({ method: 'POST', path: '/api/kaikai-debt/entries' });
