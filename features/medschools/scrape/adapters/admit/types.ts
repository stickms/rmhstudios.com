/**
 * Public, anonymous shapes of the Admit.org connector.
 *
 * The only person-shaped value the adapter ever reads is a feed row's `user_id`, and only to ask Admit one question
 * about it: is the profile marked MD/PhD (spec §4a, ruling P2). It lives in a module-private WeakMap behind a frozen,
 * empty `LookupToken`, so it cannot be stored, logged, hashed, serialized or returned; the one place that can redeem
 * a token is `redeemLookupToken`, which `client.ts` calls to build the md_phd request. Nothing here is re-exported by
 * `index.ts` except the types.
 */
import type { MedEventType, MedProgram, MedResidence, NormalizedEvent } from '../../../engine/types';

declare const lookupTokenBrand: unique symbol;

/** Opaque handle to one feed row's author, redeemable only for the md_phd flag. Serializes to `{}`. */
export type LookupToken = Readonly<{
  readonly [lookupTokenBrand]: true;
}>;

/** What Admit says about a user's MD/PhD flag. UNREADABLE = the profile does not exist or is hidden. */
export type ProgramFlag = 'PHD' | 'REG' | 'UNREADABLE';

export interface FeedItem {
  /** `event.dedupeHash` is the per-update key, used only for a row with no author (see `keyFor`). */
  event: NormalizedEvent;
  /** `null` when the row carries no author: its program is unreadable and no lookup is made. */
  lookup: LookupToken | null;
  /**
   * The event's dedupe key once its school is resolved: `hash(admit:author:<user id>:<schoolId>:<cycleYear>:<type>)`,
   * so one member counts once per event type per school per cycle across the live feed and the history backfill. The
   * user id is captured here, in the adapter, and never leaves it; a row with no author falls back to the per-update key.
   */
  keyFor(schoolId: string): string;
}

/** One dated event from a member's profile history, anonymous like a feed event. */
export interface HistoryEvent {
  schoolKey: string;
  cycleYear: number;
  eventType: MedEventType;
  occurredAt: Date;
  /** Same member key as `FeedItem.keyFor`, so the feed and the history never count one report twice. */
  keyFor(schoolId: string): string;
}

/** What one profile lookup yields: the program flag and the member's history events. */
export interface AdmitProfile {
  flag: ProgramFlag;
  history: HistoryEvent[];
  /** History entries dropped: unknown decision, missing or bad date, future date. */
  skipped: { unknownDecision: number; badDate: number; malformedEntries: number };
}

export interface AdmitSchoolRef {
  slug: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  avgDifficulty: number | null;
  interviewCount: number;
  /** `null` = Admit published no total (unknown, not zero). */
  totalInterviewCount: number | null;
}

export interface NormalizedAdmitProfile {
  schoolKey: string;
  format: string | null;
  fileType: string | null;
  avgDifficulty: number | null;
  interviewCount: number | null;
  positive: string[];
  negative: string[];
  before: string[];
}

export interface NormalizedAdmitQuestion {
  schoolKey: string;
  text: string;
  votes: number | null;
  dedupeHash: string;
}

export interface NormalizedAdmitStats {
  schoolKey: string;
  residence: MedResidence;
  /** The row's own lowercase `residence_type` as published; the run maps it explicitly and skips a mismatch. */
  residenceType: string | null;
  applicationCount: number;
  interviewCount: number;
  admittedCount: number | null;
  /** Fractions 0-1, as published. */
  applicationToInterviewPct: number | null;
  interviewToAdmittedPct: number | null;
  gpaMedian: number | null;
  mcatMedian: number | null;
  researchHours: number | null;
  clinicalHours: number | null;
  nonClinicalHours: number | null;
}

export type { MedProgram };

const userIds = new WeakMap<object, string>();

/** Internal: wrap a user id. Only `client.ts` calls this. */
export function mintLookupToken(userId: string): LookupToken {
  const token = Object.freeze({}) as LookupToken;
  userIds.set(token, userId);
  return token;
}

/** Internal: the user id behind a token, for the one md_phd request. Only `client.ts` calls this. */
export function redeemLookupToken(token: LookupToken): string {
  const id = userIds.get(token);
  if (id === undefined) throw new Error('unknown lookup token');
  return id;
}

/** An Admit school with the URL of its crest image (null when Admit has none). */
export interface AdmitSchoolCrest {
  slug: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  crestUrl: string | null;
}
