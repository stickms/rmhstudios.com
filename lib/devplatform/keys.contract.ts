/**
 * Contracts for /api/developer/keys (redesign audit C1, batch 4). Client-safe:
 * request types come from the zod schemas by `import type`; response dates are
 * the ISO strings on the wire. Failures carry the server's `{ error }` text as
 * the `HttpError` message.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { createKeyBody, patchKeyBody } from '@/lib/devplatform/keys-schema';

/** A key's metadata. The secret is never part of it. */
export interface DeveloperKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastFour: string | null;
  scopes: string[];
  testMode: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export const listDeveloperKeysApi = endpoint<{
  res: { keys: DeveloperKeyRow[]; hasApiAccess: boolean; tier: string; availableScopes: string[] };
}>()({ method: 'GET', path: '/api/developer/keys' });

/** 201. `key` is the plaintext secret, returned exactly once. */
export const createDeveloperKeyApi = endpoint<{
  body: z.infer<typeof createKeyBody>;
  res: Omit<DeveloperKeyRow, 'lastUsedAt' | 'testMode'> & { key: string };
}>()({ method: 'POST', path: '/api/developer/keys' });

/** Rename, re-scope, change expiry or rotate. `key` is present only when rotated. */
export const updateDeveloperKeyApi = endpoint<{
  body: z.infer<typeof patchKeyBody>;
  res: Omit<DeveloperKeyRow, 'testMode'> & { key?: string };
}>()({ method: 'PATCH', path: '/api/developer/keys/$id' });

export const revokeDeveloperKeyApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/developer/keys/$id',
});

export interface KeyUsageDay {
  date: string;
  requests: number;
  units: number;
  clientErrors: number;
  serverErrors: number;
}

export interface DeveloperKeyUsage {
  key: { id: string; name: string };
  days: number;
  usage: KeyUsageDay[];
  totals: { requests: number; units: number; clientErrors: number; serverErrors: number };
}

/** A key's own usage history (owner only; `days` is clamped to 1..90, default 30). 404 when the key is not theirs. */
export const getDeveloperKeyUsageApi = endpoint<{
  query: { days?: number | undefined };
  res: DeveloperKeyUsage;
}>()({ method: 'GET', path: '/api/developer/keys/$id/usage' });
