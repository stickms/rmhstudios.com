/**
 * Match times and deadlines in tournaments (s07-06): the pure rules. No I/O;
 * `scheduling.server.ts` applies them under the match lock.
 *
 * A host may give every match a deadline (a number of hours from the moment the
 * match becomes ready). The two entrants agree a time inside it by proposing and
 * accepting. A match still open after its deadline is "overdue": the host may
 * award it to one entrant (a walkover) - never automatically, because a result
 * moves payouts. Times are UTC instants; the viewer's time zone is applied only
 * when one is shown.
 */

/** The deadlines a host can pick: hours from the match becoming ready (none = null). */
export const DEADLINE_HOURS = [24, 48, 72, 168] as const;
export type DeadlineHours = (typeof DEADLINE_HOURS)[number];

export function isDeadlineHours(v: unknown): v is DeadlineHours {
  return typeof v === 'number' && (DEADLINE_HOURS as readonly number[]).includes(v);
}

const HOUR_MS = 3_600_000;

/** The reminder before an agreed time. */
export const REMIND_BEFORE_MINUTES = 60;
/** The deadline notice goes this long before `deadlineAt`. */
export const DEADLINE_NOTICE_HOURS = 12;
/** A proposal can name a time at most this far ahead (a year), whatever the deadline. */
export const MAX_PROPOSAL_AHEAD_MS = 366 * 24 * HOUR_MS;

/** `readyAt + hours`, or null when the tournament has no deadline. */
export function deadlineFor(readyAt: Date, hours: number | null | undefined): Date | null {
  if (hours == null || !isDeadlineHours(hours)) return null;
  return new Date(readyAt.getTime() + hours * HOUR_MS);
}

/** The slice of a match the rules read. */
export interface ScheduleMatch {
  state: string;
  entrantAId: string | null;
  entrantBId: string | null;
  deadlineAt: Date | null;
  scheduledAt: Date | null;
  claimedAt: Date | null;
}

const PLAYABLE = ['READY', 'LIVE'] as const;

/** Both entrants are known and the match is waiting for play. A settled or cancelled match ignores scheduling. */
export function isSchedulable(m: Pick<ScheduleMatch, 'state' | 'entrantAId' | 'entrantBId'>): boolean {
  return (PLAYABLE as readonly string[]).includes(m.state) && !!m.entrantAId && !!m.entrantBId;
}

/** Past its deadline with no settled result. */
export function isOverdue(m: ScheduleMatch, now: Date): boolean {
  return isSchedulable(m) && m.deadlineAt != null && now.getTime() > m.deadlineAt.getTime();
}

export type ProposalProblem = 'PAST' | 'AFTER_DEADLINE' | 'TOO_FAR';

/**
 * Whether `at` is an acceptable proposed or set time: ahead of `now`, before the
 * deadline when there is one, and within a year. Null when acceptable.
 */
export function proposalProblem(at: Date, now: Date, deadlineAt: Date | null): ProposalProblem | null {
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return 'PAST';
  if (deadlineAt && at.getTime() > deadlineAt.getTime()) return 'AFTER_DEADLINE';
  if (at.getTime() > now.getTime() + MAX_PROPOSAL_AHEAD_MS) return 'TOO_FAR';
  return null;
}

/** The message a refused time carries (English; the client words it from the code). */
export const PROPOSAL_MESSAGES: Record<ProposalProblem, string> = {
  PAST: 'Pick a time in the future',
  AFTER_DEADLINE: 'Pick a time before the match deadline',
  TOO_FAR: 'Pick a time within the next year',
};

/** The host's "Award match" is offered on an overdue match with no open result claim. */
export function canAward(m: ScheduleMatch, now: Date): boolean {
  return isOverdue(m, now) && m.claimedAt == null;
}

/** When the 60-minute reminder is due, or null when there is no agreed time. */
export function reminderDueAt(scheduledAt: Date | null): Date | null {
  return scheduledAt ? new Date(scheduledAt.getTime() - REMIND_BEFORE_MINUTES * 60_000) : null;
}

/** When the 12-hour deadline notice is due, or null when there is no deadline. */
export function deadlineNoticeDueAt(deadlineAt: Date | null): Date | null {
  return deadlineAt ? new Date(deadlineAt.getTime() - DEADLINE_NOTICE_HOURS * HOUR_MS) : null;
}

/** The match's next agreed time or deadline an entrant should look at, as one word for the row. */
export type SchedulePhase = 'overdue' | 'scheduled' | 'deadline' | 'none';

export function schedulePhase(m: ScheduleMatch, now: Date): SchedulePhase {
  if (!isSchedulable(m)) return 'none';
  if (isOverdue(m, now)) return 'overdue';
  if (m.scheduledAt) return 'scheduled';
  return m.deadlineAt ? 'deadline' : 'none';
}

/**
 * "Your next match": the viewer's earliest open match, preferring an agreed time
 * and then the nearest deadline. Pure over serialised rows.
 */
export function nextMatchFor<
  M extends {
    state: string;
    entrantAId: string | null;
    entrantBId: string | null;
    scheduledAt: string | null;
    deadlineAt: string | null;
    round: number;
    slot: number;
  },
>(matches: readonly M[], myEntrantId: string | null): M | null {
  if (!myEntrantId) return null;
  const mine = matches.filter(
    (m) => isSchedulable(m) && (m.entrantAId === myEntrantId || m.entrantBId === myEntrantId),
  );
  if (mine.length === 0) return null;
  const key = (m: M): [number, number, number, number] => [
    m.scheduledAt ? 0 : 1,
    m.scheduledAt ? Date.parse(m.scheduledAt) : m.deadlineAt ? Date.parse(m.deadlineAt) : Infinity,
    m.round,
    m.slot,
  ];
  return [...mine].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i]! < kb[i]! ? -1 : 1;
    }
    return 0;
  })[0]!;
}

/**
 * Every place a match receives its second entrant (becomes READY), and the call
 * that stamps its deadline there. Held by `match-ready-paths.test.ts`, which scans
 * the sources: a new path that makes a match READY without being listed (and
 * calling its stamp) fails the test. `swiss-flow.ts` is pure and builds no
 * matches; Swiss rounds are persisted by `createSwissRound`.
 */
export const MATCH_READY_PATHS = [
  {
    file: 'lib/tournaments/tournament.server.ts',
    fn: 'startTournament',
    call: 'stampTournamentDeadlines(',
  },
  {
    file: 'lib/tournaments/tournament.server.ts',
    fn: 'createSwissRound',
    call: 'stampTournamentDeadlines(',
  },
  {
    file: 'lib/tournaments/tournament.server.ts',
    fn: 'fillSlot',
    call: 'stampDeadline(',
  },
  {
    file: 'lib/tournaments/tournament.server.ts',
    fn: 'settleMatch',
    call: 'stampDeadline(',
  },
] as const;
