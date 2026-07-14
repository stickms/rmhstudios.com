/**
 * Minimal RSS 2.0 feed builder (pure, no server deps — safe to import anywhere).
 *
 * Used by the blog and news syndication routes (`/blog/rss.xml`, `/news/rss.xml`)
 * so readers and aggregators can subscribe to our content. Element text is
 * XML-escaped; rich HTML descriptions are wrapped in CDATA.
 */

export interface RssItem {
  /** Plain-text title. */
  title: string;
  /** Absolute URL to the item. */
  link: string;
  /** Stable unique id (usually the absolute link). */
  guid: string;
  /** Short description/summary (plain text or HTML — emitted inside CDATA). */
  description: string;
  /** Publication date. Invalid dates are omitted. */
  pubDate?: Date;
  /** Optional category labels. */
  categories?: string[];
  /** Optional absolute image URL (emitted as an <enclosure>). */
  imageUrl?: string;
}

export interface RssChannel {
  title: string;
  /** Absolute URL to the human-readable section (e.g. /blog). */
  link: string;
  /** Absolute URL to this feed itself (for the atom:link self reference). */
  feedUrl: string;
  description: string;
  /** RFC 5646 language tag; defaults to "en". */
  language?: string;
  items: RssItem[];
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}

/** CDATA-wrap, defusing any nested `]]>` so the payload can't break out. */
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function isValidDate(d?: Date): d is Date {
  return !!d && !Number.isNaN(d.getTime());
}

export function renderRssFeed(channel: RssChannel): string {
  const lang = channel.language ?? 'en';
  const lastBuild = channel.items
    .map((i) => i.pubDate)
    .filter(isValidDate)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const itemsXml = channel.items
    .map((item) => {
      const parts = [
        `      <title>${xmlEscape(item.title)}</title>`,
        `      <link>${xmlEscape(item.link)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(item.guid)}</guid>`,
        `      <description>${cdata(item.description)}</description>`,
      ];
      if (isValidDate(item.pubDate)) parts.push(`      <pubDate>${item.pubDate.toUTCString()}</pubDate>`);
      for (const cat of item.categories ?? []) {
        if (cat) parts.push(`      <category>${xmlEscape(cat)}</category>`);
      }
      if (item.imageUrl) {
        parts.push(`      <enclosure url="${xmlEscape(item.imageUrl)}" type="image/jpeg" />`);
      }
      return `    <item>\n${parts.join('\n')}\n    </item>`;
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${xmlEscape(channel.title)}</title>\n` +
    `    <link>${xmlEscape(channel.link)}</link>\n` +
    `    <atom:link href="${xmlEscape(channel.feedUrl)}" rel="self" type="application/rss+xml" />\n` +
    `    <description>${xmlEscape(channel.description)}</description>\n` +
    `    <language>${xmlEscape(lang)}</language>\n` +
    (isValidDate(lastBuild) ? `    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>\n` : '') +
    `${itemsXml}\n` +
    `  </channel>\n` +
    `</rss>\n`
  );
}
