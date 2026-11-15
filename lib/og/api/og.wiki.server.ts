import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { renderPageCard } from '@/lib/og/page-card.server';
import {
  WIKI_NAME,
  WIKI_TAGLINE,
  fetchWikiCardPage,
} from '@/lib/wiki/og.server';
import { wikiPublicUrl } from '@/lib/wiki/sso.server';
import { wikiOgQuery } from '@/lib/wiki/wiki-schema';
import { wikiOgCardApi } from '@/lib/wiki/wiki.contract';

/** `/wiki/Coins_and_memberships`, the way MediaWiki writes its own links. */
function wikiPath(
  title: string,
): string {
  return `/wiki/${encodeURIComponent(title.replaceAll(' ', '_')).replaceAll('%2F', '/').replaceAll('%3A', ':')}`;
}

/**
 * GET /api/og/wiki?page=Title — the link-preview card for a page on
 * wiki.rmhstudios.com (lib/wiki/og.server.ts). The wiki's `og:image` points
 * here. The title and text are the wiki's own, read from its API; a page the
 * wiki does not have, and no page at all, get the wiki's card. The revision is
 * in the cache key, so an edit gets a fresh card.
 */
export const route = apiRoute('/api/og/wiki',
    {
      GET: implement(
        wikiOgCardApi,
        {
          auth: 'none',
          rateLimit:
            'read',
          query:
            wikiOgQuery,
        },
        async ({
          query,
        }) => {
          const page =
            query.page
              ? await fetchWikiCardPage(
                  query.page,
                )
              : null;
          const host =
            new URL(
              wikiPublicUrl(),
            )
              .host;
          const png =
            page &&
            !page.isMainPage
              ? await renderPageCard(
                  {
                    cacheKey: `wiki:${page.title}:${page.revision}`,
                    eyebrow:
                      'Wiki',
                    lead: WIKI_NAME,
                    title:
                      page.title,
                    subtitle:
                      page.extract ||
                      WIKI_TAGLINE,
                    host,
                    path: wikiPath(
                      page.title,
                    ),
                  },
                )
              : await renderPageCard(
                  {
                    cacheKey:
                      'wiki:main',
                    eyebrow:
                      'Wiki',
                    title:
                      WIKI_NAME,
                    subtitle:
                      WIKI_TAGLINE,
                    host,
                  },
                );
          return new Response(
            new Uint8Array(
              png,
            ),
            {
              headers:
                {
                  'Content-Type':
                    'image/png',
                  'Cache-Control':
                    'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
                },
            },
          );
        },
      ),
    },
  );
