/** Fetch and cache the other-offices races for an election day. Server-only; same ETag strategy as measures. */

import { phaseOf, type Cycle } from './calendar';
import { normalizeOtherRace, type OtherRace } from './downballot';
import { parseOtherOfficeIndex, type MeasureRef } from './measures';
import { getIndexFeed } from './measures.server';

const BASE = (process.env.ELECTIONS_RESULTS_BASE || 'https://static01.nyt.com/elections-assets/pages/data').replace(/\/+$/, '');
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 8;
const LIVE_TTL_MS = 45_000;
const IDLE_TTL_MS = 10 * 60_000;

const pages = new Map<string, { etag: string | null; race: OtherRace | null }>();
const listMemo = new Map<string, { at: number; races: OtherRace[] }>();
const inflight = new Map<string, Promise<OtherRace[]>>();

async function getPage(date: string, ref: MeasureRef): Promise<OtherRace | null> {
  const key = `${date}/${ref.slug}`;
  const prev = pages.get(key);
  try {
    const res = await fetch(`${BASE}/${date}/${ref.slug}.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json', 'user-agent': 'rmhstudios-elections/1.0', ...(prev?.etag ? { 'if-none-match': prev.etag } : {}) },
    });
    if (res.status === 304 && prev) return prev.race;
    if (!res.ok) return prev?.race ?? null;
    const race = normalizeOtherRace(await res.json(), ref);
    pages.set(key, { etag: res.headers.get('etag'), race });
    return race;
  } catch {
    return prev?.race ?? null;
  }
}

async function build(cycle: Cycle): Promise<OtherRace[]> {
  const feed = await getIndexFeed(cycle.date);
  const refs = feed ? parseOtherOfficeIndex(feed) : [];
  const out: OtherRace[] = [];
  let next = 0;
  const worker = async () => {
    while (next < refs.length) {
      const r = await getPage(cycle.date, refs[next++]);
      if (r) out.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, refs.length) }, worker));
  return out.sort((a, b) => a.office.localeCompare(b.office) || a.state.localeCompare(b.state) || a.title.localeCompare(b.title));
}

/** Statewide offices below the headline races, and local offices. Never rejects. */
export async function getOtherRaces(cycle: Cycle, now = Date.now()): Promise<{ races: OtherRace[]; at: number }> {
  if (cycle.kind === 'other') return { races: [], at: now };
  const phase = phaseOf(cycle.date, new Date(now));
  const ttl = phase === 'election-day' || phase === 'counting' ? LIVE_TTL_MS : IDLE_TTL_MS;
  const hit = listMemo.get(cycle.date);
  if (hit && now - hit.at < ttl) return { races: hit.races, at: hit.at };
  let p = inflight.get(cycle.date);
  if (!p) {
    p = build(cycle)
      .then((races) => {
        listMemo.set(cycle.date, { at: Date.now(), races });
        return races;
      })
      .finally(() => inflight.delete(cycle.date));
    inflight.set(cycle.date, p);
  }
  try {
    return { races: await p, at: Date.now() };
  } catch (err) {
    console.warn('[elections] other offices unavailable:', String(err));
    return hit ? { races: hit.races, at: hit.at } : { races: [], at: now };
  }
}

/** Test seam. */
export function __resetOtherRaces() {
  pages.clear();
  listMemo.clear();
  inflight.clear();
}
