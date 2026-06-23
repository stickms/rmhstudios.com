import { createFileRoute } from '@tanstack/react-router';
import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';
/**
 * /api/rmhtube/oembed — Resolve Tenor share URLs to direct GIF URLs.
 *
 * Fetches the Tenor page HTML and extracts the og:image meta tag
 * to get a direct GIF/media URL. No API key required.
 */
const CACHE_TTL = 60 * 60 * 24; // 24h

export const Route = createFileRoute('/api/rmhtube/oembed')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return Response.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RmhTubeBot/1.0)' },
      allowedHosts: ['tenor.com'],
    });

    if (!res.ok) {
      return Response.json({ error: 'Failed to fetch page' }, { status: 502 });
    }

    const html = await res.text();

    // Extract og:image — allow arbitrary attributes before property/content
    const ogImageMatch = html.match(/<meta\s[^>]*property="og:image"\s[^>]*content="([^"]+)"/);
    // Try reversed attribute order too (content before property)
    const ogImageAlt = html.match(/<meta\s[^>]*content="([^"]+)"[^>]*property="og:image"/);
    // Extract og:video if available
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
  } catch (e) {
    if (e instanceof SsrfError) return Response.json({ error: 'Disallowed URL' }, { status: 400 });
    return Response.json({ error: 'Fetch failed' }, { status: 502 });
  }
},
    },
  },
});
