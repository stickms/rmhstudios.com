/**
 * The mailbox codec the browser runs: the same framing and checks as
 * `bridge-protocol.ts` (`parseLuaBatch`, `parseBridgeMessage`, `encodeJsLine`,
 * `utf8Length`), without zod.
 *
 * Why: zod v4 classic cannot be tree-shaken (every schema carries its JSON
 * Schema and locale machinery), so importing `bridge-protocol.ts` put ~80 KB
 * gzip into the lazy MP chunk against a 70 KB budget (PLAN §6.4). The zod
 * schemas stay the single source: `scripts/balatro/gen-lua-protocol.ts` lowers
 * them through `z.toJSONSchema` into descriptor tables, once for Lua
 * (`rmh_mp/protocol.lua`) and once for this file (`bridge-schema.gen.ts`), and
 * `bridge-codec.test.ts` holds the two validators to the same verdicts on the
 * contract fixtures and on mutations of them.
 *
 * Semantics follow zod's: objects reject arrays and strip unknown keys (records
 * keep theirs); a nullable field accepts `null` and, only when optional, an
 * absent value (a required key, even `unknown`, must be present); numbers are finite; string lengths are UTF-16 units; regex
 * patterns are checked; parsed objects keep the schema's key order. Not covered: `.refine()`/`.transform()` — the bridge
 * schemas have none (the generator's JSON Schema would drop them silently, so
 * the parity test is the guard).
 *
 * Nothing here may import `bridge-protocol.ts` at runtime (types only).
 */
import type {
  BatchHeader,
  J2LData,
  J2LMessage,
  J2LType,
  L2JMessage,
  LuaBatch,
  ParseResult,
} from './bridge-protocol';
import { BRIDGE_LIMITS, D, SCHEMA } from './bridge-schema.gen';

export { BRIDGE_LIMITS, BRIDGE_PATHS } from './bridge-schema.gen';

/** One generated descriptor; sub-descriptors are indices into `D`. */
export type SchemaDesc =
  | { T: 'any' | 'null' | 'boolean'; n?: true }
  | { T: 'string'; min?: number; max?: number; pat?: string; n?: true }
  | { T: 'number' | 'integer'; min?: number; max?: number; xmin?: number; xmax?: number; n?: true }
  | { T: 'const'; v: string | number | boolean; n?: true }
  | { T: 'enum'; v: (string | number)[]; n?: true }
  | { T: 'array'; i: number; min?: number; max?: number; n?: true }
  | { T: 'tuple'; i: number[]; n?: true }
  | {
      T: 'object';
      p: Record<string, number>;
      r: string[];
      ap?: number | false;
      pn?: number;
      n?: true;
    }
  | { T: 'any_of'; o: number[]; n?: true }
  | { T: 'union'; key: string; m: Record<string, number>; n?: true };

class Invalid extends Error {}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const regexCache = new Map<string, RegExp>();
function regex(src: string): RegExp {
  let re = regexCache.get(src);
  if (!re) regexCache.set(src, (re = new RegExp(src)));
  return re;
}

function fail(path: string, msg: string): never {
  throw new Invalid(`${path}: ${msg}`);
}

/** Validates `v` against `D[i]`; returns the parsed value (unknown object keys stripped). */
function parseAt(i: number, v: unknown, path: string): unknown {
  const d = D[i];
  if (d.T === 'any') return v;
  if (v === null) return d.T === 'null' || d.n ? null : fail(path, `expected ${d.T}, got null`);
  // `undefined` reaches here only for a present-but-undefined value or a top-level call.
  if (v === undefined) return fail(path, 'required');
  switch (d.T) {
    case 'null':
      return fail(path, 'expected null');
    case 'boolean':
      return typeof v === 'boolean' ? v : fail(path, 'expected boolean');
    case 'string':
      if (typeof v !== 'string') return fail(path, 'expected string');
      if (d.min !== undefined && v.length < d.min) fail(path, `shorter than ${d.min}`);
      if (d.max !== undefined && v.length > d.max) fail(path, `longer than ${d.max}`);
      if (d.pat !== undefined && !regex(d.pat).test(v)) fail(path, 'does not match its pattern');
      return v;
    case 'number':
    case 'integer':
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail(path, 'expected a finite number');
      if (d.T === 'integer' && !Number.isInteger(v)) fail(path, 'expected integer');
      if (d.min !== undefined && v < d.min) fail(path, `below minimum ${d.min}`);
      if (d.max !== undefined && v > d.max) fail(path, `above maximum ${d.max}`);
      if (d.xmin !== undefined && v <= d.xmin) fail(path, `not above ${d.xmin}`);
      if (d.xmax !== undefined && v >= d.xmax) fail(path, `not below ${d.xmax}`);
      return v;
    case 'const':
      return v === d.v ? v : fail(path, `expected ${String(d.v)}`);
    case 'enum':
      return (d.v as unknown[]).includes(v) ? v : fail(path, 'not one of the allowed values');
    case 'array': {
      if (!Array.isArray(v)) return fail(path, 'expected array');
      if (d.min !== undefined && v.length < d.min) fail(path, `fewer than ${d.min} items`);
      if (d.max !== undefined && v.length > d.max) fail(path, `more than ${d.max} items`);
      return v.map((x, j) => parseAt(d.i, x, `${path}[${j}]`));
    }
    case 'tuple':
      if (!Array.isArray(v) || v.length !== d.i.length)
        return fail(path, `expected ${d.i.length} items`);
      return d.i.map((sub, j) => parseAt(sub, v[j], `${path}[${j}]`));
    case 'object': {
      if (!isPlainObject(v)) return fail(path, 'expected object');
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(d.p)) {
        const sub = d.p[k];
        if (!own(v, k) || v[k] === undefined) {
          if (d.r.includes(k)) fail(`${path}.${k}`, 'required');
          continue;
        }
        out[k] = parseAt(sub, v[k], `${path}.${k}`);
      }
      if (d.ap !== undefined || d.pn !== undefined) {
        for (const k of Object.keys(v)) {
          if (own(d.p, k)) continue;
          if (d.ap === false) fail(`${path}.${k}`, 'unknown key');
          if (d.pn !== undefined) parseAt(d.pn, k, `${path}[key ${k}]`);
          out[k] = d.ap === undefined ? v[k] : parseAt(d.ap, v[k], `${path}.${k}`);
        }
      }
      return out;
    }
    case 'union': {
      if (!isPlainObject(v)) return fail(path, 'expected object');
      const tag = v[d.key];
      if (typeof tag !== 'string' || !own(d.m, tag))
        return fail(`${path}.${d.key}`, `unknown variant ${String(tag)}`);
      return parseAt(d.m[tag], v, path);
    }
    case 'any_of': {
      let first: unknown;
      for (const o of d.o) {
        try {
          return parseAt(o, v, path);
        } catch (e) {
          first ??= e;
        }
      }
      throw first ?? new Invalid(`${path}: no option matched`);
    }
  }
}

function check(i: number, v: unknown, path: string): { ok: true; v: unknown } | { ok: false; detail: string } {
  try {
    return { ok: true, v: parseAt(i, v, path) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, detail: e.message };
    throw e;
  }
}

/** UTF-8 byte length without TextEncoder allocation per call. */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i += 1;
    } else n += 3;
  }
  return n;
}

const isUint = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function parseLine<M>(dir: 'l2j' | 'j2l', raw: unknown): ParseResult<M> {
  if (!isPlainObject(raw) || !isUint(raw.s) || typeof raw.t !== 'string' || raw.d === undefined)
    return { ok: false, error: 'line' };
  const { s, t } = raw;
  if (t.length < 1 || t.length > 32) return { ok: false, error: 'line' };
  const schemas = SCHEMA[dir];
  if (!own(schemas, t)) return { ok: false, error: 'unknown-type', t };
  // A Lua `{}` may encode as `[]` (bridge-protocol.ts resolution 2).
  const d = Array.isArray(raw.d) && raw.d.length === 0 ? {} : raw.d;
  const r = check(schemas[t], d, t);
  if (!r.ok) return { ok: false, error: 'data', t, detail: r.detail };
  return { ok: true, msg: { s, t, d: r.v } as M };
}

/** Validate one already-decoded message in the given direction. */
export function parseBridgeMessage(dir: 'l2j', raw: unknown): ParseResult<L2JMessage>;
export function parseBridgeMessage(dir: 'j2l', raw: unknown): ParseResult<J2LMessage>;
export function parseBridgeMessage(
  dir: 'l2j' | 'j2l',
  raw: unknown,
): ParseResult<L2JMessage | J2LMessage> {
  return parseLine(dir, raw);
}

function parseHeader(raw: unknown): BatchHeader | null {
  if (!isPlainObject(raw) || raw.h !== 1 || !isUint(raw.ack) || !isUint(raw.fr)) return null;
  return { h: 1, ack: raw.ack, fr: raw.fr };
}

/** Parse a Lua→JS NDJSON batch (the content of `/rmh/net/out`). Never throws. */
export function parseLuaBatch(text: string): LuaBatch {
  const out: LuaBatch = { header: null, messages: [], dropped: [] };
  if (utf8Length(text) > BRIDGE_LIMITS.BATCH_MAX_BYTES) {
    out.dropped.push({ line: 0, error: 'too-large' });
    return out;
  }
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  lines.forEach((src, i) => {
    if (src.trim() === '') return;
    if (utf8Length(src) > BRIDGE_LIMITS.LINE_MAX_BYTES) {
      out.dropped.push({ line: i, error: 'too-large' });
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(src);
    } catch {
      out.dropped.push({ line: i, error: 'json' });
      return;
    }
    if (i === first) {
      const h = parseHeader(raw);
      if (h) {
        out.header = h;
        return;
      }
    }
    const r = parseBridgeMessage('l2j', raw);
    if (r.ok) out.messages.push(r.msg);
    else out.dropped.push({ line: i, error: r.error, t: r.t, detail: r.detail });
  });
  return out;
}

/** One JS→Lua line (no trailing newline). Validates `d`; throws on a programming error. */
export function encodeJsLine<T extends J2LType>(s: number, t: T, d: J2LData<T>): string {
  if (!own(SCHEMA.j2l, t)) throw new Error(`unknown bridge type ${t}`);
  const r = check(SCHEMA.j2l[t], d, t);
  if (!r.ok) throw new Error(`invalid ${t}: ${r.detail}`);
  const line = JSON.stringify({ s, t, d: r.v });
  if (utf8Length(line) > BRIDGE_LIMITS.LINE_MAX_BYTES) {
    throw new Error(`bridge line for ${t} exceeds ${BRIDGE_LIMITS.LINE_MAX_BYTES} bytes`);
  }
  return line;
}
