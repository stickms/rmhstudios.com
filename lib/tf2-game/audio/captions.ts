/**
 * Closed captions (SDK: game/client/hud_closecaption.cpp, public/captioncompiler.h).
 *
 * HL2 and Portal caption their speech and many effects: `resource/closecaption_<lang>.txt` maps
 * a token — the sound script entry's name, or a scene's caption token — to text with inline
 * commands, compiled into `closecaption_<lang>.dat` (VCCD v1: a directory of CRC32-of-the-
 * lowercase-token → block, offset, length; UTF-16LE strings in fixed-size blocks). The exporter
 * reduces the commands for the browser (scripts/tf2-game/sourcegame.py reduce_caption, mirrored
 * by `reduceCaption` here) into `snd/captions.json`:
 *
 *   `<clr:r,g,b>` / `<playerclr:…:r,g,b>` → `<color=#rrggbb>…</color>` (a leading one becomes
 *   `color`), `<I>` / `<B>` toggles → `<i>…</i>` / `<b>…</b>`, `<cr>` → newline, `<sfx>` →
 *   `sfx: true` (an effect caption: the HUD hides those when showing subtitles only),
 *   `<len:N>` → `len` (seconds on screen, instead of the sound's duration), `<delay:N>` →
 *   `delay`, `<norepeat:N>` → `norepeat` (not shown again within N seconds).
 *
 * A caption stays up for the sound's duration plus cc_linger_time (1 s), or `len`.
 */
import { parseKeyValues } from '../formats/keyvalues';
import { crc32 } from './crc32';

export interface Caption {
  /** Text with only `<i>`, `<b>`, `<color=#rrggbb>` runs and newlines. */
  text: string;
  /** The caption's colour (`#rrggbb`), when it starts with one. */
  color?: string;
  sfx?: boolean;
  len?: number;
  delay?: number;
  norepeat?: number;
}

/** `snd/captions.json` — written by scripts/tf2-game/sounds.py for HL2 and Portal. */
export interface CaptionDocument {
  v: 1;
  lang: string;
  /** Lowercase token → caption. */
  captions: Record<string, Caption>;
}

/** What the HUD receives when a captioned sound starts. */
export interface CaptionEvent {
  token: string;
  text: string;
  color?: string;
  sfx: boolean;
  /** Seconds to show it. */
  duration: number;
  /** Seconds to wait before showing it. */
  delay: number;
}

/** cc_linger_time. */
export const CAPTION_LINGER = 1;

const CMD = /<(\w+)(?::([^>]*))?>/g;

/** The HUD's markup → the reduced form (sourcegame.reduce_caption). */
export function reduceCaption(raw: string): Caption {
  const out: Partial<Caption> = {};
  const parts: string[] = [];
  let italic = false;
  let bold = false;
  let colorOpen = false;
  let lead: string | undefined;
  let pos = 0;
  const plain = (): string =>
    parts
      .filter((p) => !p.startsWith('<'))
      .join('')
      .trim();
  for (const m of raw.matchAll(CMD)) {
    const chunk = raw.slice(pos, m.index);
    if (chunk) parts.push(chunk.replace(/[<>]/g, ''));
    pos = (m.index ?? 0) + m[0].length;
    const cmd = m[1];
    const arg = (m[2] ?? '').trim();
    const lc = cmd.toLowerCase();
    if (lc === 'clr' || lc === 'playerclr') {
      const nums = (lc === 'playerclr' ? (arg.split(':').pop() ?? '') : arg).match(/\d+/g) ?? [];
      if (colorOpen) {
        parts.push('</color>');
        colorOpen = false;
      }
      if (nums.length >= 3) {
        const hex =
          '#' +
          nums
            .slice(0, 3)
            .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
            .join('');
        if (!plain() && lead === undefined) lead = hex;
        else {
          parts.push(`<color=${hex}>`);
          colorOpen = true;
        }
      }
    } else if (cmd === 'I') {
      parts.push(italic ? '</i>' : '<i>');
      italic = !italic;
    } else if (cmd === 'B') {
      parts.push(bold ? '</b>' : '<b>');
      bold = !bold;
    } else if (lc === 'cr') {
      parts.push('\n');
    } else if (lc === 'sfx') {
      out.sfx = true;
    } else if (lc === 'len' || lc === 'delay' || lc === 'norepeat') {
      const n = Number(arg);
      if (arg && Number.isFinite(n)) out[lc] = n;
      if (lc === 'delay' && plain()) parts.push('\n');
    }
  }
  const tail = raw.slice(pos);
  if (tail) parts.push(tail.replace(/[<>]/g, ''));
  if (colorOpen) parts.push('</color>');
  if (bold) parts.push('</b>');
  if (italic) parts.push('</i>');
  out.text = parts
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .replace(/<(i|b)><\/\1>|<color=#[0-9a-f]{6}><\/color>/g, '');
  if (lead) out.color = lead;
  return out as Caption;
}

/** Decode a caption file's text: UTF-16 with a BOM (as shipped), else UTF-8. */
function decodeCaptionText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}

/** `closecaption_<lang>.txt` → lowercase token → raw caption text (first definition wins). */
export function parseCaptionsTxt(bytes: Uint8Array): Map<string, string> {
  const out = new Map<string, string>();
  const root = parseKeyValues(decodeCaptionText(bytes)).root;
  for (const top of root.children) {
    const tokens = top.get('Tokens');
    if (!tokens) continue;
    for (const t of tokens.children) {
      const k = t.key.toLowerCase();
      if (t.value !== null && !out.has(k)) out.set(k, t.value);
    }
  }
  return out;
}

/** VCCD header magic ('VCCD' little-endian). */
export const VCCD_ID = 0x44434356;

/** A compiled caption file (`closecaption_<lang>.dat`), looked up by token. */
export class CompiledCaptions {
  private readonly view: DataView;
  private readonly lookup = new Map<number, { block: number; offset: number; length: number }>();
  readonly blockSize: number;
  readonly dataOffset: number;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (this.view.getUint32(0, true) !== VCCD_ID || this.view.getInt32(4, true) !== 1)
      throw new Error('closecaption: not a VCCD v1 file');
    this.blockSize = this.view.getInt32(12, true);
    const count = this.view.getInt32(16, true);
    this.dataOffset = this.view.getInt32(20, true);
    for (let i = 0; i < count; i++) {
      const at = 24 + i * 12;
      this.lookup.set(this.view.getUint32(at, true), {
        block: this.view.getInt32(at + 4, true),
        offset: this.view.getUint16(at + 8, true),
        length: this.view.getUint16(at + 10, true),
      });
    }
  }

  get size(): number {
    return this.lookup.size;
  }

  /** The raw caption of a token (case-insensitive), or null. */
  get(token: string): string | null {
    const hit = this.lookup.get(crc32(token.toLowerCase()));
    if (!hit) return null;
    const start = this.dataOffset + hit.block * this.blockSize + hit.offset;
    const text = new TextDecoder('utf-16le').decode(this.bytes.subarray(start, start + hit.length));
    const nul = text.indexOf('\0');
    return nul >= 0 ? text.slice(0, nul) : text;
  }
}

/** How long a caption stays up for a sound of `soundSeconds` (cc_linger_time, `len`). */
export function captionDuration(caption: Caption, soundSeconds: number): number {
  return caption.len ?? Math.max(0, soundSeconds) + CAPTION_LINGER;
}
