/** How long after a trip ended it can still be reported. Client-safe: the button and the server read the same number. */
export const RIDE_REPORT_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/** Is a trip that ended at `endedAt` (or is still open, `null`) inside the report window at `now`? */
export function withinRideReportWindow(endedAt: Date | string | null, now: Date = new Date()): boolean {
  if (!endedAt) return true;
  const ended = typeof endedAt === 'string' ? new Date(endedAt) : endedAt;
  return now.getTime() - ended.getTime() <= RIDE_REPORT_WINDOW_DAYS * DAY_MS;
}
