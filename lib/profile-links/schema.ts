/**
 * Profile links — the zod input schemas for the profile-link API routes.
 * Everything else (limits, the wire shape, the URL helpers) is in `./shared`
 * and re-exported here; the settings panel imports `./shared` directly so the
 * security settings page stays zod-free.
 */

import { z } from 'zod';
import { httpUrl } from '@/lib/url-schema';

import { MAX_LINK_LABEL_LENGTH, MAX_LINK_URL_LENGTH, MAX_PROFILE_LINKS } from './shared';

export * from './shared';

export const profileLinkCreateSchema = z.object({
  url: httpUrl(MAX_LINK_URL_LENGTH),
  label: z.string().trim().min(1).max(MAX_LINK_LABEL_LENGTH).optional().nullable(),
});

export const profileLinkUpdateSchema = z.object({
  url: httpUrl(MAX_LINK_URL_LENGTH).optional(),
  label: z.string().trim().max(MAX_LINK_LABEL_LENGTH).optional().nullable(),
  position: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROFILE_LINKS - 1)
    .optional(),
});

export type ProfileLinkCreateInput = z.infer<typeof profileLinkCreateSchema>;
export type ProfileLinkUpdateInput = z.infer<typeof profileLinkUpdateSchema>;
