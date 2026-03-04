import { z } from "zod";

export const dmPrivacyValues = ["EVERYONE", "FOLLOWERS", "NONE"] as const;

export const updateProfileSchema = z.object({
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
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
