/** Fetch + unzip + parse the NC State Board of Elections file for a date, cached. Server-only. */

import JSZip from 'jszip';
import { etDayStart, phaseOf } from '../calendar';
import type { PollClosing, Race } from '../types';
import { finalizeRaces, ncPollClosing, ncsbeUrl, parseNcsbeResults } from './ncsbe';

const TIMEOUT_MS = 30_000;
/** The zip is 1–4 MB; election-night refreshes are minutes apart, finished elections never change. */
const LIVE_TTL_MS = 45_000;
const IDLE_TTL_MS = 10 * 60_000;
const ARCHIVE_TTL_MS = 6 * 60 * 60_000;
/** A zip bomb guard: the largest real file is ~30 MB of text. */
const MAX_TEXT_BYTES = 120 * 1024 * 1024;

export interface NcOfficial {
  races: Race[];
  pollClosings: Record<string, PollClosing>;
}

const memo = new Map<string, { at: number; value: NcOfficial | null }>();
const inflight = new Map<string, Promise<NcOfficial | null>>();

function ttl(date: string, now: Date): number {
  const p = phaseOf(date, now);
  return p === 'archive' ? ARCHIVE_TTL_MS : p === 'upcoming' ? IDLE_TTL_MS : LIVE_TTL_MS;
}

async function load(date: string, now: Date): Promise<NcOfficial | null> {
  const res = await fetch(ncsbeUrl(date), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'rmhstudios-elections/1.0' },
  });
  if (res.status === 404) return null; // not published for this date (S3 answers a missing key with 404)
  if (!res.ok) throw new Error(`ncsbe: HTTP ${res.status}`);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const entry = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('.txt'));
  if (!entry) throw new Error('ncsbe: no results file in zip');
  const text = await entry.async('string');
  if (text.length > MAX_TEXT_BYTES) throw new Error('ncsbe: results file implausibly large');
  const parsed = parseNcsbeResults(text, date);
  if (!parsed.races.length) return null;
  const final = phaseOf(date, now) === 'archive';
  return {
    races: finalizeRaces(parsed.races, final),
    pollClosings: ncPollClosing(date, etDayStart(date).getTime()),
  };
}

/** The official NC count for an election date, or null when none is published. Rejects on outage with no cache. */
export async function getNcOfficial(date: string, now: Date = new Date()): Promise<NcOfficial | null> {
  const hit = memo.get(date);
  if (hit && now.getTime() - hit.at < ttl(date, now)) return hit.value;

  let p = inflight.get(date);
  if (!p) {
    p = load(date, now)
      .then((value) => {
        memo.set(date, { at: Date.now(), value });
        return value;
      })
      .finally(() => inflight.delete(date));
    inflight.set(date, p);
  }
  try {
    return await p;
  } catch (err) {
    if (hit) {
      console.warn('[elections] NC SBE failed, serving stale:', String(err));
      return hit.value;
    }
    throw err;
  }
}

/** Test seam. */
export function __resetNcCache() {
  memo.clear();
  inflight.clear();
}
