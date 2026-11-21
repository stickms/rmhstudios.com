/**
 * Text encodings, both ways: Base64 (standard and URL-safe), percent-encoding,
 * HTML entities and hexadecimal bytes.
 *
 * Text is always UTF-8 underneath, so "é" encodes to `w6k=`, not to the
 * Latin-1 byte `btoa` would choke on. Decoding is strict: input that is not a
 * valid encoding is reported, not silently mangled.
 */

export type Encoding = 'base64' | 'base64url' | 'url' | 'html' | 'hex';

export const ENCODINGS: readonly Encoding[] = ['base64', 'base64url', 'url', 'html', 'hex'];

export type CodecResult = { ok: true; text: string } | { ok: false; reason: 'invalid-input' | 'invalid-utf8' };

const utf8 = new TextEncoder();

function decodeUtf8(bytes: Uint8Array): CodecResult {
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'invalid-utf8' };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array | null {
  const clean = b64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.replace(/=+$/, '').length % 4 === 1) return null;
  try {
    const binary = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, '='));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The named entities worth decoding by name; anything else must be numeric. */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  middot: '·',
  bull: '•',
  laquo: '«',
  raquo: '»',
};

export function encode(text: string, encoding: Encoding): string {
  switch (encoding) {
    case 'base64':
      return bytesToBase64(utf8.encode(text));
    case 'base64url':
      return bytesToBase64(utf8.encode(text)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    case 'url':
      return encodeURIComponent(text);
    case 'html':
      return text.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);
    case 'hex':
      return [...utf8.encode(text)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  }
}

export function decode(text: string, encoding: Encoding): CodecResult {
  switch (encoding) {
    case 'base64': {
      const bytes = base64ToBytes(text);
      return bytes ? decodeUtf8(bytes) : { ok: false, reason: 'invalid-input' };
    }
    case 'base64url': {
      if (/[+/]/.test(text)) return { ok: false, reason: 'invalid-input' };
      const bytes = base64ToBytes(text.replace(/-/g, '+').replace(/_/g, '/'));
      return bytes ? decodeUtf8(bytes) : { ok: false, reason: 'invalid-input' };
    }
    case 'url':
      try {
        return { ok: true, text: decodeURIComponent(text.replace(/\+/g, ' ')) };
      } catch {
        return { ok: false, reason: 'invalid-input' };
      }
    case 'html':
      return {
        ok: true,
        text: text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
          if (body[0] === '#') {
            const cp = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
            return cp >= 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : whole;
          }
          return NAMED[body.toLowerCase()] ?? whole;
        }),
      };
    case 'hex': {
      const clean = text.replace(/0x/gi, '').replace(/[\s,:-]+/g, '');
      if (!/^([0-9a-f]{2})*$/i.test(clean)) return { ok: false, reason: 'invalid-input' };
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      return decodeUtf8(bytes);
    }
  }
}
