/**
 * A small Valve KeyValues (VDF) reader for the game files the loadout catalog
 * is built from (`items_game.txt`, `tf_english.txt`).
 *
 * The files are ~8 MB, so this is a single forward scan with no regexes and no
 * intermediate token array. A block becomes a plain object; a repeated key in
 * one block keeps its last value (the game does the same), and keys are
 * compared exactly — callers lower-case where the game is case-insensitive.
 */

export type VdfValue = string | VdfObject;
export interface VdfObject {
  [key: string]: VdfValue;
}

export class VdfError extends Error {
  constructor(message: string, offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = 'VdfError';
  }
}

const QUOTE = 34; // "
const OPEN = 123; // {
const CLOSE = 125; // }
const SLASH = 47; // /
const BACKSLASH = 92; // \
const NEWLINE = 10;

export function parseVdf(text: string): VdfObject {
  let i = 0;
  const n = text.length;

  const skipTrivia = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c <= 32 || c === 0xfeff) i++;
      else if (c === SLASH && text.charCodeAt(i + 1) === SLASH) {
        while (i < n && text.charCodeAt(i) !== NEWLINE) i++;
      } else break;
    }
  };

  /** A quoted string, or an unquoted run up to whitespace / brace / quote. */
  const readString = (): string => {
    const c = text.charCodeAt(i);
    if (c === QUOTE) {
      i++;
      let out = '';
      let from = i;
      while (i < n) {
        const d = text.charCodeAt(i);
        if (d === QUOTE) {
          out += text.slice(from, i);
          i++;
          return out;
        }
        if (d === BACKSLASH && i + 1 < n) {
          out += text.slice(from, i);
          const e = text[i + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
          from = i;
        } else i++;
      }
      throw new VdfError('Unterminated string', from);
    }
    const start = i;
    while (i < n) {
      const d = text.charCodeAt(i);
      if (d <= 32 || d === QUOTE || d === OPEN || d === CLOSE) break;
      i++;
    }
    if (i === start) throw new VdfError('Expected a string', i);
    return text.slice(start, i);
  };

  const readBlock = (topLevel: boolean): VdfObject => {
    const obj: VdfObject = Object.create(null);
    for (;;) {
      skipTrivia();
      if (i >= n) {
        if (topLevel) return obj;
        throw new VdfError('Unexpected end of file inside a block', i);
      }
      if (text.charCodeAt(i) === CLOSE) {
        if (topLevel) throw new VdfError('Unmatched }', i);
        i++;
        return obj;
      }
      const key = readString();
      skipTrivia();
      if (text.charCodeAt(i) === OPEN) {
        i++;
        obj[key] = readBlock(false);
      } else {
        obj[key] = readString();
      }
    }
  };

  return readBlock(true);
}

/** `obj[key]` as a block, or undefined when absent or a plain string. */
export function block(obj: VdfObject | undefined, key: string): VdfObject | undefined {
  const v = obj?.[key];
  return typeof v === 'object' ? v : undefined;
}

/** `obj[key]` as a string, or undefined when absent or a block. */
export function str(obj: VdfObject | undefined, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === 'string' ? v : undefined;
}
