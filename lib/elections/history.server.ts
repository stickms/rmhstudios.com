/** In-memory vote-share history per race, fed by every snapshot build. Server-only. */

import { appendPoint, type SeriesPoint } from './history';
import type { Race } from './types';

const byDate = new Map<string, Map<string, SeriesPoint[]>>();
/** A bound on memory: a general night has ~500 races; this leaves room for several days. */
const MAX_DATES = 6;

export function recordHistory(date: string, races: Race[], t: number = Date.now()): void {
  let m = byDate.get(date);
  if (!m) {
    m = new Map();
    byDate.set(date, m);
    if (byDate.size > MAX_DATES) byDate.delete(byDate.keys().next().value as string);
  }
  for (const r of races) {
    if (r.totalVotes <= 0) continue;
    const cur = m.get(r.id) ?? [];
    const next = appendPoint(cur, r, t);
    if (next !== cur) m.set(r.id, next);
  }
}

export function getHistory(date: string, raceId: string): SeriesPoint[] {
  return byDate.get(date)?.get(raceId) ?? [];
}

/** Test seam. */
export function __resetHistory() {
  byDate.clear();
}
