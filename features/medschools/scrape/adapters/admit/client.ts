/**
 * Admit.org GraphQL client behind the polite host. Every document is a read-only query from `queries.ts`, so the host
 * may retry a POST safely. A reply that is not exactly the expected shape is a counted failure, never an empty list.
 */
import { z } from 'zod';
import { dedupeHash } from '../../../engine/dedupe';
import { cycleYearOf } from '../../../engine/cycle';
import type { MedResidence } from '../../../engine/types';
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
  SCHOOL_STATS,
  type AdmitOperation,
} from './queries';
import {
  feedData,
  feedRow,
  interviewFeedbackData,
  interviewOverviewData,
  interviewSchoolsData,
  profileFlagData,
  questionsData,
  schoolStatsData,
} from './schemas';
import { mapStatus } from './statuses';
import {
  mintLookupToken,
  redeemLookupToken,
  type AdmitSchoolRef,
  type FeedItem,
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
  const flags = new Map<string, Promise<ProgramFlag | 'FAILED'>>();
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

  async function lookupFlag(userId: string): Promise<ProgramFlag | 'FAILED'> {
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
        return 'UNREADABLE';
      }
      errorStreak = 0;
      return profile.md_phd === true ? 'PHD' : 'REG';
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
        items.push({
          event: {
            source: 'ADMIT',
            schoolKey: row.school.slug,
            cycleYear: cycleYearOf(occurredAt, eventType),
            program: null,
            eventType,
            occurredAt,
            dedupeHash: dedupeHash(opts.secret, 'ADMIT', row.cycle_update_id),
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

    programOf(token) {
      if (token === null) return Promise.resolve('UNREADABLE');
      const userId = redeemLookupToken(token);
      let flag = flags.get(userId);
      if (!flag) {
        if (lookupsStopped) return Promise.resolve('FAILED');
        lookups++;
        flag = lookupFlag(userId);
        flags.set(userId, flag);
      }
      return flag;
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
