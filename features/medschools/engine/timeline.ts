import { dayIndex } from './stats/days';
import { MILESTONE_TYPES, type MilestoneType } from './tracker';
import type { ChanceDto, TrackerApplicationDto } from '../medschools.contract';

/**
 * The personal timeline and the silence check (roadmap item 4). Pure and client-safe: it reads the caller's own tracker
 * rows (`TrackerApplicationDto`) and the `ChanceDto` rows the chances endpoint already returns. It takes no clock and
 * reads nobody else's dates; the only thing about other members is the school's aggregate in `ChanceDto.typical`.
 */

/**
 * Which earlier milestone a step is measured from, first match wins: the first candidate the application has with a
 * date on or before the step. A decision counts from the interview invite, or from complete when there was no invite
 * (a rejection before any interview), and from the secondary submitted date when there is no complete date (owner
 * 2026-11-24). Withdrawn and submitted are not waits.
 */
const MEASURED_FROM: Record<MilestoneType, readonly MilestoneType[]> = {
  SUBMITTED: [],
  COMPLETE: ['SUBMITTED'],
  SECONDARY: ['COMPLETE'],
  SECONDARY_SUBMITTED: ['SECONDARY'],
  INTERVIEW: ['COMPLETE', 'SECONDARY_SUBMITTED'],
  WAITLIST: ['INTERVIEW', 'COMPLETE', 'SECONDARY_SUBMITTED'],
  REJECTION: ['INTERVIEW', 'COMPLETE', 'SECONDARY_SUBMITTED'],
  ACCEPTANCE: ['INTERVIEW', 'COMPLETE', 'SECONDARY_SUBMITTED'],
  MATRICULATED: ['ACCEPTANCE'],
  WITHDRAWN: [],
  HOLD: ['INTERVIEW', 'COMPLETE', 'SECONDARY_SUBMITTED'],
};

export interface TimelineEntry {
  applicationId: string;
  school: TrackerApplicationDto['school'];
  program: TrackerApplicationDto['program'];
  type: MilestoneType;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Days since `since`, or null when the step has no earlier milestone to measure from. */
  waitDays: number | null;
  since: MilestoneType | null;
}

/**
 * Every milestone of the given applications on one line, oldest first (ties: school name, then the tracker's own
 * milestone order), each with its wait since the step before it at the same school.
 */
export function buildTimeline(apps: readonly TrackerApplicationDto[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const app of apps) {
    const dates = new Map(app.milestones.map((m) => [m.type, m.date] as const));
    for (const m of app.milestones) {
      let since: MilestoneType | null = null;
      let waitDays: number | null = null;
      for (const from of MEASURED_FROM[m.type]) {
        const d = dates.get(from);
        if (d === undefined) continue;
        const days = dayIndex(m.date) - dayIndex(d);
        if (days >= 0) {
          since = from;
          waitDays = days;
          break;
        }
      }
      out.push({
        applicationId: app.id,
        school: app.school,
        program: app.program,
        type: m.type,
        date: m.date,
        waitDays,
        since,
      });
    }
  }
  const order = (t: MilestoneType) => MILESTONE_TYPES.indexOf(t);
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.school.name.localeCompare(b.school.name) ||
      a.applicationId.localeCompare(b.applicationId) ||
      order(a.type) - order(b.type),
  );
}

/** Where the member's wait sits against the invites tracked for the school. */
export type SilencePosition = 'before-half' | 'before-most' | 'after-most' | 'beyond-range';

export type Silence =
  | { kind: 'silent'; weeks: number; halfWeek: number; mostWeek: number; lastWeek: number; position: SilencePosition }
  /** Waiting, with no shared curve for this school: say so rather than guess. */
  | { kind: 'thin'; weeks: number }
  /** Waiting, with a curve but no usable range to compare against. */
  | { kind: 'plain'; weeks: number };

/**
 * The silence check for one application, or null when it does not apply (no complete date, not complete yet, an
 * invite, a closing decision: the chance status already says so). `weeks` are whole weeks since complete; the position
 * compares them with the school's weeks directly, so it is exact to the week and no finer (R13).
 */
export function silenceOf(chance: ChanceDto | undefined): Silence | null {
  if (!chance || chance.waitingWeeks === null) return null;
  const weeks = chance.waitingWeeks;
  if (chance.status === 'thin') return { kind: 'thin', weeks };
  if (chance.status !== 'estimate' && chance.status !== 'beyond') return null;
  const t = chance.typical;
  if (!t) return { kind: 'plain', weeks };
  const position: SilencePosition =
    weeks > t.lastWeek
      ? 'beyond-range'
      : weeks < t.halfWeek
        ? 'before-half'
        : weeks <= t.mostWeek
          ? 'before-most'
          : 'after-most';
  return { kind: 'silent', weeks, halfWeek: t.halfWeek, mostWeek: t.mostWeek, lastWeek: t.lastWeek, position };
}
