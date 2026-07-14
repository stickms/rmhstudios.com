import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { SITE_URL } from '@/lib/seo';

/**
 * /api/embed/oembed — oEmbed *provider* endpoint (https://oembed.com).
 *
 * Given the URL of a public RMHark (?url=...), returns an oEmbed payload whose
 * `html` is an <iframe> pointing at our chrome-free /embed/post/$id widget, so
 * Discord/Slack/WordPress/Notion and other consumers unfurl our posts richly.
 * Discovery is advertised via a `<link rel="alternate" type="application/json+oembed">`
 * on the post page. Only free, public, non-deleted posts are embeddable.
 */

const DEFAULT_WIDTH = 550;
const DEFAULT_HEIGHT = 480;
const MIN_WIDTH = 220;

function extractPostId(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  // Only embed our own content.
  const host = parsed.hostname.replace(/^www\./, '');
  const siteHost = new URL(SITE_URL).hostname.replace(/^www\./, '');
  if (host !== siteHost && host !== 'localhost') return null;

  // Canonical post URL: /u/{handle}/post/{id}. Also accept /embed/post/{id}.
  const m =
    parsed.pathname.match(/\/u\/[^/]+\/post\/([^/?#]+)/) ??
    parsed.pathname.match(/\/embed\/post\/([^/?#]+)/);
  return m?.[1] ?? null;
}

function clampWidth(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return DEFAULT_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(n, DEFAULT_WIDTH));
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}

export const Route = createFileRoute('/api/embed/oembed')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { allowed } = rateLimit(getClientIp(request), {
          limit: 60,
          windowMs: 60_000,
          prefix: 'oembed-provider',
        });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        const params = new URL(request.url).searchParams;
        const url = params.get('url');
        const format = (params.get('format') || 'json').toLowerCase();
        if (!url) return Response.json({ error: 'Missing url parameter' }, { status: 400 });
        if (format !== 'json' && format !== 'xml') {
          return Response.json({ error: 'Unsupported format' }, { status: 501 });
        }

        const postId = extractPostId(url);
        if (!postId) return Response.json({ error: 'Not a valid RMHark URL' }, { status: 404 });

        try {
          const post = await prisma.rMHark.findUnique({
            where: { id: postId },
            select: {
              id: true,
              content: true,
              deletedAt: true,
              audience: true,
              unlockPrice: true,
              user: { select: userDisplaySelect },
            },
          });

          // Mirror the embed widget's rules: only free, public, live posts.
          if (!post || post.deletedAt || post.audience !== 'PUBLIC' || (post.unlockPrice ?? 0) > 0) {
            return Response.json({ error: 'Post not embeddable' }, { status: 404 });
          }

          const author = resolveUser(post.user);
          const width = clampWidth(params.get('maxwidth'));
          const maxHeightRaw = params.get('maxheight');
          const maxHeight = maxHeightRaw ? parseInt(maxHeightRaw, 10) : NaN;
          const height = Number.isNaN(maxHeight) ? DEFAULT_HEIGHT : Math.min(maxHeight, DEFAULT_HEIGHT);
          const authorUrl = `${SITE_URL}/u/${author.handle ?? author.id}`;
          const embedSrc = `${SITE_URL}/embed/post/${post.id}`;
          const title = (post.content || 'Post on RMH Studios').slice(0, 120);

          const html =
            `<iframe src="${embedSrc}" width="${width}" height="${height}" ` +
            `style="border:none;max-width:100%;" frameborder="0" scrolling="no" ` +
            `title="${xmlEscape(title)}" allowfullscreen></iframe>`;

          const payload = {
            version: '1.0',
            type: 'rich',
            provider_name: 'RMH Studios',
            provider_url: SITE_URL,
            title,
            author_name: author.name ?? 'Someone',
            author_url: authorUrl,
            html,
            width,
            height,
            cache_age: 3600,
          };

          const headers = {
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          };

          if (format === 'xml') {
            const xml =
              `<?xml version="1.0" encoding="utf-8"?>\n<oembed>\n` +
              Object.entries(payload)
                .map(([k, v]) => `  <${k}>${xmlEscape(String(v))}</${k}>`)
                .join('\n') +
              `\n</oembed>\n`;
            return new Response(xml, {
              headers: { ...headers, 'Content-Type': 'text/xml; charset=utf-8' },
            });
          }

          return Response.json(payload, { headers });
        } catch (error) {
          console.error('oEmbed provider error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
