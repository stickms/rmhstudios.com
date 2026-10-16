/** Client-safe view models for the calendar features (K1–K4, F5). */
import type { PollParams } from './poll-slots';

export interface CalPerson {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

export interface PollRespondentView {
  user: CalPerson;
  answers: string;
  required: boolean;
}

export interface PollView {
  id: string;
  title: string;
  description: string;
  params: PollParams;
  creator: CalPerson;
  communityId: string | null;
  groupChatId: string | null;
  communityName: string | null;
  lockedStartMin: number | null;
  lockedEndMin: number | null;
  lockedAt: string | null;
  lockedEventId: string | null;
  createdAt: string;
  /** Required invitees who have not answered yet. */
  pending: CalPerson[];
  respondents: PollRespondentView[];
  viewer: {
    isCreator: boolean;
    /** The viewer's own answers, or null if they have not responded. */
    answers: string | null;
    canLock: boolean;
  };
}

export interface PollListItem {
  id: string;
  title: string;
  role: 'organiser' | 'respondent' | 'invitee';
  lockedStartMin: number | null;
  lastDayMs: number;
  respondentCount: number;
}

export interface OfficeHoursSlotView {
  /** ISO start. */
  startsAt: string;
  endsAt: string;
  /** True when the slot is the viewer's own booking. */
  mine: boolean;
}

export interface OfficeHoursBookingView {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string;
  host: CalPerson;
  guest: CalPerson;
}

export interface OfficeHoursConfigView {
  title: string;
  blurb: string;
  tz: string;
  slotMin: number;
  maxPerWeek: number | null;
  enabled: boolean;
  windows: { weekday: number; startMinute: number; endMinute: number }[];
}

export interface OfficeHoursPublicView {
  host: CalPerson;
  title: string;
  blurb: string;
  tz: string;
  slotMin: number;
  slots: OfficeHoursSlotView[];
  /** Upcoming bookings; only filled for the host, and only their own for a guest. */
  bookings: OfficeHoursBookingView[];
  isHost: boolean;
}

export interface CalendarFeedView {
  enabled: boolean;
  /** Absolute subscribe URL, or null when the feed has never been created. */
  url: string | null;
  slots: { id: string; title: string; startsAt: string; optedIn: boolean }[];
}

export interface StudyBuddyWaitingView {
  requestId: string;
  subject: string;
  lengthMin: number;
  startsAt: string;
  expiresAt: string;
  mode: 'now' | 'slot';
}

export interface StudyBuddyStatus {
  waiting: StudyBuddyWaitingView[];
  matches: StudyBuddyMatchView[];
}

export interface StudyBuddyMatchView {
  id: string;
  roomCode: string;
  subject: string;
  lengthMin: number;
  startsAt: string;
  endsAt: string;
  partner: CalPerson;
}

/** K4 — what a repeating event adds to its DTO. `startsAt` on the DTO is the shown occurrence. */
export interface EventRecurrenceDTO {
  rule: 'W' | 'M';
  tz: string;
  until: string | null;
  /** 0 for the first occurrence. */
  index: number;
  /** Who hosts the shown occurrence (the rotation's pick, else the organiser). */
  occurrenceHost: CalPerson;
  rotation: CalPerson[];
  /** The viewer's standing "every time" RSVP, if any. */
  viewerEveryTime: boolean;
}
