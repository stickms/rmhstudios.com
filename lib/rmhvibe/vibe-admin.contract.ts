/** Contract for the vibe gallery admin action (redesign audit C1, batch 10). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

/**
 * Admin: flag every ready vibe page for a thumbnail re-render (the jobs worker does the
 * rendering). Idempotent; `count` is how many pages were flagged.
 */
export const backfillVibeThumbsApi =
  endpoint<{
    res: {
      ok: true;
      count: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/vibe/backfill-thumbs',
    },
  );
