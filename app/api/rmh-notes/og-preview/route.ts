import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RMHNotes/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();

    const title = extractMeta(html, 'og:title') ?? extractTitle(html) ?? url;
    const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'description');
    const image = extractMeta(html, 'og:image');
    const siteName = extractMeta(html, 'og:site_name') ?? new URL(url).hostname;

    return NextResponse.json({ title, description, image, siteName, url });
  } catch {
    return NextResponse.json({ title: url, description: null, image: null, siteName: null, url });
  }
}

function extractMeta(html: string, property: string): string | null {
  const match =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
  return match?.[1] ?? null;
}

function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? null;
}
