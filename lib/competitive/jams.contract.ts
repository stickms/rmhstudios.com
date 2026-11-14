/**
 * Contracts for /api/jams/** (redesign audit C1, batch 8): the game-jam list,
 * one jam, the admin create and the member entry / rating writes. Client-safe:
 * every type is `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  getJam,
  listJams,
} from '@/lib/competitive/jams.server';

export type JamSummaryView =
  Awaited<
    ReturnType<
      typeof listJams
    >
  >[number];
export type JamView =
  NonNullable<
    Awaited<
      ReturnType<
        typeof getJam
      >
    >
  >;

/** Recent jams; the theme is withheld until each starts. */
export const listJamsApi =
  endpoint<{
    res: {
      jams: JamSummaryView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/jams',
    },
  );

/** Admin only. The dates are ISO strings on the wire (the route coerces them). */
export const createJamApi =
  endpoint<{
    body: {
      title: string;
      description: string;
      theme: string;
      startsAt: Date;
      submitEndsAt: Date;
      ratingEndsAt: Date;
    };
    res: {
      slug: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/jams',
    },
  );

/** One jam with entries (once started) and, when done, results. 404 when unknown. */
export const getJamApi =
  endpoint<{
    params: {
      slug: string;
    };
    res: {
      jam: JamView;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/jams/$slug',
    },
  );

/** Enter (or swap) your own User Build during the window. */
export const enterJamApi =
  endpoint<{
    params: {
      slug: string;
    };
    body: {
      buildId: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/jams/$slug/entry',
    },
  );

/** 1-5 in four categories; one rating per member per entry, never your own. */
export const rateJamEntryApi =
  endpoint<{
    params: {
      slug: string;
    };
    body: {
      entryId: string;
      fun: number;
      creativity: number;
      theme: number;
      polish: number;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/jams/$slug/rate',
    },
  );
