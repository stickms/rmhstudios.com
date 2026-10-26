/**
 * POST /api/tf2-hud/blobs/check { hashes } — which of these files you still need to upload.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { blobCheckSchema } from '@/lib/tf2-hud/api-schema';
import { guard } from '@/lib/tf2-hud/guard.server';
import { missingBlobs } from '@/lib/tf2-hud/hud.server';

export const Route = createFileRoute('/api/tf2-hud/blobs/check')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 120, windowMs: 60_000, scope: 'user', prefix: 'tf2hud-check' }, body: blobCheckSchema },
        ({ userId, body }) => guard(async () => Response.json({ missing: await missingBlobs(userId, body.hashes) })),
      ),
    },
  },
});
