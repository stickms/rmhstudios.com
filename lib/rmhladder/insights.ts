/**
 * RMHLadder search insights, pure (sprint 03, feature 18).
 *
 * Everything is computed from a member's applications and their status-change
 * events. A stage counts as reached when the event history ever entered it (or
 * the application sits in it now), so a later rejection never erases that an
 * application got an interview. Dates leave this module as ISO strings and day
 * keys so the result is plain JSON.
 */
import { addDays, dayOf, parseDay } from '@/lib/calendar/tz';

export type InsightRange = '90d' | '1y' | 'all';

/** A group of applications smaller than this is not compared (too few to mean anything). */
export const MIN_GROUP_SIZE = 5;
/** The funnel needs at least this many applications before the page shows numbers. */
export const MIN_APPLICATIONS = 3;
export const DEFAULT_QUIET_DAYS = 21;
/** Weeks drawn in the per-week charts at most (the latest ones). */
export const MAX_WEEKS = 52;
/** Response-time buckets: weeks 1..5 and "6 or more". */
export const RESPONSE_BUCKETS = 6;

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

export const FUNNEL_STEPS = ['applied', 'responded', 'interviewing', 'final_round', 'offer'] as const;
export type FunnelStepId = (typeof FUNNEL_STEPS)[number];

/** How far up the funnel a status is. Rejected and networking are a response, not a climb. */
const RANK: Record<string, number> = {
  applied: 0,
  networking: 1,
  rejected: 1,
  interviewing: 2,
  final_round: 3,
  offer: 4,
};
/** First moves after `applied` that count as the company answering. */
const RESPONSE_STATUSES = new Set(['networking', 'interviewing', 'final_round', 'offer', 'rejected']);

export interface InsightApplication {
  id: string;
  jobId: string;
  status: string;
  appliedDate: Date | null;
  createdAt: Date;
  referralName: string | null;
  followUpDate: Date | null;
  company: string;
  title: string;
  /** `LadderJob.sourcePlatform`, the kind of source the posting came from. */
  source: string | null;
  programType: string | null;
  /** `LadderOffer.state` when an offer is recorded (feature 17). */
  offerState: string | null;
}

export interface InsightEvent {
  applicationId: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: Date;
}

export interface FunnelStep {
  id: FunnelStepId;
  count: number;
  /** Share of the previous step that reached this one; null for the first step or after an empty one. */
  conversion: number | null;
}

export interface WeekPoint {
  /** The Monday of the week, `YYYY-MM-DD`. */
  weekStart: string;
  applications: number;
  responses: number;
}

export interface BreakdownGroup {
  /** A stored value, or `referral` / `no_referral` for the referral dimension. */
  value: string;
  applications: number;
  /** Null for every rate when the group is under the minimum size. */
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  suppressed: boolean;
}

export type BreakdownDimension = 'referral' | 'source' | 'program';

export interface QuietApplication {
  applicationId: string;
  jobId: string;
  company: string;
  title: string;
  appliedDate: string | null;
  followUpDate: string | null;
  daysQuiet: number;
}

export interface Insights {
  range: InsightRange;
  quietDays: number;
  timeZone: string;
  /** Applications that were sent within the range: the cohort every other number is about. */
  applications: number;
  funnel: FunnelStep[];
  response: {
    /** Applications with a measurable first response. */
    count: number;
    medianDays: number | null;
    p75Days: number | null;
    /** Index 0 is the first week; the last index means that many weeks or more. */
    buckets: number[];
  };
  weeks: WeekPoint[];
  breakdowns: {
    dimension: BreakdownDimension;
    groups: BreakdownGroup[];
  }[];
  quiet: QuietApplication[];
  outcomes: {
    offers: number;
    accepted: number;
    declined: number;
    withdrawn: number;
    rejected: number;
  };
}

/** Start of the range, or null for all time. */
export function rangeStart(range: InsightRange, now: Date): Date | null {
  if (range === 'all') return null;
  return new Date(now.getTime() - (range === '90d' ? 90 : 365) * DAY_MS);
}

/** Linear-interpolated percentile (the usual "type 7"), so the median of an even set is the mean of the middle two. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  const low = sorted[lo] ?? 0;
  const high = sorted[hi] ?? low;
  return low + (high - low) * (at - lo);
}

/** The Monday on or before a `YYYY-MM-DD` day. */
export function weekStartOf(day: string): string {
  const p = parseDay(day);
  if (!p) throw new Error(`bad day: ${day}`);
  const weekday = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

interface History {
  /** Highest funnel rank ever reached; -1 when never applied. */
  rank: number;
  /** Calendar days (`YYYY-MM-DD`): a typed applied date is a date, an event is read in the member's zone. */
  appliedDay: string | null;
  firstResponseDay: string | null;
  /** The last day the application moved to a status other than `applied`. */
  lastMoveDay: string | null;
}

function historyOf(app: InsightApplication, events: readonly InsightEvent[], timeZone: string): History {
  const ordered = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const statuses = [app.status, ...ordered.flatMap((e) => [e.fromStatus, e.toStatus])];
  // Rejected is not a rung: it counts only once the application was sent (below).
  let rank = Math.max(-1, ...statuses.map((status) => (status && status !== 'rejected' ? (RANK[status] ?? -1) : -1)));
  const typedDay = app.appliedDate ? dayOf(app.appliedDate.getTime(), 'UTC') : null;
  const enteredApplied = ordered.find((e) => e.toStatus === 'applied');
  const appliedDay = typedDay ?? (enteredApplied ? dayOf(enteredApplied.createdAt.getTime(), timeZone) : null);
  if (appliedDay !== null && rank < 0) rank = 0;
  if (rank >= 0 && statuses.includes('rejected')) rank = Math.max(rank, RANK.rejected ?? 1);

  const response = ordered.find((e) => e.toStatus && RESPONSE_STATUSES.has(e.toStatus));
  const lastMove = [...ordered].reverse().find((e) => e.toStatus !== 'applied');
  return {
    rank,
    appliedDay,
    firstResponseDay: response ? dayOf(response.createdAt.getTime(), timeZone) : null,
    lastMoveDay: lastMove ? dayOf(lastMove.createdAt.getTime(), timeZone) : null,
  };
}

/** Whole days from one `YYYY-MM-DD` to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) throw new Error(`bad day: ${from} / ${to}`);
  return Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / DAY_MS);
}

function rate(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function funnelOf(ranks: readonly number[]): FunnelStep[] {
  const counts = [
    ranks.filter((r) => r >= 0).length,
    ranks.filter((r) => r >= 1).length,
    ranks.filter((r) => r >= 2).length,
    ranks.filter((r) => r >= 3).length,
    ranks.filter((r) => r >= 4).length,
  ];
  return FUNNEL_STEPS.map((id, i) => {
    const previous = i === 0 ? null : (counts[i - 1] ?? 0);
    return {
      id,
      count: counts[i] ?? 0,
      conversion: previous === null || previous === 0 ? null : (counts[i] ?? 0) / previous,
    };
  });
}

function groupsOf(
  items: readonly {
    key: string;
    rank: number;
  }[],
): BreakdownGroup[] {
  const byKey = new Map<string, number[]>();
  for (const item of items) byKey.set(item.key, [...(byKey.get(item.key) ?? []), item.rank]);
  return [...byKey.entries()]
    .map(([value, ranks]): BreakdownGroup => {
      const suppressed = ranks.length < MIN_GROUP_SIZE;
      return {
        value,
        applications: ranks.length,
        suppressed,
        responseRate: suppressed ? null : rate(ranks.filter((r) => r >= 1).length, ranks.length),
        interviewRate: suppressed ? null : rate(ranks.filter((r) => r >= 2).length, ranks.length),
        offerRate: suppressed ? null : rate(ranks.filter((r) => r >= 4).length, ranks.length),
      };
    })
    .sort((a, b) => b.applications - a.applications || a.value.localeCompare(b.value));
}

export interface ComputeInput {
  applications: readonly InsightApplication[];
  events: readonly InsightEvent[];
  range: InsightRange;
  quietDays: number;
  timeZone: string;
  now: Date;
}

export function computeInsights({ applications, events, range, quietDays, timeZone, now }: ComputeInput): Insights {
  const eventsBy = new Map<string, InsightEvent[]>();
  for (const event of events) {
    eventsBy.set(event.applicationId, [...(eventsBy.get(event.applicationId) ?? []), event]);
  }
  const start = rangeStart(range, now);
  const startDay = start ? dayOf(start.getTime(), timeZone) : null;
  const today = dayOf(now.getTime(), timeZone);
  const all = applications.map((app) => ({
    app,
    history: historyOf(app, eventsBy.get(app.id) ?? [], timeZone),
  }));

  // The cohort: applications sent inside the range.
  const cohort = all.filter(
    ({ history }) =>
      history.rank >= 0 && (startDay === null || (history.appliedDay !== null && history.appliedDay >= startDay)),
  );

  const responseDays: number[] = [];
  const buckets = Array.from(
    {
      length: RESPONSE_BUCKETS,
    },
    () => 0,
  );
  const appliedWeeks = new Map<string, number>();
  const responseWeeks = new Map<string, number>();
  const bump = (map: Map<string, number>, day: string) => {
    const key = weekStartOf(day);
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const { history } of cohort) {
    if (history.appliedDay) bump(appliedWeeks, history.appliedDay);
    if (history.firstResponseDay) bump(responseWeeks, history.firstResponseDay);
    if (history.appliedDay && history.firstResponseDay) {
      const days = daysBetween(history.appliedDay, history.firstResponseDay);
      // A response logged before the applied date (a back-dated application) is not a response time.
      if (days >= 0) {
        responseDays.push(days);
        const bucket = Math.min(Math.floor(days / WEEK_DAYS), RESPONSE_BUCKETS - 1);
        buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      }
    }
  }

  const weekKeys = [...appliedWeeks.keys(), ...responseWeeks.keys()].sort();
  const weeks: WeekPoint[] = [];
  const first = weekKeys[0];
  const lastKey = weekKeys[weekKeys.length - 1];
  if (first && lastKey) {
    for (let key = first; key <= lastKey; key = addDays(key, WEEK_DAYS)) {
      weeks.push({
        weekStart: key,
        applications: appliedWeeks.get(key) ?? 0,
        responses: responseWeeks.get(key) ?? 0,
      });
    }
  }

  const rows = cohort.map(({ app, history }) => ({
    app,
    rank: history.rank,
  }));
  const breakdowns: Insights['breakdowns'] = [];
  const addDimension = (dimension: BreakdownDimension, keyOf: (app: InsightApplication) => string | null) => {
    const keyed = rows.flatMap(({ app, rank }) => {
      const key = keyOf(app);
      return key === null
        ? []
        : [
            {
              key,
              rank,
            },
          ];
    });
    const groups = groupsOf(keyed);
    // One value is nothing to compare against.
    if (groups.length >= 2)
      breakdowns.push({
        dimension,
        groups,
      });
  };
  addDimension('referral', (app) => (app.referralName?.trim() ? 'referral' : 'no_referral'));
  addDimension('source', (app) => app.source);
  addDimension('program', (app) => app.programType);

  const quiet = all
    .filter(({ app }) => app.status === 'applied')
    .flatMap(({ app, history }): QuietApplication[] => {
      // Only a status change is the company answering; editing a note does not end the silence.
      const lastDay =
        [history.appliedDay, history.lastMoveDay]
          .filter((d): d is string => d !== null)
          .sort()
          .pop() ?? dayOf(app.createdAt.getTime(), timeZone);
      const daysQuiet = Math.max(0, daysBetween(lastDay, today));
      if (daysQuiet < quietDays) return [];
      return [
        {
          applicationId: app.id,
          jobId: app.jobId,
          company: app.company,
          title: app.title,
          appliedDate: history.appliedDay,
          followUpDate: app.followUpDate ? dayOf(app.followUpDate.getTime(), 'UTC') : null,
          daysQuiet,
        },
      ];
    })
    .sort((a, b) => b.daysQuiet - a.daysQuiet || a.company.localeCompare(b.company));

  return {
    range,
    quietDays,
    timeZone,
    applications: cohort.length,
    funnel: funnelOf(cohort.map(({ history }) => history.rank)),
    response: {
      count: responseDays.length,
      medianDays: percentile(responseDays, 0.5),
      p75Days: percentile(responseDays, 0.75),
      buckets,
    },
    weeks: weeks.slice(-MAX_WEEKS),
    breakdowns,
    quiet,
    outcomes: {
      offers: cohort.filter(({ app, history }) => history.rank >= 4 || app.offerState !== null).length,
      accepted: cohort.filter(({ app }) => app.offerState === 'accepted').length,
      declined: cohort.filter(({ app }) => app.offerState === 'declined').length,
      withdrawn: cohort.filter(({ app }) => app.status === 'withdrawn').length,
      rejected: cohort.filter(({ app }) => app.status === 'rejected').length,
    },
  };
}
