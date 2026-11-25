import type { MilestoneType } from '../../engine/tracker';
import type { MedEventTypeId } from '../../medschools.contract';

/**
 * The status vocabulary of the redesign (owner 2026-11-24): one key per colour a decision or update is drawn in, with
 * its token trio, its icon and its label. Pure and client-safe; `StatusIcon` and `StatusText` read it.
 *
 *  - acceptance green, rejection red, hold dark purple, secondary orange, waitlist yellow, matriculation rose,
 *    interview light blue, withdrawn neutral (muted ink).
 *  - The public feed's `SECONDARY` is "secondary RECEIVED" (the school sent one; sources report it that way and the
 *    tracker's `SECONDARY` milestone is "Secondary received"), so it reads "Secondary". The private `SECONDARY_SUBMITTED`
 *    milestone is the same hue and reads "Secondary submitted"; colour is never the only cue, the label always prints.
 *  - Every colour is a `--app-med-*` token pair in `medschools.css` (`swatch` the disc, `ink` the icon on it, `text` the
 *    words); `status.test.ts` holds their contrast from the CSS itself.
 */
export type StatusKey =
  'acceptance' | 'rejection' | 'hold' | 'secondary' | 'waitlist' | 'matriculation' | 'interview' | 'withdrawn';

export interface StatusDef {
  /** The token stem: `--app-med-<stem>-{swatch,ink,text}`. */
  stem: string;
  /** A 24x24 stroke path (the approved mockup's icons). */
  icon: string;
  /** The i18n key of the default label, in `medschools`. */
  labelKey: string;
  labelDefault: string;
}

export const STATUS: Record<StatusKey, StatusDef> = {
  acceptance: { stem: 'accept', icon: 'M5 12l5 5 9-10', labelKey: 'event-acceptance', labelDefault: 'Acceptance' },
  rejection: { stem: 'reject', icon: 'M6 6l12 12M18 6L6 18', labelKey: 'event-rejection', labelDefault: 'Rejection' },
  hold: { stem: 'hold', icon: 'M9 6v12M15 6v12', labelKey: 'event-hold', labelDefault: 'Hold' },
  secondary: {
    stem: 'secondary',
    icon: 'M4 6h16v12H4zM4 7l8 6 8-6',
    labelKey: 'event-secondary',
    labelDefault: 'Secondary',
  },
  waitlist: {
    stem: 'waitlist',
    icon: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
    labelKey: 'event-waitlist',
    labelDefault: 'Waitlist',
  },
  matriculation: {
    stem: 'matric',
    icon: 'M3 10l9-5 9 5-9 5-9-5zM7 12v4c3 2 7 2 10 0v-4',
    labelKey: 'tracker-milestone-matriculated',
    labelDefault: 'Matriculating',
  },
  interview: {
    stem: 'interview',
    icon: 'M4 5h16v10H8l-4 4z',
    labelKey: 'event-interview',
    labelDefault: 'Interview invite',
  },
  withdrawn: {
    stem: 'withdrawn',
    icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 12h8',
    labelKey: 'event-withdrawn',
    labelDefault: 'Withdrawn',
  },
};

export const STATUS_KEYS = Object.keys(STATUS) as StatusKey[];

/** A public event type's status. Every event type has one. */
export function statusOfEvent(type: MedEventTypeId): StatusKey {
  switch (type) {
    case 'ACCEPTANCE':
      return 'acceptance';
    case 'REJECTION':
      return 'rejection';
    case 'HOLD':
      return 'hold';
    case 'SECONDARY':
      return 'secondary';
    case 'WAITLIST':
      return 'waitlist';
    case 'INTERVIEW':
      return 'interview';
    case 'WITHDRAWN':
      return 'withdrawn';
  }
}

/** A tracker milestone's status, or null for the two plain steps (submitted, complete), which have no colour. */
export function statusOfMilestone(type: MilestoneType): StatusKey | null {
  switch (type) {
    case 'SUBMITTED':
    case 'COMPLETE':
      return null;
    case 'SECONDARY_SUBMITTED':
      return 'secondary';
    case 'MATRICULATED':
      return 'matriculation';
    default:
      return statusOfEvent(type);
  }
}
