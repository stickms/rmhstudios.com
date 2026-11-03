/**
 * What colour, and what caption, each state tile gets for a given office —
 * derived from races, pure, and shared by the map, the state drawer and the
 * feed card. Client-safe.
 */

import { stateName } from './states';
import type { Office, Party, Race, Rating } from './types';

export type Tone =
  | 'none' // no race this cycle
  | 'DEM' // called
  | 'GOP'
  | 'OTH'
  | 'split' // called, different parties (House, or two Senate seats)
  | 'dem-lead' // counting
  | 'gop-lead'
  | 'tossup' // no votes yet — the rating
  | 'dem-lean'
  | 'gop-lean'
  | 'unrated';

export type Phase = 'none' | 'ratings' | 'counting' | 'called';

export interface StateView {
  postal: string;
  name: string;
  races: Race[];
  tone: Tone;
  phase: Phase;
  /** A few characters under the postal code: "D+3.1", "3D 2R", "TOSS". */
  caption: string;
  /** True when a called race in this state flipped. */
  flipped: boolean;
}

const RATING_CAPTION: Record<Rating, string> = {
  'solid-dem': 'D',
  'likely-dem': 'D+',
  'lean-dem': 'D~',
  tossup: 'TOSS',
  'lean-rep': 'R~',
  'likely-rep': 'R+',
  'solid-rep': 'R',
};

const partyLetter = (p: Party | null) => (p === 'DEM' ? 'D' : p === 'GOP' ? 'R' : 'I');

function ratingTone(r: Rating | null): Tone {
  if (!r) return 'unrated';
  if (r === 'tossup') return 'tossup';
  return r.endsWith('dem') ? 'dem-lean' : 'gop-lean';
}

function leaderOf(r: Race) {
  return r.candidates.find((c) => c.won) ?? r.candidates.find((c) => c.leader) ?? null;
}

function viewFor(postal: string, races: Race[], office: Office): StateView {
  const base = { postal, name: stateName(postal), races, flipped: races.some((r) => r.flipped) };
  if (!races.length) return { ...base, tone: 'none', phase: 'none', caption: '' };

  const called = races.filter((r) => r.status === 'called');
  const counting = races.filter((r) => r.status === 'counting');

  if (office === 'house' && races.length > 1) {
    const d = called.filter((r) => r.winnerParty === 'DEM').length;
    const g = called.filter((r) => r.winnerParty === 'GOP').length;
    const o = called.length - d - g;
    const caption = [d && `${d}D`, g && `${g}R`, o && `${o}I`].filter(Boolean).join(' ');
    if (called.length === races.length) {
      const tone: Tone = d && g ? 'split' : d ? 'DEM' : g ? 'GOP' : 'OTH';
      return { ...base, tone, phase: 'called', caption };
    }
    if (called.length || counting.length) {
      const lean =
        races.filter((r) => (leaderOf(r)?.party ?? null) === 'DEM').length -
        races.filter((r) => (leaderOf(r)?.party ?? null) === 'GOP').length;
      const tone: Tone = lean > 0 ? 'dem-lead' : lean < 0 ? 'gop-lead' : 'tossup';
      return { ...base, tone, phase: 'counting', caption: caption || `${counting.length}…` };
    }
    // Ratings: lean by the count of rated seats.
    const dem = races.filter((r) => r.rating?.endsWith('dem')).length;
    const gop = races.filter((r) => r.rating?.endsWith('rep')).length;
    const toss = races.filter((r) => r.rating === 'tossup').length;
    const tone: Tone = dem > gop ? 'dem-lean' : gop > dem ? 'gop-lean' : toss ? 'tossup' : 'unrated';
    return { ...base, tone, phase: 'ratings', caption: `${races.length} seats` };
  }

  // Statewide races (Senate may have two in a state: a regular and a special).
  if (called.length === races.length) {
    const parties = new Set(called.map((r) => r.winnerParty));
    const only = parties.size === 1 ? [...parties][0] : null;
    const tone: Tone = parties.size > 1 ? 'split' : only === 'DEM' ? 'DEM' : only === 'GOP' ? 'GOP' : 'OTH';
    const r = called[0];
    const lead = leaderOf(r);
    const caption =
      called.length === 1 && lead
        ? `${partyLetter(lead.party)}${r.margin != null ? `+${r.margin.toFixed(1)}` : ''}`
        : 'SPLIT';
    return { ...base, tone, phase: 'called', caption };
  }
  if (counting.length || called.length) {
    const r = counting[0] ?? called[0];
    const lead = leaderOf(r);
    const tone: Tone = lead?.party === 'DEM' ? 'dem-lead' : lead?.party === 'GOP' ? 'gop-lead' : 'tossup';
    return {
      ...base,
      tone,
      phase: 'counting',
      caption: lead ? `${partyLetter(lead.party)}${r.margin != null ? `+${r.margin.toFixed(1)}` : ''}` : '…',
    };
  }
  const rating = races[0].rating;
  return { ...base, tone: ratingTone(rating), phase: 'ratings', caption: rating ? RATING_CAPTION[rating] : '' };
}

/** One view per state that has at least one race in `office`. */
export function buildStateViews(races: Race[], office: Office): Map<string, StateView> {
  const byState = new Map<string, Race[]>();
  for (const r of races) {
    if (r.office !== office) continue;
    const list = byState.get(r.state);
    if (list) list.push(r);
    else byState.set(r.state, [r]);
  }
  const out = new Map<string, StateView>();
  for (const [postal, rs] of byState) out.set(postal, viewFor(postal, rs, office));
  return out;
}

/** The view for a state with no race in this office (a grey tile). */
export function emptyView(postal: string): StateView {
  return { postal, name: stateName(postal), races: [], tone: 'none', phase: 'none', caption: '', flipped: false };
}
