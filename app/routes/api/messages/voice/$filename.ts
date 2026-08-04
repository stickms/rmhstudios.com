import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { isSafeFilename } from '@/lib/storage/keys';
import { readVoiceObject } from '@/lib/messages/voice.server';

/**
 * GET /api/messages/voice/$filename — play back a DM voice note.
 *
 * **Authenticated on purpose.** Feed images are served straight off the CDN
 * because they are public; a recording inside a private conversation is not, and
 * a CDN URL is a permanent, forwardable bearer token for it. So every playback
 * goes through here, and `readVoiceObject` re-checks that the caller is a
 * participant of the conversation encoded in the filename (see
 * `lib/voice/keys.ts` for why it is encoded there — it makes the check one
 * primary-key lookup instead of a scan).
 *
 * `Cache-Control: private` for the same reason: a shared proxy must not hold a
 * copy that a different signed-in user could be handed.
 *
 * ## Range support
 *
 * Not an optimisation — Safari will not seek (and on some versions will not
 * start) an `<audio>` element whose source cannot serve a byte range, and
 * seeking is half of what makes a five-minute voice note usable. Clips are
 * capped at a few megabytes, so the object is read whole and sliced rather than
 * streamed; a range read of a 256 KB object is not worth a streaming path.
 */

export const Route = createFileRoute('/api/messages/voice/$filename')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ request, params, userId }) => {
        const { filename } = params;
        if (!isSafeFilename(filename)) {
          return new Response('Not Found', { status: 404 });
        }

        const result = await readVoiceObject(filename, userId);
        if (!result.ok) {
          return new Response(result.status === 410 ? 'Gone' : 'Not Found', {
            status: result.status,
          });
        }

        const total = result.body.length;
        const headers: Record<string, string> = {
          'Content-Type': result.contentType,
          'Accept-Ranges': 'bytes',
          // Private, and short: an unsent message must stop playing from a
          // cache soon after it is retracted.
          'Cache-Control': 'private, max-age=300',
        };

        const range = request.headers.get('range');
        const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
        if (match) {
          const start = match[1] ? Number(match[1]) : 0;
          const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
          if (!Number.isFinite(start) || start > end || start >= total) {
            return new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${total}` },
            });
          }
          const slice = result.body.subarray(start, end + 1);
          return new Response(new Uint8Array(slice), {
            status: 206,
            headers: {
              ...headers,
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Content-Length': String(slice.length),
            },
          });
        }

        return new Response(new Uint8Array(result.body), {
          headers: { ...headers, 'Content-Length': String(total) },
        });
      }),
    },
  },
});
