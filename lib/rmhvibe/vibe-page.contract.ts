/** Contracts for per-page vibe endpoints. Client-safe: no zod ships from here. */
import { endpoint } from '@/lib/contract/endpoint';

/**
 * Owner only (403 otherwise): save the page's tweak values. Entries are checked against
 * the latest version's spec and the rest are dropped; the thumbnail is re-rendered.
 */
export const vibeTweaksApi = endpoint<{
  body: { values: Record<string, unknown> };
  res: { ok: true };
}>()({ method: 'POST', path: '/api/vibe/page/$slug/tweaks' });
