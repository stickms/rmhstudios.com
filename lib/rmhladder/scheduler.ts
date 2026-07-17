import { validate as validateCron } from 'node-cron';

export const DEFAULT_LADDER_CRON = '0 */12 * * *';
export const DEFAULT_STALE_AFTER_MS = 12 * 60 * 60 * 1_000;

export function resolveLadderCron(value: string | undefined): string {
  const schedule = value?.trim() || DEFAULT_LADDER_CRON;
  if (!validateCron(schedule)) {
    throw new Error(`Invalid LADDER_CRON_SCHEDULE: ${JSON.stringify(schedule)}`);
  }
  return schedule;
}

export function isScrapeStale(
  lastFinishedAt: Date | null | undefined,
  now = new Date(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
): boolean {
  if (!lastFinishedAt) return true;
  return now.getTime() - lastFinishedAt.getTime() >= staleAfterMs;
}
