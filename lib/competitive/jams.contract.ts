/**
 * Contracts for /api/jams/** (redesign audit C1, batch 8): the game-jam list,
 * one jam, the admin create and the member entry / rating writes. Client-safe:
 * every type is `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { getJam, listJams } from '@/lib/competitive/jams.server';

export type JamSummaryView = Awaited<ReturnType<typeof listJams>>[number];
export type JamView = NonNullable<Awaited<ReturnType<typeof getJam>>>;

/** Recent jams; the theme is withheld until each starts. */
export const listJamsApi = endpoint<{
  res: {
    jams: JamSummaryView[];
  };
}>()({
  method: 'GET',
  path: '/api/jams',
});

/** Admin only. The dates are ISO strings on the wire (the route coerces them). */
export const createJamApi = endpoint<{
  body: {
    title: string;
    description: string;
    theme: string;
    startsAt: Date;
    submitEndsAt: Date;
    ratingEndsAt: Date;
    /** s07-07: opt-in theme vote (3 to 12 candidates; `theme` is then the first candidate until the start). */
    themeVoting?: boolean;
    themeCandidates?: string[];
    themeVoteOpensAt?: Date;
  };
  res: {
    slug: string;
  };
}>()({
  method: 'POST',
  path: '/api/jams',
});

/** One jam with entries (once started) and, when done, results. 404 when unknown. */
export const getJamApi = endpoint<{
  params: {
    slug: string;
  };
  res: {
    jam: JamView;
  };
}>()({
  method: 'GET',
  path: '/api/jams/$slug',
});

/** Enter (or swap) your own User Build during the window. */
export const enterJamApi = endpoint<{
  params: {
    slug: string;
  };
  body: {
    buildId: string;
  };
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/jams/$slug/entry',
});

/** 1-5 in four categories; one rating per member per entry, never your own. */
export const rateJamEntryApi = endpoint<{
  params: {
    slug: string;
  };
  body: {
    entryId: string;
    fun: number;
    creativity: number;
    theme: number;
    polish: number;
    /** s06-07: optional written feedback for the team (20 to 1 000 characters; empty withdraws it). */
    feedback?: string;
    /** s06-07: "Leave my name off". */
    anonymous?: boolean;
  };
  res: {
    ok: true;
    /** s06-07: what became of the feedback ('blocked' and 'banned' mean the scores saved but the words did not). */
    feedback?: 'unchanged' | 'created' | 'edited' | 'cleared' | 'blocked' | 'banned' | 'invalid';
  };
}>()({
  method: 'POST',
  path: '/api/jams/$slug/rate',
});

/**
 * Admin only: edit a jam within what its phase allows (before the start everything but the slug; after it, the
 * description and later deadlines). Every field is optional; the dates are ISO strings on the wire. The response
 * is the public jam view, so the secret theme is never echoed. Refusals carry `JAM_EDIT_LOCKED`,
 * `JAM_DATES_ORDER`, `JAM_DEADLINE_SHORTER` or `JAM_VOTE_OPENS_LATE`.
 */
export const updateJamApi = endpoint<{
  params: {
    slug: string;
  };
  body: {
    title?: string;
    description?: string;
    /** A non-voting jam before its start only; never returned. */
    theme?: string;
    startsAt?: Date;
    submitEndsAt?: Date;
    ratingEndsAt?: Date;
    /** A voting jam whose vote has not opened yet. */
    themeVoteOpensAt?: Date;
  };
  res: {
    jam: JamView;
  };
}>()({
  method: 'PATCH',
  path: '/api/jams/$slug',
});
