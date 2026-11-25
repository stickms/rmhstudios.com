/**
 * RMHHomes scraper — what started a run (pure, relative imports only: the homes worker bundles it).
 *
 * The `homes.scrape` queue carries `{}` for a cron fire and `{ trigger: 'MANUAL', by: <admin id> }` for a run an
 * admin queued from /admin/homes. The worker passes the result to `runHomesScrape`, which stores it on the run.
 */

/** The pg-boss queue the worker consumes and /admin/homes sends to. */
export const HOMES_SCRAPE_QUEUE = 'homes.scrape';

export type ScrapeTrigger = 'CRON' | 'MANUAL';

/** `'MANUAL'` only for exactly that value; anything else, including a missing payload, is a cron run. */
export function scrapeTriggerOf(data: unknown): ScrapeTrigger {
  if (data && typeof data === 'object' && (data as { trigger?: unknown }).trigger === 'MANUAL') return 'MANUAL';
  return 'CRON';
}
