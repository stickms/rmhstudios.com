/**
 * Election hub — shared types. Client-safe and pure.
 *
 * The hub is deliberately source-agnostic: `ElectionSnapshot` is OUR shape, and
 * `nyt.ts` is the one adapter that fills it. If the upstream feed moves, the
 * adapter changes and nothing above it does.
 */

export const OFFICES = ['president', 'senate', 'governor', 'house'] as const;
export type Office = (typeof OFFICES)[number];

export type Party = 'DEM' | 'GOP' | 'OTH';

export const RATINGS = [
  'solid-dem',
  'likely-dem',
  'lean-dem',
  'tossup',
  'lean-rep',
  'likely-rep',
  'solid-rep',
] as const;
export type Rating = (typeof RATINGS)[number];

/** upcoming = no votes yet · counting = votes in, no call · called = a winner is projected. */
export type RaceStatus = 'upcoming' | 'counting' | 'called';

export interface Candidate {
  id: string;
  name: string;
  lastName: string;
  party: Party;
  /** The party as the source names it ("Democrat", "Libertarian", …). */
  partyLabel: string;
  incumbent: boolean;
  imageUrl: string | null;
  votes: number;
  /** Share of the votes counted so far, 0–100 (one decimal). */
  pct: number;
  leader: boolean;
  won: boolean;
}

export interface Race {
  id: string;
  office: Office;
  /** USPS postal code, e.g. "PA". */
  state: string;
  stateName: string;
  /** House district number, "AL" for at-large; null for statewide races. */
  district: string | null;
  /** "Senate · Pennsylvania", "House · PA-7" … short, human, unique within an office. */
  label: string;
  /** "General", "Special General", "Runoff" … as the source names it. */
  type: string;
  special: boolean;
  rating: Rating | null;
  status: RaceStatus;
  /** Party of the projected winner, once called. */
  winnerParty: Party | null;
  /** The projected winner took the seat from the other party. */
  flipped: boolean;
  /** % of the expected vote in, 0–100, or null before any count. */
  pctReporting: number | null;
  totalVotes: number;
  electoralVotes: number | null;
  candidates: Candidate[];
  /** Leader's share minus runner-up's, in points; null with fewer than two candidates. */
  margin: number | null;
  uncontested: boolean;
  /** ISO time the source last touched this race. */
  updatedAt: string | null;
  /** The party whose primary this is; null for a general election contest. */
  primaryParty: Party | null;
  /** Who made the call: "ap" from the results feed, or a rule applied to a final official count. */
  calledBy: string[];
  /** Which provider this race came from. */
  source: 'nyt' | 'ncsbe';
  /** A government count for the same race, when one exists (see lib/elections/official.ts). */
  official?: OfficialCheck;
}

/** A state election board's own count for a race, set beside the results feed's. */
export interface OfficialCheck {
  /** Display name, e.g. "NC State Board of Elections". */
  source: string;
  totalVotes: number;
  /** Votes by candidate last name (lower-case). */
  votes: Record<string, number>;
  /**
   * Largest per-candidate gap between the two counts as a share of the race's votes, in points
   * (0–100). Null when the two counts cannot be compared.
   */
  deltaPts: number | null;
  /** The two counts agree to within `OFFICIAL_TOLERANCE_PTS`. */
  agrees: boolean;
}

export interface ChamberControl {
  office: Office;
  /** Seats in the body (435 House, 100 Senate, 50 governorships). */
  total: number;
  /** Seats on the ballot. */
  seatsUp: number;
  /** Seats each party holds or has won so far (not-up seats included). */
  seats: Record<Party, number>;
  /** Seats each party holds that are NOT on the ballot. */
  notUp: Record<Party, number>;
  /** Seats each party held going in. */
  before: Record<Party, number>;
  /** Seats needed for control. */
  toWin: number;
  racesCalled: number;
  /** Net seats changed hands so far. */
  flips: Record<Party, number>;
  /** Who has crossed `toWin`, if anyone. */
  controlledBy: Party | null;
  /**
   * True when the source gave no tally for this body and `seats` counts only the
   * races called so far (no holdovers) — the UI must say "called so far".
   */
  derived: boolean;
}

export interface PollClosing {
  /** ISO instant the last polls in the state close. */
  iso: string;
  /** "7 p.m." — Eastern, as the source prints it. */
  displayET: string;
}

export type SnapshotSource = 'nyt' | 'official' | 'calendar';

export interface ElectionSnapshot {
  /** Election day, YYYY-MM-DD. */
  date: string;
  /** `general` carries chamber control and predictions; `other` (a primary, runoff, special) is races only. */
  kind: 'general' | 'other';
  source: SnapshotSource;
  /** ISO — when WE fetched. */
  fetchedAt: string;
  /** ISO — when the source says it last updated, if it does. */
  sourceUpdatedAt: string | null;
  /** Any votes counted anywhere. */
  live: boolean;
  chambers: Partial<Record<Office, ChamberControl>>;
  races: Race[];
  /** Keyed by USPS postal code. */
  pollClosings: Record<string, PollClosing>;
  /** Offices the source had no page for (yet) — rendered as "awaiting ballots". */
  missing: Office[];
  /** Display names of every provider that contributed, for attribution in the footer. */
  providers: string[];
}

export const PARTY_NAME: Record<Party, string> = {
  DEM: 'Democrats',
  GOP: 'Republicans',
  OTH: 'Independents',
};

export const PARTY_SHORT: Record<Party, string> = { DEM: 'Dem', GOP: 'GOP', OTH: 'Ind' };

export const OFFICE_NAME: Record<Office, string> = {
  president: 'President',
  senate: 'Senate',
  governor: 'Governors',
  house: 'House',
};
