/** Contracts for /api/links/check and /api/safety/pile-on (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { LinkRisk } from '@/lib/safety/link-risk';

export type PileOnState = {
  status: 'OFFERED' | 'ACTIVE' | 'REVERTED' | 'DISMISSED';
  expiresAt: string | null;
};

/** Risk of up to 20 link hosts. */
export const linksCheckApi = endpoint<{
  body: { hosts: string[] };
  res: { risk: Record<string, LinkRisk> };
}>()({ method: 'POST', path: '/api/links/check' });

/** The caller's pile-on guard for one post. 404 when there is none. */
export const pileOnGetApi = endpoint<{
  query: { post: string };
  res: PileOnState;
}>()({ method: 'GET', path: '/api/safety/pile-on' });

export const pileOnActApi = endpoint<{
  body: { postId: string; action: 'accept' | 'dismiss' | 'undo' };
  res: { status: PileOnState['status']; expiresAt?: string | null };
}>()({ method: 'POST', path: '/api/safety/pile-on' });
