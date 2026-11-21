/**
 * Contracts for a game's updates page, following a game and editing a patch note. Client-safe: types come from the
 * zod schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { PatchNoteItem } from '@/lib/arcade/updates';
import type {
  patchNoteEditBody,
  updatesQuery,
} from '@/lib/arcade/updates-schema';

export interface FollowState {
  following: boolean;
  followers: number;
}

/** Every patch note of a game, newest first, one page at a time. 404 for an unknown game and for an off-site title. */
export const getGameUpdatesApi =
  endpoint<{
    query: z.infer<
      typeof updatesQuery
    >;
    res: {
      notes: PatchNoteItem[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/games/$gameId/updates',
    },
  );

/** The follower count and whether the caller follows (always false signed out). */
export const getGameFollowApi =
  endpoint<{
    res: FollowState;
  }>()(
    {
      method:
        'GET',
      path: '/api/games/$gameId/follow',
    },
  );

export const followGameApi =
  endpoint<{
    res: FollowState;
  }>()(
    {
      method:
        'PUT',
      path: '/api/games/$gameId/follow',
    },
  );

export const unfollowGameApi =
  endpoint<{
    res: FollowState;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/games/$gameId/follow',
    },
  );

/** Edit a note's title and body (admin). The version never changes. */
export const editPatchNoteApi =
  endpoint<{
    body: z.infer<
      typeof patchNoteEditBody
    >;
    res: {
      note: PatchNoteItem;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/arcade/patch-notes/$id',
    },
  );

export const deletePatchNoteApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/arcade/patch-notes/$id',
    },
  );

/** Every patch note of any catalogue game, for the admin list: unlike the public list it never 404s a title played elsewhere. */
export const adminListPatchNotesApi =
  endpoint<{
    query: z.infer<
      typeof updatesQuery
    >;
    res: {
      notes: PatchNoteItem[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/arcade/patch-notes/admin/$gameId',
    },
  );
