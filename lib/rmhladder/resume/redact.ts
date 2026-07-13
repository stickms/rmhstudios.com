export type RedactionKind = 'email' | 'phone' | 'url' | 'address' | 'name';

export interface RedactionResult {
  text: string;
  counts: Record<RedactionKind, number>;
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:linkedin\.com\/in|github\.com)\/[^\s<>()]+/gi;
const ADDRESS_RE = /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,60}\s(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|parkway|pkwy)\b[^\n,]*/gi;

function replaceAndCount(
  value: string,
  re: RegExp,
  token: string,
): { value: string; count: number } {
  let count = 0;
  return {
    value: value.replace(re, () => {
      count += 1;
      return token;
    }),
    count,
  };
}

/**
 * Redact contact PII before resume text is sent to a model. The likely name in
 * the first line is removed only when the opening block also contains contact
 * details, avoiding deletion of ordinary section headings.
 */
export function redactResumePii(raw: string): RedactionResult {
  let text = raw.replace(/\r\n?/g, '\n').split('\0').join('');
  const counts: Record<RedactionKind, number> = { email: 0, phone: 0, url: 0, address: 0, name: 0 };

  const openingLines = text.split('\n').slice(0, 10);
  const firstNonEmptyIndex = openingLines.findIndex((line) => line.trim().length > 0);
  const firstLine = firstNonEmptyIndex >= 0 ? openingLines[firstNonEmptyIndex].trim() : '';
  const opening = openingLines.join('\n');
  const hasContact = EMAIL_RE.test(opening) || PHONE_RE.test(opening) || URL_RE.test(opening);
  EMAIL_RE.lastIndex = 0;
  PHONE_RE.lastIndex = 0;
  URL_RE.lastIndex = 0;
  const likelyName = firstLine
    .replace(EMAIL_RE, '')
    .replace(PHONE_RE, '')
    .replace(URL_RE, '')
    .split(/[|•·]/, 1)[0]
    .trim()
    .replace(/[,:;\-–—]+$/g, '')
    .trim();
  EMAIL_RE.lastIndex = 0;
  PHONE_RE.lastIndex = 0;
  URL_RE.lastIndex = 0;
  const nameTokens = likelyName.split(/\s+/).filter(Boolean);
  const looksLikeName = nameTokens.length >= 2 && nameTokens.length <= 5
    && nameTokens.every((token) => /^[\p{L}][\p{L}'’-]*\.?$/u.test(token));
  if (looksLikeName && hasContact && likelyName) {
    text = text.replace(likelyName, '[NAME]');
    counts.name = 1;
  }

  for (const [kind, re, token] of [
    ['email', EMAIL_RE, '[EMAIL]'],
    ['phone', PHONE_RE, '[PHONE]'],
    ['url', URL_RE, '[URL]'],
    ['address', ADDRESS_RE, '[ADDRESS]'],
  ] as const) {
    const result = replaceAndCount(text, re, token);
    text = result.value;
    counts[kind] = result.count;
  }

  return { text: text.replace(/[ \t]+$/gm, '').replace(/\n{4,}/g, '\n\n\n').trim(), counts };
}
