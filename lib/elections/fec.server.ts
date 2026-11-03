/**
 * FEC election dates (a government API). Server-only.
 *
 * `api.open.fec.gov` is keyless in the sense that `DEMO_KEY` works, but DEMO_KEY is
 * a SHARED pool of 40 calls/hour for everyone on the internet and is routinely
 * exhausted — so production should set a free personal key (`FEC_API_KEY`, 1,000
 * calls/hour, instant at api.data.gov/signup). Everything here degrades to "no FEC
 * days" rather than failing: the primary calendar still comes from the results
 * feed (calendar-days.ts), the FEC only adds runoffs and specials.
 *
 * The response shape is parsed defensively against the documented fields
 * (`election_date`, `election_state`, `election_type_id`); see `parseFecDates`.
 */

import { parseFecDates, type ElectionDayEntry } from './calendar-days';

const TTL_MS = 12 * 60 * 60_000;
/** After a 429 don't hammer a rate-limited pool: wait this long before asking again. */
const BACKOFF_MS = 15 * 60_000;
const MAX_PAGES = 4;

export type FecStatus = 'ok' | 'rate-limited' | 'unavailable';

const memo = new Map<number, { at: number; days: ElectionDayEntry[]; status: FecStatus }>();
let backoffUntil = 0;

export function fecKeyConfigured(): boolean {
  return Boolean(process.env.FEC_API_KEY);
}

export async function getFecDays(
  year: number,
  now: number = Date.now(),
): Promise<{ days: ElectionDayEntry[]; status: FecStatus }> {
  const hit = memo.get(year);
  if (hit && now - hit.at < TTL_MS) return { days: hit.days, status: hit.status };
  if (now < backoffUntil) return { days: hit?.days ?? [], status: 'rate-limited' };

  const key = process.env.FEC_API_KEY || 'DEMO_KEY';
  const all: ElectionDayEntry[][] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `https://api.open.fec.gov/v1/election-dates/?election_year=${year}&per_page=100&page=${page}&sort=election_date&api_key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { accept: 'application/json', 'user-agent': 'rmhstudios-elections/1.0' },
      });
      if (res.status === 429) {
        backoffUntil = now + BACKOFF_MS;
        return { days: hit?.days ?? [], status: 'rate-limited' };
      }
      if (!res.ok) throw new Error(`FEC HTTP ${res.status}`);
      const json = (await res.json()) as { pagination?: { pages?: number } };
      all.push(parseFecDates(json, year));
      if (page >= (json.pagination?.pages ?? 1)) break;
    }
    const days = all.flat();
    memo.set(year, { at: now, days, status: 'ok' });
    return { days, status: 'ok' };
  } catch (err) {
    console.warn('[elections] FEC unavailable:', String(err));
    return { days: hit?.days ?? [], status: 'unavailable' };
  }
}
