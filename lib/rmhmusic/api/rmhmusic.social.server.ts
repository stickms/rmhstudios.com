import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMusicSocial, setMusicSocial } from '@/lib/rmhmusic/learn/social/prefs.server';
import { musicSocialApi, setMusicSocialApi } from '@/lib/music-social/social.contract';
import { musicSocialBody, musicSocialRes } from '@/lib/rmhmusic/learn/social/social-schema';

/**
 * `/api/rmhmusic/social` — the learner's two social switches (Phase 6): show my Daily scores on the
 * board, share my progress with friends. Both off until the learner turns one on; GET never creates
 * a row; PUT changes either (at least one) and drops the caches it makes stale.
 */
export const route = apiRoute('/api/rmhmusic/social', {
  GET: implement(musicSocialApi, { rateLimit: 'read', response: musicSocialRes }, async ({ userId }) =>
    getMusicSocial(userId),
  ),
  PUT: implement(
    setMusicSocialApi,
    { rateLimit: 'write', body: musicSocialBody, response: musicSocialRes },
    async ({ userId, body }) => setMusicSocial(userId, body, Date.now()),
  ),
});
