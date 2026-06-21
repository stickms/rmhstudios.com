import { z } from "zod";

export const MAX_RMHARK_LENGTH = 280;
export const MAX_RMHARK_IMAGES = 4;
const feedImageUrlSchema = z
  .string()
  .regex(/^\/api\/feed\/image\/[A-Za-z0-9._-]+$/, "Invalid image reference");
export const MAX_COMMENT_LENGTH = 500;
export const MAX_POLL_QUESTION_LENGTH = 200;
export const MAX_POLL_OPTION_LENGTH = 80;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 4;

const IMAGE_EXT_REGEX = /\.(gif|png|jpe?g|webp|avif)(\?[^\s]*)?$/i;

const gifUrlSchema = z
  .string()
  .url("Must be a valid URL")
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        if (host.endsWith("tenor.com") || host.endsWith("giphy.com")) return true;
        if (IMAGE_EXT_REGEX.test(parsed.pathname)) return true;
        return false;
      } catch {
        return false;
      }
    },
    { message: "Must be a Tenor/Giphy link or a direct image URL" }
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
  // Optional scheduled close, in hours from now (max 30 days).
  durationHours: z.number().int().min(1).max(720).optional(),
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
    imageUrls: z
      .array(feedImageUrlSchema)
      .max(MAX_RMHARK_IMAGES, `At most ${MAX_RMHARK_IMAGES} images allowed`)
      .optional(),
    // Quote-repost: id of the post being quoted.
    originalId: z.string().max(64).optional(),
    // Audience visibility.
    audience: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).optional(),
    // Paid post: coins required to unlock (0/undefined = free).
    unlockPrice: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine(
    (data) =>
      data.content.trim().length > 0 ||
      data.poll ||
      data.gifUrl ||
      (data.imageUrls?.length ?? 0) > 0 ||
      !!data.originalId,
    { message: "Post must have text, a poll, an image/GIF, or be a quote" }
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
