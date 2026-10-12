import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { PRONUNCIATION_MAX_BYTES, pronunciationUrl } from '@/lib/profile/plus';
import { removePronunciation, savePronunciation } from '@/lib/profile/plus.server';
import { prisma } from '@/lib/prisma.server';

/**
 * POST /api/profile/pronunciation — upload the caller's name-pronunciation clip (P3).
 *   multipart/form-data: `audio` (the MediaRecorder blob), `durationMs`.
 * DELETE /api/profile/pronunciation — remove it.
 *
 * Limits (<= 5 s, small, container sniffed from the bytes) are enforced in
 * `savePronunciation`; the checks here are the coarse pre-read guards.
 */
export const Route = createFileRoute('/api/profile/pronunciation')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 6,
            windowMs: 60_000,
            prefix: 'profile-pronunciation',
            message: 'Too many uploads. Try again in a minute.',
          },
        },
        async ({ request, userId }) => {
          const contentLength = Number(request.headers.get('content-length') ?? 0);
          if (contentLength > PRONUNCIATION_MAX_BYTES + 64 * 1024) {
            return Response.json({ error: 'That recording is too large.' }, { status: 413 });
          }
          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          const audio = form.get('audio');
          if (!(audio instanceof File) || audio.size === 0) {
            return Response.json({ error: 'No recording provided' }, { status: 400 });
          }
          if (audio.size > PRONUNCIATION_MAX_BYTES) {
            return Response.json({ error: 'That recording is too large.' }, { status: 413 });
          }
          const durationMs = Number(form.get('durationMs'));
          const result = await savePronunciation(
            userId,
            Buffer.from(await audio.arrayBuffer()),
            audio.type,
            durationMs,
          );
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          const row = await prisma.profilePlus.findUnique({
            where: { userId },
            select: { pronunciationKey: true },
          });
          return Response.json({
            pronunciationUrl: pronunciationUrl(userId, row?.pronunciationKey),
            pronunciationMs: result.durationMs,
          });
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId }) => {
        await removePronunciation(userId);
        return Response.json({ pronunciationUrl: null, pronunciationMs: null });
      }),
    },
  },
});
