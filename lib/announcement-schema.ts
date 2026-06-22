import { z } from "zod";
import {
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
} from "@/lib/rmhark-schema";

export const MAX_ANNOUNCEMENT_TITLE_LENGTH = 120;
export const MAX_ANNOUNCEMENT_BODY_LENGTH = 1000;
export const MAX_ANNOUNCEMENT_IMAGES = 4;

// Uploaded images go through /api/rmharks/image, which returns `/api/feed/image/<file>`.
const announcementImageUrlSchema = z
  .string()
  .regex(/^\/api\/feed\/image\/[A-Za-z0-9._-]+$/, "Invalid image reference");

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

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(MAX_ANNOUNCEMENT_TITLE_LENGTH),
  body: z.string().min(1).max(MAX_ANNOUNCEMENT_BODY_LENGTH),
  linkUrl: z.string().url().max(500).optional().or(z.literal("")),
  linkLabel: z.string().max(60).optional(),
  variant: z.enum(["info", "success", "warning", "event"]).default("info"),
  pinned: z.boolean().default(true),
  expiresAt: z.string().datetime().optional().or(z.literal("")),
  imageUrls: z.array(announcementImageUrlSchema).max(MAX_ANNOUNCEMENT_IMAGES).optional(),
  gifUrl: gifUrlSchema.optional().or(z.literal("")),
  poll: pollSchema.optional(),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type AnnouncementPollInput = z.infer<typeof pollSchema>;

// Re-export poll constants for the admin maker UI.
export {
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
};
