import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { readCardSound } from '@/lib/study/card-sound.server';

/**
 * GET /api/study/card-sound/$file — play a flashcard sound to the member who recorded it. Anyone else, signed in or
 * not, is told it does not exist: a sound is private to its recorder (the owner's audio decision is open). The type
 * comes from the sniffed extension and the response is `nosniff`; the file name carries a fresh id, so it never
 * changes and the browser may keep it (privately: it is never cached by a shared proxy).
 */
export const route = apiRoute('/api/study/card-sound/$file', {
  GET: defineHandler({ auth: 'required', rateLimit: 'read', etag: false }, async ({ params, userId }) => {
    const sound = await readCardSound(userId, params.file);
    if (!sound) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(sound.body), {
      headers: {
        'Content-Type': sound.contentType,
        'Content-Length': String(sound.body.length),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }),
});
