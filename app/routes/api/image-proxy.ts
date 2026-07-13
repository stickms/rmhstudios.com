import { createFileRoute } from '@tanstack/react-router';
import { optimizeImage, parseFormat, negotiateFormat } from '@/lib/image-optimize';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';
import { isDiscordAvatarUrl, refreshDiscordAvatarFromBrokenUrl } from '@/lib/discord-avatar-refresh.server';

const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024; // 10 MB

export const Route = createFileRoute('/api/image-proxy')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    try {
      // Per-IP rate limit: this endpoint fetches arbitrary upstream URLs, so cap
      // request volume to blunt SSRF probing / bandwidth abuse (mirrors oembed).
      const { allowed, retryAfter } = rateLimit(getClientIp(request), {
        limit: 60,
        windowMs: 60_000,
        prefix: 'image-proxy',
      });
      if (!allowed) {
        return Response.json(
          { error: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        );
      }

      const url = new URL(request.url);
      const src = url.searchParams.get('url');

      if (!src) {
        return Response.json({ error: 'Invalid or missing url parameter' }, { status: 400 });
      }

      const wParam = url.searchParams.get('w');
      const hParam = url.searchParams.get('h');
      const qParam = url.searchParams.get('q');
      const fParam = url.searchParams.get('f');

      // Fetch the upstream image (SSRF-guarded: https only, blocks private IPs)
      let upstream: Response;
      try {
        upstream = await safeFetch(src, {
          headers: { 'User-Agent': 'RMHStudios-ImageProxy/1.0' },
          timeoutMs: 10_000,
        });
      } catch (e) {
        if (e instanceof SsrfError) {
          return Response.json({ error: 'Disallowed image URL' }, { status: 400 });
        }
        throw e;
      }

      if (!upstream.ok) {
        // A stale Discord avatar (the hash changed after the user updated it).
        // Lazily refresh it from Discord in the background — guarded + rate-limited.
        if (isDiscordAvatarUrl(src)) {
          void refreshDiscordAvatarFromBrokenUrl(src);
        }
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
