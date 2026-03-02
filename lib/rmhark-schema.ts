import { z } from "zod";

export const MAX_RMHARK_LENGTH = 280;
export const MAX_COMMENT_LENGTH = 500;
export const MAX_POLL_QUESTION_LENGTH = 200;
export const MAX_POLL_OPTION_LENGTH = 80;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 4;

const gifUrlSchema = z
  .string()
  .url("Must be a valid URL")
  .refine(
    (url) => {
      try {
        const host = new URL(url).hostname;
        return (
          host.endsWith("tenor.com") ||
          host.endsWith("giphy.com") ||
          host.endsWith("giphy.gif")
        );
      } catch {
        return false;
      }
    },
    { message: "Must be a Tenor or Giphy link" }
  );

const pollSchema = z.object({
  question: z
    .string()
    .min(1, "Poll question cannot be empty")
    .max(MAX_POLL_QUESTION_LENGTH, `Poll question must be at most ${MAX_POLL_QUESTION_LENGTH} characters`),
  options: z
    .array(
      z
        .string()
        .min(1, "Option cannot be empty")
        .max(MAX_POLL_OPTION_LENGTH, `Option must be at most ${MAX_POLL_OPTION_LENGTH} characters`)
    )
    .min(MIN_POLL_OPTIONS, `Poll must have at least ${MIN_POLL_OPTIONS} options`)
    .max(MAX_POLL_OPTIONS, `Poll can have at most ${MAX_POLL_OPTIONS} options`),
  multiSelect: z.boolean().default(false),
});

export const createRMHarkSchema = z
  .object({
    content: z
      .string()
      .max(MAX_RMHARK_LENGTH, `RMHark must be at most ${MAX_RMHARK_LENGTH} characters`)
      .optional()
      .default(""),
    poll: pollSchema.optional(),
    gifUrl: gifUrlSchema.optional(),
  })
  .refine(
    (data) => data.content.trim().length > 0 || data.poll || data.gifUrl,
    { message: "Post must have text, a poll, or a GIF" }
  );

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(MAX_COMMENT_LENGTH, `Comment must be at most ${MAX_COMMENT_LENGTH} characters`),
  parentId: z.string().optional(),
});

export type CreateRMHarkInput = z.infer<typeof createRMHarkSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type PollInput = z.infer<typeof pollSchema>;
