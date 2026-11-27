/** Raw zod schemas for Admit's GraphQL responses. Internal: never exported from `index.ts`. Unknown keys are stripped. */
import { z } from 'zod';

const num = z.number().nullable();
const strList = z.array(z.string()).nullable();

/** One feed row, validated on its own so a single malformed row cannot fail the whole feed. */
export const feedRow = z.object({
  cycle_update_id: z.string().min(1),
  school: z.object({
    slug: z.string().min(1),
  }),
  /** A null or empty author is a valid row whose program is simply not readable (no lookup). */
  user_id: z.string().nullish(),
  current_status: z.string(),
  current_status_date: z.string(),
});

export const feedData = z.object({
  getRecentSchoolCycleUpdates: z.array(z.unknown()),
});

/** One history entry, validated on its own so a malformed entry drops only itself. */
export const historyEntry = z.object({
  school: z.object({ slug: z.string().min(1) }),
  secondary_submitted: z.string().nullish(),
  interview_received: z.string().nullish(),
  decision_date: z.string().nullish(),
  decision: z.string().nullish(),
});

/** Selects md_phd and the history (school slug and dates only). */
export const profileFlagData = z.object({
  getCycleTrackProfileByUserId: z
    .object({
      md_phd: z.boolean().nullable(),
      history: z.array(z.unknown()).nullish(),
    })
    .nullable(),
});

/** Member discovery rows: the user id only. */
export const resultUsersData = z.object({
  getAllCycleResults: z.array(z.object({ user_id: z.string().nullish() })),
});

export const interviewSchoolsData = z.object({
  getMedicalInterviewSchoolsOverview: z.object({
    totalCount: z.number(),
    schools: z.array(
      z.object({
        avg_interview_difficulty: num,
        interview_count: num,
        total_interview_count: num,
        school: z.object({
          slug: z.string().min(1),
          name: z.string(),
          shorthand_name: z.string().nullable(),
          city: z.string().nullable(),
          state: z.string().nullable(),
        }),
      }),
    ),
  }),
});

export const interviewOverviewData = z.object({
  getMedicalInterviewOverview: z
    .object({
      avg_interview_difficulty: num,
      interview_count: num,
      interview_format: z.string().nullable(),
      interview_type: z.string().nullable(),
    })
    .nullable(),
});

export const interviewFeedbackData = z.object({
  getInterviewFeedbackForSchool: z
    .object({
      positive: strList,
      negative: strList,
      before_interview: strList,
    })
    .nullable(),
});

export const questionsData = z.object({
  getInterviewsForSchool: z
    .object({
      questions: z
        .array(
          z.object({
            id: z.union([z.number(), z.string()]),
            body: z.string().nullable(),
            votes: num,
          }),
        )
        .nullable(),
    })
    .nullable(),
});

export const schoolStatsData = z.object({
  getSchoolStats: z.array(
    z.object({
      school: z
        .object({
          slug: z.string().nullable(),
        })
        .nullable(),
      application_number: z.number(),
      application_to_interview_pct: num,
      interview_number: z.number(),
      interview_to_admitted_pct: num,
      admitted_number: num,
      mcat: num,
      gpa: num,
      residence_type: z.string().nullish(),
      research_hours: num,
      clinical_hours: num,
      non_clinical_hours: num,
    }),
  ),
});

/** School fields only (the cycle-results row's user_* fields are never selected). A row without a slug is dropped. */
export const crestSchool = z.object({
  slug: z.string().min(1),
  name: z.string(),
  shorthand_name: z.string().nullable(),
  state: z.string().nullable(),
  city: z.string().nullable(),
  crest_url: z.string().nullable(),
});

export const schoolCrestsData = z.object({
  getAllCycleResults: z.array(z.object({ school: crestSchool.nullable() })),
});

/** The curriculum reply: rows are validated one by one (`curriculumRow`) so a single odd row costs only itself. */
export const schoolCurriculumData = z.object({
  getAllSchoolCurriculum: z.array(z.unknown()),
});

/** `null` on any field means Admit has no answer for that school (unknown, never "no"). Unknown keys are stripped. */
export const curriculumRow = z.object({
  school: z.object({ slug: z.string().min(1) }),
  aoa: z.boolean().nullable(),
  pc_grades: z.string().nullable(),
  pc_length: z.string().nullable(),
  clerk_grades: z.string().nullable(),
  nbme_or_in_house: z.string().nullable(),
  mspe: z.boolean().nullable(),
  lecture_attendance_required: z.boolean().nullable(),
  home_hospital: z.array(z.string()).nullable(),
});

/** One listed applicant of a school's cycle, validated on its own so a malformed row drops only itself. */
export const cycleApplicantRow = z.object({
  user_id: z.string().nullish(),
  md_phd: z.boolean().nullish(),
  secondary_submitted: z.string().nullish(),
  interview_received: z.string().nullish(),
  decision_date: z.string().nullish(),
  decision: z.string().nullish(),
});

/** `null` is a school or cycle Admit has no page for (not an error, not an empty cycle). */
export const schoolCycleData = z.object({
  getCycleResultsBySchool: z
    .object({
      total_applications: num,
      num_of_interviews: num,
      num_of_acceptances: num,
      num_of_rejections: num,
      current_applicants: z.array(z.unknown()).nullish(),
    })
    .nullable(),
});
