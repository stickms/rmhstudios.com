/**
 * Baselines for a cycle: the 2024 vote (or the last general election the feed still carries) matched to each
 * current race. Server-only; the archive pages never change, so the result is memoised for a day.
 */

import { cycleForYear, type Cycle } from './calendar';
import { getElectionSnapshot } from './source.server';
import { buildBaseline, type Baseline } from './swing';

const TTL_MS = 24 * 60 * 60_000;
const memo = new Map<string, { at: number; value: Record<string, Baseline> }>();

export async function getBaseline(cycle: Cycle, now = Date.now()): Promise<Record<string, Baseline>> {
  if (cycle.kind === 'other') return {};
  const hit = memo.get(cycle.date);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const priorYear = cycle.kind === 'midterm' ? cycle.year - 2 : cycle.year - 4;
  let value: Record<string, Baseline> = {};
  try {
    const [cur, prior] = await Promise.all([
      getElectionSnapshot(cycle),
      getElectionSnapshot(cycleForYear(priorYear)),
    ]);
    value = buildBaseline(cur.races, prior.races, priorYear);
  } catch {
    value = {};
  }
  // An empty answer (the archive page is missing, or the source is down) is not worth keeping for a day.
  memo.set(cycle.date, { at: Object.keys(value).length ? now : now - TTL_MS + 5 * 60_000, value });
  return value;
}

/** Test seam. */
export function __resetBaseline() {
  memo.clear();
}
