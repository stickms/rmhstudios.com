/**
 * How often one person may be emailed. Pure, so the numbers are pinned by a
 * test (`email-campaigns.test.ts`) and the admin page can state them.
 *
 * Two rules, enforced through the per-user delivery log
 * (`lib/email/deliveries.server.ts`):
 *
 *  - Optional bulk mail (announcements, product news) is at most one email per
 *    person per {@link BULK_MIN_GAP_HOURS} hours. Someone who got one recently
 *    is left out of the next campaign rather than queued for later: a held-back
 *    announcement arriving days late is noise too.
 *  - Security email is capped at {@link SECURITY_MAX_PER_HOUR} per person per
 *    hour. Each alert is about a distinct event, but a burst (a script signing
 *    in from many browsers) should not become a burst of mail; the in-app
 *    notices still record every event.
 *
 * Required service notices are not capped: they are rare and each one matters.
 * Every kind is still deduplicated, so nobody gets the same message twice.
 */

export const BULK_MIN_GAP_HOURS = 48;
export const SECURITY_MAX_PER_HOUR = 5;

const HOUR_MS = 3_600_000;

/** The time before which an optional bulk email no longer blocks the next one. */
export function bulkGapStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - BULK_MIN_GAP_HOURS * HOUR_MS);
}

/** Whether a person with these recent security emails may get another one now. */
export function securityAllowed(recentSecurityEmails: readonly Date[], now: Date = new Date()): boolean {
  const since = now.getTime() - HOUR_MS;
  return recentSecurityEmails.filter((d) => d.getTime() > since).length < SECURITY_MAX_PER_HOUR;
}

/** ISO-8601 week key, e.g. `2026-W47`: one weekly digest per person per week. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
