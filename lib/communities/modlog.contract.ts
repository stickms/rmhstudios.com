/** Contracts for the community moderation log (client-safe; types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  ModLogEntryDTO,
  ModLogUserDTO,
  PublicModLogEntryDTO,
} from '@/lib/communities/modlog';
import type { modLogQuery } from './modlog-schema';

export type ModLogPage =
  | {
      scope: 'full';
      entries: ModLogEntryDTO[];
      nextCursor:
        | string
        | null;
      /** Current moderators, for the filter (first page only). */
      moderators: ModLogUserDTO[];
    }
  | {
      scope: 'public';
      entries: PublicModLogEntryDTO[];
      nextCursor:
        | string
        | null;
    };

/**
 * Newest first, 50 a page. `scope=full` is moderators only (403 otherwise);
 * `scope=public` needs the community's public log switched on (404 otherwise, for
 * a moderator too) and returns only allow-listed fields.
 */
export const getModLogApi =
  endpoint<{
    query: z.infer<
      typeof modLogQuery
    >;
    res: ModLogPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/communities/$slug/modlog',
    },
  );

/** The last 365 days as a CSV file download (moderators only; a link target, not called through `api()`). */
export const exportModLogApi =
  endpoint<{
    res: string;
  }>()(
    {
      method:
        'GET',
      path: '/api/communities/$slug/modlog/export',
    },
  );
