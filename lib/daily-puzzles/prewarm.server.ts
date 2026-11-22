/**
 * Generate the coming day's AI daily puzzles in DeepSeek's off-peak hours.
 *
 * The request path (`getOrCreateDailyPuzzle`) generates a mode's puzzle for the
 * first visitor of the America/New_York day, who waits on the model call. This
 * cron writes the row first, at 04:45 UTC: off-peak in both the EST (day starts
 * 05:00 UTC) and EDT (04:00 UTC) halves of the year (lib/ai/deepseek-peak.ts).
 * The request path stays the fallback, and an existing row is never touched.
 */

import type { PgBoss } from 'pg-boss';
import { AI_PUZZLE_MODES } from './generate-core';
import { getOrCreateDailyPuzzle } from './generate.server';
import { formatDateKey } from './seed';

export const DAILY_PUZZLE_PREWARM_QUEUE = 'daily-puzzles.prewarm';
export const DAILY_PUZZLE_PREWARM_CRON = '45 4 * * *';

/** Ahead of the run, so the key is the New York day that starts within the hour. */
const LOOKAHEAD_MS = 60 * 60 * 1000;

/** The America/New_York calendar day of `at + 1h`, as the request path keys it. */
export function prewarmDateKey(at: number): string {
  const ny = new Date(at + LOOKAHEAD_MS).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });
  const [y, m, d] = ny.split('-').map(Number);
  return formatDateKey(new Date(y!, m! - 1, d!));
}

export async function prewarmDailyPuzzles(at: number = Date.now()): Promise<void> {
  const dateKey = prewarmDateKey(at);
  for (const mode of AI_PUZZLE_MODES) {
    // Never throws (falls back to a deterministic puzzle on a model failure).
    await getOrCreateDailyPuzzle(mode, dateKey);
  }
}

export async function registerDailyPuzzlePrewarmCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(DAILY_PUZZLE_PREWARM_QUEUE);
  await boss.schedule(
    DAILY_PUZZLE_PREWARM_QUEUE,
    DAILY_PUZZLE_PREWARM_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(DAILY_PUZZLE_PREWARM_QUEUE, async () => {
    await prewarmDailyPuzzles();
  });
}
