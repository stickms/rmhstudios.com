/**
 * Contracts for the sitewide announcement endpoints. Client-safe: types only,
 * by `import type`, so this file ships no zod.
 * Design: docs/superpowers/specs/2026-11-12-sitewide-announcements-design.md
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { SitewideAnnouncementResponse } from '@/lib/sitewide-announcement';
import type { markSeenSchema } from '@/lib/sitewide-announcement-schema';

/**
 * The newest live announcement and whether the signed-in viewer has dismissed
 * it (`seen` is always false for a logged-out visitor). `full=1` adds the
 * markdown `content`.
 */
export const getSitewideAnnouncementApi =
  endpoint<{
    query: {
      full?:
        | '1'
        | undefined;
    };
    res: SitewideAnnouncementResponse;
  }>()(
    {
      method:
        'GET',
      path: '/api/sitewide-announcement',
    },
  );

/** Remember that the signed-in viewer dismissed the popup. A no-op when logged out. */
export const markSitewideAnnouncementSeenApi =
  endpoint<{
    body: z.infer<
      typeof markSeenSchema
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/sitewide-announcement/seen',
    },
  );
