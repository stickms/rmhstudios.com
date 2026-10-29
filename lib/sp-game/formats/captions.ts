/**
 * Close captions: `resource/closecaption_<language>.txt`, a UTF-16 KeyValues
 * file `"lang" { "Language" "…" "Tokens" { "<token>" "<text>" } }`. The text
 * carries formatting tags (`<clr:r,g,b>`, `<sfx>`, `<len:n>`, `<I>` …) that the
 * HUD interprets; `stripCaptionTags` gives the plain words. Tokens are matched
 * case-insensitively, as the engine hashes them lower-cased.
 */

import { parseKeyValuesBlock } from '../../tf2-game/formats/keyvalues';

export class CaptionTable {
  private readonly map = new Map<string, string>();

  constructor(entries?: Iterable<[string, string]>) {
    if (entries) for (const [k, v] of entries) this.map.set(k.toLowerCase(), v);
  }

  get size(): number {
    return this.map.size;
  }

  /** Raw caption text (with tags) for a token, or null. */
  get(token: string): string | null {
    return this.map.get(token.toLowerCase()) ?? null;
  }
}

/** Decodes the file's bytes (UTF-16 with a BOM, or 8-bit) and reads its Tokens block. */
export function parseCaptionFile(bytes: Uint8Array): CaptionTable {
  let text: string;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
  else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
  else text = new TextDecoder('utf-8').decode(bytes);
  const root = parseKeyValuesBlock(text, { evaluate: null });
  const tokens = root?.get('Tokens');
  const out: Array<[string, string]> = [];
  if (tokens) for (const c of tokens.children) if (c.value !== null) out.push([c.key, c.value]);
  return new CaptionTable(out);
}

/** The caption without its formatting tags. */
export function stripCaptionTags(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
