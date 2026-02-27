import { z } from "zod";

export const FEEDBACK_CATEGORIES = ["bug", "feature", "general", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const feedbackSchema = z.object({
  name: z
    .string()
    .max(100, "Name must be at most 100 characters")
    .optional()
    .default(""),
  email: z.string().email("Please enter a valid email address"),
  category: z.enum(FEEDBACK_CATEGORIES, {
    message: "Please select a category",
  }),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be at most 2000 characters"),
  honeypot: z.string().max(0).optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
