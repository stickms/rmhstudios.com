/**
 * Contracts for the RMHType per-key analytics reads and the practice test
 * (redesign audit C1, batch 8). The aggregate `POST /api/rmhtype/keystats` is
 * written by the test runner and stays unbound. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { GeneratedTest } from '@/lib/rmhtype/custom-test';
import type { TypingLayout } from '@/lib/rmhtype/keystats';
import type { getKeyStats } from '@/lib/rmhtype/keystats.server';

export type RmhTypeKeyStats =
  Awaited<
    ReturnType<
      typeof getKeyStats
    >
  >;

/** The caller's per-key stats for a layout (the default layout when omitted). */
export const getRmhTypeKeyStatsApi =
  endpoint<{
    query: {
      layout?:
        | TypingLayout
        | undefined;
    };
    res: {
      stats: RmhTypeKeyStats;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhtype/keystats',
    },
  );

/** Erase the caller's stats for a layout. */
export const clearRmhTypeKeyStatsApi =
  endpoint<{
    query: {
      layout?:
        | TypingLayout
        | undefined;
    };
    res: {
      deleted: number;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/rmhtype/keystats',
    },
  );

/** A test weighted toward the caller's worst keys. Never leaderboard-eligible. */
export const buildRmhTypePracticeTestApi =
  endpoint<{
    body: {
      layout?:
        | TypingLayout
        | undefined;
      length?:
        | number
        | undefined;
      punctuation?:
        | boolean
        | undefined;
      numbers?:
        | boolean
        | undefined;
      language?:
        | string
        | undefined;
      seed?:
        | number
        | undefined;
    };
    res: {
      test: GeneratedTest;
      layout: TypingLayout;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhtype/practice-test',
    },
  );
