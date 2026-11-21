import { z } from 'zod';
import { scrubErrorMessage } from '@/lib/feedback-scrub';

export const FEEDBACK_CATEGORIES = [
  'bug',
  'accessibility',
  'feature',
  'general',
  'other',
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** What an accessibility report says the member was using. Ids only; the form translates them. */
export const ASSISTIVE_TECH = [
  'screen_reader',
  'magnifier',
  'voice_control',
  'keyboard',
  'switch',
  'other',
] as const;
export type AssistiveTech = (typeof ASSISTIVE_TECH)[number];

/** Length caps for the context items (FR-2): each value is refused, not trimmed, when over its cap. */
export const CONTEXT_CAPS = {
  path: 200,
  edition: 40,
  locale: 16,
  build: 40,
  errorMessage: 200,
  errors: 3,
  where: 200,
} as const;

/** The path of the page the member was on, with any query string or fragment removed. */
export function stripQuery(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

export { scrubErrorMessage } from '@/lib/feedback-scrub';

/**
 * The context a member chose to send. Every key is optional (an unticked item is simply absent) and unknown keys are
 * dropped. The path must start with `/` and loses any query string or fragment here, whatever the client did.
 */
export const feedbackContextSchema = z.object({
  path: z
    .string()
    .max(CONTEXT_CAPS.path)
    .regex(/^\//, 'The path must start with /')
    .transform(stripQuery)
    .optional(),
  viewport: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/)
    .optional(),
  edition: z.string().min(1).max(CONTEXT_CAPS.edition).optional(),
  locale: z.string().min(1).max(CONTEXT_CAPS.locale).optional(),
  /** The client sends `current`; the server replaces it with the running build id. */
  build: z.string().min(1).max(CONTEXT_CAPS.build).optional(),
  errors: z
    .array(z.string().max(CONTEXT_CAPS.errorMessage).transform(scrubErrorMessage))
    .max(CONTEXT_CAPS.errors)
    .optional(),
  /** Accessibility reports: the page the problem is on, prefilled with the path. */
  where: z.string().max(CONTEXT_CAPS.where).optional(),
});
export type FeedbackContext = z.infer<typeof feedbackContextSchema>;

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES, {
    message: 'Please select a category',
  }),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message must be at most 2000 characters'),
  assistiveTech: z.enum(ASSISTIVE_TECH).optional(),
  context: feedbackContextSchema.optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
