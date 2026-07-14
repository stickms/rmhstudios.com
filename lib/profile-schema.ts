import { z } from "zod";
import { HANDLE_REGEX } from "@/lib/handle";
import { httpUrl } from "@/lib/url-safety";

export const dmPrivacyValues = ["EVERYONE", "FOLLOWERS", "NONE"] as const;

export const MAX_PROFILE_LINKS = 5;

// A single link-in-bio entry. Labels are short; URLs must be http(s).
export const profileLinkSchema = z.object({
  label: z.string().trim().min(1, "Label cannot be empty").max(30, "Label must be at most 30 characters"),
  url: httpUrl(200),
});
export type ProfileLink = z.infer<typeof profileLinkSchema>;

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
  website: httpUrl(200)
    .optional()
    .nullable()
    .or(z.literal("")),
  links: z.array(profileLinkSchema).max(MAX_PROFILE_LINKS, `At most ${MAX_PROFILE_LINKS} links allowed`).optional().nullable(),
  showLikes: z.boolean().optional(),
  dmPrivacy: z.enum(["EVERYONE", "FOLLOWERS", "NONE"]).optional(),
  tipGoal: z.number().int().min(0).max(10_000_000).optional().nullable(),
  tipGoalLabel: z.string().max(80).optional().nullable(),
  // Per-creator membership price in coins/month (0/null = memberships off).
  membershipPriceCoins: z.number().int().min(0).max(1_000_000).optional().nullable(),
  profileSongSpotifyId: z.string().max(50).optional().nullable(),
  profileSongTitle: z.string().max(200).optional().nullable(),
  profileSongArtist: z.string().max(200).optional().nullable(),
  profileSongPreviewUrl: httpUrl(500)
    .optional()
    .nullable()
    .or(z.literal("")),
  profileSongAlbumArt: httpUrl(500)
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
