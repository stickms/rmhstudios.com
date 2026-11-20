import { z } from 'zod';
import type {
  MedEventType,
  MedProgram,
} from '../../../engine/types';
import { cycleYearFromLabel } from '../../../engine/cycle';
import { normalizeSchoolKey } from '../../../engine/names';
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

const PROGRAM_BY_QUERY: Record<
  string,
  MedProgram
> =
  {
    reg: 'REG',
    phd: 'PHD',
  };

/**
 * summary.json?program=reg|phd: the same daily counts as the school-page tables, for one program and cycle.
 * Returns one table, or none when the endpoint says the data is unavailable (missing is not zero).
 * `requestedProgram` is the `program=` query value the caller sent: exactly `reg` or `phd` (any case), else it throws.
 * The payload label ("MD", "DO", "MD-PhD") is only cross-checked: it must contain "phd" exactly when PHD was requested.
 * The schoolKey is the payload's, normalized.
 */
export function parseSummaryJson(
  json: unknown,
  requestedProgram: string,
): ParsedTable[] {
  const program =
    PROGRAM_BY_QUERY[
      requestedProgram.toLowerCase()
    ];
  if (
    program ===
    undefined
  )
    throw new UnexpectedPageError(
      `unknown summary program: ${JSON.stringify(requestedProgram)}`,
    );
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
  // The requested program is the authority; the label only has to agree (a PhD payload must never be stored as REG).
  if (
    /phd/i.test(
      s.program,
    ) !==
    (program ===
      'PHD')
  )
    throw new UnexpectedPageError(
      `summary.json program label ${JSON.stringify(s.program)} does not match requested ${requestedProgram}`,
    );
  const schoolKey =
    normalizeSchoolKey(
      s
        .school
        .key,
    );
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
                    schoolKey,
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
