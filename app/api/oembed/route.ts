/**
 * /api/oembed — Resolve Tenor share URLs to direct GIF URLs.
 *
 * Fetches the Tenor page HTML and extracts the og:image meta tag
 * to get a direct GIF/media URL. No API key required.
 */
import { NextRequest, NextResponse } from 'next/server';

const CACHE_TTL = 60 * 60 * 24; // 24h

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !url.includes('tenor.com/')) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RmhBot/1.0)' },
      next: { revalidate: CACHE_TTL },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch page' }, { status: 502 });
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
      return NextResponse.json({ error: 'No media found' }, { status: 404 });
    }

    return NextResponse.json(
      { gifUrl, videoUrl: ogVideoMatch?.[1] ?? ogVideoAlt?.[1] ?? null },
      {
        headers: {
          'Cache-Control': `public, max-age=${CACHE_TTL}, stale-while-revalidate=86400`,
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
  }
}
