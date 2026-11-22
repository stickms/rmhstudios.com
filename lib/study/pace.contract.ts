/** Contracts for a deck's study pace. Client-safe: request types by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { TestDateState } from '@/lib/study/pace';
import type { paceBody, paceQuery } from '@/lib/study/pace-schema';

export interface DeckPaceView {
  /** New cards a day; null is "No daily limit". */
  newPerDay: number | null;
  /** The local `YYYY-MM-DD` test date, or null. */
  testDate: string | null;
  /** Today in the member's zone. */
  today: string;
  /** Cards in this deck the member has never reviewed. */
  newRemaining: number;
  /** New cards first graded today, counted from the review log (a paced deck only). */
  introducedToday: number;
  /** What "Learn more" has added for today. */
  extraToday: number;
  /** What the test date says; null without a date. */
  testState: TestDateState | null;
  /** The next seven days, from today: scheduled cards due plus the new cards the pace will add. */
  forecast: { date: string; scheduled: number; fresh: number }[];
}

/** Owner only (404 otherwise). */
export const getDeckPaceApi = endpoint<{
  query: z.infer<typeof paceQuery>;
  res: DeckPaceView;
}>()({ method: 'GET', path: '/api/study/decks/$id/pace' });

/** 404 for a deck that is not yours. 400 for a date in the past or one that is not a calendar day. */
export const setDeckPaceApi = endpoint<{
  body: z.infer<typeof paceBody>;
  res: { success: true; newPerDay: number | null; testDate: string | null; extraToday: number };
}>()({ method: 'PATCH', path: '/api/study/decks/$id/pace' });
