/**
 * Contracts for /api/admin/homes (admin only). Client-safe: types only, by `import type`.
 * A source's feed URL never leaves the server beyond its host and path.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AdminHomeSource, AdminHomesPage } from '@/lib/admin/homes';
import type { addRssSourceBody, sourceStatusBody } from '@/lib/admin/homes-schema';

/** Every source (errors first) and the last 20 scrape runs. */
export const listAdminHomesApi = endpoint<{
  res: AdminHomesPage;
}>()({
  method: 'GET',
  path: '/api/admin/homes',
});

/** Add an RSS feed. Refused for a non-https or non-public address and for a feed that is already a source. */
export const addAdminHomeRssApi = endpoint<{
  body: z.infer<typeof addRssSourceBody>;
  res: { source: AdminHomeSource };
}>()({
  method: 'POST',
  path: '/api/admin/homes',
});

/** Pause or resume one source; a stale `seen` status is a conflict. */
export const setAdminHomeSourceStatusApi = endpoint<{
  body: z.infer<typeof sourceStatusBody>;
  res: { source: AdminHomeSource };
}>()({
  method: 'POST',
  path: '/api/admin/homes/sources/$id/status',
});

/** Queue one scrape now; refused while one is already queued or running. */
export const runAdminHomesScrapeApi = endpoint<{
  res: { queued: true };
}>()({
  method: 'POST',
  path: '/api/admin/homes/scrape',
});
