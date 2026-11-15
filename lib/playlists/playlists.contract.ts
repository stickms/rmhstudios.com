/**
 * Contracts for /api/playlists (redesign audit C1). Client-safe: request types
 * come from the zod schemas and response types from `playlists.server.ts`, both
 * by `import type`, so nothing server-side or zod ships to the browser.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  CollaboratorView,
  PlaylistDetail,
  PlaylistSummary,
} from '@/lib/playlists.server';
import type {
  addCollaboratorBody,
  addPlaylistItemBody,
  createPlaylistBody,
  renamePlaylistBody,
} from '@/lib/playlists/playlists-schema';

type Ok =
  {
    success: true;
  };

/** The caller's playlists (owned and shared). A `?kind=` param is ignored by the server. */
export const listPlaylistsApi =
  endpoint<{
    res: {
      playlists: PlaylistSummary[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/playlists',
    },
  );

/** 201 with the new playlist's id. */
export const createPlaylistApi =
  endpoint<{
    body: z.infer<
      typeof createPlaylistBody
    >;
    res: Ok & {
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/playlists',
    },
  );

export const getPlaylistApi =
  endpoint<{
    res: PlaylistDetail;
  }>()(
    {
      method:
        'GET',
      path: '/api/playlists/$id',
    },
  );

export const renamePlaylistApi =
  endpoint<{
    body: z.infer<
      typeof renamePlaylistBody
    >;
    res: Ok;
  }>()(
    {
      method:
        'PATCH',
      path: '/api/playlists/$id',
    },
  );

export const deletePlaylistApi =
  endpoint<{
    res: Ok;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/playlists/$id',
    },
  );

export const listPlaylistCollaboratorsApi =
  endpoint<{
    res: {
      collaborators: CollaboratorView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/playlists/$id/collaborators',
    },
  );

/** 201. */
export const addPlaylistCollaboratorApi =
  endpoint<{
    body: z.infer<
      typeof addCollaboratorBody
    >;
    res: Ok;
  }>()(
    {
      method:
        'POST',
      path: '/api/playlists/$id/collaborators',
    },
  );

export const removePlaylistCollaboratorApi =
  endpoint<{
    res: Ok;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/playlists/$id/collaborators/$userId',
    },
  );

export const addPlaylistItemApi =
  endpoint<{
    body: z.infer<
      typeof addPlaylistItemBody
    >;
    res: Ok & {
      duplicate: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/playlists/$id/items',
    },
  );

export const removePlaylistItemApi =
  endpoint<{
    res: Ok;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/playlists/$id/items/$itemId',
    },
  );
