import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
/**
 * /api/oembed — Resolve media URLs and extract OpenGraph metadata.
 *
 * Supports two modes via ?type= query param:
 *   - "tenor" (default): Resolve Tenor share URLs to direct GIF URLs
 *   - "og": Extract OpenGraph metadata (title, description, image) from any URL
 */
const CACHE_TTL = 60 * 60 * 24; // 24h

function extractMetaContent(html: string, property: string): string | null {
  // Try property="..." content="..."
  const propMatch = html.match(
    new RegExp(`<meta\\s[^>]*(?:property|name)="${property}"\\s[^>]*content="([^"]*)"`, 'i')
  );
  if (propMatch) return propMatch[1];

  // Try content="..." property="..."
  const altMatch = html.match(
    new RegExp(`<meta\\s[^>]*content="([^"]*)"[^>]*(?:property|name)="${property}"`, 'i')
  );
  return altMatch ? altMatch[1] : null;
}

function extractTagContent(html: string, tag: string): string | null {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

export const Route = createFileRoute('/api/oembed')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: "oembed" });
  if (!allowed) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429 });

  const url = new URL(request.url).searchParams.get('url');
  const type = new URL(request.url).searchParams.get('type') || 'tenor';

  if (!url) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // ── Tenor resolution ──────────────────────────────────────────
  if (type === 'tenor') {
    if (!url.includes('tenor.com/')) {
      return Response.json({ error: 'Invalid Tenor URL' }, { status: 400 });
    }

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RmhBot/1.0)' },
      });

      if (!res.ok) {
        return Response.json({ error: 'Failed to fetch page' }, { status: 502 });
      }

      const html = await res.text();

      const ogImageMatch = html.match(/<meta\s[^>]*property="og:image"\s[^>]*content="([^"]+)"/);
      const ogImageAlt = html.match(/<meta\s[^>]*content="([^"]+)"[^>]*property="og:image"/);
      const ogVideoMatch = html.match(/<meta\s[^>]*property="og:video"\s[^>]*content="([^"]+)"/);
      const ogVideoAlt = html.match(/<meta\s[^>]*content="([^"]+)"[^>]*property="og:video"/);

      const gifUrl = ogImageMatch?.[1] ?? ogImageAlt?.[1] ?? null;

      if (!gifUrl) {
        return Response.json({ error: 'No media found' }, { status: 404 });
      }

      return Response.json(
        { gifUrl, videoUrl: ogVideoMatch?.[1] ?? ogVideoAlt?.[1] ?? null },
        {
          headers: {
            'Cache-Control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=86400`,
          },
        },
      );
    } catch {
      return Response.json({ error: 'Fetch failed' }, { status: 502 });
    }
  }

  // ── OpenGraph metadata extraction ─────────────────────────────
  if (type === 'og') {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RmhBot/1.0)' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return Response.json({ error: 'Failed to fetch page' }, { status: 502 });
      }

      const html = await res.text();
      const head = html.slice(0, 50_000); // Only parse the head section

      const title =
        extractMetaContent(head, 'og:title') ||
        extractMetaContent(head, 'twitter:title') ||
        extractTagContent(head, 'title');
      const description =
        extractMetaContent(head, 'og:description') ||
        extractMetaContent(head, 'twitter:description') ||
        extractMetaContent(head, 'description');
      const image =
        extractMetaContent(head, 'og:image') ||
        extractMetaContent(head, 'twitter:image');
      const siteName =
        extractMetaContent(head, 'og:site_name');

      if (!title && !description) {
        return Response.json({ error: 'No metadata found' }, { status: 404 });
      }

      return Response.json(
        {
          title: title || null,
          description: description || null,
          image: image || null,
          siteName: siteName || new URL(url).hostname,
        },
        {
          headers: {
            'Cache-Control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=86400`,
          },
        },
      );
    } catch {
      return Response.json({ error: 'Fetch failed' }, { status: 502 });
    }
  }

  return Response.json({ error: 'Invalid type parameter' }, { status: 400 });
},
    },
  },
});
