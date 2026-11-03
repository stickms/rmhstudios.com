/**
 * Adapter: the New York Times' public static results pages → our `Race` /
 * `ChamberControl` shapes. Pure — no I/O — so it is unit-tested against
 * trimmed fixtures of the real feed (`__tests__/fixtures/`).
 *
 * Why this source: it is the one keyless, login-free, CORS-free JSON feed that
 * carries live vote counts, race calls, ratings, candidate rosters AND chamber
 * control tallies, for every office, with a predictable URL per Election Day
 * (`calendar.resultsUrl`). It is an unofficial static file, not a contract, so
 * every read here is defensive: a missing or renamed field degrades one number
 * to null, it never throws and never takes the page down.
 */

import { AT_LARGE, stateName } from './states';
import {
  RATINGS,
  type Candidate,
  type ChamberControl,
  type Office,
  type Party,
  type PollClosing,
  type Race,
  type RaceStatus,
  type Rating,
} from './types';

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const OFFICE_ID: Record<Office, string> = { president: 'P', senate: 'S', governor: 'G', house: 'H' };

/** Seats in the body, and the number needed for control. */
const BODY: Record<Office, { total: number; toWin: number }> = {
  president: { total: 538, toWin: 270 },
  senate: { total: 100, toWin: 51 },
  governor: { total: 50, toWin: 26 },
  house: { total: 435, toWin: 218 },
};

const ZERO = (): Record<Party, number> => ({ DEM: 0, GOP: 0, OTH: 0 });

export function toParty(id: unknown): Party {
  return id === 'DEM' ? 'DEM' : id === 'GOP' ? 'GOP' : 'OTH';
}

function toRating(v: unknown): Rating | null {
  return typeof v === 'string' && (RATINGS as readonly string[]).includes(v) ? (v as Rating) : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function candidateName(m: Json): { name: string; lastName: string } {
  const first = str(m.first_name) ?? '';
  const last = str(m.last_name) ?? str(m.nyt_id) ?? 'Unknown';
  const suffix = str(m.suffix);
  return {
    name: [first, last, suffix].filter(Boolean).join(' '),
    lastName: last,
  };
}

function normalizeRace(raw: Json, office: Office): Race | null {
  const id = str(raw.nyt_id);
  if (!id) return null;
  // The first House row is a national roll-up, not a contest.
  if (raw.coverage === 'national') return null;
  const state = id.split('-')[0];
  if (!state || state === 'US') return null;

  const meta = isObj(raw.candidate_metadata) ? raw.candidate_metadata : {};
  const unit = isObj(raw.top_reporting_unit) ? raw.top_reporting_unit : {};
  const outcome = isObj(raw.outcome) ? raw.outcome : {};
  const won = new Set(arr(outcome.won).filter((x): x is string => typeof x === 'string'));

  const votesById = new Map<string, { votes: number; leader: boolean }>();
  for (const c of arr(unit.candidates)) {
    if (!isObj(c)) continue;
    const cid = str(c.nyt_id);
    if (!cid) continue;
    const votes = isObj(c.votes) ? (num(c.votes.total) ?? 0) : 0;
    votesById.set(cid, { votes, leader: c.leader === true });
  }

  const totalVotes = num(unit.total_votes) ?? [...votesById.values()].reduce((s, v) => s + v.votes, 0);

  const candidates: Candidate[] = Object.values(meta)
    .filter(isObj)
    .map((m) => {
      const cid = str(m.nyt_id) ?? '';
      const party = isObj(m.party) ? m.party : {};
      const v = votesById.get(cid);
      const { name, lastName } = candidateName(m);
      return {
        id: cid,
        name,
        lastName,
        party: toParty(party.nyt_id),
        partyLabel: str(party.name) ?? 'Independent',
        incumbent: m.incumbent === true,
        imageUrl: str(m.img_url),
        votes: v?.votes ?? 0,
        pct: totalVotes > 0 ? round1(((v?.votes ?? 0) / totalVotes) * 100) : 0,
        leader: v?.leader ?? false,
        won: won.has(cid),
        // ballot order breaks ties before any votes are in
        _order: num(m.ballot_order) ?? 99,
      };
    })
    .filter((c) => c.id)
    .sort((a, b) => b.votes - a.votes || a._order - b._order)
    .map(({ _order: _o, ...c }) => c);

  // A leader flag from the source wins; otherwise the vote leader once any are in.
  if (!candidates.some((c) => c.leader) && candidates[0] && candidates[0].votes > 0) {
    candidates[0].leader = true;
  }

  const winner = candidates.find((c) => c.won) ?? null;
  const status: RaceStatus = winner ? 'called' : totalVotes > 0 ? 'counting' : 'upcoming';

  const eevp = num(unit.eevp);
  const pTot = num(unit.precincts_total);
  const pRep = num(unit.precincts_reporting);
  const pctReporting =
    totalVotes <= 0 && !winner
      ? null
      : eevp != null
        ? Math.min(100, Math.max(0, eevp))
        : pTot && pRep != null
          ? Math.min(100, round1((pRep / pTot) * 100))
          : null;

  const type = str(raw.type) ?? 'General';
  const seatNo = str(raw.seat_number);
  const district = office === 'house' ? (AT_LARGE.has(state) ? 'AL' : seatNo) : null;
  const special = /special/i.test(type);
  const nameOfState = stateName(state);
  const label =
    office === 'house'
      ? `House · ${state}-${district ?? '?'}`
      : office === 'senate'
        ? `Senate · ${nameOfState}${special ? ' (special)' : ''}`
        : office === 'governor'
          ? `Governor · ${nameOfState}`
          : `President · ${nameOfState}`;

  const top2 = candidates.slice(0, 2);
  const margin =
    top2.length === 2 && totalVotes > 0
      ? round1(((top2[0].votes - top2[1].votes) / totalVotes) * 100)
      : null;

  return {
    id,
    office,
    state,
    stateName: nameOfState,
    district,
    label,
    type,
    special,
    rating: toRating(raw.rating) ?? toRating(raw.general_rating),
    status,
    winnerParty: winner ? winner.party : null,
    flipped: winner != null && outcome.gained === true,
    pctReporting,
    totalVotes,
    electoralVotes: num(outcome.electoral_votes) ?? num(raw.electoral_votes),
    candidates,
    margin,
    uncontested: raw.uncontested === true,
    updatedAt: str(raw.updated_at),
    primaryParty: null,
    calledBy: arr(outcome.called_by).filter((x): x is string => typeof x === 'string'),
    source: 'nyt',
  };
}

function normalizeControl(page: Json, office: Office, races: Race[]): ChamberControl | null {
  const body = BODY[office];
  const results = arr(isObj(page.partyControlData) ? page.partyControlData.results : null);
  const us = results.find((r) => isObj(r) && r.state_postal === 'US');
  const offices = isObj(us) && isObj(us.offices) ? us.offices : {};
  const o = offices[OFFICE_ID[office]];

  // The source can hand every page the same roll-up (the governor page carries the House's),
  // so only trust an entry whose office id matches the page we asked for.
  if (isObj(o) && o.office_id === OFFICE_ID[office] && isObj(o.party_balance)) {
    const bal = o.party_balance;
    const seats = ZERO();
    const notUp = ZERO();
    const flips = ZERO();
    for (const p of ['DEM', 'GOP', 'OTH'] as const) {
      const b = bal[p];
      if (!isObj(b)) continue;
      seats[p] = num(b.seats) ?? 0;
      notUp[p] = num(b.no_election) ?? 0;
      flips[p] = num(b.flip_count) ?? 0;
    }
    const toWinRec = isObj(o.to_win) ? o.to_win : {};
    const toWin = num(toWinRec.DEM) ?? num(toWinRec.GOP) ?? body.toWin;
    const cur = isObj(o.current_control) ? o.current_control : {};
    const before = {
      DEM: num(cur.DEM) ?? 0,
      GOP: num(cur.GOP) ?? 0,
      OTH: num(cur.OTH) ?? 0,
    };
    return {
      office,
      total: num(o.total) ?? body.total,
      seatsUp: num(o.open_seats) ?? races.length,
      seats,
      notUp,
      before,
      toWin,
      racesCalled: num(o.num_races_called) ?? races.filter((r) => r.status === 'called').length,
      flips,
      controlledBy: (['DEM', 'GOP', 'OTH'] as const).find((p) => seats[p] >= toWin) ?? null,
      derived: false,
    };
  }

  return deriveControl(races, office);
}

/** Tally from called races alone — used when the source carries no control table for the body. */
export function deriveControl(races: Race[], office: Office): ChamberControl {
  const body = BODY[office];
  const seats = ZERO();
  const flips = ZERO();
  let called = 0;
  for (const r of races) {
    if (r.status !== 'called' || !r.winnerParty) continue;
    called++;
    seats[r.winnerParty] += office === 'president' ? (r.electoralVotes ?? 0) : 1;
    if (r.flipped) flips[r.winnerParty]++;
  }
  return {
    office,
    total: body.total,
    seatsUp: races.length,
    seats,
    notUp: ZERO(),
    before: ZERO(),
    toWin: body.toWin,
    racesCalled: called,
    flips,
    controlledBy: (['DEM', 'GOP', 'OTH'] as const).find((p) => seats[p] >= body.toWin) ?? null,
    derived: true,
  };
}

export interface NormalizedPage {
  races: Race[];
  chamber: ChamberControl | null;
  pollClosings: Record<string, PollClosing>;
  sourceUpdatedAt: string | null;
}

/** Turn one results page (`results-senate.json` …) into our shapes. Never throws on odd input. */
export function normalizeNytPage(json: unknown, office: Office): NormalizedPage {
  const page = isObj(json) ? json : {};
  const races = arr(page.races)
    .filter(isObj)
    .map((r) => normalizeRace(r, office))
    .filter((r): r is Race => r !== null);

  const pollClosings: Record<string, PollClosing> = {};
  for (const p of arr(page.pollClosingTimes)) {
    if (!isObj(p)) continue;
    const unit = isObj(p.reporting_unit) ? p.reporting_unit : {};
    const postal = str(unit.state_postal);
    const iso = str(p.poll_closing_time);
    if (postal && iso) {
      pollClosings[postal] = { iso, displayET: str(p.poll_closing_time_display_et) ?? '' };
    }
  }

  const meta = isObj(page.resultsMeta) ? page.resultsMeta : {};
  return {
    races,
    chamber: races.length ? normalizeControl(page, office, races) : null,
    pollClosings,
    sourceUpdatedAt: str(meta.resultsUpdatedAt),
  };
}
