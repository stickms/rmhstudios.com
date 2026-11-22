/**
 * Contract for GET /api/study/stats. Client-safe: the query type comes from the zod schema by
 * `import type`; the response is plain data.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { statsQuery } from '@/lib/study/stats-schema';

export interface DeckStatsRow {
  id: string;
  title: string;
  cards: number;
  newCards: number;
  learning: number;
  young: number;
  mature: number;
  dueToday: number;
  /** ISO time of the last review in this deck, or null if never studied since history began. */
  lastStudied: string | null;
}

export interface RetentionStat {
  /** 0 to 1, or null when there are fewer than 20 reviews. */
  rate: number | null;
  samples: number;
}

export interface StudyStats {
  /** Today in the viewer's time zone, `YYYY-MM-DD`. */
  today: string;
  /** The day of the first logged review, or null when nothing is logged yet. */
  since: string | null;
  /** Days with at least one review in the last 365 days (the page fills the gaps). */
  days: { date: string; count: number }[];
  streak: { current: number; longest: number };
  /** Cards due on each of the next 30 days; overdue cards count on today. */
  forecast: { date: string; count: number }[];
  retention: { young: RetentionStat; mature: RetentionStat };
  decks: DeckStatsRow[];
}

export const getStudyStatsApi = endpoint<{
  query: z.infer<typeof statsQuery>;
  res: StudyStats;
}>()({ method: 'GET', path: '/api/study/stats' });
