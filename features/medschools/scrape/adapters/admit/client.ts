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
  constructor(
    message: string,
  ) {
    super(
      message,
    );
    this.name =
      'AdmitResponseError';
  }
}

export interface AdmitClient {
  fetchFeed(
    slug?: string,
  ): Promise<{
    items: FeedItem[];
    skipped: {
      unknownStatus: number;
      badDate: number;
    };
  }>;
  /** One request per distinct user per client, cached for the client's life. */
  programOf(
    token: LookupToken,
  ): Promise<
    | ProgramFlag
    | 'FAILED'
  >;
  readonly lookups: number;
  /** True when this token's user already has a flag this run, so `programOf` costs no request. */
  isCached(
    token: LookupToken,
  ): boolean;
  listInterviewSchools(): Promise<
    AdmitSchoolRef[]
  >;
  fetchInterviewProfile(
    slug: string,
  ): Promise<NormalizedAdmitProfile>;
  fetchQuestions(
    slug: string,
  ): Promise<
    NormalizedAdmitQuestion[]
  >;
  fetchSchoolStats(
    filter: MedResidence,
  ): Promise<
    NormalizedAdmitStats[]
  >;
}

const DAY_MS = 86_400_000;
const SCHOOLS_PAGE = 100;
const STATS_PAGE = 999;
/** Safety stop for paging loops against a source that never returns a short page. */
const MAX_PAGES = 50;

const cleanText =
  (
    s: string,
  ) =>
    s
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();
const cleanList =
  (
    l:
      | string[]
      | null,
  ) =>
    (
      l ??
      []
    )
      .map(
        cleanText,
      )
      .filter(
        (
          s,
        ) =>
          s.length >
          0,
      );

export function createAdmitClient(
  session: PoliteClient,
  opts: {
    secret: string;
    now?: () => Date;
  },
): AdmitClient {
  const now =
    opts.now ??
    (() =>
      new Date());
  const flags =
    new Map<
      string,
      Promise<
        | ProgramFlag
        | 'FAILED'
      >
    >();
  let lookups = 0;

  async function run<
    S extends
      z.ZodType,
  >(
    op: AdmitOperation,
    variables: Record<
      string,
      unknown
    >,
    schema: S,
    /** A GraphQL `errors` reply to a per-user lookup is that user's failure, not the source's (ruling P16). */
    errorsAreSourceFailures = true,
  ): Promise<
    z.output<S>
  > {
    const fail =
      (
        reason: string,
      ): never => {
        session.noteFailure(
          `${op.operationName}: ${reason}`,
        );
        throw new AdmitResponseError(
          `${op.operationName}: ${reason}`,
        );
      };
    const res =
      await session.post(
        ADMIT_GRAPHQL_PATH,
        JSON.stringify(
          {
            operationName:
              op.operationName,
            query:
              op.query,
            variables,
          },
        ),
      );
    if (
      !res.ok
    ) {
      // The host already counted network errors, 5xx and exhausted 429s; a plain 4xx it does not count.
      if (
        res.status >=
          400 &&
        res.status <
          500 &&
        res.status !==
          429
      )
        session.noteFailure(
          `${op.operationName}: HTTP ${res.status}`,
        );
      throw new AdmitResponseError(
        `${op.operationName}: HTTP ${res.status || 'unavailable'}`,
      );
    }
    let json: unknown;
    try {
      json =
        JSON.parse(
          res.body,
        );
    } catch {
      return fail(
        'response is not JSON',
      );
    }
    const errors =
      (
        json as {
          errors?: unknown;
        } | null
      )
        ?.errors;
    if (
      Array.isArray(
        errors,
      ) &&
      errors.length >
        0
    ) {
      if (
        !errorsAreSourceFailures
      )
        throw new AdmitResponseError(
          `${op.operationName}: GraphQL errors`,
        );
      return fail(
        'GraphQL errors',
      );
    }
    const parsed =
      z
        .object(
          {
            data: schema,
          },
        )
        .safeParse(
          json,
        );
    if (
      !parsed.success
    )
      return fail(
        'unexpected response shape',
      );
    session.noteSuccess();
    return (
      parsed.data as {
        data: z.output<S>;
      }
    )
      .data;
  }

  async function lookupFlag(
    userId: string,
  ): Promise<
    | ProgramFlag
    | 'FAILED'
  > {
    try {
      const data =
        await run(
          PROFILE_FLAG,
          {
            userId,
          },
          profileFlagData,
          false,
        );
      const profile =
        data.getCycleTrackProfileByUserId;
      if (
        profile ===
        null
      )
        return 'UNREADABLE';
      return profile.md_phd ===
        true
        ? 'PHD'
        : 'REG';
    } catch (e) {
      if (
        e instanceof
        AdmitResponseError
      )
        return 'FAILED';
      throw e;
    }
  }

  return {
    get lookups() {
      return lookups;
    },

    async fetchFeed(
      slug = ALL_SCHOOLS_SLUG,
    ) {
      const data =
        await run(
          RECENT_UPDATES,
          {
            filterOwnSchools: false,
            slug,
          },
          feedData,
        );
      const skipped =
        {
          unknownStatus: 0,
          badDate: 0,
        };
      const items: FeedItem[] =
        [];
      const latest =
        now().getTime() +
        DAY_MS;
      for (const row of data.getRecentSchoolCycleUpdates) {
        const eventType =
          mapStatus(
            row.current_status,
          );
        if (
          eventType ===
          null
        ) {
          skipped.unknownStatus++;
          continue;
        }
        const occurredAt =
          new Date(
            row.current_status_date,
          );
        if (
          Number.isNaN(
            occurredAt.getTime(),
          ) ||
          occurredAt.getTime() >
            latest
        ) {
          skipped.badDate++;
          continue;
        }
        items.push(
          {
            event:
              {
                source:
                  'ADMIT',
                schoolKey:
                  row
                    .school
                    .slug,
                cycleYear:
                  cycleYearOf(
                    occurredAt,
                    eventType,
                  ),
                program:
                  null,
                eventType,
                occurredAt,
                dedupeHash:
                  dedupeHash(
                    opts.secret,
                    'ADMIT',
                    row.cycle_update_id,
                  ),
                inState:
                  null,
              },
            lookup:
              mintLookupToken(
                row.user_id,
              ),
          },
        );
      }
      return {
        items,
        skipped,
      };
    },

    isCached(
      token,
    ) {
      return flags.has(
        redeemLookupToken(
          token,
        ),
      );
    },

    programOf(
      token,
    ) {
      const userId =
        redeemLookupToken(
          token,
        );
      let flag =
        flags.get(
          userId,
        );
      if (
        !flag
      ) {
        lookups++;
        flag =
          lookupFlag(
            userId,
          );
        flags.set(
          userId,
          flag,
        );
      }
      return flag;
    },

    async listInterviewSchools() {
      const out: AdmitSchoolRef[] =
        [];
      for (
        let page = 0;
        page <
        MAX_PAGES;
        page++
      ) {
        const data =
          await run(
            INTERVIEW_SCHOOLS,
            {
              ...INTERVIEW_SCHOOLS.variables,
              limit:
                SCHOOLS_PAGE,
              offset:
                page *
                SCHOOLS_PAGE,
            },
            interviewSchoolsData,
          );
        const {
          totalCount,
          schools,
        } =
          data.getMedicalInterviewSchoolsOverview;
        for (const s of schools) {
          out.push(
            {
              slug: s
                .school
                .slug,
              name: s
                .school
                .name,
              shortName:
                s
                  .school
                  .shorthand_name ??
                '',
              city:
                s
                  .school
                  .city ??
                '',
              state:
                s
                  .school
                  .state ??
                '',
              avgDifficulty:
                s.avg_interview_difficulty,
              interviewCount:
                s.interview_count ??
                0,
              totalInterviewCount:
                s.total_interview_count ??
                0,
            },
          );
        }
        if (
          schools.length ===
            0 ||
          out.length >=
            totalCount
        )
          break;
      }
      return out;
    },

    async fetchInterviewProfile(
      slug,
    ) {
      const overview =
        (
          await run(
            INTERVIEW_OVERVIEW,
            {
              schoolSlug:
                slug,
            },
            interviewOverviewData,
          )
        )
          .getMedicalInterviewOverview;
      const feedback =
        (
          await run(
            INTERVIEW_FEEDBACK,
            {
              schoolSlug:
                slug,
            },
            interviewFeedbackData,
          )
        )
          .getInterviewFeedbackForSchool;
      return {
        schoolKey:
          slug,
        format:
          overview?.interview_format ??
          null,
        fileType:
          overview?.interview_type ??
          null,
        avgDifficulty:
          overview?.avg_interview_difficulty ??
          null,
        interviewCount:
          overview?.interview_count ??
          null,
        positive:
          cleanList(
            feedback?.positive ??
              null,
          ),
        negative:
          cleanList(
            feedback?.negative ??
              null,
          ),
        before:
          cleanList(
            feedback?.before_interview ??
              null,
          ),
      };
    },

    async fetchQuestions(
      slug,
    ) {
      const data =
        await run(
          INTERVIEW_QUESTIONS,
          {
            schoolSlug:
              slug,
          },
          questionsData,
        );
      const seen =
        new Set<string>();
      const out: NormalizedAdmitQuestion[] =
        [];
      for (const q of data
        .getInterviewsForSchool
        ?.questions ??
        []) {
        const text =
          cleanText(
            q.body ??
              '',
          );
        if (
          text ===
          ''
        )
          continue;
        const hash =
          dedupeHash(
            opts.secret,
            'ADMIT',
            `question:${q.id}`,
          );
        if (
          seen.has(
            hash,
          )
        )
          continue;
        seen.add(
          hash,
        );
        out.push(
          {
            schoolKey:
              slug,
            text,
            votes:
              q.votes,
            dedupeHash:
              hash,
          },
        );
      }
      return out;
    },

    async fetchSchoolStats(
      filter,
    ) {
      const out: NormalizedAdmitStats[] =
        [];
      for (
        let page = 1;
        page <=
        MAX_PAGES;
        page++
      ) {
        const data =
          await run(
            SCHOOL_STATS,
            {
              ...SCHOOL_STATS.variables,
              filterBy:
                filter,
              page,
              pageSize:
                STATS_PAGE,
            },
            schoolStatsData,
          );
        const rows =
          data.getSchoolStats;
        for (const r of rows) {
          const slug =
            r
              .school
              ?.slug;
          if (
            !slug
          )
            continue;
          out.push(
            {
              schoolKey:
                slug,
              residence:
                filter,
              residenceType:
                r.residence_type ??
                null,
              applicationCount:
                r.application_number,
              interviewCount:
                r.interview_number,
              admittedCount:
                r.admitted_number,
              applicationToInterviewPct:
                r.application_to_interview_pct,
              interviewToAdmittedPct:
                r.interview_to_admitted_pct,
              gpaMedian:
                r.gpa,
              mcatMedian:
                r.mcat,
              researchHours:
                r.research_hours,
              clinicalHours:
                r.clinical_hours,
              nonClinicalHours:
                r.non_clinical_hours,
            },
          );
        }
        if (
          rows.length <
          STATS_PAGE
        )
          break;
      }
      return out;
    },
  };
}
