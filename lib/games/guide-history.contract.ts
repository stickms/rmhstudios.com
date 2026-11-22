/**
 * Contracts for a game guide's revision history (s09-05). Client-safe: types only.
 *
 * A revision is the body BEFORE an edit, carrying the note of the edit that replaced it. Only the guide's author and
 * admins may read them; only the author may restore one.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface GuideRevisionRow {
  id: string;
  /** The note of the edit that replaced this version, or null when none was given. */
  note: string | null;
  /** When that edit happened (ISO). */
  createdAt: string;
  /** Characters in this (older) version. */
  length: number;
  /** Characters the edit added (positive) or removed (negative): the next version's length minus this one's. */
  delta: number;
}

/** The author's or an admin's list, newest edit first. No bodies. */
export const listGuideRevisionsApi = endpoint<{
  res: {
    revisions: GuideRevisionRow[];
    /** Characters in the current text. */
    currentLength: number;
    /** Whether the viewer may restore (the author, not an admin). */
    canRestore: boolean;
  };
}>()({
  method: 'GET',
  path: '/api/guides/$id/revisions',
});

/** One earlier version's text. */
export const getGuideRevisionApi = endpoint<{
  res: {
    id: string;
    note: string | null;
    createdAt: string;
    body: string;
  };
}>()({
  method: 'GET',
  path: '/api/guides/$id/revisions/$revisionId',
});

/** Author only: makes the version current through `updateGuide`, so the replaced text becomes a revision. */
export const restoreGuideRevisionApi = endpoint<{
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/guides/$id/revisions/$revisionId/restore',
});
