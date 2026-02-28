import { z } from "zod";

export const MAX_RMHARK_LENGTH = 280;
export const MAX_COMMENT_LENGTH = 500;

export const createRMHarkSchema = z.object({
  content: z
    .string()
    .min(1, "RMHark cannot be empty")
    .max(MAX_RMHARK_LENGTH, `RMHark must be at most ${MAX_RMHARK_LENGTH} characters`),
});

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(MAX_COMMENT_LENGTH, `Comment must be at most ${MAX_COMMENT_LENGTH} characters`),
  parentId: z.string().optional(),
});

export type CreateRMHarkInput = z.infer<typeof createRMHarkSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
