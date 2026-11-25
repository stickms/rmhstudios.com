/**
 * RMHLadder on the member's calendar (sprint 13, feature 09) — pure.
 *
 * With "Show on my calendar" on, a member's interviews, follow-ups and the deadlines of the jobs they track appear in
 * `/calendar` "Yours" and in the private calendar feed. This module turns applications into entries: which ones, what
 * they say, the stable UIDs, and the day an all-day entry falls on in the member's RMHLadder time zone.
 *
 * What an entry says is the one privacy rule here. A calendar provider stores the feed's text and the feed URL is a
 * bearer credential, so an entry carries a title and a link and nothing else: never an application's notes, contact
 * e-mail, referral name or pay. `LadderCalendarApplication` does not even have those fields, so a caller cannot pass
 * them in by accident.
 */
import { dayOf, isValidTimeZone } from '@/lib/calendar/tz';

/** Applications the member has closed out; their dates are not on the calendar. */
export const LADDER_CALENDAR_EXCLUDED_STATUSES = ['rejected', 'withdrawn'] as const;

export const LADDER_CALENDAR_DEFAULT_TZ = 'America/New_York';

/** The page every entry links to. */
export const LADDER_CALENDAR_HREF = '/rmhladder/pipeline';

/** An interview is entered as this long (the application stores a start only). */
export const LADDER_INTERVIEW_MINUTES = 30;

/** The longest title or company the entry carries (an own job's title is member-written). */
const PART_MAX = 120;

export type LadderCalendarKind = 'interview' | 'followup' | 'deadline';

/** The fields of an application the calendar reads: dates and names, no private field. */
export interface LadderCalendarApplication {
  id: string;
  status: string;
  updatedAt: Date;
  followUpDate: Date | null;
  interviewDates: Date[];
  job: {
    id: string;
    title: string;
    applicationDeadline: Date | null;
    /**
     * `LadderJob` has no `updatedAt`. The scraper writes `lastSeenAt` in the same write that stores a deadline it
     * found, and an own job (no scrape) has `lastSeenAt` null: its edit touches the member's application instead.
     */
    lastSeenAt: Date | null;
    discoveredAt: Date;
    company: { name: string };
  };
}

export interface LadderCalendarEntry {
  /** The stable UID base (`ladder-interview-<applicationId>-<n>`, …); the feed appends the domain. */
  uid: string;
  kind: LadderCalendarKind;
  /** "Interview: {{title}} at {{company}}" and its siblings, in English like the rest of the feed. */
  title: string;
  /** The instant of an interview; for an all-day entry, noon UTC on its day (a bucket key, never shown as a time). */
  startsAt: Date;
  endsAt: Date;
  /** `YYYY-MM-DD` in the member's zone for a follow-up or deadline; null for an interview. */
  allDay: string | null;
  href: string;
  /** Rises whenever the application or job changes, so a subscribed calendar replaces the entry it holds. */
  sequence: number;
}

export const ladderInterviewUid = (applicationId: string, index: number) =>
  `ladder-interview-${applicationId}-${index}`;
export const ladderFollowUpUid = (applicationId: string) => `ladder-followup-${applicationId}`;
export const ladderDeadlineUid = (jobId: string) => `ladder-deadline-${jobId}`;

const clip = (s: string) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > PART_MAX ? `${one.slice(0, PART_MAX - 1)}…` : one;
};

const seq = (...dates: Date[]) => Math.floor(Math.max(...dates.map((d) => d.getTime())) / 1000);

/** The member's zone, or the default when the stored one is not a zone this runtime knows. */
export function ladderCalendarZone(timezone: string | null | undefined): string {
  return timezone && isValidTimeZone(timezone) ? timezone : LADDER_CALENDAR_DEFAULT_TZ;
}

/** Noon UTC of a `YYYY-MM-DD`: lands in that day's UTC bucket whatever the viewer's zone. */
function noonUtc(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 12));
}

/**
 * The entries for a window. An interview is in when its instant is in `[from, to]`; a follow-up or deadline when the
 * day it falls on in `timezone` is a day of the window as seen in that zone. Rejected and withdrawn applications are
 * left out. Sorted by time, then UID.
 */
export function ladderCalendarEntries(
  applications: LadderCalendarApplication[],
  timezone: string | null | undefined,
  from: Date,
  to: Date,
): LadderCalendarEntry[] {
  const tz = ladderCalendarZone(timezone);
  const firstDay = dayOf(from.getTime(), tz);
  const lastDay = dayOf(to.getTime(), tz);
  const excluded = new Set<string>(LADDER_CALENDAR_EXCLUDED_STATUSES);
  const entries: LadderCalendarEntry[] = [];

  for (const app of applications) {
    if (excluded.has(app.status)) continue;
    const label = `${clip(app.job.title)} at ${clip(app.job.company.name)}`;
    const sequence = seq(app.updatedAt);

    // The index is the position in the stored array, so moving an interview keeps its UID.
    app.interviewDates.forEach((at, index) => {
      if (at < from || at > to) return;
      entries.push({
        uid: ladderInterviewUid(app.id, index),
        kind: 'interview',
        title: `Interview: ${label}`,
        startsAt: at,
        endsAt: new Date(at.getTime() + LADDER_INTERVIEW_MINUTES * 60_000),
        allDay: null,
        href: LADDER_CALENDAR_HREF,
        sequence,
      });
    });

    const allDay = (uid: string, kind: LadderCalendarKind, prefix: string, at: Date | null, sequence: number) => {
      if (!at) return;
      const day = dayOf(at.getTime(), tz);
      if (day < firstDay || day > lastDay) return;
      const startsAt = noonUtc(day);
      entries.push({
        uid,
        kind,
        title: `${prefix}: ${label}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 86_400_000),
        allDay: day,
        href: LADDER_CALENDAR_HREF,
        sequence,
      });
    };
    allDay(ladderFollowUpUid(app.id), 'followup', 'Follow up', app.followUpDate, sequence);
    // The deadline is the job's, so its sequence also follows the job's last write (see `job.lastSeenAt`).
    const deadlineSequence = seq(app.updatedAt, app.job.lastSeenAt ?? app.job.discoveredAt);
    allDay(ladderDeadlineUid(app.job.id), 'deadline', 'Deadline', app.job.applicationDeadline, deadlineSequence);
  }

  return entries.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || (a.uid < b.uid ? -1 : 1));
}
