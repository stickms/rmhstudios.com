/** Client-safe request schemas for the recurring-thread endpoints (shared by the routes and `recurring.contract.ts`). */
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/calendar/tz';
import { BODY_MAX, CADENCES, MONTH_DAY_MAX, TITLE_MAX, fitsPost, parseTime } from '@/lib/communities/recurring';

/**
 * The template fields. `.strict()` refuses anything else, so a media field (images, a GIF, a poll) is a 400:
 * a template is text only, which is also why the community's image-description rule cannot fail on it.
 */
const templateFields = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX),
    body: z.string().trim().max(BODY_MAX).default(''),
    flairId: z.string().min(1).max(64).nullable().optional(),
    cadence: z.enum(CADENCES),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(MONTH_DAY_MAX).nullable().optional(),
    time: z.string().refine((v) => parseTime(v) !== null, 'Use a 24-hour time such as 09:00'),
    timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  })
  .strict();

type TemplateFields = z.infer<typeof templateFields>;

function refineTemplate(v: TemplateFields, ctx: z.RefinementCtx): void {
  if (v.cadence === 'weekly' && (v.weekday === null || v.weekday === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['weekday'],
      message: 'Choose a weekday',
    });
  }
  if (v.cadence === 'monthly' && (v.dayOfMonth === null || v.dayOfMonth === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['dayOfMonth'],
      message: 'Choose a day of the month',
    });
  }
  if (!fitsPost(v.title, v.body)) {
    ctx.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'The title and body must fit one post',
    });
  }
}

export const createRecurringBody = templateFields.superRefine(refineTemplate);

/** A full edit (saving makes the editor the author, and resumes a paused template) or a pause / resume on its own. */
export const updateRecurringBody = z.union([
  templateFields
    .extend({
      active: z.boolean().optional(),
    })
    .strict()
    .superRefine(refineTemplate),
  z
    .object({
      active: z.boolean(),
    })
    .strict(),
]);

export type CreateRecurringBody = z.infer<typeof createRecurringBody>;
export type UpdateRecurringBody = z.infer<typeof updateRecurringBody>;
