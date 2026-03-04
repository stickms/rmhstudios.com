/**
 * /api/oembed — Resolve media URLs and extract OpenGraph metadata.
 *
 * Supports two modes via ?type= query param:
 *   - "tenor" (default): Resolve Tenor share URLs to direct GIF URLs
 *   - "og": Extract OpenGraph metadata (title, description, image) from any URL
 */
import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  const type = req.nextUrl.searchParams.get('type') || 'tenor';

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // ── Tenor resolution ──────────────────────────────────────────
  if (type === 'tenor') {
    if (!url.includes('tenor.com/')) {
      return NextResponse.json({ error: 'Invalid Tenor URL' }, { status: 400 });
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

      const ogImageMatch = html.match(/<meta\s[^>]*property="og:image"\s[^>]*content="([^"]+)"/);
      const ogImageAlt = html.match(/<meta\s[^>]*content="([^"]+)"[^>]*property="og:image"/);
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

  // ── OpenGraph metadata extraction ─────────────────────────────
  if (type === 'og') {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RmhBot/1.0)' },
        next: { revalidate: CACHE_TTL },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to fetch page' }, { status: 502 });
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
        return NextResponse.json({ error: 'No metadata found' }, { status: 404 });
      }

      return NextResponse.json(
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
      return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
}
