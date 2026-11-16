/**
 * Contracts for RMH Music's social endpoints (Phase 6). Client-safe: types come from the zod
 * schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  musicSocialBody,
  musicSocialRes,
} from './social-schema';

export type MusicSocial =
  z.infer<
    typeof musicSocialRes
  >;

/** The learner's two switches (no row reads as both off; reading never creates one). */
export const musicSocialApi =
  endpoint<{
    res: MusicSocial;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhmusic/social',
    },
  );

/** Change either switch; answers both. */
export const setMusicSocialApi =
  endpoint<{
    body: z.infer<
      typeof musicSocialBody
    >;
    res: MusicSocial;
  }>()(
    {
      method:
        'PUT',
      path: '/api/rmhmusic/social',
    },
  );
