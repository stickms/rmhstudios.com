import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElectionEvent } from '@/lib/elections/events';
import { nextFollowTarget, pickRaceForState, type FollowTarget } from '@/lib/elections/follow';
import type { RacePane } from '@/lib/elections/room-config';
import type { Office, Race } from '@/lib/elections/types';

/** The most worth-watching race in an office right now: closest live count with real votes in, else the first. */
export function defaultRace(races: Race[], office: Office): Race | null {
  const inOffice = races.filter((r) => r.office === office);
  const live = inOffice
    .filter((r) => r.status === 'counting' && (r.pctReporting ?? 0) >= 5 && r.margin != null)
    .sort((a, b) => (a.margin ?? 99) - (b.margin ?? 99));
  return live[0] ?? inOffice.find((r) => r.status !== 'called') ?? inOffice[0] ?? null;
}

export interface Followed {
  race: Race | null;
  /** Why the pane is showing this race, when it is following the action. */
  reason: string | null;
  /** True when the pane is auto-following and not paused. */
  following: boolean;
  paused: boolean;
  setPaused: (p: boolean) => void;
}

/**
 * What a race/graph pane should show. Three sources, in priority order:
 *  1. auto-follow (the pane's mode, unless the viewer paused it) — moves on events, with a dwell;
 *  2. the pane's own pinned state;
 *  3. the room's shared map selection, else the best live race in the pane's office.
 * History is never replayed: only events stamped `fresh` (arrived live over the stream) can move it.
 */
export function useFollow(
  pane: RacePane,
  races: Race[],
  events: ElectionEvent[],
  selectedState: string | null,
): Followed {
  const [target, setTarget] = useState<FollowTarget | null>(null);
  const [paused, setPaused] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const pending = useRef<{ timer: ReturnType<typeof setTimeout> | null }>({ timer: null });
  const targetRef = useRef<FollowTarget | null>(null);
  const racesRef = useRef(races);
  racesRef.current = races;
  targetRef.current = target;
  const mode = paused ? 'off' : pane.follow;

  useEffect(() => {
    for (const ev of events) {
      if (seen.current.has(ev.id)) continue;
      seen.current.add(ev.id);
      if (!ev.fresh) continue; // history: remembered, never acted on
      const step = nextFollowTarget(
        targetRef.current,
        ev,
        racesRef.current,
        mode,
        Date.now(),
        pane.office,
      );
      if (step.target !== targetRef.current) {
        targetRef.current = step.target;
        setTarget(step.target);
      }
      if (step.deferred) {
        const { event, retryAt } = step.deferred;
        if (pending.current.timer) clearTimeout(pending.current.timer);
        pending.current.timer = setTimeout(
          () => {
            const again = nextFollowTarget(
              targetRef.current,
              event,
              racesRef.current,
              mode,
              Date.now(),
              pane.office,
            );
            if (again.target !== targetRef.current) {
              targetRef.current = again.target;
              setTarget(again.target);
            }
          },
          Math.max(0, retryAt - Date.now()) + 50,
        );
      }
    }
  }, [events, mode, pane.office]);

  useEffect(
    () => () => {
      if (pending.current.timer) clearTimeout(pending.current.timer);
    },
    [],
  );

  return useMemo(() => {
    const following = pane.follow !== 'off' && !paused;
    if (following && target) {
      const race =
        races.find((r) => r.id === target.raceId) ??
        pickRaceForState(races, target.state, target.office);
      if (race) return { race, reason: target.reason, following, paused, setPaused };
    }
    const state = pane.state ?? selectedState;
    const race = state
      ? pickRaceForState(races, state, pane.office)
      : defaultRace(races, pane.office);
    return { race, reason: null, following, paused, setPaused };
  }, [pane.follow, pane.state, pane.office, paused, target, races, selectedState]);
}
