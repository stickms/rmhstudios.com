/**
 * Fetch and cache the ballot measures for an election day. Server-only.
 *
 * One index request lists every measure page; each page is fetched with an ETag so an unchanged page costs a
 * 304. Fetches are limited to a few at a time and single-flighted; on an outage the last good list is served.
 */

import { phaseOf, type Cycle } from './calendar';
import { normalizeMeasure, parseMeasureIndex, type BallotMeasure, type MeasureRef } from './measures';

const BASE = (process.env.ELECTIONS_RESULTS_BASE || 'https://static01.nyt.com/elections-assets/pages/data').replace(/\/+$/, '');
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 8;
const LIVE_TTL_MS = 45_000;
const IDLE_TTL_MS = 10 * 60_000;
const INDEX_TTL_MS = 30 * 60_000;

interface Page {
  etag: string | null;
  measure: BallotMeasure | null;
}

const pages = new Map<string, Page>();
const indexMemo = new Map<string, { at: number; refs: MeasureRef[] }>();
const listMemo = new Map<string, { at: number; measures: BallotMeasure[] }>();
const inflight = new Map<string, Promise<BallotMeasure[]>>();

const headers = (etag?: string | null): Record<string, string> => ({
  accept: 'application/json',
  'user-agent': 'rmhstudios-elections/1.0',
  ...(etag ? { 'if-none-match': etag } : {}),
});

/** The index URL is named inside every office page's config; find it via the (smallest) governor page. */
async function indexUrl(date: string): Promise<string | null> {
  if (process.env.ELECTIONS_MEASURES_INDEX_URL) return process.env.ELECTIONS_MEASURES_INDEX_URL;
  for (const office of ['governor', 'senate']) {
    try {
      const res = await fetch(`${BASE}/${date}/results-${office}.json`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: headers() });
      if (!res.ok) continue;
      const j = (await res.json()) as { pageConfig?: { feeds?: { search?: { url?: string } } } };
      const url = j.pageConfig?.feeds?.search?.url;
      if (typeof url === 'string' && url.startsWith('https://static01.nyt.com/')) return url;
    } catch {
      /* try the next office */
    }
  }
  return null;
}

async function getRefs(date: string, now: number): Promise<MeasureRef[]> {
  const hit = indexMemo.get(date);
  if (hit && now - hit.at < INDEX_TTL_MS) return hit.refs;
  const url = await indexUrl(date);
  if (!url) return hit?.refs ?? [];
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: headers() });
  if (!res.ok) throw new Error(`measure index: HTTP ${res.status}`);
  const refs = parseMeasureIndex(await res.json());
  indexMemo.set(date, { at: now, refs });
  return refs;
}

async function getPage(date: string, ref: MeasureRef): Promise<BallotMeasure | null> {
  const key = `${date}/${ref.slug}`;
  const prev = pages.get(key);
  try {
    const res = await fetch(`${BASE}/${date}/${ref.slug}.json`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: headers(prev?.etag) });
    if (res.status === 304 && prev) return prev.measure;
    if (!res.ok) return prev?.measure ?? null;
    const measure = normalizeMeasure(await res.json(), ref);
    pages.set(key, { etag: res.headers.get('etag'), measure });
    return measure;
  } catch {
    return prev?.measure ?? null;
  }
}

async function build(cycle: Cycle, now: number): Promise<BallotMeasure[]> {
  const refs = await getRefs(cycle.date, now);
  const out: BallotMeasure[] = [];
  let next = 0;
  const worker = async () => {
    while (next < refs.length) {
      const ref = refs[next++];
      const m = await getPage(cycle.date, ref);
      if (m) out.push(m);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, refs.length) }, worker));
  return out.sort((a, b) => a.state.localeCompare(b.state) || a.scope.localeCompare(b.scope) || a.title.localeCompare(b.title));
}

/** Every ballot measure for the cycle's election day. Never rejects; an empty list means none are published. */
export async function getBallotMeasures(cycle: Cycle, now = Date.now()): Promise<{ measures: BallotMeasure[]; at: number }> {
  if (cycle.kind === 'other') return { measures: [], at: now };
  const phase = phaseOf(cycle.date, new Date(now));
  const ttl = phase === 'election-day' || phase === 'counting' ? LIVE_TTL_MS : IDLE_TTL_MS;
  const hit = listMemo.get(cycle.date);
  if (hit && now - hit.at < ttl) return { measures: hit.measures, at: hit.at };
  let p = inflight.get(cycle.date);
  if (!p) {
    p = build(cycle, now)
      .then((measures) => {
        listMemo.set(cycle.date, { at: Date.now(), measures });
        return measures;
      })
      .finally(() => inflight.delete(cycle.date));
    inflight.set(cycle.date, p);
  }
  try {
    const measures = await p;
    return { measures, at: Date.now() };
  } catch (err) {
    console.warn('[elections] measures unavailable:', String(err));
    return hit ? { measures: hit.measures, at: hit.at } : { measures: [], at: now };
  }
}

/** Test seam. */
export function __resetMeasures() {
  pages.clear();
  indexMemo.clear();
  listMemo.clear();
  inflight.clear();
}
