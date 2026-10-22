/**
 * Marathon planner for any watch list (feature idea F15). Reuses the Dunesday
 * scheduler: a member's own (title, minutes) items become film-like titles and
 * `buildPlan` in "fit" mode finds the smallest daily pace that meets the
 * deadline. Pure and client-safe.
 */
import { buildPlan, localToday, type Plan, type Remaining } from './schedule';
import type { WatchTitle } from './titles';

export interface MarathonItem {
  title: string;
  minutes: number;
}

export const itemId = (i: number) => `item-${i}`;

function asTitle(it: MarathonItem, i: number): WatchTitle {
  return {
    id: itemId(i),
    title: it.title,
    franchise: 'extra',
    kind: 'film',
    released: '',
    minutes: it.minutes,
    chrono: i,
    phase: 0,
    essential: false,
    hook: '',
  };
}

export function planMarathon(
  items: readonly MarathonItem[],
  deadline: string,
  today = localToday(),
): Plan {
  const remaining: Remaining[] = items.map((it, i) => ({
    title: asTitle(it, i),
    minutes: it.minutes,
  }));
  return buildPlan(remaining, {
    startDate: today,
    deadline,
    mode: 'fit',
    minutesPerDay: 120,
    weekdayWeights: [1, 1, 1, 1, 1, 1, 1],
    skipDates: [],
    overrunPct: 15,
    splitFilms: false,
  });
}
