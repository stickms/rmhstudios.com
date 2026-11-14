/**
 * Election news from public RSS feeds: the pure half — which feeds, what counts
 * as election news, and how an item is cleaned. Client-safe.
 *
 * RSS is the machine-readable path publishers themselves offer for syndication,
 * so this is "scraping" in the polite sense: headline, outlet, link and a short
 * snippet, linked back to the publisher. We never copy article bodies, never
 * hit a paywalled HTML page, and every item points the reader to the source.
 */

import { STATE_NAMES } from './states';

export interface NewsFeed {
  id: string;
  name: string;
  url: string;
}

export const NEWS_FEEDS: NewsFeed[] =
  [
    {
      id: 'npr',
      name: 'NPR',
      url: 'https://feeds.npr.org/1014/rss.xml',
    },
    {
      id: 'pbs',
      name: 'PBS NewsHour',
      url: 'https://www.pbs.org/newshour/feeds/rss/politics',
    },
    {
      id: 'politico',
      name: 'Politico',
      url: 'https://rss.politico.com/politics-news.xml',
    },
    {
      id: 'guardian',
      name: 'The Guardian',
      url: 'https://www.theguardian.com/us-news/us-politics/rss',
    },
    {
      id: 'bbc',
      name: 'BBC News',
      url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
    },
    {
      id: 'cbs',
      name: 'CBS News',
      url: 'https://www.cbsnews.com/latest/rss/politics',
    },
    {
      id: 'abc',
      name: 'ABC News',
      url: 'https://abcnews.go.com/abcnews/politicsheadlines',
    },
    {
      id: 'nbc',
      name: 'NBC News',
      url: 'https://feeds.nbcnews.com/nbcnews/public/politics',
    },
    {
      id: 'thehill',
      name: 'The Hill',
      url: 'https://thehill.com/homenews/campaign/feed/',
    },
  ];

/** Google News' search feed: one query, many outlets. The `when:` operator keeps it recent. */
export function googleNewsFeed(
  query: string,
): NewsFeed {
  return {
    id: 'gnews',
    name: 'Google News',
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
  };
}

export interface NewsItem {
  /** Stable: a hash of the normalised title, so the same story from two feeds is one item. */
  id: string;
  title: string;
  url: string;
  source: string;
  /** ISO. */
  publishedAt: string;
  snippet: string;
  /** USPS codes of the states the headline names. */
  states: string[];
}

const RELEVANT =
  /\b(elections?|primar(?:y|ies)|runoffs?|ballots?|voters?|voting|votes?|polls? (?:close|open|closing)|exit polls?|senate race|house race|governor'?s? race|midterms?|caucus(?:es)?|candidates?|nominee|nomination|turnout|swing states?|battlegrounds?|recount|concedes?|conceded|projected|projects|too close to call|results)\b/i;

export function isElectionRelevant(
  title: string,
  snippet = '',
): boolean {
  return RELEVANT.test(
    `${title} ${snippet}`,
  );
}

const ENTITIES: Record<
  string,
  string
> =
  {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    '#39':
      "'",
    '#x27':
      "'",
    rsquo:
      '’',
    lsquo:
      '‘',
    ldquo:
      '“',
    rdquo:
      '”',
    ndash:
      '–',
    mdash:
      '—',
    hellip:
      '…',
  };

export function stripHtml(
  s: string,
): string {
  return s
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      ' ',
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      ' ',
    )
    .replace(
      /<[^>]*>/g,
      ' ',
    )
    .replace(
      /&(#x?[0-9a-f]+|[a-z]+);/gi,
      (
        m,
        e: string,
      ) => {
        if (
          e[0] ===
          '#'
        ) {
          const n =
            e[1] ===
              'x' ||
            e[1] ===
              'X'
              ? parseInt(
                  e.slice(
                    2,
                  ),
                  16,
                )
              : parseInt(
                  e.slice(
                    1,
                  ),
                  10,
                );
          return Number.isFinite(
            n,
          ) &&
            n >
              31 &&
            n <
              0x10ffff
            ? String.fromCodePoint(
                n,
              )
            : ' ';
        }
        return (
          ENTITIES[
            e.toLowerCase()
          ] ??
          m
        );
      },
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

const titleKey =
  (
    t: string,
  ) =>
    t
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        ' ',
      )
      .trim()
      .slice(
        0,
        90,
      );

function hash(
  s: string,
): string {
  let h = 5381;
  for (
    let i = 0;
    i <
    s.length;
    i++
  )
    h =
      ((h *
        33) ^
        s.charCodeAt(
          i,
        )) >>>
      0;
  return h.toString(
    36,
  );
}

// "Washington" is a state and a city; "Georgia" a state and a country. Only count them with a cue.
const AMBIGUOUS: Record<
  string,
  RegExp
> =
  {
    WA: /\bwashington state\b/i,
    GA: /\bgeorgia(?:'s)? (?:senate|governor|primary|runoff|election|voters|secretary)/i,
  };

export function tagStates(
  text: string,
): string[] {
  const out: string[] =
    [];
  for (const [
    code,
    name,
  ] of Object.entries(
    STATE_NAMES,
  )) {
    if (
      code ===
      'DC'
    )
      continue;
    const re =
      AMBIGUOUS[
        code
      ];
    if (
      re
        ? re.test(
            text,
          )
        : new RegExp(
            `\\b${name.replace(/ /g, '\\s')}\\b`,
            'i',
          ).test(
            text,
          )
    )
      out.push(
        code,
      );
  }
  return out;
}

export interface RawFeedItem {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
}

const MAX_TITLE = 200;
const MAX_SNIPPET = 200;

/** Clean one feed entry into a `NewsItem`, or null if it is unusable or not election news. */
export function normalizeNewsItem(
  raw: RawFeedItem,
  feed: NewsFeed,
  now: number = Date.now(),
): NewsItem | null {
  let title =
    stripHtml(
      raw.title ??
        '',
    );
  let source =
    feed.name;
  // Google News headlines arrive as "Headline - Outlet".
  if (
    feed.id ===
    'gnews'
  ) {
    // Split on the LAST " - ": outlet names carry hyphens ("Journal-Constitution") but headlines can too.
    const i =
      title.lastIndexOf(
        ' - ',
      );
    if (
      i >
        10 &&
      title.length -
        i -
        3 <=
        60
    ) {
      source =
        title
          .slice(
            i +
              3,
          )
          .trim() ||
        source;
      title =
        title
          .slice(
            0,
            i,
          )
          .trim();
    }
  }
  if (
    !title ||
    title.length <
      12
  )
    return null;

  let url: URL;
  try {
    url =
      new URL(
        raw.link ??
          '',
      );
  } catch {
    return null;
  }
  if (
    url.protocol !==
      'https:' &&
    url.protocol !==
      'http:'
  )
    return null;

  const when =
    Date.parse(
      raw.isoDate ??
        raw.pubDate ??
        '',
    );
  // Missing or future-dated entries are not trusted as "latest": cap at now.
  const published =
    Number.isFinite(
      when,
    )
      ? Math.min(
          when,
          now,
        )
      : now;

  let snippet =
    stripHtml(
      raw.contentSnippet ??
        raw.summary ??
        raw.content ??
        '',
    );
  if (
    feed.id ===
    'gnews'
  )
    snippet =
      ''; // Google's description just repeats the headline and a link list
  if (
    snippet
      .toLowerCase()
      .startsWith(
        title
          .toLowerCase()
          .slice(
            0,
            40,
          ),
      )
  )
    snippet =
      '';
  snippet =
    snippet.slice(
      0,
      MAX_SNIPPET,
    );

  if (
    !isElectionRelevant(
      title,
      snippet,
    )
  )
    return null;
  title =
    title.slice(
      0,
      MAX_TITLE,
    );
  return {
    id: hash(
      titleKey(
        title,
      ),
    ),
    title,
    url: url.toString(),
    source,
    publishedAt:
      new Date(
        published,
      ).toISOString(),
    snippet,
    states:
      tagStates(
        title,
      ),
  };
}

/** One item per story (same normalised headline), keeping the earliest copy; newest first. */
export function dedupeNews(
  items: NewsItem[],
): NewsItem[] {
  const byId =
    new Map<
      string,
      NewsItem
    >();
  for (const it of items) {
    const cur =
      byId.get(
        it.id,
      );
    if (
      !cur ||
      it.publishedAt <
        cur.publishedAt
    )
      byId.set(
        it.id,
        it,
      );
  }
  return [
    ...byId.values(),
  ].sort(
    (
      a,
      b,
    ) =>
      b.publishedAt.localeCompare(
        a.publishedAt,
      ),
  );
}
