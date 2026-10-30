/**
 * Teams (REF-01, REF-07, A1 §4.1, §4.3; D-13).
 *
 * - Assignment: a planned A/B pick (the roster's team) is kept; unpicked
 *   players are assigned one at a time, in roster order, to the team with
 *   fewer members (ties → A). Uneven picks (3v1) are allowed (D-13).
 * - Card targets (per ante): each alive member of a team targets an alive
 *   member of the other team, rotating with the ante —
 *   `opp[(myIndex + ante − 1) mod |opp|]` — or '' when the other team has
 *   nobody alive. (A1 names the message but not the rule; this is ours.)
 */

import type { Id, RosterEntry } from '../types';

export type TeamAB = 'A' | 'B';

export function assignTeams(roster: readonly RosterEntry[]): Record<Id, TeamAB> {
  const out: Record<Id, TeamAB> = {};
  let a = 0;
  let b = 0;
  for (const r of roster) {
    if (r.team === 'A') a++;
    if (r.team === 'B') b++;
  }
  for (const r of roster) {
    if (r.team === 'A' || r.team === 'B') {
      out[r.id] = r.team;
      continue;
    }
    if (a <= b) {
      out[r.id] = 'A';
      a++;
    } else {
      out[r.id] = 'B';
      b++;
    }
  }
  return out;
}

export function otherTeam(t: TeamAB): TeamAB {
  return t === 'A' ? 'B' : 'A';
}

export function teamCardTargets(
  order: readonly Id[],
  teamOf: (id: Id) => TeamAB | undefined,
  alive: (id: Id) => boolean,
  ante: number,
): Record<Id, Id | ''> {
  const members: Record<TeamAB, Id[]> = { A: [], B: [] };
  for (const id of order) {
    const t = teamOf(id);
    if (t && alive(id)) members[t].push(id);
  }
  const out: Record<Id, Id | ''> = {};
  for (const t of ['A', 'B'] as const) {
    const opp = members[otherTeam(t)];
    members[t].forEach((id, i) => {
      out[id] =
        opp.length === 0
          ? ''
          : (opp[(((i + ante - 1) % opp.length) + opp.length) % opp.length] as Id);
    });
  }
  // Roster order for a stable message.
  const ordered: Record<Id, Id | ''> = {};
  for (const id of order) if (id in out) ordered[id] = out[id] as Id | '';
  return ordered;
}
