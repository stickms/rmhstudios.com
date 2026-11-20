/** Raw zod schemas for Admit's GraphQL responses. Internal: never exported from `index.ts`. Unknown keys are stripped. */
import { z } from 'zod';

const num =
  z
    .number()
    .nullable();
const strList =
  z
    .array(
      z.string(),
    )
    .nullable();

export const feedData =
  z.object(
    {
      getRecentSchoolCycleUpdates:
        z.array(
          z.object(
            {
              cycle_update_id:
                z
                  .string()
                  .min(
                    1,
                  ),
              school:
                z.object(
                  {
                    slug: z
                      .string()
                      .min(
                        1,
                      ),
                  },
                ),
              user_id:
                z
                  .string()
                  .min(
                    1,
                  ),
              current_status:
                z.string(),
              current_status_date:
                z.string(),
            },
          ),
        ),
    },
  );

/** Selects md_phd and nothing else. */
export const profileFlagData =
  z.object(
    {
      getCycleTrackProfileByUserId:
        z
          .object(
            {
              md_phd:
                z
                  .boolean()
                  .nullable(),
            },
          )
          .nullable(),
    },
  );

export const interviewSchoolsData =
  z.object(
    {
      getMedicalInterviewSchoolsOverview:
        z.object(
          {
            totalCount:
              z.number(),
            schools:
              z.array(
                z.object(
                  {
                    avg_interview_difficulty:
                      num,
                    interview_count:
                      num,
                    total_interview_count:
                      num,
                    school:
                      z.object(
                        {
                          slug: z
                            .string()
                            .min(
                              1,
                            ),
                          name: z.string(),
                          shorthand_name:
                            z
                              .string()
                              .nullable(),
                          city: z
                            .string()
                            .nullable(),
                          state:
                            z
                              .string()
                              .nullable(),
                        },
                      ),
                  },
                ),
              ),
          },
        ),
    },
  );

export const interviewOverviewData =
  z.object(
    {
      getMedicalInterviewOverview:
        z
          .object(
            {
              avg_interview_difficulty:
                num,
              interview_count:
                num,
              interview_format:
                z
                  .string()
                  .nullable(),
              interview_type:
                z
                  .string()
                  .nullable(),
            },
          )
          .nullable(),
    },
  );

export const interviewFeedbackData =
  z.object(
    {
      getInterviewFeedbackForSchool:
        z
          .object(
            {
              positive:
                strList,
              negative:
                strList,
              before_interview:
                strList,
            },
          )
          .nullable(),
    },
  );

export const questionsData =
  z.object(
    {
      getInterviewsForSchool:
        z
          .object(
            {
              questions:
                z
                  .array(
                    z.object(
                      {
                        id: z.union(
                          [
                            z.number(),
                            z.string(),
                          ],
                        ),
                        body: z
                          .string()
                          .nullable(),
                        votes:
                          num,
                      },
                    ),
                  )
                  .nullable(),
            },
          )
          .nullable(),
    },
  );

export const schoolStatsData =
  z.object(
    {
      getSchoolStats:
        z.array(
          z.object(
            {
              school:
                z
                  .object(
                    {
                      slug: z
                        .string()
                        .nullable(),
                    },
                  )
                  .nullable(),
              application_number:
                z.number(),
              application_to_interview_pct:
                num,
              interview_number:
                z.number(),
              interview_to_admitted_pct:
                num,
              admitted_number:
                num,
              mcat: num,
              gpa: num,
              research_hours:
                num,
              clinical_hours:
                num,
              non_clinical_hours:
                num,
            },
          ),
        ),
    },
  );
