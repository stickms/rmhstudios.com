/**
 * Contracts for the per-account /api/discovery/** settings (redesign audit C1,
 * batch 7): keyword alerts, the "On this day" opt-in and watch levels.
 * Client-safe: every type is `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { alertCreateSchema, WatchKind, WatchLevel } from '@/lib/discovery/schema';

export interface DiscoveryAlert {
  id: string;
  query: string;
}

export const listDiscoveryAlertsApi = endpoint<{ res: { alerts: DiscoveryAlert[] } }>()({
  method: 'GET',
  path: '/api/discovery/alerts',
});

/** 201 with the stored alert; the server's `{ error }` on a refused query. */
export const addDiscoveryAlertApi = endpoint<{
  body: z.infer<typeof alertCreateSchema>;
  res: { alert: DiscoveryAlert };
}>()({ method: 'POST', path: '/api/discovery/alerts' });

export const removeDiscoveryAlertApi = endpoint<{
  query: { id: string };
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/discovery/alerts' });

export const getDiscoveryMemoriesApi = endpoint<{ res: { enabled: boolean } }>()({
  method: 'GET',
  path: '/api/discovery/memories',
});

export const setDiscoveryMemoriesApi = endpoint<{
  body: { enabled: boolean };
  res: { enabled: boolean };
}>()({ method: 'PUT', path: '/api/discovery/memories' });

export const getDiscoveryWatchApi = endpoint<{
  query: { kind: WatchKind; targetId: string };
  res: { level: WatchLevel };
}>()({ method: 'GET', path: '/api/discovery/watch' });

export const setDiscoveryWatchApi = endpoint<{
  body: { kind: WatchKind; targetId: string; level: WatchLevel };
  res: { level: WatchLevel };
}>()({ method: 'PUT', path: '/api/discovery/watch' });
