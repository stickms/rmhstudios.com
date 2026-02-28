import { z } from "zod";

export const updateProfileSchema = z.object({
  bio: z
    .string()
    .max(160, "Bio must be at most 160 characters")
    .optional()
    .nullable(),
  location: z
    .string()
    .max(100, "Location must be at most 100 characters")
    .optional()
    .nullable(),
  website: z
    .string()
    .max(200, "Website URL must be at most 200 characters")
    .url("Must be a valid URL")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
