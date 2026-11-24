/**
 * Admit.org GraphQL client behind the polite host. Every document is a read-only query from `queries.ts`, so the host
 * may retry a POST safely. A reply that is not exactly the expected shape is a counted failure, never an empty list.
 */
import { z } from 'zod';
import { dedupeHash } from '../../../engine/dedupe';
import { cycleYearOf } from '../../../engine/cycle';
import type { MedEventType, MedResidence } from '../../../engine/types';
import type { PoliteClient } from '../../http';
import { ADMIT_GRAPHQL_PATH } from '../../sources';
import {
  ALL_SCHOOLS_SLUG,
  INTERVIEW_FEEDBACK,
  INTERVIEW_OVERVIEW,
  INTERVIEW_QUESTIONS,
  INTERVIEW_SCHOOLS,
  PROFILE_FLAG,
  RECENT_UPDATES,
  RESULT_STATUSES,
  RESULT_USERS,
  SCHOOL_CRESTS,
  SCHOOL_CURRICULUM,
  SCHOOL_STATS,
  type AdmitOperation,
} from './queries';
import { mapCurriculumRow } from './curriculum';
import {
  curriculumRow,
  feedData,
  feedRow,
  historyEntry,
  interviewFeedbackData,
  interviewOverviewData,
  interviewSchoolsData,
  profileFlagData,
  questionsData,
  resultUsersData,
  schoolCrestsData,
  schoolCurriculumData,
  schoolStatsData,
} from './schemas';
import { admitMemberKey } from './member-key';
import type { AdmitCurriculum } from './curriculum';
import { mapStatus } from './statuses';
import {
  mintLookupToken,
  redeemLookupToken,
  type AdmitProfile,
  type AdmitSchoolCrest,
  type AdmitSchoolRef,
  type FeedItem,
  type HistoryEvent,
  type LookupToken,
  type NormalizedAdmitProfile,
  type NormalizedAdmitQuestion,
  type NormalizedAdmitStats,
  type ProgramFlag,
} from './types';

export class AdmitResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdmitResponseError';
  }
}

/** A GraphQL `errors` reply to a per-user lookup (P16): that user's failure, not the source's. */
export class AdmitLookupErrorsReply extends AdmitResponseError {}

/** Consecutive per-user `errors` replies after which the rest of the run makes no more lookups. */
export const LOOKUP_ERROR_STREAK_LIMIT = 10;

export interface AdmitClient {
  fetchFeed(slug?: string): Promise<{
    items: FeedItem[];
    skipped: {
      unknownStatus: number;
      badDate: number;
      /** Rows failing validation (e.g. a null school slug): dropped and counted, never fatal to the feed. */
      malformedRows: number;
    };
  }>;
  /** One request per distinct user per client, cached for the client's life. */
  programOf(token: LookupToken | null): Promise<ProgramFlag | 'FAILED'>;
  /** The same cached request, read for the flag and the member's history events. */
  profileOf(token: LookupToken | null): Promise<AdmitProfile | 'FAILED'>;
  /** Keyed hash of the member behind a token (`null` for no token): a progress marker that is not the user id. */
  memberHashOf(token: LookupToken | null): string | null;
  /**
   * Distinct members from `getAllCycleResults`, one status filter after another, paged until a short page. A status
   * whose request fails is counted and skipped; a halted source throws. Tokens carry the ids in memory only.
   */
  discoverMembers(): Promise<{ tokens: LookupToken[]; pages: number; failedStatuses: number }>;
  readonly lookups: number;
  /** True when this token's user already has a flag this run, so `programOf` costs no request. */
  isCached(token: LookupToken | null): boolean;
  /** True once LOOKUP_ERROR_STREAK_LIMIT consecutive lookups got GraphQL `errors`: no further requests this run. */
  readonly lookupsStopped: boolean;
  listInterviewSchools(): Promise<AdmitSchoolRef[]>;
  /** `null` = Admit answered without the overview or the feedback (unavailable, not empty). */
  fetchInterviewProfile(slug: string): Promise<NormalizedAdmitProfile | null>;
  /** `null` = Admit answered without the question list (unavailable); `[]` is an explicit empty list. */
  fetchQuestions(slug: string): Promise<NormalizedAdmitQuestion[] | null>;
  fetchSchoolStats(filter: MedResidence): Promise<NormalizedAdmitStats[]>;
  /** Every school with a result row, with its crest URL. Schools only: no user field is requested. */
  listSchoolCrests(): Promise<AdmitSchoolCrest[]>;
  /**
   * The whole curriculum table in ONE request. A reply with no valid row at all is a failure (never an empty table);
   * a row failing validation is dropped and counted.
   */
  fetchCurriculum(): Promise<{ schools: AdmitCurriculum[]; malformedRows: number }>;
}

const DAY_MS = 86_400_000;
const SCHOOLS_PAGE = 100;
const STATS_PAGE = 999;
/** Safety stop for paging loops against a source that never returns a short page. */
const MAX_PAGES = 50;

const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim();
const cleanList = (l: string[] | null) => (l ?? []).map(cleanText).filter((s) => s.length > 0);

export function createAdmitClient(
  session: PoliteClient,
  opts: {
    secret: string;
    now?: () => Date;
  },
): AdmitClient {
  const now = opts.now ?? (() => new Date());
  const flags = new Map<string, Promise<AdmitProfile | 'FAILED'>>();
  /** Member-scoped key (owner 2026-11-23): one member counts once per type per school per cycle, feed or history. */
  const memberKey = (userId: string, schoolId: string, cycleYear: number, type: MedEventType): string =>
    admitMemberKey(opts.secret, userId, schoolId, cycleYear, type);

  /** A history entry's dates and decision become events; entries that cannot be dated are counted, never guessed. */
  function mapHistory(userId: string, raw: unknown[] | null | undefined): Pick<AdmitProfile, 'history' | 'skipped'> {
    const skipped = { unknownDecision: 0, badDate: 0, malformedEntries: 0 };
    const history: HistoryEvent[] = [];
    const latest = now().getTime() + DAY_MS;
    for (const r of raw ?? []) {
      const parsed = historyEntry.safeParse(r);
      if (!parsed.success) {
        skipped.malformedEntries++;
        continue;
      }
      const e = parsed.data;
      const take = (type: MedEventType | null, date: string | null | undefined, present: boolean) => {
        if (!present) return;
        if (type === null) {
          skipped.unknownDecision++;
          return;
        }
        const parsedAt = date ? new Date(date) : null;
        if (parsedAt === null || Number.isNaN(parsedAt.getTime()) || parsedAt.getTime() > latest) {
          skipped.badDate++;
          return;
        }
        // A profile-history date is a day picked on a form (the API sends it at a fixed hour, e.g. 16:00Z), not a
        // time of day. Stored at UTC midnight it is recognisably day-only, so arrivals leave it out and it never
        // displaces an exact live-feed time (`replacesTime` in scrape/admit-events.ts).
        const at = new Date(Date.UTC(parsedAt.getUTCFullYear(), parsedAt.getUTCMonth(), parsedAt.getUTCDate()));
        const cycleYear = cycleYearOf(at, type);
        history.push({
          schoolKey: e.school.slug,
          cycleYear,
          eventType: type,
          occurredAt: at,
          keyFor: (schoolId) => memberKey(userId, schoolId, cycleYear, type),
        });
      };
      take('SECONDARY', e.secondary_submitted, Boolean(e.secondary_submitted));
      take('INTERVIEW', e.interview_received, Boolean(e.interview_received));
      const decision = e.decision?.trim() ?? '';
      take(decision === '' ? null : mapStatus(decision), e.decision_date, decision !== '');
    }
    return { history, skipped };
  }
  let lookups = 0;
  let errorStreak = 0;
  let lookupsStopped = false;

  async function run<S extends z.ZodType>(
    op: AdmitOperation,
    variables: Record<string, unknown>,
    schema: S,
    /** A GraphQL `errors` reply to a per-user lookup is that user's failure, not the source's (ruling P16). */
    errorsAreSourceFailures = true,
  ): Promise<z.output<S>> {
    const fail = (reason: string): never => {
      session.noteFailure(`${op.operationName}: ${reason}`);
      throw new AdmitResponseError(`${op.operationName}: ${reason}`);
    };
    const res = await session.post(
      ADMIT_GRAPHQL_PATH,
      JSON.stringify({
        operationName: op.operationName,
        query: op.query,
        variables,
      }),
    );
    if (!res.ok) {
      // The host already counted network errors, 5xx and exhausted 429s; a plain 4xx it does not count.
      if (res.status >= 400 && res.status < 500 && res.status !== 429)
        session.noteFailure(`${op.operationName}: HTTP ${res.status}`);
      throw new AdmitResponseError(`${op.operationName}: HTTP ${res.status || 'unavailable'}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(res.body);
    } catch {
      return fail('response is not JSON');
    }
    const errors = (
      json as {
        errors?: unknown;
      } | null
    )?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      if (!errorsAreSourceFailures) throw new AdmitLookupErrorsReply(`${op.operationName}: GraphQL errors`);
      return fail('GraphQL errors');
    }
    const parsed = z
      .object({
        data: schema,
      })
      .safeParse(json);
    if (!parsed.success) return fail('unexpected response shape');
    session.noteSuccess();
    return (
      parsed.data as {
        data: z.output<S>;
      }
    ).data;
  }

  async function lookupProfile(userId: string): Promise<AdmitProfile | 'FAILED'> {
    try {
      const data = await run(
        PROFILE_FLAG,
        {
          userId,
        },
        profileFlagData,
        false,
      );
      const profile = data.getCycleTrackProfileByUserId;
      if (profile === null) {
        errorStreak = 0;
        return {
          flag: 'UNREADABLE',
          history: [],
          skipped: { unknownDecision: 0, badDate: 0, malformedEntries: 0 },
        };
      }
      errorStreak = 0;
      return { flag: profile.md_phd === true ? 'PHD' : 'REG', ...mapHistory(userId, profile.history) };
    } catch (e) {
      if (e instanceof AdmitLookupErrorsReply) {
        // A few hidden profiles are normal, but a streak means the lookup endpoint itself is broken: stop asking
        // for the rest of this run and let the source's failure count see it once.
        if (++errorStreak >= LOOKUP_ERROR_STREAK_LIMIT && !lookupsStopped) {
          lookupsStopped = true;
          session.noteFailure(`${PROFILE_FLAG.operationName}: ${errorStreak} consecutive GraphQL errors`);
        }
        return 'FAILED';
      }
      if (e instanceof AdmitResponseError) return 'FAILED';
      throw e;
    }
  }

  return {
    get lookups() {
      return lookups;
    },

    async fetchFeed(slug = ALL_SCHOOLS_SLUG) {
      const data = await run(
        RECENT_UPDATES,
        {
          filterOwnSchools: false,
          slug,
        },
        feedData,
      );
      const skipped = {
        unknownStatus: 0,
        badDate: 0,
        malformedRows: 0,
      };
      const items: FeedItem[] = [];
      const latest = now().getTime() + DAY_MS;
      for (const raw of data.getRecentSchoolCycleUpdates) {
        const parsedRow = feedRow.safeParse(raw);
        if (!parsedRow.success) {
          skipped.malformedRows++;
          continue;
        }
        const row = parsedRow.data;
        const eventType = mapStatus(row.current_status);
        if (eventType === null) {
          skipped.unknownStatus++;
          continue;
        }
        const occurredAt = new Date(row.current_status_date);
        if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > latest) {
          skipped.badDate++;
          continue;
        }
        const cycleYear = cycleYearOf(occurredAt, eventType);
        const updateKey = dedupeHash(opts.secret, 'ADMIT', row.cycle_update_id);
        const authorId = row.user_id ? row.user_id : null;
        items.push({
          keyFor: (schoolId) => (authorId === null ? updateKey : memberKey(authorId, schoolId, cycleYear, eventType)),
          event: {
            source: 'ADMIT',
            schoolKey: row.school.slug,
            cycleYear,
            program: null,
            eventType,
            occurredAt,
            dedupeHash: updateKey,
            inState: null,
          },
          lookup: row.user_id ? mintLookupToken(row.user_id) : null,
        });
      }
      return {
        items,
        skipped,
      };
    },

    get lookupsStopped() {
      return lookupsStopped;
    },

    isCached(token) {
      if (token === null) return true;
      return flags.has(redeemLookupToken(token));
    },

    profileOf(token) {
      if (token === null)
        return Promise.resolve({
          flag: 'UNREADABLE',
          history: [],
          skipped: { unknownDecision: 0, badDate: 0, malformedEntries: 0 },
        });
      const userId = redeemLookupToken(token);
      let profile = flags.get(userId);
      if (!profile) {
        if (lookupsStopped) return Promise.resolve('FAILED');
        lookups++;
        profile = lookupProfile(userId);
        flags.set(userId, profile);
      }
      return profile;
    },

    async programOf(token) {
      const p = await this.profileOf(token);
      return p === 'FAILED' ? 'FAILED' : p.flag;
    },

    memberHashOf(token) {
      return token === null ? null : dedupeHash(opts.secret, 'ADMIT', `member:${redeemLookupToken(token)}`);
    },

    async discoverMembers() {
      const byId = new Map<string, LookupToken>();
      let pages = 0;
      let failedStatuses = 0;
      for (const status of RESULT_STATUSES) {
        try {
          for (let page = 0; page < MAX_PAGES; page++) {
            const data = await run(
              RESULT_USERS,
              { ...RESULT_USERS.variables, status: [status], limit: SCHOOLS_PAGE, offset: page * SCHOOLS_PAGE },
              resultUsersData,
            );
            pages++;
            const rows = data.getAllCycleResults;
            for (const r of rows)
              if (r.user_id && !byId.has(r.user_id)) byId.set(r.user_id, mintLookupToken(r.user_id));
            if (rows.length < SCHOOLS_PAGE) break;
          }
        } catch (e) {
          if (!(e instanceof AdmitResponseError)) throw e;
          failedStatuses++;
        }
      }
      return { tokens: [...byId.values()], pages, failedStatuses };
    },

    async listInterviewSchools() {
      const out: AdmitSchoolRef[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await run(
          INTERVIEW_SCHOOLS,
          {
            ...INTERVIEW_SCHOOLS.variables,
            limit: SCHOOLS_PAGE,
            offset: page * SCHOOLS_PAGE,
          },
          interviewSchoolsData,
        );
        const { totalCount, schools } = data.getMedicalInterviewSchoolsOverview;
        for (const s of schools) {
          out.push({
            slug: s.school.slug,
            name: s.school.name,
            shortName: s.school.shorthand_name ?? '',
            city: s.school.city ?? '',
            state: s.school.state ?? '',
            avgDifficulty: s.avg_interview_difficulty,
            interviewCount: s.interview_count ?? 0,
            totalInterviewCount: s.total_interview_count,
          });
        }
        if (schools.length === 0 || out.length >= totalCount) break;
      }
      return out;
    },

    async fetchInterviewProfile(slug) {
      const overview = (
        await run(
          INTERVIEW_OVERVIEW,
          {
            schoolSlug: slug,
          },
          interviewOverviewData,
        )
      ).getMedicalInterviewOverview;
      const feedback = (
        await run(
          INTERVIEW_FEEDBACK,
          {
            schoolSlug: slug,
          },
          interviewFeedbackData,
        )
      ).getInterviewFeedbackForSchool;
      if (overview === null || feedback === null) return null;
      return {
        schoolKey: slug,
        format: overview.interview_format,
        fileType: overview.interview_type,
        avgDifficulty: overview.avg_interview_difficulty,
        interviewCount: overview.interview_count,
        positive: cleanList(feedback.positive),
        negative: cleanList(feedback.negative),
        before: cleanList(feedback.before_interview),
      };
    },

    async fetchQuestions(slug) {
      const data = await run(
        INTERVIEW_QUESTIONS,
        {
          schoolSlug: slug,
        },
        questionsData,
      );
      const list = data.getInterviewsForSchool?.questions;
      if (!list) return null;
      const seen = new Set<string>();
      const out: NormalizedAdmitQuestion[] = [];
      for (const q of list) {
        const text = cleanText(q.body ?? '');
        if (text === '') continue;
        const hash = dedupeHash(opts.secret, 'ADMIT', `question:${q.id}`);
        if (seen.has(hash)) continue;
        seen.add(hash);
        out.push({
          schoolKey: slug,
          text,
          votes: q.votes,
          dedupeHash: hash,
        });
      }
      return out;
    },

    async listSchoolCrests() {
      const bySlug = new Map<string, AdmitSchoolCrest>();
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await run(
          SCHOOL_CRESTS,
          {
            ...SCHOOL_CRESTS.variables,
            limit: SCHOOLS_PAGE,
            offset: page * SCHOOLS_PAGE,
          },
          schoolCrestsData,
        );
        const rows = data.getAllCycleResults;
        for (const r of rows) {
          const s = r.school;
          if (!s) continue;
          bySlug.set(s.slug, {
            slug: s.slug,
            name: s.name,
            shortName: s.shorthand_name ?? '',
            city: s.city ?? '',
            state: s.state ?? '',
            crestUrl: s.crest_url,
          });
        }
        if (rows.length < SCHOOLS_PAGE) break;
      }
      return [...bySlug.values()];
    },

    async fetchCurriculum() {
      const data = await run(SCHOOL_CURRICULUM, {}, schoolCurriculumData);
      const bySlug = new Map<string, AdmitCurriculum>();
      let malformedRows = 0;
      for (const raw of data.getAllSchoolCurriculum) {
        const parsed = curriculumRow.safeParse(raw);
        if (!parsed.success) {
          malformedRows++;
          continue;
        }
        bySlug.set(parsed.data.school.slug, mapCurriculumRow(parsed.data));
      }
      if (bySlug.size === 0) {
        session.noteFailure(`${SCHOOL_CURRICULUM.operationName}: no valid row`);
        throw new AdmitResponseError(`${SCHOOL_CURRICULUM.operationName}: no valid row`);
      }
      return { schools: [...bySlug.values()], malformedRows };
    },

    async fetchSchoolStats(filter) {
      const out: NormalizedAdmitStats[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const data = await run(
          SCHOOL_STATS,
          {
            ...SCHOOL_STATS.variables,
            filterBy: filter,
            page,
            pageSize: STATS_PAGE,
          },
          schoolStatsData,
        );
        const rows = data.getSchoolStats;
        for (const r of rows) {
          const slug = r.school?.slug;
          if (!slug) continue;
          out.push({
            schoolKey: slug,
            residence: filter,
            residenceType: r.residence_type ?? null,
            applicationCount: r.application_number,
            interviewCount: r.interview_number,
            admittedCount: r.admitted_number,
            applicationToInterviewPct: r.application_to_interview_pct,
            interviewToAdmittedPct: r.interview_to_admitted_pct,
            gpaMedian: r.gpa,
            mcatMedian: r.mcat,
            researchHours: r.research_hours,
            clinicalHours: r.clinical_hours,
            nonClinicalHours: r.non_clinical_hours,
          });
        }
        if (rows.length < STATS_PAGE) break;
      }
      return out;
    },
  };
}
