/**
 * GET /api/vibe/thumb/$slug
 *
 * Serves the server-rendered gallery thumbnail for a vibe page from disk
 * (db/vibe-thumbs/<slug>.png). The URL is versioned with a `?v=` query by the
 * capture step, so responses are safe to cache immutably. 404 when no thumbnail
 * has been rendered yet.
 */

import { createFileRoute } from '@tanstack/react-router';
import { readFile } from 'fs/promises';
import path from 'path';
import { resolvePathUnder } from '@/lib/slice-it/upload-validation';
import { THUMB_DIR } from '@/lib/rmhvibe/vibe-thumbs';

export const Route = createFileRoute('/api/vibe/thumb/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const safeName = `${path.basename(params.slug)}.png`;
        const filePath = resolvePathUnder(THUMB_DIR, safeName);
        if (!filePath) {
          return new Response('Not found', { status: 404 });
        }
        try {
          const buffer = await readFile(filePath);
          return new Response(buffer, {
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        } catch {
          return new Response('Not found', { status: 404 });
        }
      },
    },
  },
});
