/**
 * JSON validation, formatting and inspection.
 *
 * `JSON.parse` says that a document is broken, but where it says so depends on
 * the browser (V8 gives an offset, Firefox a line and column, Safari neither).
 * `validateJson` is a small strict RFC 8259 scanner that finds the first error
 * itself and reports the same line, column and reason everywhere; the value
 * itself still comes from `JSON.parse`.
 */

export type JsonErrorCode =
  | 'empty'
  | 'unexpected-character'
  | 'unexpected-end'
  | 'bad-escape'
  | 'bad-number'
  | 'control-character'
  | 'trailing-content'
  | 'expected-colon'
  | 'expected-key'
  | 'expected-comma'
  | 'too-deep';

/** Deeper than this is refused rather than risking the call stack (no real document nests this far). */
export const MAX_JSON_DEPTH = 1000;

export interface JsonError {
  code: JsonErrorCode;
  /** 0-based offset into the input. */
  offset: number;
  /** 1-based. */
  line: number;
  /** 1-based, in UTF-16 code units. */
  column: number;
  /** The character found there, when there is one. */
  found?: string;
}

class Scanner {
  i = 0;
  constructor(readonly s: string) {}

  fail(code: JsonErrorCode, at = this.i): never {
    throw Object.assign(new Error(code), { jsonCode: code, offset: at });
  }

  ws() {
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') this.i++;
      else break;
    }
  }

  peek(): string | undefined {
    return this.s[this.i];
  }

  value(depth: number) {
    this.ws();
    const c = this.peek();
    if (c === undefined) this.fail('unexpected-end');
    if ((c === '{' || c === '[') && depth >= MAX_JSON_DEPTH) this.fail('too-deep');
    if (c === '{') return this.object(depth + 1);
    if (c === '[') return this.array(depth + 1);
    if (c === '"') return this.string();
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    for (const word of ['true', 'false', 'null']) {
      if (this.s.startsWith(word, this.i)) {
        this.i += word.length;
        return;
      }
    }
    this.fail('unexpected-character');
  }

  object(depth: number) {
    this.i++;
    this.ws();
    if (this.peek() === '}') {
      this.i++;
      return;
    }
    for (;;) {
      this.ws();
      if (this.peek() === undefined) this.fail('unexpected-end');
      if (this.peek() !== '"') this.fail('expected-key');
      this.string();
      this.ws();
      if (this.peek() === undefined) this.fail('unexpected-end');
      if (this.peek() !== ':') this.fail('expected-colon');
      this.i++;
      this.value(depth);
      this.ws();
      const c = this.peek();
      if (c === ',') {
        this.i++;
        continue;
      }
      if (c === '}') {
        this.i++;
        return;
      }
      if (c === undefined) this.fail('unexpected-end');
      this.fail('expected-comma');
    }
  }

  array(depth: number) {
    this.i++;
    this.ws();
    if (this.peek() === ']') {
      this.i++;
      return;
    }
    for (;;) {
      this.value(depth);
      this.ws();
      const c = this.peek();
      if (c === ',') {
        this.i++;
        continue;
      }
      if (c === ']') {
        this.i++;
        return;
      }
      if (c === undefined) this.fail('unexpected-end');
      this.fail('expected-comma');
    }
  }

  string() {
    this.i++;
    for (;;) {
      const c = this.peek();
      if (c === undefined) this.fail('unexpected-end');
      if (c === '"') {
        this.i++;
        return;
      }
      if (c < ' ') this.fail('control-character');
      if (c === '\\') {
        const e = this.s[this.i + 1];
        if (e === undefined) this.fail('unexpected-end', this.i + 1);
        if ('"\\/bfnrt'.includes(e)) this.i += 2;
        else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(this.s.slice(this.i + 2, this.i + 6))) this.i += 6;
        else this.fail('bad-escape');
        continue;
      }
      this.i++;
    }
  }

  number() {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.i, this.i + 400));
    if (!m) this.fail('bad-number');
    const next = this.s[this.i + m[0].length];
    if (next !== undefined && /[0-9.eE+-]/.test(next)) this.fail('bad-number');
    this.i += m[0].length;
  }
}

function position(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** `null` when `text` is valid JSON, else its first error. */
export function validateJson(text: string): JsonError | null {
  if (text.trim() === '') return { code: 'empty', offset: 0, line: 1, column: 1 };
  const scanner = new Scanner(text);
  try {
    scanner.value(0);
    scanner.ws();
    if (scanner.i < text.length) scanner.fail('trailing-content');
    return null;
  } catch (err) {
    const { jsonCode, offset } = err as { jsonCode?: JsonErrorCode; offset?: number };
    if (!jsonCode || offset === undefined) throw err;
    const found = text[offset];
    return { code: jsonCode, offset, ...position(text, offset), ...(found === undefined ? {} : { found }) };
  }
}

/** A copy with every object's keys in code-point order, recursively. Arrays keep their order. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

export type JsonIndent = '2' | '4' | 'tab' | 'minify';

export type FormatResult = { ok: true; text: string; value: unknown } | { ok: false; error: JsonError };

export function formatJson(text: string, indent: JsonIndent, sortKeys = false): FormatResult {
  const error = validateJson(text);
  if (error) return { ok: false, error };
  const parsed: unknown = JSON.parse(text);
  const value = sortKeys ? sortKeysDeep(parsed) : parsed;
  const space = indent === 'minify' ? undefined : indent === 'tab' ? '\t' : Number(indent);
  return { ok: true, text: JSON.stringify(value, null, space), value };
}

export interface JsonStats {
  objects: number;
  arrays: number;
  keys: number;
  strings: number;
  numbers: number;
  booleans: number;
  nulls: number;
  /** Nesting depth: a scalar is 0, `[]` is 1. */
  depth: number;
}

export function jsonStats(value: unknown): JsonStats {
  const s: JsonStats = { objects: 0, arrays: 0, keys: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, depth: 0 };
  // Iterative walk, so a very deep document cannot overflow the stack.
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length) {
    const [v, d] = stack.pop() as [unknown, number];
    if (Array.isArray(v)) {
      s.arrays++;
      s.depth = Math.max(s.depth, d + 1);
      for (const item of v) stack.push([item, d + 1]);
    } else if (v === null) s.nulls++;
    else if (typeof v === 'object') {
      s.objects++;
      s.depth = Math.max(s.depth, d + 1);
      for (const [, item] of Object.entries(v)) {
        s.keys++;
        stack.push([item, d + 1]);
      }
    } else if (typeof v === 'string') s.strings++;
    else if (typeof v === 'number') s.numbers++;
    else if (typeof v === 'boolean') s.booleans++;
  }
  return s;
}
