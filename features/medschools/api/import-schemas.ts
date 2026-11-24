import { z } from 'zod';
import { IMPORT_LIMITS } from '../engine/import';
import { MILESTONE_TYPES, cycleYearProblem, type MilestoneType } from '../engine/tracker';

/**
 * The tracker import's inputs (server-side importer only; the contract imports types). Restated here, like
 * `qa-schemas.ts`, so this module and its tests do not load Prisma.
 */

const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);

/** A cycle year the tracker will hold: inside the window around the current cycle (the same check as `me-schemas`). */
const windowedCycleYear = z.number().superRefine((v, ctx) => {
  if (cycleYearProblem(v, new Date())) ctx.addIssue({ code: 'custom', message: 'cycle year out of range' });
});

const milestoneType = z.enum(MILESTONE_TYPES as unknown as [MilestoneType, ...MilestoneType[]]);

/** `POST .../import/parse` as JSON: pasted text. Longer than the limit is cut (and the member told), not refused. */
export const importTextBody = z
  .object({
    text: z
      .string()
      .max(IMPORT_LIMITS.pasteChars)
      // NUL and other control characters except newline and tab.
      .refine((s) => !/[^\P{Cc}\n\r\t]/u.test(s), 'control characters'),
  })
  .strict();
export type ImportTextBody = z.infer<typeof importTextBody>;

/**
 * What the model must return. The envelope is checked here; each row and each milestone is then checked on its own
 * (`validate.ts`) so one malformed row costs that row and not the import. Unknown keys are ignored: the model's `notes`
 * is read by nothing and never reaches the response.
 */
export const modelMilestone = z.object({
  type: milestoneType,
  date: z.string().max(10).nullable(),
  raw: z.string().min(1).max(IMPORT_LIMITS.rawChars),
});
export const modelRow = z.object({
  schoolName: z.string().trim().min(2).max(120),
  program: z.string().trim().max(40).optional(),
  milestones: z.array(z.unknown()).max(20),
});
export const modelOutput = z.object({
  rows: z.array(z.unknown()).max(IMPORT_LIMITS.schools * 2),
  cycleHint: z.number().int().nullable().optional(),
});
export type ModelOutput = z.infer<typeof modelOutput>;

/** `POST .../import/save`: the member's edited rows, a cycle, and per date whether an existing date may be replaced. */
export const importSaveBody = z
  .object({
    cycleYear: windowedCycleYear,
    rows: z
      .array(
        z
          .object({
            slug,
            program: z.enum(['REG', 'PHD']),
            milestones: z
              .array(
                z
                  .object({
                    type: milestoneType,
                    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                    /** The member ticked a date that conflicts with one already on the tracker. */
                    overwrite: z.boolean(),
                  })
                  .strict(),
              )
              .min(1)
              .max(MILESTONE_TYPES.length),
          })
          .strict(),
      )
      .min(1)
      .max(IMPORT_LIMITS.schools),
  })
  .strict();
export type ImportSaveBody = z.infer<typeof importSaveBody>;
