/**
 * Contracts for /api/arcade/{backlog,rival,patch-notes,tips} (redesign audit
 * C1, batch 5). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { PlayStatus } from '@/lib/arcade/backlog';
import type { DailyMutator } from '@/lib/arcade/seeded';
import type { ArcadeState } from '@/lib/quests/arcade';

export interface BacklogView {
  stats: { medianMinutes: number | null; count: number };
  mine: { status: PlayStatus; finishMinutes: number | null } | null;
}

export interface RivalView {
  ranked: boolean;
  myScore?: number;
  rival?: { name: string; score: number; rank: number } | null;
  state?: 'ahead' | 'behind';
}

export interface PatchNoteView {
  version: string;
  title: string;
  body: string;
}

export interface AchievementTipView {
  id: string;
  body: string;
  votes: number;
  author: { name?: string | null; handle?: string | null };
  isMine: boolean;
  voted: boolean;
}

/** The caller's status for a game plus the community median. 404 for an unknown game. */
export const getBacklogApi = endpoint<{
  query: { gameId: string };
  res: BacklogView;
}>()({ method: 'GET', path: '/api/arcade/backlog' });

export const setBacklogApi = endpoint<{
  body: {
    gameId: string;
    status: PlayStatus;
    finishMinutes?: number | null | undefined;
  };
  res: { ok: true };
}>()({ method: 'PUT', path: '/api/arcade/backlog' });

export const clearBacklogApi = endpoint<{
  query: { gameId: string };
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/arcade/backlog' });

/** The player just above you on that game's board. 404 when the game has no board. */
export const getRivalApi = endpoint<{
  query: { gameId: string };
  res: RivalView;
}>()({ method: 'GET', path: '/api/arcade/rival' });

/** Latest patch note for the game at a path. */
export const getPatchNoteApi = endpoint<{
  query: { path: string };
  res: { gameId: string | null; note: PatchNoteView | null };
}>()({ method: 'GET', path: '/api/arcade/patch-notes' });

export const listAchievementTipsApi = endpoint<{
  query: { achievementId: string };
  res: { tips: AchievementTipView[] };
}>()({ method: 'GET', path: '/api/arcade/tips' });

/** Max 3 tips per player per achievement (409 past that). */
export const postAchievementTipApi = endpoint<{
  body: { achievementId: string; body: string };
  res: { id: string };
}>()({ method: 'POST', path: '/api/arcade/tips' });

/** Toggle the caller's upvote; 409 on your own tip. */
export const voteAchievementTipApi = endpoint<{
  body: { tipId: string };
  res: { voted: boolean };
}>()({ method: 'PUT', path: '/api/arcade/tips' });

/** Admin: publish a note; its version is what clients compare. */
export const publishPatchNoteApi = endpoint<{
  body: { gameId: string; version: string; title: string; body: string };
  res: { ok: true };
}>()({ method: 'POST', path: '/api/arcade/patch-notes' });

export interface BoardRow {
  rank: number;
  score: number;
  isMe: boolean;
  user: { name?: string | null; handle?: string | null };
}

type RunOptions = Record<string, string | number>;

/** Today's arcade challenges and streak for the viewer. */
export const getArcadeStateApi = endpoint<{ res: ArcadeState }>()({
  method: 'GET',
  path: '/api/arcade/',
});

/** Claim a completed challenge. 400 `{ error }` when it is not claimable. */
export const claimArcadeChallengeApi = endpoint<{
  body: { challengeId: string };
  res: { success: true; xp?: number; coins?: number };
}>()({ method: 'POST', path: '/api/arcade/claim' });

/** Today's Laundry Sort basket, its board and the caller's attempt (public). */
export const getBasketApi = endpoint<{
  res: {
    basket: { day: string; seed: number; options: RunOptions };
    board: BoardRow[];
    mine: { finishedAt: string | null } | null;
  };
}>()({ method: 'GET', path: '/api/arcade/basket' });

/** Claim today's one counted basket attempt. */
export const startBasketApi = endpoint<{
  res: { counted: boolean; basket: { day: string; seed: number; options: RunOptions } };
}>()({ method: 'POST', path: '/api/arcade/basket/start' });

/** File the counted basket attempt's score. */
export const finishBasketApi = endpoint<{
  body: {
    score: number;
    detail: { sorted: number; wrong: number; missed: number; bestCombo: number };
  };
  res: { counted: boolean };
}>()({ method: 'POST', path: '/api/arcade/basket/finish' });

/** Today's daily mutator, its board, and the caller's own attempt (null when signed out). */
export interface DailyData {
  mutator: DailyMutator;
  board: {
    rank: number;
    score: number;
    isMe: boolean;
    user: { name?: string | null; handle?: string | null };
  }[];
  mine: { score: number | null; finishedAt: string | null } | null;
}

export const getDailyMutatorApi = endpoint<{ res: DailyData }>()({
  method: 'GET',
  path: '/api/arcade/daily',
});

/** Claim today's one counted daily-mutator attempt. */
export const startDailyRunApi = endpoint<{
  res: {
    counted: boolean;
    mutator: { gameId: string; seed: number; modifier: { id: string; options: RunOptions } };
  };
}>()({ method: 'POST', path: '/api/arcade/daily/start' });

/** Finish a daily attempt or record a run on a shared seed. */
export const submitArcadeRunApi = endpoint<{
  body: {
    kind: 'daily' | 'seed';
    gameId: string;
    seedKey: string;
    score: number;
    detail?: Record<string, number> | undefined;
  };
  res: { counted: boolean; best: number | null };
}>()({ method: 'POST', path: '/api/arcade/runs' });

/** The mini leaderboard for one shared seed. */
export const getSeedBoardApi = endpoint<{
  query: { gameId: string; seedKey: string };
  res: { board: BoardRow[] };
}>()({ method: 'GET', path: '/api/arcade/runs' });
