import { z } from "zod";

export const FEEDBACK_CATEGORIES = ["bug", "feature", "general", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES, {
    message: "Please select a category",
  }),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be at most 2000 characters"),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
