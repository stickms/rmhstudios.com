import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { VOICE_ABSOLUTE_MAX_BYTES, VOICE_ABSOLUTE_MAX_DURATION_MS } from '@/lib/media/voice-policy';
import { MESSAGE_MAX_LENGTH } from '@/lib/messages/edit-policy';
import { sendVoiceMessage } from '@/lib/messages/voice.server';

/**
 * POST /api/messages/$conversationId/voice — record and send a voice note.
 *
 * `multipart/form-data`, one request:
 *   - `audio`      the recording (Opus in WebM/Ogg, or MP4/AAC from Safari)
 *   - `durationMs` what the recorder measured
 *   - `peaks`      JSON array — the downsampled waveform the bubble draws
 *   - `note`       optional text note from the sender (see below)
 *
 * Upload and send are one call on purpose: a separate upload endpoint leaves an
 * object in storage for every recording the user then discarded, and hands the
 * client a URL it could attach to a conversation it is not a participant of.
 *
 * The pre-auth guards here are the coarse ones — the *absolute* ceiling across
 * every tier, applied before the body is read. The real, tier-aware decision is
 * `validateVoiceUpload` inside `sendVoiceMessage`, which is also what produces
 * the 400 message naming the caller's own limit.
 *
 * ## The note field
 *
 * A voice message is unreadable to a deaf recipient and unskimmable to everyone
 * else, and this codebase has no transcription model (`lib/ai/text.server.ts` is
 * DeepSeek text completion, a different model class). Until there is one, the
 * sender's note is the only path from audio to text, so the composer asks for it
 * on every recording. It is optional at this layer rather than required because
 * refusing to deliver a recording someone already made is worse for them than an
 * unlabelled bubble is for the recipient.
 */

export const Route = createFileRoute('/api/messages/$conversationId/voice')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            policy: 'upload',
            scope: 'user',
            prefix: 'dm:voice',
            message: "You're sending voice messages too quickly. Please slow down.",
          },
        },
        async ({ request, params, userId }) => {
          const contentLength = Number(request.headers.get('content-length') ?? 0);
          // Rejected before the body is buffered. The multipart envelope adds a
          // little overhead, hence the slack above the absolute object ceiling.
          if (contentLength > VOICE_ABSOLUTE_MAX_BYTES + 64 * 1024) {
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

          const durationMs = Number(form.get('durationMs'));
          if (
            !Number.isFinite(durationMs) ||
            durationMs <= 0 ||
            durationMs > VOICE_ABSOLUTE_MAX_DURATION_MS
          ) {
            return Response.json({ error: 'Invalid recording length' }, { status: 400 });
          }

          let peaks: unknown = [];
          const rawPeaks = form.get('peaks');
          if (typeof rawPeaks === 'string' && rawPeaks.length > 0 && rawPeaks.length < 4096) {
            try {
              peaks = JSON.parse(rawPeaks);
            } catch {
              // A malformed waveform is cosmetic — `normalizePeaks` turns it
              // into a flat line rather than failing the send.
              peaks = [];
            }
          }

          const rawNote = form.get('note');
          const note = typeof rawNote === 'string' ? rawNote.slice(0, MESSAGE_MAX_LENGTH) : '';

          const result = await sendVoiceMessage({
            conversationId: params.conversationId,
            userId,
            buffer: Buffer.from(await audio.arrayBuffer()),
            contentType: audio.type || 'application/octet-stream',
            durationMs,
            peaks,
            note,
          });

          if (!result.ok) {
            return Response.json({ error: result.error }, { status: result.status });
          }
          return Response.json({ message: result.message });
        },
      ),
    },
  },
});
