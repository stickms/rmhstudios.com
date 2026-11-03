/**
 * Adapter: the North Carolina State Board of Elections' official results file →
 * our `Race` shapes. Pure — no I/O (the fetch + unzip is `ncsbe.server.ts`).
 *
 * Why this source: it is a government source, keyless and login-free, published
 * for EVERY North Carolina election date including primaries
 * (`dl.ncsbe.gov/ENRS/<YYYY_MM_DD>/results_pct_<YYYYMMDD>.zip`), and on Election
 * Day it is regenerated as precincts report. It is how the hub shows primaries
 * (the news-grade general-election feed has no primary pages), and on election
 * night it independently cross-checks the feed's North Carolina numbers.
 *
 * The file is tab-separated, one row per precinct per candidate:
 *   County, Election Date, Precinct, Contest Group ID, Contest Type (S statewide /
 *   C county), Contest Name, Choice, Choice Party, Vote For, Election Day, Early
 *   Voting, Absentee by Mail, Provisional, Total Votes, Real Precinct
 * Contest names look like `US SENATE (REP)`, `US HOUSE OF REPRESENTATIVES
 * DISTRICT 11 (DEM)`, `NC GOVERNOR`, `US PRESIDENT`, `PRESIDENTIAL PREFERENCE
 * (REP)`. Note `NC HOUSE OF REPRESENTATIVES …` is the STATE house — not ours.
 *
 * What the file does not carry: ratings, incumbents, and race calls. So a race is
 * 'counting' while votes come in, and is only 'called' by a stated rule applied
 * to a FINAL count (see `finalizeRaces`), never mid-count.
 */

import { stateName } from '../states';
import type { Candidate, Office, Party, PollClosing, Race, RaceStatus } from '../types';

export const NCSBE_NAME = 'NC State Board of Elections';
/** North Carolina's polls close at 7:30 p.m. Eastern. */
export const NC_CLOSE_HOUR_ET = 19.5;

export function ncsbeUrl(date: string): string {
  const [y, m, d] = date.split('-');
  return `https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/${y}_${m}_${d}/results_pct_${y}${m}${d}.zip`;
}

interface ContestInfo {
  office: Office;
  district: string | null;
  /** Party suffix of a primary contest, e.g. "(REP)". */
  primary: string | null;
}

const FEDERAL: { re: RegExp; office: Office; district?: boolean }[] = [
  { re: /^US SENATE(?: \(([A-Z]{3})\))?$/, office: 'senate' },
  { re: /^US HOUSE OF REPRESENTATIVES DISTRICT (\d{1,3})(?: \(([A-Z]{3})\))?$/, office: 'house', district: true },
  { re: /^NC GOVERNOR(?: \(([A-Z]{3})\))?$/, office: 'governor' },
  { re: /^(?:US PRESIDENT|PRESIDENTIAL PREFERENCE)(?: \(([A-Z]{3})\))?$/, office: 'president' },
];

/** Only contests this hub carries; state legislative, judicial and local contests return null. */
export function classifyContest(name: string): ContestInfo | null {
  for (const f of FEDERAL) {
    const m = f.re.exec(name.trim());
    if (!m) continue;
    return f.district
      ? { office: f.office, district: String(Number(m[1])), primary: m[2] ?? null }
      : { office: f.office, district: null, primary: m[1] ?? null };
  }
  return null;
}

const partyOf = (code: string): Party => (code === 'DEM' ? 'DEM' : code === 'REP' ? 'GOP' : 'OTH');

function personName(raw: string): { name: string; lastName: string } {
  const name = raw.replace(/\s*\(Write-In\)\s*$/i, '').replace(/\s+/g, ' ').trim();
  const parts = name.split(' ').filter(Boolean);
  // "Martin Luther King Jr." → King; "Jr."/"Sr."/"III" are suffixes, not surnames.
  while (parts.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts[parts.length - 1])) parts.pop();
  return { name, lastName: parts[parts.length - 1] ?? name };
}

interface Acc {
  office: Office;
  district: string | null;
  primary: string | null;
  choices: Map<string, { party: Party; label: string; votes: number; write: boolean }>;
  precincts: Set<string>;
  reported: Set<string>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ParsedNcsbe {
  races: Race[];
  /** Total rows read — for the caller's sanity check. */
  rows: number;
}

/** Parse the results text for one election date. */
export function parseNcsbeResults(text: string, date: string): ParsedNcsbe {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? '').replace(/^﻿/, '').split('\t').map((h) => h.trim());
  const col = (n: string) => header.indexOf(n);
  const iPrec = col('Precinct');
  const iCounty = col('County');
  const iType = col('Contest Type');
  const iContest = col('Contest Name');
  const iChoice = col('Choice');
  const iParty = col('Choice Party');
  const iTotal = col('Total Votes');
  if ([iPrec, iCounty, iType, iContest, iChoice, iParty, iTotal].some((i) => i < 0)) {
    return { races: [], rows: 0 }; // the file is not what we expect: say nothing rather than guess
  }

  const contests = new Map<string, Acc>();
  const info = new Map<string, ContestInfo | null>();
  let rows = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split('\t');
    rows++;
    if (f[iType] !== 'S') continue; // statewide contest (county-level rows are local races)
    const name = f[iContest];
    let ci = info.get(name);
    if (ci === undefined) {
      ci = classifyContest(name);
      info.set(name, ci);
    }
    if (!ci) continue;

    let acc = contests.get(name);
    if (!acc) {
      acc = { ...ci, choices: new Map(), precincts: new Set(), reported: new Set() };
      contests.set(name, acc);
    }
    const votes = Number(f[iTotal]) || 0;
    const precinct = `${f[iCounty]}|${f[iPrec]}`;
    acc.precincts.add(precinct);
    if (votes > 0) acc.reported.add(precinct);

    const raw = f[iChoice] ?? '';
    const write = /write-in/i.test(raw);
    // All write-ins are one "Write-ins" line: dozens of names with a handful of votes each is noise.
    const key = write ? '\u0000write-in' : raw;
    const cur = acc.choices.get(key);
    if (cur) cur.votes += votes;
    else
      acc.choices.set(key, {
        party: partyOf((f[iParty] ?? '').trim()),
        label: write ? 'Write-ins' : raw,
        votes,
        write,
      });
  }

  const races: Race[] = [];
  for (const a of contests.values()) {
    const stateCode = 'NC';
    const total = [...a.choices.values()].reduce((s, c) => s + c.votes, 0);
    const primaryParty = a.primary ? partyOf(a.primary.replace(/[()]/g, '')) : null;
    const primaryCode = a.primary ? a.primary.replace(/[()]/g, '') : null;

    const district = a.office === 'house' ? a.district : null;
    const raceId = `${stateCode}-${primaryCode ? `PR_${primaryCode}` : 'G'}-${a.office[0].toUpperCase()}${district ? `-${district}` : ''}-${date}`;

    const candidates: Candidate[] = [...a.choices.entries()]
      .map(([key, c]) => {
        const { name: nm, lastName } = personName(c.label);
        return {
          id: `${raceId}:${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: nm,
          lastName,
          party: c.party,
          partyLabel: c.write ? 'Write-in' : c.party === 'DEM' ? 'Democrat' : c.party === 'GOP' ? 'Republican' : 'Other',
          incumbent: false,
          imageUrl: null,
          votes: c.votes,
          pct: total > 0 ? round1((c.votes / total) * 100) : 0,
          leader: false,
          won: false,
        };
      })
      .sort((x, y) => y.votes - x.votes || x.name.localeCompare(y.name));
    if (candidates[0] && candidates[0].votes > 0) candidates[0].leader = true;

    const status: RaceStatus = total > 0 ? 'counting' : 'upcoming';
    const nPrec = a.precincts.size;
    const pctReporting = total > 0 && nPrec ? Math.min(100, round1((a.reported.size / nPrec) * 100)) : null;
    const top2 = candidates.slice(0, 2);
    const nm = stateName(stateCode);
    const tag = primaryCode ? ` (${primaryCode === 'REP' ? 'GOP' : primaryCode} primary)` : '';
    const label =
      a.office === 'house'
        ? `House · ${stateCode}-${district}${tag}`
        : a.office === 'senate'
          ? `Senate · ${nm}${tag}`
          : a.office === 'governor'
            ? `Governor · ${nm}${tag}`
            : `President · ${nm}${tag}`;

    races.push({
      id: raceId,
      office: a.office,
      state: stateCode,
      stateName: nm,
      district,
      label,
      type: primaryCode ? 'Primary' : 'General',
      special: false,
      rating: null,
      status,
      winnerParty: null,
      flipped: false,
      pctReporting,
      totalVotes: total,
      electoralVotes: null,
      candidates,
      margin:
        top2.length === 2 && total > 0 ? round1(((top2[0].votes - top2[1].votes) / total) * 100) : null,
      uncontested: candidates.filter((c) => c.partyLabel !== 'Write-in').length === 1,
      updatedAt: null,
      primaryParty,
      calledBy: [],
      source: 'ncsbe',
    });
  }

  return { races: races.sort((x, y) => x.id.localeCompare(y.id, 'en', { numeric: true })), rows };
}

/** NC polls: one closing time, 7:30 p.m. ET, for the whole state. */
export function ncPollClosing(date: string, etDayStartMs: number): Record<string, PollClosing> {
  return {
    NC: {
      iso: new Date(etDayStartMs + NC_CLOSE_HOUR_ET * 3_600_000).toISOString(),
      displayET: '7:30 p.m.',
    },
  };
}

/** Primary runoff threshold in North Carolina: the leader needs more than 30% to avoid one. */
export const NC_PRIMARY_THRESHOLD_PCT = 30;

/**
 * Turn a FINAL count into calls — only when the date is far enough in the past that counting is
 * over (`final` is decided by the caller from the phase). Plurality wins a general election or a
 * presidential preference primary; any other primary needs more than 30% to avoid a runoff.
 * Marked `calledBy: ['ncsbe-final']` so the UI says it is the official count's leader, not an AP call.
 */
export function finalizeRaces(races: Race[], final: boolean): Race[] {
  if (!final) return races;
  return races.map((r) => {
    const lead = r.candidates[0];
    if (!lead || lead.votes <= 0 || r.candidates.length < 1) return r;
    const second = r.candidates[1];
    if (second && second.votes === lead.votes) return r; // an exact tie is never called
    const needsMajorityish = r.primaryParty !== null && r.office !== 'president';
    if (needsMajorityish && lead.pct <= NC_PRIMARY_THRESHOLD_PCT) return r;
    return {
      ...r,
      status: 'called' as const,
      winnerParty: lead.party,
      calledBy: ['ncsbe-final'],
      pctReporting: 100,
      candidates: r.candidates.map((c, i) => (i === 0 ? { ...c, won: true } : c)),
    };
  });
}

