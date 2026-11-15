/**
 * Contracts for the Slice It admin tools (redesign audit C1, batch 8): the
 * content and storage dashboard, and the ranked-pool queue. Client-safe: types
 * only.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface ContentDashboard {
  storage: {
    usedBytes: number;
    limitBytes: number;
    headroom: number;
    unmeasured: number;
  };
  topUploaders: {
    uploaderId: string;
    songs: number;
    bytes: number;
  }[];
  staleCharts: number;
  uploadRate: {
    day: string;
    count: number;
  }[];
  totals: {
    songs: number;
    charts: number;
    runs: number;
  };
}

export interface BrokenChart {
  chartId: string;
  songId: string;
  title: string;
  reasons: string[];
  dip: number;
  clearRate: number;
  sampleSize: number;
  spikes: number;
}

export const getContentDashboardApi =
  endpoint<{
    query: {
      view: 'dashboard';
    };
    res: ContentDashboard;
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/admin/content',
    },
  );

export const getBrokenChartsApi =
  endpoint<{
    query: {
      view: 'broken';
    };
    res: {
      charts: BrokenChart[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/admin/content',
    },
  );

/** Storage objects nothing points at. */
export const getOrphanKeysApi =
  endpoint<{
    query: {
      view: 'orphans';
    };
    res: {
      keys: string[];
      count: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/admin/content',
    },
  );

/** Mirrors `QualificationReport` in `ranking.server.ts`. */
export interface RankingEvidence {
  chartId: string;
  eligible: boolean;
  blockers: string[];
  players: number;
  plays: number;
  clearRate:
    | number
    | null;
  lintErrors: number;
  status: string;
}

/** What the admin table renders, beside the qualification evidence. */
export interface RankingRow {
  id: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  name: string;
  difficulty: string;
  authorName:
    | string
    | null;
  authorHandle:
    | string
    | null;
  rating:
    | number
    | null;
  ratingVersion:
    | number
    | null;
  status: string;
  rankStatus: string;
  rankStatusAt:
    | string
    | null;
  updatedAt: string;
  evidence: RankingEvidence;
}

export type RankStatus =
  | 'unranked'
  | 'qualified'
  | 'ranked';

export const listRankingApi =
  endpoint<{
    query: {
      status: RankStatus;
      limit: number;
    };
    res: {
      charts: RankingRow[];
      counts: Record<
        string,
        number
      >;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/charts/ranking',
    },
  );

/** 409 when the chart is not in a state the transition applies to (the list is stale). */
export const rankChartActionApi =
  endpoint<{
    body: {
      chartId: string;
      action:
        | 'promote'
        | 'demote';
    };
    res: {
      ok: true;
      chartId: string;
      rankStatus: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/slice-it/charts/ranking',
    },
  );
