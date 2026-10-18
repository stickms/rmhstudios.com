import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { saveChallengeAudio } from '@/lib/studio/challenge/challenge.server';
import { CHALLENGE_AUDIO_MAX_BYTES } from '@/lib/studio/challenge/shared';

/** POST /api/admin/studio-challenges/upload — upload the challenge sample (multipart `audio`, <= 8 MB). */
export const Route = createFileRoute('/api/admin/studio-challenges/upload')({
  server: {
    handlers: {
      POST: defineHandler({ auth: 'admin', rateLimit: 'write' }, async ({ request, userId }) => {
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
        return Response.json({ key: r.key });
      }),
    },
  },
});
