/**
 * Fetches and caches the election snapshot. Server-only.
 *
 * One fetch per office per Election Day, normalised by `nyt.ts`, merged into an
 * `ElectionSnapshot`. Three behaviours matter on the night:
 *
 *  - **Single-flight:** a burst of viewers shares one upstream request.
 *  - **TTL by phase:** 20 s while votes are coming in, 5 min the rest of the
 *    time (the pre-election pages change a few times a day).
 *  - **Stale on error:** if the source hiccups we keep serving the last good
 *    snapshot rather than blanking the page mid-count.
 *
 * A 404 for one office is not an error — it means "no ballots yet" (the 2028
 * pages do not exist today) and is reported in `snapshot.missing`.
 */

import { phaseOf, resultsUrl, type Cycle } from './calendar';
import { crossCheck } from './official';
import { NCSBE_NAME } from './sources/ncsbe';
import { getNcOfficial } from './sources/ncsbe.server';
import { ingestSnapshot } from './events.server';
import { normalizeNytPage } from './nyt';
import type { ElectionSnapshot, Office, PollClosing, Race, ChamberControl } from './types';

const FETCH_TIMEOUT_MS = 20_000;
const LIVE_TTL_MS = 20_000;
const IDLE_TTL_MS = 5 * 60_000;

interface Entry {
  at: number;
  snapshot: ElectionSnapshot;
}

const memo = new Map<string, Entry>();
const inflight = new Map<string, Promise<ElectionSnapshot>>();

export function snapshotTtlMs(date: string, live: boolean, now = new Date()): number {
  // Rehearsal override (docs/elections.md): refresh on a fixed interval whatever the phase.
  const forced = Number(process.env.ELECTIONS_TTL_MS);
  if (Number.isFinite(forced) && forced >= 1000) return forced;
  const phase = phaseOf(date, now);
  return live || phase === 'election-day' || phase === 'counting' ? LIVE_TTL_MS : IDLE_TTL_MS;
}

async function fetchOffice(date: string, office: Office): Promise<unknown | null> {
  const res = await fetch(resultsUrl(date, office, process.env.ELECTIONS_RESULTS_BASE), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json', 'user-agent': 'rmhstudios-elections/1.0' },
  });
  // Only a 404 means "not published yet". A 403/5xx is an outage or a block — an error, so the caller
  // serves the last good snapshot instead of showing "no ballots" for a race that has them.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`results-${office}: HTTP ${res.status}`);
  return res.json();
}

async function buildGeneral(cycle: Cycle): Promise<ElectionSnapshot> {
  const results = await Promise.allSettled(
    cycle.offices.map(async (office) => ({ office, json: await fetchOffice(cycle.date, office) })),
  );

  const races: Race[] = [];
  const chambers: Partial<Record<Office, ChamberControl>> = {};
  const pollClosings: Record<string, PollClosing> = {};
  const missing: Office[] = [];
  let sourceUpdatedAt: string | null = null;
  let failures = 0;

  results.forEach((r, i) => {
    const office = cycle.offices[i];
    if (r.status === 'rejected') {
      failures++;
      console.warn('[elections] fetch failed', office, String(r.reason));
      return;
    }
    if (r.value.json == null) {
      missing.push(office);
      return;
    }
    const page = normalizeNytPage(r.value.json, office);
    if (!page.races.length) {
      missing.push(office);
      return;
    }
    races.push(...page.races);
    if (page.chamber) chambers[office] = page.chamber;
    Object.assign(pollClosings, page.pollClosings);
    if (page.sourceUpdatedAt && (!sourceUpdatedAt || page.sourceUpdatedAt > sourceUpdatedAt)) {
      sourceUpdatedAt = page.sourceUpdatedAt;
    }
  });

  // Every office failed outright (not "missing"): surface it so the caller can serve stale.
  if (failures === cycle.offices.length) throw new Error('all election sources failed');

  // An independent government count, set beside the feed's where one exists (NC today). Best-effort:
  // the cross-check never blocks or fails the snapshot.
  const providers = races.length ? ['The New York Times results feed (AP data)'] : [];
  let checked = races;
  if (races.some((r) => r.status !== 'upcoming')) {
    try {
      const nc = await getNcOfficial(cycle.date);
      if (nc) {
        checked = crossCheck(races, nc.races, NCSBE_NAME);
        if (checked.some((r) => r.official)) providers.push(`${NCSBE_NAME} (official count, cross-check)`);
      }
    } catch (err) {
      console.warn('[elections] NC cross-check unavailable:', String(err));
    }
  }

  return {
    date: cycle.date,
    kind: 'general',
    source: races.length ? 'nyt' : 'calendar',
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt,
    live: races.some((r) => r.status !== 'upcoming'),
    chambers,
    races: checked,
    pollClosings,
    missing,
    providers,
  };
}

/**
 * A primary, runoff or special: there is no news-grade feed page for these, so the snapshot comes from
 * the state election boards we integrate (North Carolina's official count today). Races only — a primary
 * decides no chamber, so there is no control table.
 */
async function buildOther(cycle: Cycle): Promise<ElectionSnapshot> {
  const nc = await getNcOfficial(cycle.date);
  const races = nc?.races ?? [];
  return {
    date: cycle.date,
    kind: 'other',
    source: races.length ? 'official' : 'calendar',
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: null,
    // "Live" means votes are still being counted: a finished primary from March is data, not an event.
    live: races.some((r) => r.totalVotes > 0) && phaseOf(cycle.date) !== 'archive',
    chambers: {},
    races,
    pollClosings: nc?.pollClosings ?? {},
    missing: races.length ? [] : [...cycle.offices],
    providers: races.length ? [NCSBE_NAME] : [],
  };
}

const build = (cycle: Cycle) => (cycle.kind === 'other' ? buildOther(cycle) : buildGeneral(cycle));

/** The current snapshot for a cycle. Never rejects when a previous snapshot exists. */
export async function getElectionSnapshot(cycle: Cycle, now = new Date()): Promise<ElectionSnapshot> {
  const key = cycle.date;
  const hit = memo.get(key);
  if (hit && now.getTime() - hit.at < snapshotTtlMs(cycle.date, hit.snapshot.live, now)) {
    return hit.snapshot;
  }

  let p = inflight.get(key);
  if (!p) {
    p = build(cycle)
      .then((snapshot) => {
        memo.set(key, { at: Date.now(), snapshot });
        ingestSnapshot(snapshot); // diff against the last one: calls, flips, lead changes, polls closing
        return snapshot;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }

  try {
    return await p;
  } catch (err) {
    if (hit) {
      console.warn('[elections] serving stale snapshot', key, String(err));
      return hit.snapshot;
    }
    // Nothing cached and the source is down: an honest empty, calendar-only snapshot.
    return {
      date: cycle.date,
      kind: cycle.kind === 'other' ? 'other' : 'general',
      source: 'calendar',
      fetchedAt: new Date().toISOString(),
      sourceUpdatedAt: null,
      live: false,
      chambers: {},
      races: [],
      pollClosings: {},
      missing: [...cycle.offices],
      providers: [],
    };
  }
}

/** Test seam. */
export function __resetElectionCache() {
  memo.clear();
  inflight.clear();
}
