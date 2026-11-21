/** Contracts for pinning posts to a profile (sprint 05 #19). Client-safe: types come from the zod schema by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { movePinBodySchema } from '@/lib/feed/profile-pins-schema';

/** Where a post stands among its author's pins. `pinnedOrder` is 1-based and `null` when the post is not pinned. */
export interface PinState {
  pinned: boolean;
  pinnedOrder:
    | number
    | null;
  pinnedCount: number;
  limit: number;
}

/** The author's pin state for one of their posts (the menu asks when it opens). 403 for someone else's post, 404 when gone. */
export const getPinStateApi =
  endpoint<{
    res: PinState;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmharks/$id/pin',
    },
  );

/**
 * Pin the post to the profile, or unpin it when it already is. A fourth pin is a 409 (nothing is unpinned for the
 * member); 403 for someone else's post, 404 when gone or deleted, 400 for a community post or reply.
 */
export const pinPostApi =
  endpoint<{
    res: PinState & {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rmharks/$id/pin',
    },
  );

/** Trade places with the neighbouring pin. 409 when the post is not pinned or already at that end of the list. */
export const movePinApi =
  endpoint<{
    body: z.infer<
      typeof movePinBodySchema
    >;
    res: PinState & {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rmharks/$id/pin/move',
    },
  );
