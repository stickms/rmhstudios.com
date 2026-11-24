/**
 * Deep links to the exact place a source says something (owner 2026-11-24). Pure and client-safe.
 *
 * - A web page whose words we hold verbatim gets a URL text fragment (`#:~:text=`, WICG Scroll-to-Text): Chromium,
 *   Safari and Firefox scroll to the words and highlight them; a browser without support simply opens the page.
 * - A PDF gets `#page=N`, which most viewers honour.
 */

/** How many words of a long quote are used at each end (`textStart,textEnd`). */
export const FRAGMENT_EDGE_WORDS = 4;

/**
 * One text-fragment term: `encodeURIComponent` plus the characters the fragment syntax gives a meaning to. The spec
 * reserves `-` (prefix / suffix), `,` (start / end) and `&` (the next directive); `encodeURIComponent` already escapes
 * `,` and `&`, so `-` is the one added here.
 */
export function encodeFragmentTerm(term: string): string {
  return encodeURIComponent(term).replace(/-/g, '%2D');
}

/** The quote as a page shows it: whitespace collapsed, wrapping quotation marks dropped. */
export function normaliseQuote(quote: string): string {
  return quote
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .trim();
}

/** The URL with any fragment it carried removed (a text directive replaces it). */
const withoutHash = (url: string): string => {
  const i = url.indexOf('#');
  return i === -1 ? url : url.slice(0, i);
};

/**
 * `url#:~:text=…` for a quote on that page. A short quote is matched whole; a long one by its first and last
 * `FRAGMENT_EDGE_WORDS` words (`textStart,textEnd`), which is what the spec intends for long passages and survives a
 * small difference in the middle. An empty quote returns the URL unchanged.
 */
export function textFragmentUrl(
  url: string,
  quote: string | null | undefined,
  edgeWords = FRAGMENT_EDGE_WORDS,
): string {
  const text = quote ? normaliseQuote(quote) : '';
  if (!text) return url;
  const words = text.split(' ');
  const directive =
    words.length <= edgeWords * 2 + 1
      ? encodeFragmentTerm(text)
      : `${encodeFragmentTerm(words.slice(0, edgeWords).join(' '))},${encodeFragmentTerm(words.slice(-edgeWords).join(' '))}`;
  return `${withoutHash(url)}#:~:text=${directive}`;
}

/**
 * `url#:~:text=…&text=…` highlighting several quotes on one page (a group of figures read from one profile): each quote
 * is a directive of its own, as `textFragmentUrl` builds it, duplicates once. A browser highlights every one it finds and
 * ignores the rest. No quotes returns the URL unchanged.
 */
export function textFragmentsUrl(url: string, quotes: ReadonlyArray<string | null | undefined>): string {
  const seen = new Set<string>();
  const directives: string[] = [];
  for (const q of quotes) {
    const one = textFragmentUrl(url, q);
    const i = one.indexOf('#:~:text=');
    if (i === -1) continue;
    const d = one.slice(i + '#:~:'.length);
    if (seen.has(d)) continue;
    seen.add(d);
    directives.push(d);
  }
  return directives.length === 0 ? url : `${withoutHash(url)}#:~:${directives.join('&')}`;
}

/** True for a PDF url: a text fragment does not apply there. */
export const isPdfUrl = (url: string): boolean => /\.pdf(?:$|[?#])/i.test(url);

/** `url#page=N` for a page of a PDF; the URL unchanged when the page is unknown. */
export function pdfPageUrl(url: string, page: number | null | undefined): string {
  if (!page || !Number.isInteger(page) || page < 1) return url;
  return `${withoutHash(url)}#page=${page}`;
}
