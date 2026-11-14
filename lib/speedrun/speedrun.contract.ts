/**
 * Contracts for the player-facing /api/speedrun/** endpoints (redesign audit C1,
 * batch 8): the boards, one category's leaderboard, the runner's submittable
 * replays and run submission. The admin review queue (`verify`) has no client
 * call site and stays unbound. Client-safe: every type is `import type`.
 *
 * The query slots carry the schema's OUTPUT types (`implement()` checks them for
 * equality), so a caller states the defaulted `version` / `limit` itself.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  BoardResult,
  SubmittableReplay,
} from '@/lib/speedrun/speedrun.server';
import type {
  SpeedrunCategoryView,
  SpeedrunEntryView,
  SpeedrunMetric,
  SpeedrunRejection,
  SpeedrunStatus,
  VerificationTier,
} from '@/lib/speedrun/types';

/** The boards that exist, plus the games that can have one. Public. */
export const listSpeedrunCategoriesApi =
  endpoint<{
    query: {
      game?:
        | string
        | undefined;
      includeInactive?:
        | '0'
        | '1'
        | undefined;
    };
    res: {
      categories: SpeedrunCategoryView[];
      games: string[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/speedrun/categories',
    },
  );

/** Admin: open one board, or `{ seed: true }` to open every starter board. */
export const upsertSpeedrunCategoryApi =
  endpoint<{
    body:
      | {
          game: string;
          slug: string;
          version: string;
          name: string;
          rules: string;
          metric: SpeedrunMetric;
          active?:
            | boolean
            | undefined;
        }
      | {
          seed: true;
        };
    res:
      | {
          categories: SpeedrunCategoryView[];
        }
      | {
          category: SpeedrunCategoryView;
        };
  }>()(
    {
      method:
        'POST',
      path: '/api/speedrun/categories',
    },
  );

/** One category's runs; `version: 'all'` returns every version, each labelled. 404 for an unknown category. */
export const getSpeedrunLeaderboardApi =
  endpoint<{
    query: {
      game: string;
      slug: string;
      version: string;
      limit: number;
    };
    res: BoardResult;
  }>()(
    {
      method:
        'GET',
      path: '/api/speedrun/leaderboard',
    },
  );

/** The caller's own replays for a game that are not on a board yet. */
export const listSubmittableReplaysApi =
  endpoint<{
    query: {
      game: string;
      limit: number;
    };
    res: {
      replays: SubmittableReplay[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/speedrun/replays',
    },
  );

export interface SubmitSpeedrunRunResult {
  entry: SpeedrunEntryView;
  verdict: {
    status: SpeedrunStatus;
    tier: VerificationTier;
    reason: SpeedrunRejection | null;
    message:
      | string
      | null;
  };
}

/** Submit a run: the body names a replay and a category, never a time or score. */
export const submitSpeedrunRunApi =
  endpoint<{
    body: {
      game: string;
      slug: string;
      replayId: string;
    };
    res: SubmitSpeedrunRunResult;
  }>()(
    {
      method:
        'POST',
      path: '/api/speedrun/runs',
    },
  );
