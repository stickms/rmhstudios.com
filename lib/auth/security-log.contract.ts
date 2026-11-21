/**
 * Contracts for the account security log (`/settings/security`, "Recent activity"). Client-safe:
 * types come from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { SecurityEventDetail, SecurityEventKind } from '@/lib/auth/security-log';
import type { securityActivityQuery } from '@/lib/auth/security-log-schema';

export interface SecurityActivityItem {
  /** Row id as a string (a bigint does not survive JSON). */
  id: string;
  kind: SecurityEventKind;
  /** Coarse device name ("Firefox on Windows"), never a full user agent. */
  device: string | null;
  createdAt: string;
  /** The event belongs to the session this request was made from. */
  thisDevice: boolean;
  /** Same salted IP hash as the current session; `null` when either side has none. */
  sameNetwork: boolean | null;
  detail: SecurityEventDetail | null;
}

export interface SecurityActivityPage {
  items: SecurityActivityItem[];
  /** Pass back as `cursor` for the next page; `null` on the last page. */
  nextCursor: string | null;
}

export const getSecurityActivityApi = endpoint<{
  query: z.infer<typeof securityActivityQuery>;
  res: SecurityActivityPage;
}>()({ method: 'GET', path: '/api/settings/security/activity' });

/** The whole log as a CSV file download (a link target, not called through `api()`). */
export const exportSecurityActivityApi = endpoint<{ res: string }>()({
  method: 'GET',
  path: '/api/settings/security/activity/export',
});
