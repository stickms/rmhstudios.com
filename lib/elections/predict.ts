/**
 * "Paint your map": a visitor's picks for each statewide race, how they share
 * as a URL, what control they imply, and how they score once results exist.
 * Client-safe and pure — picks live in localStorage and the share URL, never in
 * the database (a free, no-account toy; coin markets are the staked version).
 */

import type { ChamberControl, Office, Race } from './types';

export type Call = 'DEM' | 'GOP' | 'TOSS';
export type Picks = Record<string, Call>;

/** Offices a visitor can paint: the statewide ones. */
export const PAINTABLE: Office[] = ['senate', 'governor', 'president'];

/** Short stable key for a race: "PA-G-S", "OH-S_W-S", "WI-G-G" (id minus the date). */
export function raceKey(r: string | { id: string }): string {
  const id = typeof r === 'string' ? r : r.id;
  return id.split('-').slice(0, 3).join('-');
}

export function nextPick(p: Call | undefined): Call | undefined {
  // unpicked → DEM → TOSS → GOP → unpicked
  return p === undefined ? 'DEM' : p === 'DEM' ? 'TOSS' : p === 'TOSS' ? 'GOP' : undefined;
}

const CODE: Record<Call, string> = { DEM: 'd', GOP: 'r', TOSS: 't' };
const DECODE: Record<string, Call> = { d: 'DEM', r: 'GOP', t: 'TOSS' };

/** `PA-G-S.d,OH-S_W-S.r` — URL-safe without encoding. */
export function encodePicks(picks: Picks): string {
  return Object.entries(picks)
    .filter(([, v]) => v in CODE)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}.${CODE[v]}`)
    .join(',');
}

export function decodePicks(raw: string | null | undefined, valid?: Set<string>): Picks {
  const out: Picks = {};
  if (!raw || raw.length > 4000) return out;
  for (const part of raw.split(',')) {
    const i = part.lastIndexOf('.');
    if (i < 1) continue;
    const key = part.slice(0, i);
    const pick = DECODE[part.slice(i + 1)];
    if (!pick || !/^[A-Z]{2}-[A-Z_]+-[A-Z]$/.test(key)) continue;
    if (valid && !valid.has(key)) continue;
    out[key] = pick;
  }
  return out;
}

export interface Projection {
  DEM: number;
  GOP: number;
  /** Seats the visitor left as toss-ups or unpainted. */
  open: number;
  toWin: number;
  /** Who clears `toWin` on the picks alone, if anyone. */
  controlledBy: 'DEM' | 'GOP' | null;
}

/** Holdover seats (not on the ballot) plus the visitor's picks. */
export function project(picks: Picks, races: Race[], chamber: ChamberControl | undefined): Projection {
  let dem = chamber?.notUp.DEM ?? 0;
  let gop = chamber?.notUp.GOP ?? 0;
  let open = 0;
  for (const r of races) {
    const p = picks[raceKey(r)];
    if (p === 'DEM') dem++;
    else if (p === 'GOP') gop++;
    else open++;
  }
  const toWin = chamber?.toWin ?? 0;
  return {
    DEM: dem,
    GOP: gop,
    open,
    toWin,
    controlledBy: toWin && dem >= toWin ? 'DEM' : toWin && gop >= toWin ? 'GOP' : null,
  };
}

export interface Score {
  correct: number;
  wrong: number;
  /** Picked a side, race not called yet. */
  pending: number;
  /** Picked toss-up or left it blank — no claim, no score. */
  abstained: number;
  /** correct / (correct + wrong), 0–100, or null before any scored race. */
  accuracy: number | null;
}

export function scorePicks(picks: Picks, races: Race[]): Score {
  let correct = 0;
  let wrong = 0;
  let pending = 0;
  let abstained = 0;
  for (const r of races) {
    const p = picks[raceKey(r)];
    if (p !== 'DEM' && p !== 'GOP') {
      abstained++;
      continue;
    }
    if (r.status !== 'called' || !r.winnerParty) pending++;
    else if (r.winnerParty === p) correct++;
    else wrong++;
  }
  const scored = correct + wrong;
  return {
    correct,
    wrong,
    pending,
    abstained,
    accuracy: scored ? Math.round((correct / scored) * 100) : null,
  };
}
