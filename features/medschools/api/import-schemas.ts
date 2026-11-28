import { z } from 'zod';
import { SCHOOL_SLUG_RE } from '../engine/school-slug';
import { IMPORT_LIMITS, LIST_IMPORT_LIMITS } from '../engine/import';
import { LIMITS, MILESTONE_TYPES, cleanText, cycleYearProblem, type MilestoneType } from '../engine/tracker';

/** Tracker and list import inputs. The contract imports only their types. */

const slug = z.string().regex(SCHOOL_SLUG_RE);

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

/* ------------------------------ the list import (owner 2026-11-24) ------------------------------ */

/** What the list import's model must return: names, each checked on its own (`list-validate.ts`). */
export const listModelOutput = z.object({
  schools: z.array(z.unknown()).max(LIST_IMPORT_LIMITS.modelSchools),
});
export const listModelRow = z.object({
  name: z.string().trim().min(2).max(LIST_IMPORT_LIMITS.nameChars),
  program: z.string().trim().max(40).optional(),
});

const rowId = z.string().min(1).max(100);
const listName = z
  .string()
  .max(LIMITS.listName * 4 + 64)
  .refine((v) => cleanText(v, LIMITS.listName) !== null, { message: 'invalid list name' });

/**
 * `POST me/lists/import/save`: the ticked rows, by slug and program, into one of the caller's lists or a new one. Never
 * a user, an item id or a school id (strict); another member's list id is a 404 from the writer.
 */
export const listImportSaveBody = z
  .object({
    target: z.union([
      z.object({ listId: rowId }).strict(),
      z.object({ newList: listName }).strict(),
    ]),
    items: z
      .array(z.object({ slug, program: z.enum(['ANY', 'REG', 'PHD']) }).strict())
      .min(1)
      .max(LIST_IMPORT_LIMITS.schools),
  })
  .strict();
export type ListImportSaveBody = z.infer<typeof listImportSaveBody>;
