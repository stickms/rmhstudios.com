/**
 * Content warning reasons (sprint 06 #16) - the zod schemas. Split from `./content-warning` so the composers and
 * renderers, which import the pure half, do not bring zod with them.
 */
import { z } from 'zod';
import { isValidContentWarning, MAX_CONTENT_WARNING_LENGTH } from '@/lib/feed/content-warning';

/** One reason: plain text, 1-80 characters, no line breaks. Over-long, blank or multi-line input is refused. */
export const contentWarningReasonSchema = z
  .string()
  .max(MAX_CONTENT_WARNING_LENGTH * 4)
  .refine(isValidContentWarning, {
    message: `A content warning reason is 1 to ${MAX_CONTENT_WARNING_LENGTH} characters on one line.`,
  });

/** The reason as a request field: optional, and `null` clears it. */
export const contentWarningFieldSchema = contentWarningReasonSchema.nullable().optional();

/** The reader preference: `/api/settings/content-warnings`. */
export const contentWarningSettingSchema = z.object({ showContentWarnings: z.boolean() });
