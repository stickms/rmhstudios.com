/**
 * RMHHomes scraper — minimal RSS/RDF feed parser (server only).
 *
 * Housing feeds come in two shapes we care about: RSS 2.0 (`<item><title/>
 * <link/><description/><pubDate/>…`) and Craigslist's RDF variant (`<item
 * rdf:about="…"><dc:date/><geo:lat/><geo:long/>…`). Both wrap listings in
 * `<item>` elements, so we split on those and read leaf fields by tag name.
 *
 * We deliberately avoid pulling in a full XML dependency: these feeds are
 * regular, and a focused reader is easier to reason about (and to fuzz with the
 * tests next to this file) than a general parser wrestling with namespaces.
 */

/** One parsed feed entry: leaf field text keyed by lower-cased tag name. */
export interface FeedItem {
  /** e.g. { title, link, description, 'dc:date', 'geo:lat', 'geo:long' } */
  fields: Record<string, string>;
  /** Image URLs found in enclosure / media:content / media:thumbnail tags. */
  imageUrls: string[];
}

const ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

/** Decode CDATA wrappers and the handful of HTML entities feeds actually use. */
function decode(raw: string): string {
  let s = raw.trim();
  // Unwrap one or more CDATA sections, keeping their contents.
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner) => inner);
  s = s
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return s.trim();
}

const CDATA_RE = /<!\[CDATA\[[\s\S]*?\]\]>/g;

/**
 * Collect leaf `<tag>…</tag>` values, keyed by lower-cased tag name (first
 * writer wins). Container tags that hold child elements (e.g. Craigslist's
 * `<geo:Point>` wrapping `<geo:lat>`/`<geo:long>`) are recursed into rather than
 * stored. CDATA is ignored for the container test so a CDATA-wrapped HTML
 * description (which legitimately contains `<p>…`) still counts as a leaf.
 */
function readFieldsInto(xml: string, fields: Record<string, string>): void {
  // Tag names may carry a namespace prefix (dc:date, geo:lat).
  const tagRe = /<([a-zA-Z][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const name = m[1].toLowerCase();
    const content = m[2];
    const hasChildElements = /<[a-zA-Z]/.test(content.replace(CDATA_RE, ''));
    if (hasChildElements) {
      readFieldsInto(content, fields);
    } else if (!(name in fields)) {
      fields[name] = decode(content);
    }
  }
}

function readFields(itemXml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  readFieldsInto(itemXml, fields);
  return fields;
}

/** Extract image URLs from enclosure / media:content / media:thumbnail tags. */
function readImages(itemXml: string): string[] {
  const urls: string[] = [];
  const re =
    /<(?:enclosure|media:content|media:thumbnail)\b[^>]*\burl\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(itemXml)) !== null) {
    const url = decode(m[1]);
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/** Parse a feed body into its item entries (empty array on junk input). */
export function parseFeedItems(xml: string): FeedItem[] {
  if (!xml) return [];
  const items: FeedItem[] = [];
  let m: RegExpExecArray | null;
  ITEM_RE.lastIndex = 0;
  while ((m = ITEM_RE.exec(xml)) !== null) {
    const itemXml = m[1];
    items.push({ fields: readFields(itemXml), imageUrls: readImages(itemXml) });
  }
  return items;
}

/** First present, non-empty value among `names` (already lower-cased keys). */
export function pickField(fields: Record<string, string>, names: string[]): string | null {
  for (const name of names) {
    const v = fields[name];
    if (v != null && v.trim() !== '') return v.trim();
  }
  return null;
}
