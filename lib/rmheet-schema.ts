import { z } from "zod";

export const MAX_RMHEET_LENGTH = 280;
export const MAX_COMMENT_LENGTH = 500;

export const createRMHeetSchema = z.object({
  content: z
    .string()
    .min(1, "RMHeet cannot be empty")
    .max(MAX_RMHEET_LENGTH, `RMHeet must be at most ${MAX_RMHEET_LENGTH} characters`),
});

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(MAX_COMMENT_LENGTH, `Comment must be at most ${MAX_COMMENT_LENGTH} characters`),
  parentId: z.string().optional(),
});

export type CreateRMHeetInput = z.infer<typeof createRMHeetSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
