/**
 * Turning a stream of snapshots into discrete, human-readable EVENTS — "AP calls
 * Georgia", "lead flips in Michigan", "polls close in Ohio" — pure and client-safe.
 *
 * Events are what the watch room's auto-follow reacts to and what the ticker
 * reads out. They are derived by DIFFING two consecutive snapshots, so they are
 * facts about what changed, never guesses about what will. IDs are deterministic
 * (`call:<raceId>`, `closed:<date>:<state>`), so two web instances that each
 * observe the same change publish the same id and every consumer de-duplicates.
 */

import type {
  ChamberControl,
  ElectionSnapshot,
  Office,
  Party,
  PollClosing,
  Race,
} from './types';
import {
  OFFICE_NAME,
  PARTY_SHORT,
} from './types';

export type ElectionEventKind =
  | 'call'
  | 'flip'
  | 'lead-change'
  | 'polls-closed'
  | 'clinch'
  | 'news';

export interface ElectionEvent {
  id: string;
  /** Epoch ms. */
  at: number;
  /** Election Day the event belongs to (the room key). */
  date: string;
  kind: ElectionEventKind;
  /** 1 = background, 2 = notable, 3 = major. Auto-follow filters on this. */
  importance:
    | 1
    | 2
    | 3;
  text: string;
  state?: string;
  raceId?: string;
  office?: Office;
  party?: Party | null;
  /** Link for `news` events. */
  url?: string;
  /**
   * Set by the CLIENT, never the server: true for an event that arrived live over the stream, false for
   * one that came in the initial history batch. Auto-follow acts only on fresh events, so opening a
   * room mid-night never replays the evening.
   */
  fresh?: boolean;
}

/** A lead change only means something once real votes are in; below this it is noise. */
export const MIN_REPORTING_FOR_LEAD_CHANGE = 5;

const calledByWord =
  (
    r: Race,
  ): string =>
    r.calledBy.includes(
      'ap',
    )
      ? 'AP calls'
      : r.calledBy.some(
            (
              c,
            ) =>
              c.endsWith(
                '-final',
              ),
          )
        ? 'Final count:'
        : 'Called:';

const weight =
  (
    r: Race,
  ):
    | 2
    | 3 =>
    r.office ===
      'house' &&
    !r.flipped
      ? 2
      : 3;

function leaderOf(
  r: Race,
) {
  return (
    r.candidates.find(
      (
        c,
      ) =>
        c.won,
    ) ??
    r.candidates.find(
      (
        c,
      ) =>
        c.leader,
    ) ??
    null
  );
}

const nameOf =
  (c: {
    name: string;
    party: Party;
  }) =>
    `${c.name} (${PARTY_SHORT[c.party]})`;

/** Events that happened between `prev` and `next` (same Election Day). */
export function diffSnapshots(
  prev: ElectionSnapshot,
  next: ElectionSnapshot,
  at: number = Date.now(),
): ElectionEvent[] {
  const out: ElectionEvent[] =
    [];
  const before =
    new Map(
      prev.races.map(
        (
          r,
        ) => [
          r.id,
          r,
        ],
      ),
    );

  for (const r of next.races) {
    const p =
      before.get(
        r.id,
      );
    if (
      !p
    )
      continue;

    if (
      p.status !==
        'called' &&
      r.status ===
        'called'
    ) {
      const w =
        r.candidates.find(
          (
            c,
          ) =>
            c.won,
        ) ??
        leaderOf(
          r,
        );
      if (
        !w
      )
        continue;
      out.push(
        {
          id: `${r.flipped ? 'flip' : 'call'}:${r.id}`,
          at,
          date: next.date,
          kind: r.flipped
            ? 'flip'
            : 'call',
          importance:
            weight(
              r,
            ),
          text: r.flipped
            ? `${calledByWord(r)} ${r.label} — ${nameOf(w)} wins, a flip`
            : `${calledByWord(r)} ${r.label} — ${nameOf(w)} wins`,
          state:
            r.state,
          raceId:
            r.id,
          office:
            r.office,
          party:
            w.party,
        },
      );
      continue;
    }

    // Lead change: both sides counting, a different leader, and enough votes in to mean it.
    if (
      p.status ===
        'counting' &&
      r.status ===
        'counting' &&
      (r.pctReporting ??
        0) >=
        MIN_REPORTING_FOR_LEAD_CHANGE
    ) {
      const a =
        leaderOf(
          p,
        );
      const b =
        leaderOf(
          r,
        );
      if (
        a &&
        b &&
        a.id !==
          b.id
      ) {
        out.push(
          {
            id: `lead:${r.id}:${b.id}:${Math.floor(at / 60_000)}`,
            at,
            date: next.date,
            kind: 'lead-change',
            importance:
              r.office ===
              'house'
                ? 1
                : 2,
            text: `${r.label} — ${nameOf(b)} takes the lead (${Math.round(r.pctReporting ?? 0)}% in)`,
            state:
              r.state,
            raceId:
              r.id,
            office:
              r.office,
            party:
              b.party,
          },
        );
      }
    }
  }

  for (const office of Object.keys(
    next.chambers,
  ) as Office[]) {
    const n:
      | ChamberControl
      | undefined =
      next
        .chambers[
        office
      ];
    const p:
      | ChamberControl
      | undefined =
      prev
        .chambers[
        office
      ];
    if (
      n &&
      !n.derived &&
      n.controlledBy &&
      p?.controlledBy !==
        n.controlledBy
    ) {
      out.push(
        {
          id: `clinch:${next.date}:${office}:${n.controlledBy}`,
          at,
          date: next.date,
          kind: 'clinch',
          importance: 3,
          text: `${PARTY_SHORT[n.controlledBy]} clinches control of the ${OFFICE_NAME[office]}`,
          office,
          party:
            n.controlledBy,
        },
      );
    }
  }
  return out;
}

/**
 * Polls-closed events. Called every refresh with the set of states already announced; returns events
 * for newly-closed states and the updated set. A state that closed long ago (a cold start mid-night)
 * is recorded but NOT announced, so a restart never replays the evening.
 */
export function closedPollEvents(
  date: string,
  closings: Record<
    string,
    PollClosing
  >,
  announced: ReadonlySet<string>,
  now: number,
  hasStatewideRace: (
    state: string,
  ) => boolean = () =>
    false,
  freshMs = 15 *
    60_000,
): {
  events: ElectionEvent[];
  announced: Set<string>;
} {
  const seen =
    new Set(
      announced,
    );
  const events: ElectionEvent[] =
    [];
  for (const [
    state,
    c,
  ] of Object.entries(
    closings,
  )) {
    const t =
      Date.parse(
        c.iso,
      );
    if (
      !Number.isFinite(
        t,
      ) ||
      t >
        now ||
      seen.has(
        state,
      )
    )
      continue;
    seen.add(
      state,
    );
    if (
      now -
        t >
      freshMs
    )
      continue;
    events.push(
      {
        id: `closed:${date}:${state}`,
        at: t,
        date,
        kind: 'polls-closed',
        importance:
          hasStatewideRace(
            state,
          )
            ? 2
            : 1,
        text: `Polls have closed in ${state}${c.displayET ? ` (${c.displayET} ET)` : ''}`,
        state,
      },
    );
  }
  return {
    events,
    announced:
      seen,
  };
}

/** What auto-follow listens for. */
export type FollowMode =
  | 'off'
  | 'major'
  | 'calls'
  | 'closings'
  | 'all';

export function matchesFollow(
  ev: ElectionEvent,
  mode: FollowMode,
): boolean {
  if (
    !ev.state &&
    !ev.raceId
  )
    return false; // nothing to point a pane at
  switch (
    mode
  ) {
    case 'off':
      return false;
    case 'major':
      return (
        ev.importance >=
        3
      );
    case 'calls':
      return (
        ev.kind ===
          'call' ||
        ev.kind ===
          'flip'
      );
    case 'closings':
      return (
        ev.kind ===
        'polls-closed'
      );
    case 'all':
      return (
        ev.kind !==
        'news'
      );
  }
}

/** Keep a ring of events: newest last, unique by id, bounded. */
export function pushEvents(
  ring: ElectionEvent[],
  incoming: ElectionEvent[],
  cap = 200,
): ElectionEvent[] {
  const ids =
    new Set(
      ring.map(
        (
          e,
        ) =>
          e.id,
      ),
    );
  const next =
    [
      ...ring,
    ];
  for (const e of incoming) {
    if (
      ids.has(
        e.id,
      )
    )
      continue;
    ids.add(
      e.id,
    );
    next.push(
      e,
    );
  }
  next.sort(
    (
      a,
      b,
    ) =>
      a.at -
      b.at,
  );
  return next.length >
    cap
    ? next.slice(
        next.length -
          cap,
      )
    : next;
}
