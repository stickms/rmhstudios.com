/** How long after a trip ended it can still be reported. Client-safe: the button and the server read the same number. */
export const RIDE_REPORT_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/** Is a trip that ended at `endedAt` (or is still open, `null`) inside the report window at `now`? */
export function withinRideReportWindow(endedAt: Date | string | null, now: Date = new Date()): boolean {
  if (!endedAt) return true;
  const ended = typeof endedAt === 'string' ? new Date(endedAt) : endedAt;
  return now.getTime() - ended.getTime() <= RIDE_REPORT_WINDOW_DAYS * DAY_MS;
}

/**
 * s15-18 (S13-15): whether the trip panel offers "Report". A trip with a matched driver that was accepted can be
 * reported by either party until the window closes, counted from when it ended: completion, or cancellation for a trip
 * cancelled after a driver accepted it. Mirrors `reportAuthorOf` on the server, which refuses the same trips.
 */
export function rideReportable(
  ride: {
    hasDriver: boolean;
    acceptedAt: Date | string | null;
    completedAt: Date | string | null;
    cancelledAt: Date | string | null;
  },
  now: Date = new Date(),
): boolean {
  if (!ride.hasDriver || !ride.acceptedAt) return false;
  return withinRideReportWindow(ride.completedAt ?? ride.cancelledAt, now);
}
