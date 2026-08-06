import { createFileRoute } from '@tanstack/react-router';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineHandler } from '@/lib/api/handler.server';
import { resolvePathUnder } from '@/lib/slice-it/upload-validation';
import { optimizeImage, parseFormat, negotiateFormat } from '@/lib/image-optimize';
import { getObject } from '@/lib/storage/s3.server';
import { curatedBuildImageKey, contentTypeForFilename, isSafeFilename } from '@/lib/storage/keys';

/**
 * Serve a curated build thumbnail.
 *
 * Reads object storage first and falls back to the old `db/builds` local-disk
 * path, because thumbnails uploaded before the move are still only on whichever
 * web container happened to receive them.
 */
export const Route = createFileRoute('/api/admin/curated-builds/image/$filename')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ request, params }) => {
        const { filename } = params;
        if (!isSafeFilename(filename)) {
          return Response.json({ error: 'Invalid filename' }, { status: 400 });
        }

        const buffer = await readThumbnail(filename);
        if (!buffer) return Response.json({ error: 'File not found' }, { status: 404 });

        const url = new URL(request.url);
        const wParam = url.searchParams.get('w');
        const hParam = url.searchParams.get('h');
        const qParam = url.searchParams.get('q');
        const fParam = url.searchParams.get('f');

        if (wParam || hParam || qParam || fParam) {
          const width = wParam ? Math.min(parseInt(wParam, 10), 2000) : undefined;
          const height = hParam ? Math.min(parseInt(hParam, 10), 2000) : undefined;
          const quality = qParam ? Math.min(Math.max(parseInt(qParam, 10), 1), 100) : 80;
          const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

          const result = await optimizeImage(buffer, { width, height, quality, format });
          return new Response(new Uint8Array(result.buffer), {
            headers: {
              'Content-Type': result.contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Access-Control-Allow-Origin': '*',
              Vary: 'Accept',
            },
          });
        }

        return new Response(new Uint8Array(buffer), {
          headers: {
            'Content-Type': contentTypeForFilename(filename),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }),
    },
  },
});

/** Object storage, then the pre-2026-08-06 local-disk location. */
async function readThumbnail(filename: string): Promise<Buffer | null> {
  const stored = await getObject(curatedBuildImageKey(filename));
  if (stored) return stored.body;

  const legacyDir = path.join(process.cwd(), 'db', 'builds');
  const legacyPath = resolvePathUnder(legacyDir, filename);
  if (!legacyPath) return null;
  try {
    return await readFile(legacyPath);
  } catch {
    return null;
  }
}
