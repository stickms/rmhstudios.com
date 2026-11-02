/**
 * Pure summaries of a snapshot: the deterministic "what's happening" bullets,
 * the facts object the AI summariser is grounded on, and the fingerprint that
 * decides when a summary is stale. Client-safe — the page renders the
 * deterministic bullets instantly and swaps in the AI prose when it arrives.
 *
 * The AI never sees raw feed data and never invents numbers: it is handed
 * `buildFacts()` and told to use nothing else. Anything it cannot ground in
 * these facts is, by construction, not in its prompt.
 */

import {
  OFFICE_NAME,
  PARTY_SHORT,
  type ChamberControl,
  type ElectionSnapshot,
  type Office,
  type Party,
  type Race,
} from './types';

const OFFICES_ORDER: Office[] = ['president', 'senate', 'house', 'governor'];

export interface RaceFact {
  label: string;
  leader: string | null;
  leaderParty: Party | null;
  marginPts: number | null;
  pctReporting: number | null;
  status: Race['status'];
  flipped: boolean;
}

export interface ChamberFact {
  office: Office;
  name: string;
  seats: Record<Party, number>;
  toWin: number;
  racesCalled: number;
  seatsUp: number;
  controlledBy: Party | null;
  flips: Record<Party, number>;
  derived: boolean;
}

export interface Facts {
  date: string;
  live: boolean;
  racesTotal: number;
  racesCalled: number;
  racesCounting: number;
  chambers: ChamberFact[];
  flips: RaceFact[];
  closest: RaceFact[];
  /** Races called most recently are not knowable from the feed, so: called, biggest first by office weight. */
  calledHighlights: RaceFact[];
}

function raceFact(r: Race): RaceFact {
  const leader = r.candidates.find((c) => c.won) ?? r.candidates.find((c) => c.leader) ?? null;
  return {
    label: r.label,
    leader: leader ? `${leader.name} (${PARTY_SHORT[leader.party]})` : null,
    leaderParty: leader?.party ?? null,
    marginPts: r.margin,
    pctReporting: r.pctReporting,
    status: r.status,
    flipped: r.flipped,
  };
}

const OFFICE_WEIGHT: Record<Office, number> = { president: 0, senate: 1, governor: 2, house: 3 };

export function buildFacts(s: ElectionSnapshot): Facts {
  const called = s.races.filter((r) => r.status === 'called');
  const counting = s.races.filter((r) => r.status === 'counting');
  const closest = counting
    .filter((r) => r.margin != null && (r.pctReporting ?? 0) >= 5)
    .sort((a, b) => (a.margin ?? 99) - (b.margin ?? 99))
    .slice(0, 5)
    .map(raceFact);
  const highlights = [...called]
    .sort((a, b) => OFFICE_WEIGHT[a.office] - OFFICE_WEIGHT[b.office])
    .filter((r) => r.office !== 'house')
    .slice(0, 8)
    .map(raceFact);

  return {
    date: s.date,
    live: s.live,
    racesTotal: s.races.length,
    racesCalled: called.length,
    racesCounting: counting.length,
    chambers: OFFICES_ORDER.flatMap((o) => {
      const c = s.chambers[o];
      return c ? [chamberFact(c)] : [];
    }),
    flips: called.filter((r) => r.flipped).slice(0, 12).map(raceFact),
    closest,
    calledHighlights: highlights,
  };
}

function chamberFact(c: ChamberControl): ChamberFact {
  return {
    office: c.office,
    name: OFFICE_NAME[c.office],
    seats: c.seats,
    toWin: c.toWin,
    racesCalled: c.racesCalled,
    seatsUp: c.seatsUp,
    controlledBy: c.controlledBy,
    flips: c.flips,
    derived: c.derived,
  };
}

/**
 * Changes whenever the AI summary would have something new to say, and not
 * otherwise: the called count per chamber, who controls what, and the count of
 * races with votes in (bucketed so a trickle of precincts does not churn it).
 */
export function snapshotFingerprint(s: ElectionSnapshot): string {
  const f = buildFacts(s);
  const chambers = f.chambers
    .map((c) => `${c.office}:${c.racesCalled}:${c.controlledBy ?? '-'}`)
    .join('|');
  return `${f.date}#${f.racesCalled}/${Math.floor(f.racesCounting / 10)}#${chambers}`;
}

const seatLine = (c: ChamberFact) =>
  `${c.name}: ${PARTY_SHORT.GOP} ${c.seats.GOP} · ${PARTY_SHORT.DEM} ${c.seats.DEM}` +
  (c.seats.OTH ? ` · ${PARTY_SHORT.OTH} ${c.seats.OTH}` : '') +
  ` (${c.toWin} to win)`;

/** Plain bullets — always available, no AI. */
export function deterministicSummary(s: ElectionSnapshot): string[] {
  const f = buildFacts(s);
  if (!f.racesTotal) return [];
  const out: string[] = [];

  if (!f.live) {
    for (const c of f.chambers) {
      out.push(
        `${c.name}: ${c.seatsUp} ${c.seatsUp === 1 ? 'seat' : 'seats'} on the ballot${
          c.derived ? '' : ` · ${seatLine(c)}`
        }`,
      );
    }
    out.push('Polls have not reported yet — results appear here the moment the first precincts do.');
    return out;
  }

  out.push(`${f.racesCalled} of ${f.racesTotal} races called · ${f.racesCounting} still counting`);
  for (const c of f.chambers) {
    const who = c.controlledBy
      ? `${PARTY_SHORT[c.controlledBy]} has clinched control`
      : c.derived
        ? 'called so far'
        : 'control undecided';
    out.push(`${seatLine(c)} — ${who}`);
  }
  for (const r of f.flips.slice(0, 3)) {
    out.push(`Flip: ${r.label} → ${r.leader ?? 'called'}`);
  }
  for (const r of f.closest.slice(0, 2)) {
    out.push(
      `Too close: ${r.label} — ${r.leader ?? 'tied'} by ${r.marginPts?.toFixed(1)} pts, ${Math.round(
        r.pctReporting ?? 0,
      )}% in`,
    );
  }
  return out;
}

/** One line for the feed card and share text. */
export function headline(s: ElectionSnapshot): string {
  const f = buildFacts(s);
  if (!f.racesTotal) return 'Results will appear here as soon as polls report.';
  if (!f.live) {
    const bits = f.chambers.map((c) => `${c.seatsUp} ${c.name}`);
    return `On the ballot: ${bits.join(' · ')}. Live results the moment polls close.`;
  }
  const lead = f.chambers.filter((c) => c.office === 'senate' || c.office === 'house');
  const parts = lead.map(
    (c) => `${c.name} ${PARTY_SHORT.GOP} ${c.seats.GOP}–${PARTY_SHORT.DEM} ${c.seats.DEM}`,
  );
  return `${parts.join(' · ')} · ${f.racesCalled}/${f.racesTotal} races called`;
}

/** Counts of races by rating lean — for the "ratings" bar before results exist. */
export function ratingLean(races: Race[]): { dem: number; tossup: number; gop: number } {
  let dem = 0;
  let gop = 0;
  let tossup = 0;
  for (const r of races) {
    if (!r.rating) continue;
    if (r.rating === 'tossup') tossup++;
    else if (r.rating.endsWith('dem')) dem++;
    else gop++;
  }
  return { dem, tossup, gop };
}
