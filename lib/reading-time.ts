/**
 * Reading-time estimate for long-form posts (blog logs). Pure so the page and
 * the tests agree.
 *
 * Markdown is stripped first so syntax, URLs and code do not inflate the count:
 * fenced code is skipped (people skim it), link targets and HTML/MDX tags are
 * dropped. Space-separated words read at {@link WORDS_PER_MINUTE}; Chinese,
 * Japanese and Korean text has no spaces, so those characters are counted
 * separately at {@link CJK_CHARS_PER_MINUTE}.
 */

export const WORDS_PER_MINUTE = 230;
export const CJK_CHARS_PER_MINUTE = 400;

const CJK = /[぀-ヿ㐀-鿿가-힯]/g;

function stripMarkdown(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`\n]*`/g, ' ') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their text
    .replace(/<[^>]+>/g, ' ') // HTML / MDX tags
    .replace(/https?:\/\/\S+/g, ' ') // bare URLs
    .replace(/[#>*_~|-]+/g, ' '); // markdown punctuation
}

/** Whole minutes to read `markdown`; never less than 1 for non-empty text, 0 for empty. */
export function readingTimeMinutes(markdown: string): number {
  const text = stripMarkdown(markdown);
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text
    .replace(CJK, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (words === 0 && cjk === 0) return 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE + cjk / CJK_CHARS_PER_MINUTE));
}
