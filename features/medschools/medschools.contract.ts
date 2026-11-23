/**
 * Contracts for the med schools admin endpoints. Client-safe: no zod, no server imports.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { Prefs } from './engine/prefs';
import type { MilestoneType } from './engine/tracker';
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
}

export interface MedSchoolHistoryRes {
  program: MedProgramFilter;
  eventType: MedChartedTypeId;
  cycles: HistoryCycleDto[];
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

export const getMedLiveApi = endpoint<{
  query: {
    type?: MedEventTypeId | undefined;
    school?: string | undefined;
    degree?: MedDegreeId | undefined;
    program?: MedLiveProgramFilter | undefined;
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
