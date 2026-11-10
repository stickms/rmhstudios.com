/**
 * Identity and text sanitising (NET-03, R-07, D-35).
 *
 * Player names come from the hub (vouched account names) and chat lines from
 * peers; both are drawn by the game's subset fonts, which have no fallback
 * glyphs. Every string a player supplied is therefore cleaned before it
 * reaches Lua: control characters and runs of whitespace collapse to one
 * space, and any code point the shipped font for the current language cannot
 * draw becomes `?`.
 *
 * The glyph bitmap ships in the MP pack as `rmh_mp/glyphs.bin`
 * (docs/balatro-mp.md §4, little-endian):
 *
 *     'RMHG'  u8 version=1  u8 fontCount  u8 langCount  u8 0
 *     fontCount × { u8 nameLen, name, u32 byteLen, bitmap }
 *     langCount × { u8 keyLen, key, u8 fontIndex }
 *
 * Bit `cp & 7` of byte `cp >> 3` is set when the font draws `cp`.
 * Without a bitmap (pack not mounted yet, a corrupt file) only printable
 * ASCII survives. Browser-free.
 */

export interface GlyphTable {
  fonts: { name: string; bits: Uint8Array }[];
  /** `G.LANGUAGES` key → index into `fonts`. */
  langs: Map<string, number>;
}

export const NAME_MAX_CHARS = 32;

/** Parse `glyphs.bin`; null when the bytes are not a version-1 table. */
export function parseGlyphs(bytes: Uint8Array): GlyphTable | null {
  try {
    if (bytes.byteLength < 8) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== 'RMHG' || bytes[4] !== 1) return null;
    const fontCount = bytes[5];
    const langCount = bytes[6];
    let at = 8;
    const text = (n: number) => {
      if (at + n > bytes.byteLength) throw new RangeError('glyphs: truncated');
      const s = new TextDecoder().decode(bytes.subarray(at, at + n));
      at += n;
      return s;
    };
    const fonts: GlyphTable['fonts'] = [];
    for (let i = 0; i < fontCount; i++) {
      const name = text(bytes[at++]);
      if (at + 4 > bytes.byteLength) return null;
      const len = view.getUint32(at, true);
      at += 4;
      if (at + len > bytes.byteLength) return null;
      fonts.push({ name, bits: bytes.slice(at, at + len) });
      at += len;
    }
    const langs = new Map<string, number>();
    for (let i = 0; i < langCount; i++) {
      const key = text(bytes[at++]);
      const idx = bytes[at++];
      if (idx === undefined || idx >= fonts.length) return null;
      langs.set(key, idx);
    }
    return { fonts, langs };
  } catch {
    return null;
  }
}

/** Build a glyph file (tests and tools); the inverse of `parseGlyphs`. */
export function encodeGlyphs(
  fonts: { name: string; codepoints: Iterable<number> }[],
  langs: Record<string, number>,
): Uint8Array {
  const enc = new TextEncoder();
  const parts: number[] = [0x52, 0x4d, 0x48, 0x47, 1, fonts.length, Object.keys(langs).length, 0];
  for (const f of fonts) {
    const name = enc.encode(f.name);
    parts.push(name.length, ...name);
    let max = 0;
    const cps = [...f.codepoints];
    for (const cp of cps) max = Math.max(max, cp);
    const bits = new Uint8Array((max >> 3) + 1);
    for (const cp of cps) bits[cp >> 3] |= 1 << (cp & 7);
    parts.push(bits.length & 0xff, (bits.length >> 8) & 0xff, (bits.length >> 16) & 0xff, bits.length >>> 24);
    parts.push(...bits);
  }
  for (const [key, idx] of Object.entries(langs)) {
    const k = enc.encode(key);
    parts.push(k.length, ...k, idx);
  }
  return Uint8Array.from(parts);
}

/** The bitmap for a language: exact key, then the same base language, then en-us, then the first font. */
export function glyphsFor(table: GlyphTable | null, lang: string): Uint8Array | null {
  if (!table || table.fonts.length === 0) return null;
  const want = lang.toLowerCase().replace('-', '_');
  let idx: number | undefined;
  for (const [key, i] of table.langs) if (key.toLowerCase().replace('-', '_') === want) idx = i;
  if (idx === undefined) {
    const base = want.split('_')[0];
    for (const [key, i] of table.langs) if (key.toLowerCase().split(/[-_]/)[0] === base) idx ??= i;
  }
  idx ??= table.langs.get('en-us') ?? 0;
  return table.fonts[idx]?.bits ?? null;
}

/** `'all'` keeps every printable code point (cleaning for transport, not for a font). */
export type GlyphBits = Uint8Array | null | 'all';

function hasGlyph(bits: GlyphBits, cp: number): boolean {
  if (cp === 0x20 || bits === 'all') return true;
  if (!bits) return cp > 0x20 && cp < 0x7f;
  const byte = bits[cp >> 3];
  return byte !== undefined && (byte & (1 << (cp & 7))) !== 0;
}

/**
 * Clean player-supplied text for the game's fonts: NFC, controls and
 * whitespace runs → one space, trimmed, undrawable code points → `?`,
 * at most `maxChars` code points.
 */
export function sanitizeText(text: string, bits: GlyphBits, maxChars = 500): string {
  const norm = String(text ?? '').normalize('NFC');
  let out = '';
  let n = 0;
  let space = false;
  for (const ch of norm) {
    const cp = ch.codePointAt(0) ?? 0;
    // C0/C1 controls, DEL, line/paragraph separators, bidi controls and every whitespace.
    const blank =
      cp < 0x20 ||
      (cp >= 0x7f && cp < 0xa0) ||
      cp === 0x2028 ||
      cp === 0x2029 ||
      (cp >= 0x200b && cp <= 0x200f) ||
      (cp >= 0x202a && cp <= 0x202e) ||
      (cp >= 0x2066 && cp <= 0x2069) ||
      cp === 0xfeff ||
      /\s/u.test(ch);
    if (blank) {
      space = out.length > 0;
      continue;
    }
    if (space) {
      if (n >= maxChars) break;
      out += ' ';
      n += 1;
      space = false;
    }
    if (n >= maxChars) break;
    out += hasGlyph(bits, cp) ? ch : '?';
    n += 1;
  }
  return out;
}

/** A display name: sanitised, ≤32 chars, never empty. */
export function sanitizeName(name: string, bits: GlyphBits): string {
  return sanitizeText(name, bits, NAME_MAX_CHARS) || 'Player';
}

/** The page's language as a `G.LANGUAGES` key guess (sanitising only; Lua owns the real setting). */
export function guessLang(nav: { language?: string } | undefined = globalThis.navigator): string {
  const l = (nav?.language ?? 'en-US').toLowerCase();
  if (l.startsWith('en')) return 'en-us';
  if (l === 'zh-tw' || l === 'zh-hk' || l.startsWith('zh-hant')) return 'zh_TW';
  if (l.startsWith('zh')) return 'zh_CN';
  if (l.startsWith('pt')) return 'pt_BR';
  if (l === 'es-es') return 'es_ES';
  if (l.startsWith('es')) return 'es_419';
  return l.split('-')[0] ?? 'en-us';
}
