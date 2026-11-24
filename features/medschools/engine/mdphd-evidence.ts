/**
 * The rule that decides whether a quoted sentence is on a page (MD-PhD timelines, `data/medschools/mdphd-programs.json`).
 * Pure; shared by `scripts/medschools/check-mdphd.ts`, which re-fetches the pages, and its tests. It is the rule the
 * one-time research pass used to keep a timeline, so the checker passes exactly what that pass kept.
 *
 * 1. Both texts are normalised: NFKC, curly quotes and dashes folded, whitespace collapsed, lower case.
 * 2. The quote is split at ellipses (`...` or `…`); every piece of four or more words must be a substring of the page.
 * 3. Fallback for tables and headings, where stripping tags joins cells differently: compare letters and digits only, in
 *    order; every piece must still be at least 20 such characters and appear on the page.
 */

export function normEvidence(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−‐‑]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** HTML to its text: scripts and styles dropped, tags to spaces, the common entities decoded. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&lsquo;|&#8217;|&#8216;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&ndash;|&mdash;|&#8211;|&#8212;/g, '-')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

/** The pieces of a quote that must each be found: split at ellipses, wrapping quote marks dropped, four words or more. */
export function evidencePieces(quote: string): string[] {
  return normEvidence(quote)
    .replace(/^["']|["']$/g, '')
    .split(/\.\.\.|…/)
    .map((p) => p.trim().replace(/^["']|["']$/g, ''))
    .filter((p) => p.split(' ').length >= 4);
}

const alnum = (s: string): string => s.replace(/[^a-z0-9]+/g, '');

/** Whether `quote` is on the page whose (already normalised) text is `pageText`. */
export function evidenceFound(pageText: string, quote: string | null | undefined): boolean {
  if (!quote) return false;
  const pieces = evidencePieces(quote);
  if (pieces.length === 0) return false;
  if (pieces.every((p) => pageText.includes(p))) return true;
  const page = alnum(pageText);
  return pieces.every((p) => alnum(p).length >= 20 && page.includes(alnum(p)));
}
