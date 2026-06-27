/**
 * Period-bucket keys for time-boxed leaderboards. Shared by the client (to
 * label boards) and the server (to bucket submissions). All in UTC so a board
 * rolls over at the same instant for everyone.
 */

/** YYYY-MM-DD in UTC. */
export function dateKeyUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** ISO week key YYYY-Www (e.g. 2026-W26) in UTC. */
export function weekKeyUTC(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // ISO: Thursday determines the year/week.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type LeaderboardPeriod = 'all' | 'daily' | 'weekly';
