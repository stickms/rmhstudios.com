/**
 * Case conversion for identifiers and headings.
 *
 * Every conversion first splits the input into words, then joins them in the
 * target style, so any style converts to any other: `parseHTTPResponse2`,
 * `parse-http-response-2` and `PARSE_HTTP_RESPONSE_2` all split into
 * `parse · http · response · 2`. Each line converts on its own, so a pasted
 * list of names stays a list.
 */

export type CaseStyle =
  'camel' | 'pascal' | 'snake' | 'kebab' | 'constant' | 'dot' | 'path' | 'title' | 'sentence' | 'lower' | 'upper';

export const CASE_STYLES: readonly CaseStyle[] = [
  'camel',
  'pascal',
  'snake',
  'kebab',
  'constant',
  'dot',
  'path',
  'title',
  'sentence',
  'lower',
  'upper',
];

/**
 * Split one line into words: on anything that is not a letter or digit, at a
 * lower-to-upper change (`fooBar`), at the end of an acronym (`HTTPServer` →
 * `HTTP`, `Server`), and between letters and digits (`v2` → `v`, `2`).
 */
export function splitWords(line: string): string[] {
  return line
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const cap = (word: string, locale: string) =>
  word.charAt(0).toLocaleUpperCase(locale) + word.slice(1).toLocaleLowerCase(locale);

function convertLine(line: string, style: CaseStyle, locale: string): string {
  if (style === 'lower') return line.toLocaleLowerCase(locale);
  if (style === 'upper') return line.toLocaleUpperCase(locale);
  const words = splitWords(line);
  const lower = words.map((w) => w.toLocaleLowerCase(locale));
  switch (style) {
    case 'camel':
      return lower.map((w, i) => (i === 0 ? w : cap(w, locale))).join('');
    case 'pascal':
      return lower.map((w) => cap(w, locale)).join('');
    case 'snake':
      return lower.join('_');
    case 'kebab':
      return lower.join('-');
    case 'constant':
      return words.map((w) => w.toLocaleUpperCase(locale)).join('_');
    case 'dot':
      return lower.join('.');
    case 'path':
      return lower.join('/');
    case 'title':
      return lower.map((w) => cap(w, locale)).join(' ');
    case 'sentence':
      return lower.map((w, i) => (i === 0 ? cap(w, locale) : w)).join(' ');
  }
}

/** Convert every line of `text` to `style`. Blank lines stay blank. */
export function convertCase(text: string, style: CaseStyle, locale = 'en'): string {
  return text
    .split(/\r?\n/)
    .map((line) => convertLine(line, style, locale))
    .join('\n');
}
