import { createFileRoute } from '@tanstack/react-router';
import { optimizeImage, parseFormat, negotiateFormat } from '@/lib/image-optimize';

const ALLOWED_HOSTS = new Set<string>();
const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024; // 10 MB

function isAllowedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    // Allow any https URL (images are user-provided). Block non-https.
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const Route = createFileRoute('/api/image-proxy')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    try {
      const url = new URL(request.url);
      const src = url.searchParams.get('url');

      if (!src || !isAllowedUrl(src)) {
        return Response.json({ error: 'Invalid or missing url parameter' }, { status: 400 });
      }

      const wParam = url.searchParams.get('w');
      const hParam = url.searchParams.get('h');
      const qParam = url.searchParams.get('q');
      const fParam = url.searchParams.get('f');

      // Fetch the upstream image
      const upstream = await fetch(src, {
        headers: { 'User-Agent': 'RMHStudios-ImageProxy/1.0' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!upstream.ok) {
        return Response.json({ error: 'Failed to fetch upstream image' }, { status: 502 });
      }

      const contentType = upstream.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        return Response.json({ error: 'URL does not point to an image' }, { status: 400 });
      }

      const arrayBuffer = await upstream.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_UPSTREAM_BYTES) {
        return Response.json({ error: 'Image too large' }, { status: 413 });
      }

      const buffer = Buffer.from(arrayBuffer);

      const width = wParam ? Math.min(parseInt(wParam, 10), 2000) : undefined;
      const height = hParam ? Math.min(parseInt(hParam, 10), 2000) : undefined;
      const quality = qParam ? Math.min(Math.max(parseInt(qParam, 10), 1), 100) : 80;
      const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

      const result = await optimizeImage(buffer, { width, height, quality, format });

      return new Response(result.buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'Access-Control-Allow-Origin': '*',
          'Vary': 'Accept',
        },
      });
    } catch (error) {
      console.error('Image proxy error:', error);
      return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  },
    },
  },
});
