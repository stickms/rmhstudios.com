/**
 * Contracts for /api/series (redesign audit C1, batch 4). Client-safe: request
 * types come from the zod schemas by `import type`. Failures carry the server's
 * `{ error }` text as the `HttpError` message.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { SeriesNav } from '@/lib/posts-plus/constants';
import type {
  seriesAddPostSchema,
  seriesCreateSchema,
  seriesReorderBody,
  seriesUpdateSchema,
} from '@/lib/posts-plus/schema';
import type {
  SeriesSummary,
  SeriesView,
} from '@/lib/posts-plus/series.server';
import type { ResolvedUser } from '@/lib/user-display';

export type {
  SeriesSummary,
  SeriesView,
};

/** The series you have written, and the ones you follow (with their author). */
export const listSeriesApi =
  endpoint<{
    res: {
      mine: SeriesSummary[];
      following: (SeriesSummary & {
        author: ResolvedUser;
      })[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/series',
    },
  );

/** 201. */
export const createSeriesApi =
  endpoint<{
    body: z.infer<
      typeof seriesCreateSchema
    >;
    res: {
      id: string;
      title: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/series',
    },
  );

/** The series page payload: header + its live parts, in order. 404 when it does not exist. */
export const getSeriesApi =
  endpoint<{
    res: SeriesView;
  }>()(
    {
      method:
        'GET',
      path: '/api/series/$id',
    },
  );

/** Owner only. */
export const updateSeriesApi =
  endpoint<{
    body: z.infer<
      typeof seriesUpdateSchema
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/series/$id',
    },
  );

/** Owner only; the posts stay, only the grouping goes. */
export const deleteSeriesApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/series/$id',
    },
  );

export const followSeriesApi =
  endpoint<{
    res: {
      following: true;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/series/$id/follow',
    },
  );

export const unfollowSeriesApi =
  endpoint<{
    res: {
      following: false;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/series/$id/follow',
    },
  );

/** 201. Appends one of your own public posts as the next part. */
export const addSeriesPostApi =
  endpoint<{
    body: z.infer<
      typeof seriesAddPostSchema
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/series/$id/posts',
    },
  );

export const moveSeriesPostApi =
  endpoint<{
    body: z.infer<
      typeof seriesReorderBody
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/series/$id/posts/$postId',
    },
  );

/** Takes a post out of the series (the post stays). */
export const removeSeriesPostApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/series/$id/posts/$postId',
    },
  );

/** "Part k of N" for one post. 404 when the post is not in a live series. */
export const seriesNavForPostApi =
  endpoint<{
    res: SeriesNav;
  }>()(
    {
      method:
        'GET',
      path: '/api/series/post/$postId',
    },
  );
