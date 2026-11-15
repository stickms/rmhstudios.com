/**
 * What the wiki's link previews show (docs/wiki.md, "Link previews").
 *
 * The wiki's pages carry Wikipedia-style Open Graph tags (the RMHStudiosOpenGraph
 * extension): "Title - RMH Studios Wiki", the page's opening sentences, and a
 * card image from `GET /api/og/wiki?page=…` on this site, drawn by the same
 * `lib/og` renderer as every other card. The card's title and text come from the
 * wiki itself (its API, with TextExtracts, the extension Wikipedia's previews
 * use), never from the query string, so the URL cannot make the site draw
 * arbitrary words: a page the wiki does not have gets the wiki's own card.
 */
import { wikiPublicUrl } from '@/lib/wiki/sso.server';

export const WIKI_NAME =
  'RMH Studios Wiki';
export const WIKI_TAGLINE =
  'The reference for rmhstudios.com: its games, apps, feed and economy.';

export interface WikiCardPage {
  /** The title as the wiki has it (normalised, redirects followed). */
  title: string;
  /** The opening sentences as plain text; empty when the page has none. */
  extract: string;
  /** The latest revision, so an edited page gets a new card. */
  revision: number;
  /** Whether this is the wiki's main page, which previews as the wiki itself. */
  isMainPage: boolean;
}

const TIMEOUT_MS = 4_000;

interface ApiPage {
  title: string;
  missing?: boolean;
  invalid?: boolean;
  lastrevid?: number;
  extract?: string;
}

/**
 * The page behind a card, read from the wiki's API, or null when the wiki does
 * not have it (or cannot be reached: a card is never worth an error).
 */
export async function fetchWikiCardPage(
  page: string,
): Promise<WikiCardPage | null> {
  const query =
    new URLSearchParams(
      {
        action:
          'query',
        format:
          'json',
        formatversion:
          '2',
        redirects:
          '1',
        prop: 'info|extracts',
        exintro:
          '1',
        explaintext:
          '1',
        exsentences:
          '2',
        titles:
          page,
        meta: 'siteinfo',
        siprop:
          'general',
      },
    );
  try {
    const res =
      await fetch(
        `${wikiPublicUrl()}/api.php?${query}`,
        {
          headers:
            {
              'User-Agent':
                'rmhstudios.com link previews',
            },
          signal:
            AbortSignal.timeout(
              TIMEOUT_MS,
            ),
        },
      );
    if (
      !res.ok
    )
      return null;
    const json =
      (await res.json()) as {
        query?: {
          pages?: ApiPage[];
          general?: {
            mainpage?: string;
          };
        };
      };
    const found =
      json
        .query
        ?.pages?.[0];
    if (
      !found ||
      found.missing ||
      found.invalid ||
      !found.lastrevid
    )
      return null;
    return {
      title:
        found.title,
      extract:
        (
          found.extract ??
          ''
        )
          .replace(
            /\s+/g,
            ' ',
          )
          .trim(),
      revision:
        found.lastrevid,
      isMainPage:
        found.title ===
        json
          .query
          ?.general
          ?.mainpage,
    };
  } catch {
    return null;
  }
}
