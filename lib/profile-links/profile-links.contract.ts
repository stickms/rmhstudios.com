/**
 * Contracts for /api/profile-links (redesign audit C1, batch 3). Client-safe:
 * request types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { VerifyOutcome } from '@/lib/profile-links/verify.server';
import type { profileLinkCreateSchema, profileLinkUpdateSchema } from '@/lib/profile-links/schema';
import type { ProfileLinkDTO } from '@/lib/profile-links/shared';

export const listProfileLinksApi = endpoint<{ res: { links: ProfileLinkDTO[] } }>()({
  method: 'GET',
  path: '/api/profile-links',
});

/** 400 `{ error }` past the link limit. */
export const addProfileLinkApi = endpoint<{
  body: z.infer<typeof profileLinkCreateSchema>;
  res: { link: ProfileLinkDTO };
}>()({ method: 'POST', path: '/api/profile-links' });

export const updateProfileLinkApi = endpoint<{
  body: z.infer<typeof profileLinkUpdateSchema>;
  res: { link: ProfileLinkDTO };
}>()({ method: 'PATCH', path: '/api/profile-links/$id' });

export const deleteProfileLinkApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/profile-links/$id',
});

/** Runs the `rel="me"` check; the outcome says whether the mark was earned. */
export const verifyProfileLinkApi = endpoint<{
  res: { outcome: VerifyOutcome; link: ProfileLinkDTO };
}>()({ method: 'POST', path: '/api/profile-links/$id/verify' });
