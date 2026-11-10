/**
 * Cheap shape check for a 5-field cron (minute hour day month weekday, with lists, ranges, steps and
 * names). It exists so a typo in LADDER_CRON_SCHEDULE fails at boot with the variable's name; the
 * authority is pg-boss `schedule()`, which parses the expression with cron-parser and throws on
 * anything it cannot evaluate.
 */
function validateCron(expression: string): boolean {
  const fields = expression.split(/\s+/);
  return fields.length === 5 && fields.every((field) => /^[A-Za-z0-9*?,/-]+$/.test(field));
}

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
