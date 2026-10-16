import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { saveChallengeAudio } from '@/lib/studio/challenge/challenge.server';
import { CHALLENGE_AUDIO_MAX_BYTES, challengeAudioUrl } from '@/lib/studio/challenge/shared';

/** POST /api/studio/challenges/audio — upload a flip bounce (multipart `audio`, <= 8 MB) to attach to an entry (F12). */
export const Route = createFileRoute('/api/studio/challenges/audio/')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 6, windowMs: 60_000, prefix: 'studio-challenge-audio' } },
        async ({ request, userId }) => {
          if (
            Number(request.headers.get('content-length') ?? 0) >
            CHALLENGE_AUDIO_MAX_BYTES + 64 * 1024
          ) {
            return Response.json({ error: 'Keep audio under 8 MB.' }, { status: 413 });
          }
          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          const audio = form.get('audio');
          if (!(audio instanceof File) || audio.size === 0) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
          }
          const r = await saveChallengeAudio(userId, Buffer.from(await audio.arrayBuffer()));
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ key: r.key, url: challengeAudioUrl(r.key) });
        },
      ),
    },
  },
});
