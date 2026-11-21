/**
 * Zod schemas for the sight reading results endpoints (`sprint.contract.ts`). The shape checks
 * live here; the rules (lengths per run, levels in order, the recomputed score) are the pure
 * `record.ts`, applied by `sprint.server.ts`.
 */
import { z } from 'zod';
import { durationMsSchema } from '@/lib/rmhmusic/history-schema';
import { isUtcDate } from './generate';
import {
  BAR_NOTES,
  DAILY_LEVELS,
  DAILY_PROMPTS_PER_LEVEL,
  FREEPLAY_PROMPTS,
  isSprintLevelId,
} from './levels';
import type { SprintLevelId } from './levels';
import { MAX_PROMPT_MS } from './record';
import { boardMeSchema } from '../social/social-schema';

const level =
  z.custom<SprintLevelId>(
    isSprintLevelId,
    {
      message:
        'Unknown level',
    },
  );
const date =
  z
    .string()
    .refine(
      isUtcDate,
      {
        message:
          'Not a YYYY-MM-DD date',
      },
    );
const ms =
  z
    .number()
    .min(
      0,
    )
    .max(
      MAX_PROMPT_MS,
    );

/** One prompt's result as the game sends it (`PromptResult`); its `points` are recomputed. */
export const promptResultSchema =
  z.object(
    {
      level,
      kind: z.enum(
        [
          'note',
          'accidental',
          'chord',
          'bar',
        ],
      ),
      correct:
        z.boolean(),
      ms: ms.nullable(),
      noteMs:
        z
          .array(
            ms,
          )
          .max(
            BAR_NOTES,
          )
          .readonly(),
      points:
        z
          .number()
          .min(
            0,
          )
          .max(
            100,
          ),
      skipped:
        z.boolean(),
    },
  );

const MAX_RESULTS =
  Math.max(
    FREEPLAY_PROMPTS,
    DAILY_LEVELS.length *
      DAILY_PROMPTS_PER_LEVEL,
  );
const results =
  z
    .array(
      promptResultSchema,
    )
    .max(
      MAX_RESULTS,
    )
    .readonly();

/** Body of `POST /api/rmhmusic/sprint/freeplay`. */
export const sprintFreeplayBody =
  z.object(
    {
      level,
      results,
      /** How long the run took, from the client's clock; recorded in the practice log. */
      durationMs:
        durationMsSchema,
    },
  );

/** Body of `POST /api/rmhmusic/sprint/daily`: `date` is the UTC date the run was dealt on. */
export const sprintDailyBody =
  z.object(
    {
      date,
      results,
      /** How long the run took, from the client's clock; recorded in the practice log. */
      durationMs:
        durationMsSchema,
    },
  );

/** Body of `POST /api/rmhmusic/sprint/daily-start`. */
export const sprintDailyStartBody =
  z.object(
    {
      date,
    },
  );

/** Query of `GET /api/rmhmusic/sprint`: the date the client would deal today's run on. */
export const sprintOverviewQuery =
  z.object(
    {
      date,
    },
  );

const best =
  z.object(
    {
      level,
      bestScore:
        z
          .number()
          .int(),
      bestAvgMs:
        z
          .number()
          .int()
          .nullable(),
    },
  );

/** Where the asked date's challenge stands: not started, started but never finished, or scored. */
export const DAILY_STATES =
  [
    'open',
    'started',
    'scored',
  ] as const;

export const sprintOverviewRes =
  z.object(
    {
      bests:
        z.array(
          best,
        ),
      daily:
        z.enum(
          DAILY_STATES,
        ),
      /** Days in a row with a scored daily run, ending today or yesterday. */
      streak:
        z
          .number()
          .int()
          .min(
            0,
          ),
    },
  );

export const sprintFreeplayRes =
  z.object(
    {
      outcome:
        z.literal(
          'saved',
        ),
      best,
    },
  );

export const sprintDailyRes =
  z.object(
    {
      outcome:
        z.enum(
          [
            'saved',
            'already-scored',
          ],
        ),
      /** Where the run stands on the Daily board (Phase 6); old clients ignore it. */
      board:
        boardMeSchema.optional(),
    },
  );

export const sprintDailyStartRes =
  z.object(
    {
      /** Whether this start is the date's scored run (false: the date already had one started). */
      scored:
        z.boolean(),
    },
  );
