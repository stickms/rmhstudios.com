/** Contracts for theme voting (s07-07). Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';
import type { ThemeVotingPhase } from '@/lib/competitive/jam-themes';

export interface JamThemeCandidateView {
  id: string;
  text: string;
  position: number;
  /** null until the jam starts; never sent before. */
  votes:
    | number
    | null;
}

export interface JamThemeVoteView {
  enabled: boolean;
  phase: ThemeVotingPhase;
  opensAt:
    | string
    | null;
  closesAt: string;
  candidates: JamThemeCandidateView[];
  /** The viewer's own marks (candidate ids); empty when signed out. */
  mine: string[];
  /** null until the jam starts; never sent before. */
  winnerId:
    | string
    | null;
  /** True once the jam has started and a mark exists; never reported before the start (it would hint at votes). */
  locked: boolean;
}

/** The shortlist, the viewer's marks and, only after the start, counts and the winner. */
export const getJamThemeVoteApi =
  endpoint<{
    params: {
      slug: string;
    };
    res: {
      view: JamThemeVoteView;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/jams/$slug/theme-vote',
    },
  );

/** Set the viewer's marks (up to three; an empty list clears them). Only while voting is open. */
export const castJamThemeVotesApi =
  endpoint<{
    params: {
      slug: string;
    };
    body: {
      candidateIds: string[];
    };
    res: {
      ok: true;
      mine: string[];
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/jams/$slug/theme-vote',
    },
  );

/** Admin: replace the shortlist (3 to 12 themes) before the first mark exists. */
export const setJamThemeCandidatesApi =
  endpoint<{
    params: {
      slug: string;
    };
    body: {
      candidates: string[];
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/jams/$slug/theme-candidates',
    },
  );
