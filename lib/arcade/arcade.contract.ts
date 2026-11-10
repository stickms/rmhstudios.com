/**
 * Contracts for /api/arcade/{backlog,rival,patch-notes,tips} (redesign audit
 * C1, batch 5). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { PlayStatus } from '@/lib/arcade/backlog';

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
