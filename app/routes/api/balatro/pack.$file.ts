/**
 * GET /api/balatro/pack/$file — the Balatro game packs, signed-in only.
 *
 * /balatro is gated behind sign-in, so the packs it downloads cannot be static
 * files under public/ (anyone could fetch those). They live in data/balatro-pack/
 * (built by scripts/balatro/build-game-pack.py) and only the names in
 * lib/balatro/game-pack.json are served: the core and audio packs, and the
 * multiplayer pack (`mp-<sha>.zip`), which the page fetches only when
 * multiplayer is opened, and the optional `release-<sha>.zip`, fetched only
 * when a lobby picks the Release ruleset (docs/balatro-mp.md).
 *
 * Names are content-addressed, so the bytes at a URL never change: the response
 * is cacheable forever, but `private` — a shared cache (Cloudflare) must never
 * keep a copy and hand it to a signed-out request.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import pack from '@/lib/balatro/game-pack.json';

const PACK_DIR = join(process.cwd(), 'data', 'balatro-pack');
// The optional packs (EX-14: `release`, the Release ruleset's art) are served the same way.
const FILES = new Set(
  [pack.core, pack.audio, pack.mp, (pack as { release?: { file: string } }).release]
    .filter((p): p is { file: string } => !!p)
    .map((p) => p.file),
);

export const Route = createFileRoute('/api/balatro/pack/$file')({
  server: {
    handlers: {
      GET: defineHandler(
        // Two to four downloads per visit, usually zero once the browser has cached them.
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'balatro-pack' }, label: 'balatro pack' },
        async ({ params }) => {
          if (!FILES.has(params.file)) return Response.json({ error: 'Not found' }, { status: 404 });
          const path = join(PACK_DIR, params.file);
          const { size } = await stat(path);
          const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
          return new Response(body, {
            headers: {
              'Content-Type': 'application/zip',
              'Content-Length': String(size),
              'Cache-Control': 'private, max-age=31536000, immutable',
              'X-Robots-Tag': 'noindex',
            },
          });
        },
      ),
    },
  },
});
