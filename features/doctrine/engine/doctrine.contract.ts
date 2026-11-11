/**
 * Contracts for the /api/doctrine/** reads (redesign audit C1, batches 6 and 10):
 * reputation, the Sahur window, incidents, the daily / replay puzzles and the Safehouse
 * feed and disclosures.
 * Client-safe: every type is `import type`. Response types are derived from the
 * server helpers and passed through {@link Json}, because dates cross the wire as
 * ISO strings. The query slots are strings because the routes read them with
 * `pageSize()` / `searchParams` themselves.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { getRecentIncidents } from '@features/doctrine/engine/incidents';
import type { getReputation, getReputationLeaderboard } from '@features/doctrine/engine/reputation';
import type { ReactionCount, SahurModeConfig, SahurStatus } from '@features/doctrine/engine/types';

/** What a value looks like after `JSON.stringify` → `JSON.parse`. */
export type Json<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

export type DoctrineReputation = Json<Awaited<ReturnType<typeof getReputation>>>;
export type DoctrineReputationLeaderboard = Json<
  Awaited<ReturnType<typeof getReputationLeaderboard>>
>;
export type DoctrineIncidents = Json<Awaited<ReturnType<typeof getRecentIncidents>>>;

/** A puzzle with its solution stripped. */
export interface DoctrinePuzzleView {
  id: string;
  mode: string;
  difficulty: number;
  resetsAt: string;
  data: unknown;
}

export interface DoctrineDailyPuzzle extends DoctrinePuzzleView {
  date: string;
  isSahur: boolean;
}

export interface DoctrineLeaderboardRow {
  rank: number;
  userId: string;
  user: { id: string; name: string | null; handle: string | null; image: string | null };
  score: number;
  timeMs: number;
  attempts: number;
}

/** The signed-in caller's standing. 401 when signed out. */
export const getDoctrineReputationApi = endpoint<{ res: DoctrineReputation }>()({
  method: 'GET',
  path: '/api/doctrine/reputation',
});

export const getDoctrineReputationLeaderboardApi = endpoint<{
  query: { limit?: string | undefined };
  res: DoctrineReputationLeaderboard;
}>()({ method: 'GET', path: '/api/doctrine/reputation/leaderboard' });

export const getDoctrineSahurStatusApi = endpoint<{
  query: { timezone?: string | undefined };
  res: { status: SahurStatus; config: SahurModeConfig | null };
}>()({ method: 'GET', path: '/api/doctrine/sahur/status' });

export const listDoctrineIncidentsApi = endpoint<{
  query: { limit?: string | undefined };
  res: DoctrineIncidents;
}>()({ method: 'GET', path: '/api/doctrine/incidents' });

/** Today's five puzzles. */
export const getDoctrineTodayPuzzlesApi = endpoint<{ res: DoctrineDailyPuzzle[] }>()({
  method: 'GET',
  path: '/api/doctrine/puzzles/today',
});

export const getDoctrinePuzzleLeaderboardApi = endpoint<{
  query: { mode?: string | undefined; date?: string | undefined; limit?: string | undefined };
  res: DoctrineLeaderboardRow[];
}>()({ method: 'GET', path: '/api/doctrine/puzzles/leaderboard' });

/** A fresh random puzzle for a mode. 401 signed out, 400 for an unknown mode. */
export const getDoctrineReplayPuzzleApi = endpoint<{
  query: { mode?: string | undefined };
  res: DoctrinePuzzleView;
}>()({ method: 'GET', path: '/api/doctrine/puzzles/replay' });

/** React to a safehouse, disclosure or incident (exactly one target id). */
export const doctrineReactApi = endpoint<{
  body: {
    reaction: string;
    safehouseId?: string | undefined;
    disclosureId?: string | undefined;
    incidentId?: string | undefined;
  };
  res: { success: true };
}>()({ method: 'POST', path: '/api/doctrine/reactions' });

/** Mint a recruitment code (403 when the caller may not recruit). */
export const createRecruitmentApi = endpoint<{
  body: { personalMessage: string; targetSkills: string[]; maxUses: number };
  res: { success: true; code: string; expiresAt: string; maxUses: number };
}>()({ method: 'POST', path: '/api/doctrine/recruitment/create' });

export interface SafehouseItem {
  id: string;
  type: string;
  title: string;
  body: string;
  minTier: string;
  mediaUrls: string[];
  publishedAt: string | null;
  reactions: ReactionCount;
  divisiveness: number;
}

/** The Safehouse feed at the caller's clearance (`cursor` / `limit` page it). */
export const getSafehouseContentApi = endpoint<{
  query: { cursor?: string | undefined; limit?: number | undefined };
  res: { items: SafehouseItem[]; nextCursor: string | null | undefined };
}>()({ method: 'GET', path: '/api/doctrine/safehouse/content' });

export interface SafehouseDisclosure {
  id: string;
  codename: string;
  publicTitle: string;
  content: string | null;
  narrative: string | null;
  status: string;
  teasedAt: string | null;
  disclosedAt: string | null;
  mediaUrls: string[];
  reactions: ReactionCount;
  divisiveness: number;
}

/** Controlled disclosures at the caller's clearance: classified ones come back redacted. */
export const getSafehouseDisclosuresApi = endpoint<{ res: SafehouseDisclosure[] }>()({
  method: 'GET',
  path: '/api/doctrine/safehouse/disclosures',
});
