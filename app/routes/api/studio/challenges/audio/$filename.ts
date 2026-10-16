import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { readChallengeAudio } from '@/lib/studio/challenge/challenge.server';

/** GET /api/studio/challenges/audio/:filename — stream a challenge sample or entry clip (F12). */
export const Route = createFileRoute('/api/studio/challenges/audio/$filename')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read', etag: false }, async ({ params }) => {
        const clip = await readChallengeAudio(params.filename);
        if (!clip) return new Response('Not found', { status: 404 });
        return new Response(new Uint8Array(clip.body), {
          headers: {
            'Content-Type': clip.contentType,
            'Content-Length': String(clip.body.length),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }),
    },
  },
});
