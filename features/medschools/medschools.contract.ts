/**
 * Contracts for the med schools admin endpoints. Client-safe: no zod, no server imports.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { Prefs } from './engine/prefs';
import type { MilestoneType } from './engine/tracker';
import type { askBody, limitDecisionBody, limitRequestBody } from './api/qa-schemas';
import type {
  addApplicationBody,
  addListToTrackerBody,
  createListBody,
  deleteCycleQuery,
  getTrackerQuery,
  patchApplicationBody,
  patchListBody,
  patchListItemBody,
  putCycleBody,
  putItemOrderBody,
  putListOrderBody,
  putMilestoneBody,
  putPrefsBody,
  saveListItemBody,
} from './api/me-schemas';
import type { MedEventType, MedProgram, MedSource } from './engine/types';

export interface AliasMissDto {
  id: string;
  source: string;
  sourceKey: string;
  seenCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SchoolOptionDto {
  id: string;
  name: string;
  shortName: string;
  state: string;
  degree: string;
}

export const listAliasMissesApi = endpoint<{
  res: {
    misses: AliasMissDto[];
    schools: SchoolOptionDto[];
  };
}>()({
  method: 'GET',
  path: '/api/admin/medschools/alias-misses',
});

export const mapAliasMissApi = endpoint<{
  body: {
    missId: string;
    schoolId: string;
  };
  res: {
    aliasId: string;
  };
}>()({
  method: 'POST',
  path: '/api/admin/medschools/alias-misses/map',
});

export const ignoreAliasMissApi = endpoint<{
  body: {
    missId: string;
  };
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/admin/medschools/alias-misses/ignore',
});

/* ------------------------------ public reads ------------------------------ */
/* Anonymous, signed-out-readable. No DTO below carries a person identifier (spec §6). */

export type MedSourceId = MedSource;
export type MedProgramId = MedProgram;
export type MedEventTypeId = MedEventType;
/** The five types the charts offer (`CHARTED_TYPES`); WITHDRAWN and HOLD appear in the live feed only. */
export type MedChartedTypeId = 'INTERVIEW' | 'SECONDARY' | 'WAITLIST' | 'REJECTION' | 'ACCEPTANCE';
/** O5: ALL is REG + PHD summed within one source per day, never across sources. */
export type MedProgramFilter = 'ALL' | 'REG' | 'PHD';
export type MedLiveProgramFilter = MedProgramFilter | 'NONE';
export type MedDegreeId = 'MD' | 'DO';

export interface MedSchoolListItemDto {
  slug: string;
  name: string;
  shortName: string;
  degree: MedDegreeId;
  city: string;
  state: string;
  reported: { source: MedSourceId; count: number } | null;
}

export interface SourceLinkDto {
  source: 'CYCLETRACK' | 'ADMIT' | 'SDN';
  name: string;
  href: string;
  scope: 'school' | 'thread' | 'summary';
  cycleYear: number | null;
}

export interface SchoolStatsDto {
  source: MedSourceId;
  program: MedProgramId | null;
  cycleYear: number;
  residence: 'GLOBAL' | 'IN_STATE' | 'OUT_OF_STATE';
  allCycles: boolean;
  gpaMedian: number | null;
  gpaLow: number | null;
  gpaHigh: number | null;
  mcatMedian: number | null;
  mcatLow: number | null;
  mcatHigh: number | null;
  interviewToAcceptancePct: number | null;
  applicationToInterviewPct: number | null;
  applicationCount: number | null;
  interviewCount: number | null;
  admittedCount: number | null;
  researchHours: number | null;
  clinicalHours: number | null;
  nonClinicalHours: number | null;
}

export interface InterviewProfileDto {
  source: MedSourceId;
  format: string | null;
  fileType: string | null;
  avgDifficulty: number | null;
  avgStress: number | null;
  avgImpression: number | null;
  interviewCount: number | null;
  interviewStyle: string | null;
  interviewLength: string | null;
  split: { inState: number; outOfState: number } | null;
  feedbackPositive: string[];
  feedbackNegative: string[];
  feedbackBefore: string[];
}

export interface InterviewQuestionDto {
  text: string;
  source: MedSourceId;
  votes: number | null;
  cycleYear: number | null;
}

export interface MedSchoolDetailDto {
  school: {
    slug: string;
    name: string;
    shortName: string;
    /** The school's own degree: the UI hides the other degree's program options. */
    degree: MedDegreeId;
    city: string;
    state: string;
    website: string | null;
    interviewFormat: string | null;
    interviewType: string | null;
  };
  cycleYear: number;
  programsWithData: MedProgramId[];
  links: SourceLinkDto[];
  stats: SchoolStatsDto[];
  profiles: InterviewProfileDto[];
  questions: InterviewQuestionDto[];
}

export interface ActivityTypeDto {
  eventType: MedChartedTypeId;
  primary: MedSourceId | null;
  sources: { source: MedSourceId; days: { date: string; count: number }[]; total: number }[];
}

export interface HistoryCycleDto {
  cycleYear: number;
  /** The cycle's day zero (`YYYY-MM-DD`): the History overlay aligns cycles by calendar date from it (O7). */
  dayZeroOn: string;
  dayZeroEstimated: boolean;
  sources: { source: MedSourceId; points: { day: number; cumulative: number }[]; total: number }[];
}

export interface LiveEventDto {
  id: string;
  eventType: MedEventTypeId;
  program: MedProgramId | null;
  school: { slug: string; shortName: string; name: string; degree: MedDegreeId; city: string; state: string };
  /** ISO, truncated to the minute. */
  occurredAt: string;
  source: 'ADMIT' | 'SDN';
  /** INTERVIEW rows only: the school had a wave of invites on this row's UTC day (D10). False for every other row. */
  wave: boolean;
}

/** A day with far more invites than the trailing 14-day median (D10). `date` is a UTC calendar day. */
export interface WaveDto {
  date: string;
  count: number;
  baseline: number;
}

export interface ListMedSchoolsRes {
  cycleYear: number;
  program: MedProgramFilter;
  schools: MedSchoolListItemDto[];
  states: string[];
}

export interface MedSchoolActivityRes {
  cycleYear: number;
  program: MedProgramFilter;
  dayZeroOn: string;
  dayZeroEstimated: boolean;
  /** All five CHARTED_TYPES, always, so toggling a category refetches nothing (O4). */
  types: ActivityTypeDto[];
  /** Withdrawn and hold, floored per-source totals only (never charted), where any source reports them. */
  otherTotals: { eventType: 'WITHDRAWN' | 'HOLD'; sources: { source: MedSourceId; total: number }[] }[];
  /** Null-program events of the charted types for one source (never a sum across sources). */
  unreportedProgram: number;
  unreportedProgramSource: 'ADMIT' | 'SDN' | null;
  /** Waves on the INTERVIEW primary series of this response's program filter (D10); empty when none. */
  waves: WaveDto[];
}

/** The public forecast of one school x program x event type for the site's current cycle (phase 5). */
export interface MedSchoolForecastRes {
  /** Resolved: `ALL` reads REG (D12). */
  program: 'REG' | 'PHD';
  eventType: MedChartedTypeId;
  cycleYear: number;
  dayZeroOn: string;
  dayZeroEstimated: boolean;
  endOn: string;
  /** `ready` band drawn; `early` band drawn, wide; `no-history` observed only; `no-data` nothing reported; `pending` not computed yet. */
  status: 'ready' | 'early' | 'no-history' | 'no-data' | 'pending';
  source: MedSourceId | null;
  /** The last day the model saw (`YYYY-MM-DD`). */
  asOf: string | null;
  /** Days since `dayZeroOn`, through `asOf`. The zero start is the chart's. */
  observed: { day: number; cumulative: number }[];
  band: { day: number; p10: number; p50: number; p90: number }[];
  summary: {
    total: { p10: number; p50: number; p90: number };
    halfOn: { p10: string; p50: string; p90: string };
  } | null;
  basis: { cycleYear: number; source: MedSourceId; weight: number }[];
}

export interface MedSchoolHistoryRes {
  program: MedProgramFilter;
  eventType: MedChartedTypeId;
  cycles: HistoryCycleDto[];
}

export interface MedArrivalsRes {
  program: MedProgramFilter;
  eventType: MedChartedTypeId;
  /** The zone the weekdays and hours are in (`America/New_York`); the chart names it. */
  zone: string;
  /** Events counted (ADMIT and SDN with an exact time). Under 10 the arrays are empty and the chart is hidden. */
  total: number;
  /** Monday first, seven counts. */
  weekdays: number[];
  /** Eastern hour 0 to 23, 24 counts. */
  hours: number[];
  /** Newest cycle first. `firstOn` and `medianOn` are Eastern calendar days, `YYYY-MM-DD`: aggregates, not a timestamp. */
  cycles: { cycleYear: number; count: number; firstOn: string; medianOn: string }[];
}

export interface MedLiveRes {
  events: LiveEventDto[];
  nextCursor: string | null;
  asOf: string;
}

export interface MedTodayRes {
  date: string | null;
  isToday: boolean;
  program: MedProgramFilter;
  schools: {
    slug: string;
    shortName: string;
    name: string;
    city: string;
    state: string;
    count: number;
    source: MedSourceId;
  }[];
}

export const listMedSchoolsApi = endpoint<{
  query: {
    q?: string | undefined;
    degree?: MedDegreeId | undefined;
    state?: string | undefined;
    program?: MedProgramFilter | undefined;
    /** The program set as a comma list (`md,do-phd`, see `engine/programs.ts`); omitted when every program is on. */
    programs?: string | undefined;
  };
  res: ListMedSchoolsRes;
}>()({ method: 'GET', path: '/api/medschools/schools' });

/** 404 for an unknown or inactive slug. */
export const getMedSchoolApi = endpoint<{ res: MedSchoolDetailDto }>()({
  method: 'GET',
  path: '/api/medschools/schools/$slug',
});

export const getMedSchoolActivityApi = endpoint<{
  query: { program?: MedProgramFilter | undefined; cycle?: number | undefined };
  res: MedSchoolActivityRes;
}>()({ method: 'GET', path: '/api/medschools/schools/$slug/activity' });

export const getMedSchoolHistoryApi = endpoint<{
  query: { program?: MedProgramFilter | undefined; type?: MedChartedTypeId | undefined };
  res: MedSchoolHistoryRes;
}>()({ method: 'GET', path: '/api/medschools/schools/$slug/history' });

export const getMedSchoolForecastApi = endpoint<{
  query: { program?: MedProgramFilter | undefined; type?: MedChartedTypeId | undefined };
  res: MedSchoolForecastRes;
}>()({ method: 'GET', path: '/api/medschools/schools/$slug/forecast' });

export const getMedSchoolArrivalsApi = endpoint<{
  query: { program?: MedProgramFilter | undefined; type?: MedChartedTypeId | undefined };
  res: MedArrivalsRes;
}>()({ method: 'GET', path: '/api/medschools/schools/$slug/arrivals' });

export const getMedLiveApi = endpoint<{
  query: {
    type?: MedEventTypeId | undefined;
    school?: string | undefined;
    degree?: MedDegreeId | undefined;
    program?: MedLiveProgramFilter | undefined;
    /** The program set (see `listMedSchoolsApi`); with it `degree` and `program` are ignored. */
    programs?: string | undefined;
    /** The activity rail's search: school name or short name, or a state code. */
    q?: string | undefined;
    state?: string | undefined;
    /** Several event types as a comma list (`acceptance,rejection`); `type` names one. */
    types?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  };
  res: MedLiveRes;
}>()({ method: 'GET', path: '/api/medschools/live' });

export const getMedTodayApi = endpoint<{
  query: { program?: MedProgramFilter | undefined; degree?: MedDegreeId | undefined };
  res: MedTodayRes;
}>()({ method: 'GET', path: '/api/medschools/today' });

/* ------------------------- private tracker (me/**) ------------------------- */
/* Signed-in only, never publicly cached. No DTO carries a user id, a cycle id or an event hash (spec §6). */

export interface TrackerSchoolDto {
  slug: string;
  name: string;
  shortName: string;
  degree: MedDegreeId;
  state: string;
  /** False for a deactivated school: the row stays, the link degrades to plain text. */
  active: boolean;
}

export interface TrackerApplicationDto {
  id: string;
  school: TrackerSchoolDto;
  program: 'REG' | 'PHD';
  notes: string | null;
  /** Ordered by date, then by `MILESTONE_TYPES`. `date` is a calendar day, `YYYY-MM-DD`. */
  milestones: { type: MilestoneType; date: string }[];
}

export interface TrackerCycleDto {
  cycleYear: number;
  homeState: string | null;
  shareAnonymously: boolean;
  applications: TrackerApplicationDto[];
}

export interface TrackerDto {
  /** False when the server secret is unset: the switch is disabled, the tracker still works unshared. */
  sharingAvailable: boolean;
  /** The user's cycle years, newest first. */
  cycles: number[];
  cycle: TrackerCycleDto | null;
}

export const getMedTrackerApi = endpoint<{ query: z.infer<typeof getTrackerQuery>; res: TrackerDto }>()({
  method: 'GET',
  path: '/api/medschools/me/tracker',
});

export const putMedTrackerCycleApi = endpoint<{ body: z.infer<typeof putCycleBody>; res: TrackerDto }>()({
  method: 'PUT',
  path: '/api/medschools/me/tracker/cycle',
});

export const deleteMedTrackerCycleApi = endpoint<{ query: z.infer<typeof deleteCycleQuery>; res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/medschools/me/tracker/cycle',
});

export const addMedApplicationApi = endpoint<{
  body: z.infer<typeof addApplicationBody>;
  res: TrackerApplicationDto;
}>()({ method: 'POST', path: '/api/medschools/me/tracker/applications' });

export const patchMedApplicationApi = endpoint<{
  body: z.infer<typeof patchApplicationBody>;
  res: TrackerApplicationDto;
}>()({ method: 'PATCH', path: '/api/medschools/me/tracker/applications/$id' });

export const deleteMedApplicationApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/medschools/me/tracker/applications/$id',
});

export const putMedMilestoneApi = endpoint<{
  body: z.infer<typeof putMilestoneBody>;
  res: TrackerApplicationDto;
}>()({ method: 'PUT', path: '/api/medschools/me/tracker/applications/$id/milestones/$type' });

export const deleteMedMilestoneApi = endpoint<{ res: TrackerApplicationDto }>()({
  method: 'DELETE',
  path: '/api/medschools/me/tracker/applications/$id/milestones/$type',
});

/* ------------------------- personal invite chance (me/**) ------------------------- */

/** Why an application has (or lacks) an estimate. */
export type ChanceStatus = 'estimate' | 'thin' | 'invited' | 'closed' | 'no-complete' | 'not-complete-yet' | 'beyond';

/** One of the caller's own applications. No other member's data, no user id (spec §6). */
export interface ChanceDto {
  applicationId: string;
  school: { slug: string; shortName: string; name: string; active: boolean };
  program: 'REG' | 'PHD';
  status: ChanceStatus;
  completeOn: string | null;
  invitedOn: string | null;
  /** The curve's day, `estimate` only. */
  asOf: string | null;
  /** Members behind the curve, floored to a multiple of 10 and at least 20; `estimate` only. */
  basis: number | null;
  /** Calendar dates and percents in steps of 5; `estimate` only. */
  points: { on: string; percent: number }[];
}

export interface MedChancesRes {
  cycleYear: number | null;
  chances: ChanceDto[];
}

export const getMedChancesApi = endpoint<{
  query: { school?: string | undefined; cycle?: number | undefined };
  res: MedChancesRes;
}>()({ method: 'GET', path: '/api/medschools/me/chances' });

/* ------------------------- AI Q&A (phase 6, me/ask) ------------------------- */

/** A row an answer cites: where the figure came from and when that source was last refreshed. */
export interface MedAskCitationDto {
  ref: string;
  label: string;
  sourceName: string;
  schoolSlug: string | null;
  /** ISO. The source's last successful refresh (a count), a profile's fetch time, a forecast's computation; null when unknown. */
  updatedAt: string | null;
  /** A site path with its `?tab=`. */
  href: string;
  /** The source's own page for the school where one is known. */
  sourceHref: string | null;
}

/**
 * The answer to one question. Nothing in it is stored: no question text, no answer text. `segments` are sentences that
 * survived the grounding check, each citing retrieved rows by `ref`; `mine` is the caller's own invite estimate (from the
 * tracker, never shown to the model) on a `my-chance` question.
 */
export interface MedAskRes {
  /** `answered`: every sentence survived. `partial`: some were removed. `no-data`: nothing to say from the data. */
  status: 'answered' | 'partial' | 'no-data' | 'declined' | 'no-school';
  segments: { text: string; cites: string[] }[];
  citations: MedAskCitationDto[];
  notice: 'removed-ungrounded' | 'thin' | 'mine-unavailable' | null;
  decline: 'out-of-scope' | 'ungrounded' | 'name-a-school' | null;
  schools: { slug: string; shortName: string }[];
  cycleYear: number | null;
  mine: ChanceDto[] | null;
  tier: MedQaTier;
  /** Questions left today; `null` for an admin (no daily limit). */
  remainingToday: number | null;
  dailyCap: number | null;
  /** True when the answer call ran with DeepSeek's thinking on (plan R20). The reasoning text itself is never returned. */
  thinking: boolean;
}

/** The caller's limit tier (plan R19), resolved on the server: `admin` has no daily limit, `member` is a paid membership. */
export type MedQaTier = 'free' | 'approved' | 'member' | 'admin';

export interface MedAskStatusRes {
  /** False when the site has no model key: the page says so and sends no question. */
  configured: boolean;
  tier: MedQaTier;
  /** `null` for an admin. */
  remainingToday: number | null;
  /** `null` for an admin. */
  dailyCap: number | null;
  /** Whether "Think it through" is offered (`MEDSCHOOLS_QA_THINKING`, plan R20). */
  thinkingAvailable: boolean;
}

/**
 * Signed in. 429 `MEDSCHOOLS_QA_DAILY_CAP` (the day's questions are used) or `MEDSCHOOLS_QA_BUSY` (another question of
 * the member's is in flight, on any process), 503 `MEDSCHOOLS_QA_PAUSED` (the Q&A share of the monthly budget is spent, or its ledger cannot be
 * read) or `AI_UNAVAILABLE`, 402 `AI_BUDGET_EXCEEDED` (the member's own allowance), 403 for a suspended account. Never cached.
 */
export const askMedQuestionApi = endpoint<{ body: z.infer<typeof askBody>; res: MedAskRes }>()({
  method: 'POST',
  path: '/api/medschools/me/ask',
});

/** What the Ask page needs before a question: whether Q&A is on and how many questions the caller has left today. */
export const getMedAskStatusApi = endpoint<{ res: MedAskStatusRes }>()({
  method: 'GET',
  path: '/api/medschools/me/ask',
});

/* ------------------------- Q&A limit requests (phase 6, R19) ------------------------- */

/**
 * Where the caller stands on a higher daily limit. `none`: may ask; `pending`: waiting for an admin; `approved`: has the
 * approved tier; `declined`: a decision (or a revoked approval) started a wait, `reapplyOn` is the day it ends;
 * `not-needed`: an admin or a paying member, who never sees the form.
 */
export interface MedQaLimitRequestStateRes {
  state: 'none' | 'pending' | 'approved' | 'declined' | 'not-needed';
  tier: MedQaTier;
  /** ISO. When the current request was made; null for `none` and `not-needed`. */
  requestedAt: string | null;
  decidedAt: string | null;
  /** An admin's optional reply on the last decision. */
  adminNote: string;
  /** ISO. `declined` only: the first moment the member can ask again. */
  reapplyOn: string | null;
}

export const getMedQaLimitRequestApi = endpoint<{ res: MedQaLimitRequestStateRes }>()({
  method: 'GET',
  path: '/api/medschools/me/qa-limit-request',
});

/** 409 `MEDSCHOOLS_QA_LIMIT_PENDING`, `MEDSCHOOLS_QA_LIMIT_WAIT` or `MEDSCHOOLS_QA_LIMIT_NOT_NEEDED`. */
export const submitMedQaLimitRequestApi = endpoint<{
  body: z.infer<typeof limitRequestBody>;
  res: MedQaLimitRequestStateRes;
}>()({
  method: 'POST',
  path: '/api/medschools/me/qa-limit-request',
});

export interface MedQaLimitRequestRowDto {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'REVOKED';
  note: string;
  adminNote: string;
  createdAt: string;
  decidedAt: string | null;
  /** Set when an approval was revoked; the approval's own `decidedAt` and `adminNote` stay as they were. */
  revokedAt: string | null;
  revokeNote: string;
  user: { id: string; handle: string | null; name: string | null };
}

/** Admin: every pending request (oldest first), every approval in force, and the 50 most recent declines and revokes. */
export const listMedQaLimitRequestsApi = endpoint<{
  res: { pending: MedQaLimitRequestRowDto[]; active: MedQaLimitRequestRowDto[]; recent: MedQaLimitRequestRowDto[] };
}>()({
  method: 'GET',
  path: '/api/admin/medschools/qa-limit-requests',
});

export const decideMedQaLimitRequestApi = endpoint<{
  body: z.infer<typeof limitDecisionBody>;
  res: { ok: true };
}>()({
  method: 'POST',
  path: '/api/admin/medschools/qa-limit-requests',
});

/* ------------------------- saved lists and preferences (me/**) ------------------------- */

/** `ANY` is "either program": a list item that does not pick one (spec section 4a). */
export type MedListProgramId = 'ANY' | 'REG' | 'PHD';

export interface MedListItemDto {
  id: string;
  school: TrackerSchoolDto;
  program: MedListProgramId;
  note: string | null;
  position: number;
}

/** No `userId`. `GET me/lists` returns at most 20 lists and 4,000 items, the one query every list surface shares. */
export interface MedListDto {
  id: string;
  name: string;
  position: number;
  items: MedListItemDto[];
}

/** The preferences, the defaults when the user has no row (`ALL`, null, null, `[]`). */
export type MedPrefsDto = Prefs;

export const getMedListsApi = endpoint<{ res: { lists: MedListDto[] } }>()({
  method: 'GET',
  path: '/api/medschools/me/lists',
});

export const createMedListApi = endpoint<{ body: z.infer<typeof createListBody>; res: MedListDto }>()({
  method: 'POST',
  path: '/api/medschools/me/lists',
});

export const patchMedListApi = endpoint<{ body: z.infer<typeof patchListBody>; res: MedListDto }>()({
  method: 'PATCH',
  path: '/api/medschools/me/lists/$id',
});

export const deleteMedListApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/medschools/me/lists/$id',
});

export const putMedListOrderApi = endpoint<{ body: z.infer<typeof putListOrderBody>; res: { lists: MedListDto[] } }>()({
  method: 'PUT',
  path: '/api/medschools/me/list-order',
});

export const saveMedListItemApi = endpoint<{ body: z.infer<typeof saveListItemBody>; res: MedListDto }>()({
  method: 'POST',
  path: '/api/medschools/me/list-items',
});

export const patchMedListItemApi = endpoint<{ body: z.infer<typeof patchListItemBody>; res: MedListDto }>()({
  method: 'PATCH',
  path: '/api/medschools/me/lists/$id/items/$itemId',
});

export const deleteMedListItemApi = endpoint<{ res: MedListDto }>()({
  method: 'DELETE',
  path: '/api/medschools/me/lists/$id/items/$itemId',
});

export const putMedListItemOrderApi = endpoint<{ body: z.infer<typeof putItemOrderBody>; res: MedListDto }>()({
  method: 'PUT',
  path: '/api/medschools/me/lists/$id/item-order',
});

export const addMedListToTrackerApi = endpoint<{
  body: z.infer<typeof addListToTrackerBody>;
  res: { cycleYear: number; added: number; skipped: number };
}>()({ method: 'POST', path: '/api/medschools/me/lists/$id/add-to-tracker' });

export const getMedPrefsApi = endpoint<{ res: MedPrefsDto }>()({
  method: 'GET',
  path: '/api/medschools/me/prefs',
});

export const putMedPrefsApi = endpoint<{ body: z.infer<typeof putPrefsBody>; res: MedPrefsDto }>()({
  method: 'PUT',
  path: '/api/medschools/me/prefs',
});

/* ------------------------- Secondaries (public tab, me/ overlap, admin entry) ------------------------- */

/** Where a prompt was read: Admit.org, Student Doctor Network, or the school's own page. */
export type MedPromptSourceId = 'ADMIT' | 'SDN' | 'SCHOOL';
export type MedPromptStatus = 'same' | 'reworded' | 'new' | 'gone' | 'last-cycle';
export interface MedPromptLimitDto {
  kind: 'WORDS' | 'CHARS';
  value: number;
}

export interface MedSecondaryPromptDto {
  id: string;
  text: string;
  limit: MedPromptLimitDto | null;
  optional: boolean;
  /** Theme ids (`engine/secondaries/theme-ids.ts`), at least one (`other` when no rule matched). */
  themes: string[];
  /** `null` = nothing to compare with (a first year of data). */
  status: MedPromptStatus | null;
  previousText: string | null;
  /** Entry years the prompt was observed in, ascending; the UI writes them as `2026–2027` ranges. */
  cycles: number[];
  /** The sources that saw it in the cycle shown. */
  sources: MedPromptSourceId[];
  /** ISO instant of the newest check of those sources. */
  lastCheckedAt: string;
}

export interface MedSecondaryGroupDto {
  program: 'REG' | 'PHD';
  /** `current` = this cycle's prompts; `not-yet` = none seen this cycle, the newest earlier cycle's list is shown. */
  state: 'current' | 'not-yet';
  shownCycle: number;
  comparedWith: number | null;
  prompts: MedSecondaryPromptDto[];
}

export interface MedSecondarySourceDto {
  source: MedPromptSourceId;
  url: string | null;
  /** ISO instant of the newest read of this source for this school; null when it was never read. */
  checkedAt: string | null;
  status: 'OK' | 'EMPTY' | 'UNAVAILABLE';
}

/** What the school's own admissions page says about rolling decisions (a curated, dated import). */
export interface MedAdmissionsPolicyDto {
  program: 'REG' | 'PHD';
  /** true = rolling decisions; false = decisions on set dates. */
  rolling: boolean;
  /** The page's own sentence. */
  evidence: string;
  url: string;
  /** YYYY-MM-DD. */
  checkedOn: string;
}

/** Secondary turnaround (received to submitted): present only when at least 20 members who share contribute. */
export interface MedSecondaryTurnaroundDto {
  program: 'REG' | 'PHD';
  members: number;
  p25Days: number;
  medianDays: number;
  p75Days: number;
  asOf: string;
}

export interface MedSchoolSecondariesRes {
  /** The cycle the site is showing. */
  cycleYear: number;
  groups: MedSecondaryGroupDto[];
  sources: MedSecondarySourceDto[];
  admissions: MedAdmissionsPolicyDto[];
  turnaround: MedSecondaryTurnaroundDto[];
}

export const getMedSchoolSecondariesApi = endpoint<{
  query: { program?: MedProgramFilter | undefined };
  res: MedSchoolSecondariesRes;
}>()({ method: 'GET', path: '/api/medschools/schools/$slug/secondaries' });

export interface MedSecondaryOverlapEntryDto {
  slug: string;
  schoolName: string;
  program: 'REG' | 'PHD';
  promptId: string;
  text: string;
  limit: MedPromptLimitDto | null;
  optional: boolean;
  basis: 'current' | 'last-cycle';
}

export interface MedSecondaryOverlapGroupDto {
  theme: string;
  schools: number;
  shortestWords: number | null;
  longestWords: number | null;
  entries: MedSecondaryOverlapEntryDto[];
}

export interface MedSecondaryOverlapRes {
  cycleYear: number;
  source: 'list' | 'tracker';
  groups: MedSecondaryOverlapGroupDto[];
  withoutPrompts: { slug: string; name: string }[];
  schoolCount: number;
}

/** The caller's own list or tracker schools. Personal: never cached; another member's list id is a 404. */
export const getMedSecondaryOverlapApi = endpoint<{
  query: { source: 'list' | 'tracker'; list?: string | undefined };
  res: MedSecondaryOverlapRes;
}>()({ method: 'GET', path: '/api/medschools/me/secondaries/overlap' });

/** An admin's correction of a school's own prompts (the page URL is stored, never fetched). */
export const postMedSecondariesAdminApi = endpoint<{
  body: {
    schoolId: string;
    program: 'REG' | 'PHD';
    cycleYear: number;
    sourceUrl: string;
    prompts: {
      text: string;
      limitKind?: 'WORDS' | 'CHARS' | undefined;
      limitValue?: number | undefined;
      optional?: boolean | undefined;
    }[];
  };
  res: { prompts: number; created: number; rejected: number };
}>()({ method: 'POST', path: '/api/admin/medschools/secondaries' });
