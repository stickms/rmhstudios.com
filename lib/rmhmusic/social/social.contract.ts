/**
 * Contracts for RMH Music's social endpoints (Phase 6). Client-safe: types come from the zod
 * schemas by `import type`, so this file ships no zod.
 *
 * Outside `lib/rmhmusic` on purpose: the site Privacy page (`MusicPrivacyControls`) imports it,
 * and `app/site-tier.css` skips `lib/rmhmusic` (`@source not`), so a site page must not reach code
 * in there (`lib/__tests__/style-tiers.test.ts`).
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  boardMeSchema,
  boardQuery,
  boardRes,
  boardRowSchema,
  musicSocialBody,
  musicSocialRes,
} from '@/lib/rmhmusic/learn/social/social-schema';

export type MusicSocial = z.infer<typeof musicSocialRes>;
export type DailyBoard = z.infer<typeof boardRes>;
export type DailyBoardRow = z.infer<typeof boardRowSchema>;
export type DailyBoardMe = z.infer<typeof boardMeSchema>;
export type BoardScope = z.infer<typeof boardQuery>['scope'];

/** The learner's two switches (no row reads as both off; reading never creates one). */
export const musicSocialApi = endpoint<{
  res: MusicSocial;
}>()({
  method: 'GET',
  path: '/api/rmhmusic/social',
});

/** Change either switch; answers both. */
export const setMusicSocialApi = endpoint<{
  body: z.infer<typeof musicSocialBody>;
  res: MusicSocial;
}>()({
  method: 'PUT',
  path: '/api/rmhmusic/social',
});

/** A date's Daily board (today or yesterday), Everyone or Friends, and the viewer's own line. */
export const dailyBoardApi = endpoint<{
  query: z.infer<typeof boardQuery>;
  res: DailyBoard;
}>()({
  method: 'GET',
  path: '/api/rmhmusic/sprint/board',
});
