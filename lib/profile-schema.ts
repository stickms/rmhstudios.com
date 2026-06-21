import { z } from "zod";
import { HANDLE_REGEX } from "@/lib/handle";

export const dmPrivacyValues = ["EVERYONE", "FOLLOWERS", "NONE"] as const;

export const updateProfileSchema = z.object({
  handle: z
    .string()
    .min(3, "Handle must be at least 3 characters")
    .max(20, "Handle must be at most 20 characters")
    .regex(
      HANDLE_REGEX,
      "Handle must start with a letter and contain only lowercase letters, numbers, and underscores"
    )
    .optional(),
  displayName: z
    .string()
    .trim()
    .min(1, "Display name cannot be empty")
    .max(50, "Display name must be at most 50 characters")
    .optional()
    .nullable(),
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
  showLikes: z.boolean().optional(),
  dmPrivacy: z.enum(["EVERYONE", "FOLLOWERS", "NONE"]).optional(),
  tipGoal: z.number().int().min(0).max(10_000_000).optional().nullable(),
  tipGoalLabel: z.string().max(80).optional().nullable(),
  profileSongSpotifyId: z.string().max(50).optional().nullable(),
  profileSongTitle: z.string().max(200).optional().nullable(),
  profileSongArtist: z.string().max(200).optional().nullable(),
  profileSongPreviewUrl: z
    .string()
    .max(500)
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
  profileSongAlbumArt: z
    .string()
    .max(500)
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
  showProfilePet: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
