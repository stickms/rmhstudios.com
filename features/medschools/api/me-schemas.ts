import { z } from 'zod';
import { CHARTED_TYPES } from '../engine/public-read';
import { LIMITS, MILESTONE_TYPES, cleanText, cycleYearProblem, normalizeHomeState } from '../engine/tracker';

/**
 * Bodies and queries of the private `me/**` endpoints (server-side importers only; the contract imports types).
 * Every object is strict: an unknown key (`userId`, `dedupeHash`) is a 400, never ignored.
 */

/** A cycle year the tracker will create: inside the window around the current cycle (D7), checked at parse time. */
const windowedCycleYear = z.number().superRefine((v, ctx) => {
  if (cycleYearProblem(v, new Date())) ctx.addIssue({ code: 'custom', message: 'cycle year out of range' });
});

/** A cycle year that already exists may be read or deleted whatever its age, so only sanity is checked. */
const knownCycleYear = z.coerce.number().int().min(2000).max(2100);

const homeState = z
  .string()
  .max(8)
  .nullable()
  .refine((v) => normalizeHomeState(v) !== 'invalid', { message: 'invalid home state' });

const slug = z.string().regex(/^[a-z0-9-]{1,80}$/);

/** Text that cleans to something within `max` code points, or to nothing at all (which clears the field). */
const userText = (max: number) =>
  z
    .string()
    .max(max * 4 + 64)
    .refine((v) => cleanText(v, max) !== null || cleanText(v, Number.MAX_SAFE_INTEGER) === null, {
      message: 'text too long',
    });

export const getTrackerQuery = z.object({ cycle: knownCycleYear.optional() }).strict();

export const putCycleBody = z
  .object({ cycleYear: windowedCycleYear, homeState: homeState.optional(), shareAnonymously: z.boolean() })
  .strict();

export const deleteCycleQuery = z.object({ cycleYear: knownCycleYear }).strict();

export const addApplicationBody = z
  .object({ cycleYear: windowedCycleYear, schoolSlug: slug, program: z.enum(['REG', 'PHD']) })
  .strict();

export const patchApplicationBody = z.object({ notes: userText(LIMITS.trackerNotes).nullable() }).strict();

/** The shape only: whether the day is on the calendar and inside the application's cycle is the service's (it knows the cycle). */
export const putMilestoneBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();

export const milestoneTypeParam = z.enum(MILESTONE_TYPES as unknown as [string, ...string[]]);

/* ------------------------- saved lists and preferences ------------------------- */

/** A list name: required, and within the cap after cleaning (whitespace-only is not a name). */
const listName = z
  .string()
  .max(LIMITS.listName * 4 + 64)
  .refine((v) => cleanText(v, LIMITS.listName) !== null, { message: 'invalid list name' });

const rowId = z.string().min(1).max(100);

/** The ids of a full reorder. A list holds at most 200 items, so no honest body is longer. */
const orderIds = z.array(rowId).max(LIMITS.itemsPerList);

const listProgram = z.enum(['ANY', 'REG', 'PHD']);

export const createListBody = z.object({ name: listName }).strict();
export const patchListBody = z.object({ name: listName }).strict();
export const putListOrderBody = z.object({ ids: orderIds }).strict();
export const putItemOrderBody = z.object({ ids: orderIds }).strict();

/** `listId` and `newListName` are alternatives; neither means "my default list" (created on first use). */
export const saveListItemBody = z
  .object({
    schoolSlug: slug,
    program: listProgram.optional(),
    listId: rowId.optional(),
    newListName: listName.optional(),
  })
  .strict()
  .refine((v) => v.listId === undefined || v.newListName === undefined, { message: 'listId or newListName, not both' });

export const patchListItemBody = z
  .object({ note: userText(LIMITS.note).nullable().optional(), program: listProgram.optional() })
  .strict()
  .refine((v) => v.note !== undefined || v.program !== undefined, { message: 'nothing to change' });

export const addListToTrackerBody = z.object({ cycleYear: windowedCycleYear.optional() }).strict();

/** Every preference is sent every time (a PUT replaces the row); an unknown value or key is a 400. */
export const putPrefsBody = z
  .object({
    programFilter: z.enum(['ALL', 'REG', 'PHD']),
    degree: z.enum(['MD', 'DO']).nullable(),
    homeState,
    chartCategories: z.array(z.enum(CHARTED_TYPES as unknown as [string, ...string[]])).max(CHARTED_TYPES.length),
  })
  .strict();
