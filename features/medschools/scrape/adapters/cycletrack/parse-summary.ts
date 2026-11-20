import { z } from 'zod';
import type {
  MedEventType,
  MedProgram,
} from '../../../engine/types';
import { cycleYearFromLabel } from '../../../engine/cycle';
import {
  cycleTrackCount,
  UnexpectedPageError,
  type ParsedTable,
} from './parse-school';

const countField =
  z
    .number()
    .int()
    .nonnegative();

const summarySchema =
  z.object(
    {
      availability:
        z.string(),
      cycle:
        z.string(),
      program:
        z.string(),
      school:
        z.object(
          {
            key: z.string(),
          },
        ),
      daily:
        z.array(
          z.object(
            {
              date: z
                .string()
                .regex(
                  /^\d{4}-\d{2}-\d{2}$/,
                ),
              observationCounts:
                z.object(
                  {
                    Acceptance:
                      countField,
                    Interview:
                      countField,
                    Rejection:
                      countField,
                    Secondary:
                      countField,
                    Waitlist:
                      countField,
                  },
                ),
            },
          ),
        ),
    },
  );

const EVENT_KEYS: [
  keyof z.infer<
    typeof summarySchema
  >['daily'][number]['observationCounts'],
  MedEventType,
][] =
  [
    [
      'Secondary',
      'SECONDARY',
    ],
    [
      'Interview',
      'INTERVIEW',
    ],
    [
      'Rejection',
      'REJECTION',
    ],
    [
      'Waitlist',
      'WAITLIST',
    ],
    [
      'Acceptance',
      'ACCEPTANCE',
    ],
  ];

/**
 * summary.json?program=reg|phd: the same daily counts as the school-page tables, for one program and cycle.
 * Returns one table, or none when the endpoint says the data is unavailable (missing is not zero).
 * `program` "MD"/"DO" is the regular program; anything containing "phd" is PHD. The schoolKey is the one in the payload.
 */
export function parseSummaryJson(
  json: unknown,
): ParsedTable[] {
  const parsed =
    summarySchema.safeParse(
      json,
    );
  if (
    !parsed.success
  )
    throw new UnexpectedPageError(
      `summary.json shape: ${parsed.error.message}`,
    );
  const s =
    parsed.data;
  if (
    s.availability !==
    'available'
  )
    return [];
  let cycleYear: number;
  try {
    cycleYear =
      cycleYearFromLabel(
        s.cycle,
      );
  } catch (e) {
    throw new UnexpectedPageError(
      (
        e as Error
      )
        .message,
    );
  }
  const program: MedProgram =
    /phd/i.test(
      s.program,
    )
      ? 'PHD'
      : 'REG';
  const counts =
    s.daily.flatMap(
      (
        d,
      ) =>
        EVENT_KEYS.flatMap(
          ([
            key,
            eventType,
          ]) =>
            d
              .observationCounts[
              key
            ] >
            0
              ? [
                  cycleTrackCount(
                    s
                      .school
                      .key,
                    program,
                    cycleYear,
                    d.date,
                    eventType,
                    d
                      .observationCounts[
                      key
                    ],
                  ),
                ]
              : [],
        ),
    );
  return [
    {
      program,
      cycleYear,
      counts,
    },
  ];
}
