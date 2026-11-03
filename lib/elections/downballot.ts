/**
 * Other offices: statewide offices below the headline races (attorney general, secretary of state, treasurer,
 * lieutenant governor, supreme court, comptroller…) and local ones (mayors, county offices). Client-safe, pure.
 *
 * These pages use the same race schema as the Senate or governor, so this reads the same fields defensively.
 */

import { stateName } from './states';
import { toParty } from './nyt';
import type { MeasureRef } from './measures';
import type { Party } from './types';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface OtherCandidate {
  id: string;
  name: string;
  party: Party;
  partyLabel: string;
  incumbent: boolean;
  votes: number;
  pct: number;
  leader: boolean;
  won: boolean;
}

export interface OtherRace {
  id: string;
  slug: string;
  state: string;
  stateName: string;
  /** "Attorney General", "Mayor", "Supreme Court"… as the results site names the office. */
  office: string;
  /** The contest's own title, e.g. "Louisville Mayor". */
  title: string;
  scope: 'statewide' | 'local';
  candidates: OtherCandidate[];
  status: 'upcoming' | 'counting' | 'called';
  winnerParty: Party | null;
  flipped: boolean;
  totalVotes: number;
  pctReporting: number | null;
  /** Leader minus runner-up, in points. */
  margin: number | null;
  calledBy: string[];
  url: string | null;
}

export function normalizeOtherRace(json: unknown, ref: MeasureRef): OtherRace | null {
  const page = isObj(json) ? json : {};
  const raw = arr(page.races).find(isObj);
  if (!raw) return null;
  const id = str(raw.nyt_id);
  if (!id) return null;

  const meta = isObj(raw.candidate_metadata) ? raw.candidate_metadata : {};
  const unit = isObj(raw.top_reporting_unit) ? raw.top_reporting_unit : {};
  const outcome = isObj(raw.outcome) ? raw.outcome : {};
  const won = new Set(arr(outcome.won).filter((x): x is string => typeof x === 'string'));

  const votesById = new Map<string, { votes: number; leader: boolean }>();
  for (const c of arr(unit.candidates)) {
    if (!isObj(c)) continue;
    const cid = str(c.nyt_id);
    if (cid) votesById.set(cid, { votes: isObj(c.votes) ? (num(c.votes.total) ?? 0) : 0, leader: c.leader === true });
  }
  const totalVotes = num(unit.total_votes) ?? [...votesById.values()].reduce((s, v) => s + v.votes, 0);

  const candidates: OtherCandidate[] = Object.values(meta)
    .filter(isObj)
    .map((m) => {
      const cid = str(m.nyt_id) ?? '';
      const party = isObj(m.party) ? m.party : {};
      const v = votesById.get(cid);
      const name = [str(m.first_name), str(m.last_name) ?? cid, str(m.suffix)].filter(Boolean).join(' ');
      return {
        id: cid,
        name,
        party: toParty(party.nyt_id),
        partyLabel: str(party.name) ?? 'Independent',
        incumbent: m.incumbent === true,
        votes: v?.votes ?? 0,
        pct: totalVotes > 0 ? round1(((v?.votes ?? 0) / totalVotes) * 100) : 0,
        leader: v?.leader ?? false,
        won: won.has(cid),
        _order: num(m.ballot_order) ?? 99,
      };
    })
    .filter((c) => c.id)
    .sort((a, b) => b.votes - a.votes || a._order - b._order)
    .map(({ _order: _o, ...c }) => c);
  if (!candidates.some((c) => c.leader) && candidates[0] && candidates[0].votes > 0) candidates[0].leader = true;

  const winner = candidates.find((c) => c.won) ?? null;
  const eevp = num(unit.eevp);
  const pTot = num(unit.precincts_total);
  const pRep = num(unit.precincts_reporting);
  const pctReporting =
    totalVotes <= 0 && !winner
      ? null
      : eevp != null && eevp > 0
        ? Math.min(100, eevp)
        : pTot && pRep != null
          ? Math.min(100, round1((pRep / pTot) * 100))
          : null;
  const [a, b] = candidates;
  const title = (isObj(raw.title) ? str(raw.title.default) : null) ?? ref.headline.replace(/\s+Election Results.*$/i, '');

  return {
    id,
    slug: ref.slug,
    state: ref.state,
    stateName: stateName(ref.state),
    office: str(raw.office) ?? ref.office,
    title,
    scope: str(raw.coverage) === 'county' ? 'local' : 'statewide',
    candidates: candidates.slice(0, 6),
    status: winner ? 'called' : totalVotes > 0 ? 'counting' : 'upcoming',
    winnerParty: winner ? winner.party : null,
    flipped: winner != null && outcome.gained === true,
    totalVotes,
    pctReporting,
    margin: a && b && totalVotes > 0 ? round1(a.pct - b.pct) : null,
    calledBy: arr(outcome.called_by).filter((x): x is string => typeof x === 'string'),
    url: str(raw.url),
  };
}

export interface OtherFilter {
  office: string | 'all';
  scope: 'all' | 'statewide' | 'local';
  state: string | 'all';
  q: string;
}

export function filterOther(rs: OtherRace[], f: OtherFilter): OtherRace[] {
  const q = f.q.trim().toLowerCase();
  return rs.filter(
    (r) =>
      (f.office === 'all' || r.office === f.office) &&
      (f.scope === 'all' || r.scope === f.scope) &&
      (f.state === 'all' || r.state === f.state) &&
      (!q || `${r.title} ${r.office} ${r.stateName} ${r.candidates.map((c) => c.name).join(' ')}`.toLowerCase().includes(q)),
  );
}

export interface OtherStats {
  total: number;
  statewide: number;
  local: number;
  called: number;
  flips: number;
  byOffice: { office: string; count: number }[];
}

export function otherStats(rs: OtherRace[]): OtherStats {
  const by = new Map<string, number>();
  for (const r of rs) by.set(r.office, (by.get(r.office) ?? 0) + 1);
  return {
    total: rs.length,
    statewide: rs.filter((r) => r.scope === 'statewide').length,
    local: rs.filter((r) => r.scope === 'local').length,
    called: rs.filter((r) => r.status === 'called').length,
    flips: rs.filter((r) => r.flipped).length,
    byOffice: [...by.entries()].map(([office, count]) => ({ office, count })).sort((a, b) => b.count - a.count),
  };
}
