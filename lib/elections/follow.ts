/**
 * Auto-follow: deciding what a "follow the action" pane should show next.
 * Pure and client-safe — the hook that drives it is a thin timer around `nextFollowTarget`.
 *
 * Rules a viewer would want, in order:
 *  1. Only events the pane's mode cares about can move it (`matchesFollow`).
 *  2. An event must point at something we can show (a race we have).
 *  3. Don't thrash: after a switch, hold for DWELL_MS before the next ordinary one. A MAJOR event
 *     (a flip, a Senate call, a chamber clinch) may cut in sooner, after MAJOR_DWELL_MS, so two
 *     big calls a few seconds apart both get seen but never flicker.
 *  4. An event that arrives during the hold is not lost: it is returned as `deferred` and the
 *     caller shows it when the hold ends (latest one wins).
 */

import { matchesFollow, type ElectionEvent, type FollowMode } from './events';
import type { Office, Race } from './types';

export const DWELL_MS = 20_000;
export const MAJOR_DWELL_MS = 8_000;

export interface FollowTarget {
  state: string;
  office: Office;
  raceId: string | null;
  /** The event text that moved the pane — shown as "Following: …". */
  reason: string;
  /** When the pane switched (epoch ms). */
  at: number;
  importance: 1 | 2 | 3;
}

/** Which office to show first when an event names only a state. */
const OFFICE_RANK: Record<Office, number> = { senate: 0, governor: 1, president: 2, house: 3 };

/** The most interesting race in a state: the preferred office if it has one, else Senate > Governor > President > House. */
export function pickRaceForState(
  races: Race[],
  state: string,
  prefer: Office = 'senate',
): Race | null {
  const inState = races.filter((r) => r.state === state);
  if (!inState.length) return null;
  const rank = (r: Race) => (r.office === prefer ? -1 : OFFICE_RANK[r.office]);
  // Uncalled before called (the live one is the story), then by rank, then closest.
  return [...inState].sort(
    (a, b) =>
      Number(a.status === 'called') - Number(b.status === 'called') ||
      rank(a) - rank(b) ||
      (a.margin ?? 99) - (b.margin ?? 99),
  )[0];
}

/** The race an event is about. */
export function raceForEvent(
  ev: ElectionEvent,
  races: Race[],
  prefer: Office = 'senate',
): Race | null {
  if (ev.raceId) {
    const exact = races.find((r) => r.id === ev.raceId);
    if (exact) return exact;
  }
  return ev.state ? pickRaceForState(races, ev.state, ev.office ?? prefer) : null;
}

export interface FollowStep {
  target: FollowTarget | null;
  /** The event was valid but arrived inside the hold: show it at `retryAt`. */
  deferred: { event: ElectionEvent; retryAt: number } | null;
}

export function nextFollowTarget(
  prev: FollowTarget | null,
  ev: ElectionEvent,
  races: Race[],
  mode: FollowMode,
  now: number,
  prefer: Office = 'senate',
): FollowStep {
  const keep: FollowStep = { target: prev, deferred: null };
  if (!matchesFollow(ev, mode)) return keep;
  const race = raceForEvent(ev, races, prefer);
  if (!race) return keep;
  if (prev && prev.raceId === race.id) {
    // Already showing it: just refresh the reason (a call after a lead change on the same race).
    return {
      target: {
        ...prev,
        reason: ev.text,
        importance: Math.max(prev.importance, ev.importance) as 1 | 2 | 3,
      },
      deferred: null,
    };
  }
  if (prev) {
    const hold = ev.importance >= 3 ? MAJOR_DWELL_MS : DWELL_MS;
    const since = now - prev.at;
    if (since < hold) return { target: prev, deferred: { event: ev, retryAt: prev.at + hold } };
  }
  return {
    target: {
      state: race.state,
      office: race.office,
      raceId: race.id,
      reason: ev.text,
      at: now,
      importance: ev.importance,
    },
    deferred: null,
  };
}
