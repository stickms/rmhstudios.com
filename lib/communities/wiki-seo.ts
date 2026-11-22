/** The text a wiki page unfurls with (s09-04). Pure and client-safe: a route's `head()` runs in the browser too. */

export const WIKI_DESCRIPTION_MAX = 160;

/**
 * The first 160 characters of a page's text, as one plain line: markdown marks and link targets dropped, runs of
 * whitespace collapsed, cut at a word with an ellipsis when it is longer.
 */
export function wikiDescription(body: string, max: number = WIKI_DESCRIPTION_MAX): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+\s]+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
