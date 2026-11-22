/** Zod schemas for the RMHType saved-text endpoints (s10-05). Server-side; the contracts take their types by `import type`. */
import { z } from 'zod';
import { ghostSamplesSchema } from '@/lib/rmhtype/ghost-schema';
import { MAX_WPM } from '@/lib/rmhtype/typing-run';
import { TEXT_BODY_MAX, TEXT_TITLE_MAX, normaliseTextBody, normaliseTextTitle } from '@/lib/rmhtype/texts';

const titleField = z
  .string()
  .max(TEXT_TITLE_MAX * 4)
  .refine((v) => normaliseTextTitle(v).ok, 'Invalid title');
const bodyField = z
  .string()
  .max(TEXT_BODY_MAX * 2)
  .refine((v) => normaliseTextBody(v).ok, 'Invalid text');

export const textParams = z.object({ textId: z.string().min(1).max(40) });

export const createTextBody = z.object({ title: titleField, body: bodyField });

/** A rename, a new body, or both. A new body resets the text's record (the page confirms first). */
export const updateTextBody = z
  .object({ title: titleField.optional(), body: bodyField.optional() })
  .refine((v) => v.title !== undefined || v.body !== undefined, 'Nothing to change');

export const textRunBody = z.object({
  wpm: z.number().min(0).max(MAX_WPM),
  accuracy: z.number().min(0).max(100),
  timeMs: z.number().int().min(1),
  typedLength: z.number().int().min(1).max(TEXT_BODY_MAX),
  /** The coarse progress curve for the ghost; dropped when it is not believable. */
  samples: ghostSamplesSchema.optional(),
});
