/**
 * PUT /api/tf2-hud/blobs/:sha1 — upload one file's bytes. The server re-hashes
 * the body and refuses a mismatch, so the hash in a manifest is proof of content.
 */

import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { readRequestBodyLimited, RequestBodyTooLargeError } from '@/lib/http-body.server';
import { sha1Param } from '@/lib/tf2-hud/api-schema';
import { HUD_LIMITS } from '@/lib/tf2-hud/api-types';
import { guard } from '@/lib/tf2-hud/guard.server';
import { storeBlob } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/blobs/$sha1')({
  server: {
    handlers: {
      PUT: defineHandler(
        { rateLimit: { limit: 600, windowMs: 60_000, scope: 'user', prefix: 'tf2hud-blob' } },
        ({ userId, params, request }) =>
          guard(async () => {
            const sha1 = sha1Param.safeParse(params.sha1);
            if (!sha1.success) return apiError('Invalid hash', 400);
            let bytes: Uint8Array;
            try {
              bytes = await readRequestBodyLimited(request, HUD_LIMITS.maxBlobBytes);
            } catch (e) {
              if (e instanceof RequestBodyTooLargeError) return apiError('File is larger than 25 MB', 413);
              throw e;
            }
            await storeBlob(userId, sha1.data, bytes);
            return new Response(null, { status: 204 });
          }),
      ),
    },
  },
});
