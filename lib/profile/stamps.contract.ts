/**
 * Contracts for /api/stamps (redesign audit C1, batches 4 and 9). Client-safe.
 * Failures carry the server's `{ error }` text as the `HttpError` message.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  browseStampsQuery,
  StampView,
} from '@/lib/profile/stamps';

/** Everyone's stamps, for collecting onto a wall. */
export const browseStampsApi =
  endpoint<{
    query: z.infer<
      typeof browseStampsQuery
    >;
    res: {
      stamps: StampView[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/stamps',
    },
  );

/** Multipart: `image` (the artwork) and `name`. Answers 201 with the new stamp. */
export const createStampApi =
  endpoint<{
    body: FormData;
    res: {
      stamp: StampView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/stamps',
    },
  );

/** The stamps the caller has made. */
export const myStampsApi =
  endpoint<{
    res: {
      stamps: StampView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/stamps/mine',
    },
  );

/** The creator deletes their own stamp; it leaves every wall. */
export const deleteStampApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/stamps/$id',
    },
  );

/** Add a stamp to the caller's profile wall (cap 50). */
export const addStampToWallApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/stamps/$id/wall',
    },
  );

export const removeStampFromWallApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/stamps/$id/wall',
    },
  );
