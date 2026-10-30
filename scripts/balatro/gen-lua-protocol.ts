/**
 * Generates `lib/balatro/lua/mp/rmh_mp/protocol.lua` from the zod schemas in
 * `lib/balatro/mp/bridge-protocol.ts` (PLAN §3.c, WS0).
 *
 *     pnpm balatro:gen-protocol            # rewrite protocol.lua
 *     pnpm balatro:gen-protocol --check    # exit 1 if it is stale
 *
 * How: every message schema goes through `z.toJSONSchema` (zod's public,
 * stable conversion), and the JSON Schema is lowered into small Lua
 * descriptor tables that a hand-written validator in the same file walks.
 * Identical sub-descriptors are emitted once (`D[n]`) so LobbyState and
 * StartedMatch are not repeated per message type.
 *
 * What the Lua side checks: types, required fields, enums/literals,
 * discriminated unions, integer-ness, numeric ranges, string lengths (in
 * code points), array lengths, record values and keys. What it does not:
 * regex `pattern`s (Lua 5.1 patterns are not regexes) and `.refine()`s
 * (zod drops them from JSON Schema). TS validates both on its side.
 * A nullable field may also be absent in Lua (a Lua table cannot hold nil).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  BRIDGE_LIMITS,
  BRIDGE_PATHS,
  J2L,
  J2L_ENTRY,
  L2J,
  L2J_ENTRY,
} from '../../lib/balatro/mp/bridge-protocol';
import { MP_PROTOCOL_VERSION } from '../../lib/balatro/net/limits';
import { zQueueMode } from '../../lib/balatro/net/events';
import {
  LOBBY_OPTION_KEYS,
  zGameEvent,
  zRefMsg,
  zReplayOp,
  zTeam,
} from '../../lib/balatro/mp/types';
import { PEER_KINDS, WIRE_KINDS } from '../../lib/balatro/mp/wire';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROTOCOL_LUA_PATH = join(ROOT, 'lib/balatro/lua/mp/rmh_mp/protocol.lua');
/**
 * The same descriptors for the browser: `lib/balatro/mp/bridge-codec.ts` walks them
 * so the lazy MP chunk validates the mailbox without bundling zod (~80 KB gzip of
 * zod v4 classic). bridge-protocol.ts stays the source; this file is derived.
 */
export const PROTOCOL_TS_PATH = join(ROOT, 'lib/balatro/mp/bridge-schema.gen.ts');

/* ─── JSON Schema → Lua descriptor ───────────────────────────────────────── */

type Json = Record<string, unknown>;

/** A Lua descriptor before emission. `n` = nullable. */
type Desc =
  | { T: 'any' }
  | { T: 'null' }
  | { T: 'boolean'; n?: true }
  | { T: 'string'; min?: number; max?: number; pat?: string; n?: true }
  | { T: 'number' | 'integer'; min?: number; max?: number; xmin?: number; xmax?: number; n?: true }
  | { T: 'const'; v: string | number | boolean; n?: true }
  | { T: 'enum'; v: (string | number)[]; n?: true }
  | { T: 'array'; i: Desc; min?: number; max?: number; n?: true }
  | { T: 'tuple'; i: Desc[]; n?: true }
  | {
      T: 'object';
      p: [string, Desc][];
      r: string[];
      ap?: Desc | false;
      pn?: Desc;
      n?: true;
      /** The schema's own key order (zod's output order); `p` is sorted for Lua. */
      ord?: string[];
    }
  | { T: 'any_of'; o: Desc[]; n?: true }
  | { T: 'union'; key: string; m: [string, Desc][]; n?: true };

function lower(s: unknown): Desc {
  if (s === true || s === undefined) return { T: 'any' };
  if (s === false) throw new Error('`false` schema is not supported');
  const js = s as Json;
  const alts = (js.anyOf ?? js.oneOf) as unknown[] | undefined;
  if (alts) {
    const nonNull = alts.filter((a) => (a as Json).type !== 'null');
    const nullable = nonNull.length !== alts.length;
    let d: Desc;
    if (nonNull.length === 1) d = lower(nonNull[0]);
    else d = unionOf(nonNull.map(lower));
    if (nullable) {
      if (d.T === 'any' || d.T === 'null') return d;
      return { ...d, n: true } as Desc;
    }
    return d;
  }
  if ('const' in js) {
    const v = js.const;
    if (v === null) return { T: 'null' };
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      return { T: 'const', v };
    throw new Error(`unsupported const ${JSON.stringify(v)}`);
  }
  if (Array.isArray(js.enum)) {
    const vals = js.enum as unknown[];
    if (
      vals.length === 1 &&
      (typeof vals[0] === 'string' || typeof vals[0] === 'number' || typeof vals[0] === 'boolean')
    ) {
      return { T: 'const', v: vals[0] as string | number | boolean };
    }
    return {
      T: 'enum',
      v: vals.filter((x): x is string | number => typeof x === 'string' || typeof x === 'number'),
    };
  }
  const type = js.type;
  if (Array.isArray(type)) {
    return lower({ anyOf: type.map((t) => ({ ...js, type: t })) });
  }
  switch (type) {
    case 'null':
      return { T: 'null' };
    case 'boolean':
      return { T: 'boolean' };
    case 'string':
      return clean({
        T: 'string',
        min: num(js.minLength),
        max: num(js.maxLength),
        pat: typeof js.pattern === 'string' ? js.pattern : undefined,
      });
    case 'number':
    case 'integer':
      return clean({
        T: type,
        min: num(js.minimum),
        max: num(js.maximum),
        xmin: num(js.exclusiveMinimum),
        xmax: num(js.exclusiveMaximum),
      });
    case 'array': {
      if (Array.isArray(js.prefixItems))
        return { T: 'tuple', i: (js.prefixItems as unknown[]).map(lower) };
      return clean({
        T: 'array',
        i: lower(js.items),
        min: num(js.minItems),
        max: num(js.maxItems),
      });
    }
    case 'object': {
      const props = (js.properties ?? {}) as Record<string, unknown>;
      const p = Object.keys(props)
        .sort()
        .map((k) => [k, lower(props[k])] as [string, Desc]);
      const r = ((js.required ?? []) as string[]).slice().sort();
      const desc: Desc = { T: 'object', p, r, ord: Object.keys(props) };
      if (js.additionalProperties === false) desc.ap = false;
      else if (js.additionalProperties !== undefined && js.additionalProperties !== true) {
        desc.ap = lower(js.additionalProperties);
      }
      if (js.propertyNames !== undefined) desc.pn = lower(js.propertyNames);
      return desc;
    }
    case undefined:
      return { T: 'any' };
    default:
      throw new Error(`unsupported JSON Schema type ${String(type)}`);
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < Number.MAX_SAFE_INTEGER
    ? v
    : undefined;
}

function clean<D extends Desc>(d: D): D {
  for (const key of Object.keys(d) as (keyof D)[]) if (d[key] === undefined) delete d[key];
  return d;
}

/** A union of objects that all carry a distinct string const on one key becomes a keyed lookup. */
function unionOf(options: Desc[]): Desc {
  if (options.every((o) => o.T === 'object')) {
    const objs = options as Extract<Desc, { T: 'object' }>[];
    for (const [key] of objs[0].p) {
      const values = objs.map((o) => {
        const prop = o.p.find(([k]) => k === key)?.[1];
        return prop && prop.T === 'const' && typeof prop.v === 'string' && o.r.includes(key)
          ? prop.v
          : null;
      });
      if (values.every((v) => v !== null) && new Set(values).size === values.length) {
        return {
          T: 'union',
          key,
          m: objs.map((o, i) => [values[i] as string, o] as [string, Desc]),
        };
      }
    }
  }
  return { T: 'any_of', o: options };
}

/* ─── Lua emission ───────────────────────────────────────────────────────── */

function luaStr(s: string): string {
  return JSON.stringify(s); // JSON string escapes are valid Lua 5.1 escapes for ASCII + \uXXXX-free text
}

function luaNum(n: number): string {
  return String(n);
}

function luaKey(k: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !LUA_RESERVED.has(k) ? k : `[${luaStr(k)}]`;
}

const LUA_RESERVED = new Set([
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
]);

class Emitter {
  private readonly index = new Map<string, number>();
  readonly defs: string[] = [];

  ref(d: Desc): string {
    const src = this.source(d);
    let i = this.index.get(src);
    if (i === undefined) {
      this.defs.push(src);
      i = this.defs.length;
      this.index.set(src, i);
    }
    return `D[${i}]`;
  }

  private source(d: Desc): string {
    const parts: string[] = [`T=${luaStr(d.T)}`];
    const n = 'n' in d && d.n ? ', n=true' : '';
    switch (d.T) {
      case 'any':
      case 'null':
      case 'boolean':
        break;
      case 'string':
      case 'number':
      case 'integer':
        for (const key of ['min', 'max', 'xmin', 'xmax'] as const) {
          const v = (d as Record<string, unknown>)[key];
          if (typeof v === 'number') parts.push(`${key}=${luaNum(v)}`);
        }
        break;
      case 'const':
        parts.push(`v=${typeof d.v === 'string' ? luaStr(d.v) : String(d.v)}`);
        break;
      case 'enum':
        parts.push(
          `v={${d.v.map((v) => (typeof v === 'string' ? luaStr(v) : luaNum(v))).join(',')}}`,
        );
        break;
      case 'array':
        parts.push(`i=${this.ref(d.i)}`);
        if (d.min !== undefined) parts.push(`min=${d.min}`);
        if (d.max !== undefined) parts.push(`max=${d.max}`);
        break;
      case 'tuple':
        parts.push(`i={${d.i.map((x) => this.ref(x)).join(',')}}`);
        break;
      case 'object':
        parts.push(`p={${d.p.map(([k, v]) => `${luaKey(k)}=${this.ref(v)}`).join(',')}}`);
        parts.push(`r={${d.r.map(luaStr).join(',')}}`);
        if (d.ap === false) parts.push('ap=false');
        else if (d.ap) parts.push(`ap=${this.ref(d.ap)}`);
        if (d.pn) parts.push(`pn=${this.ref(d.pn)}`);
        break;
      case 'any_of':
        parts.push(`o={${d.o.map((x) => this.ref(x)).join(',')}}`);
        break;
      case 'union':
        parts.push(`key=${luaStr(d.key)}`);
        parts.push(`m={${d.m.map(([k, v]) => `${luaKey(k)}=${this.ref(v)}`).join(',')}}`);
        break;
    }
    return `{${parts.join(', ')}${n}}`;
  }
}

function descOf(schema: z.ZodType): Desc {
  return lower(
    z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any', target: 'draft-2020-12' }),
  );
}

function luaList(values: readonly string[]): string {
  return `{ ${values.map(luaStr).join(', ')} }`;
}

function luaNameTable(values: readonly string[]): string {
  return `{\n${values.map((v) => `  ${luaKey(v)} = ${luaStr(v)},`).join('\n')}\n}`;
}

function discriminants(schema: z.ZodType, key: string): string[] {
  const d = descOf(schema);
  if (d.T !== 'union' || d.key !== key) throw new Error(`expected a union on ${key}`);
  return d.m.map(([k]) => k);
}

/** The whole protocol.lua source. Deterministic. */
export function generateProtocolLua(): string {
  const em = new Emitter();
  const l2jTypes = Object.keys(L2J).sort();
  const j2lTypes = Object.keys(J2L).sort();
  const l2jRefs = l2jTypes.map((t) => [t, em.ref(descOf(L2J[t as keyof typeof L2J]))] as const);
  const j2lRefs = j2lTypes.map((t) => [t, em.ref(descOf(J2L[t as keyof typeof J2L]))] as const);

  const enums: [string, readonly string[]][] = [
    ['queueMode', zQueueMode.options],
    ['team', zTeam.options],
    ['lobbyOptionKey', LOBBY_OPTION_KEYS],
    ['gameEvent', discriminants(zGameEvent, 't')],
    ['refMsg', discriminants(zRefMsg, 't')],
    ['peerKind', PEER_KINDS],
    ['wireKind', WIRE_KINDS],
    ['replayOp', zReplayOp.options],
  ];

  const out: string[] = [];
  out.push(
    '-- GENERATED FILE — do not edit by hand.',
    '-- Source: lib/balatro/mp/bridge-protocol.ts (PLAN §3.c), via scripts/balatro/gen-lua-protocol.ts.',
    '-- Regenerate with `pnpm balatro:gen-protocol`; lib/balatro/mp/__tests__/protocol-lua.test.ts fails when stale.',
    '--',
    '-- Usage:',
    "--   local P = require 'rmh_mp.protocol'",
    "--   local ok, err = P.validate('j2l', msg.t, msg.d)   -- inbound from JS",
    "--   local ok, err = P.validate('l2j', t, d)           -- self-check before sending (tests)",
    '--   P.L2J.ui_ready, P.J2L.lobby_view, P.ENUM.queueMode, P.PATHS.IN, P.LIMITS.LINE_MAX_BYTES',
    '--',
    '-- JSON null: a decoder may map it to nil or to a sentinel. P.NULL is one; a decoder with its',
    '-- own sentinel registers it with P.set_null(sentinel). A nullable field may also be absent.',
    '-- Not checked here (TS checks them): regex patterns and zod refinements.',
    '',
    'local P = {}',
    '',
    `P.VERSION = ${MP_PROTOCOL_VERSION}`,
    '',
    `P.ENTRY_L2J = ${luaList(Object.keys(L2J_ENTRY).sort())}`,
    `P.ENTRY_J2L = ${luaList(Object.keys(J2L_ENTRY).sort())}`,
    '',
    `P.L2J = ${luaNameTable(l2jTypes)}`,
    '',
    `P.J2L = ${luaNameTable(j2lTypes)}`,
    '',
    'P.ENUM = {',
    ...enums.map(([name, values]) => `  ${name} = ${luaList(values)},`),
    '}',
    '',
    'P.PATHS = {',
    ...Object.entries(BRIDGE_PATHS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `  ${k} = ${luaStr(v)},`),
    '}',
    '',
    'P.LIMITS = {',
    ...Object.entries(BRIDGE_LIMITS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `  ${k} = ${v},`),
    '}',
    '',
    '-- Shared descriptors (T = kind; n = nullable; p/r = properties/required; ap = additional',
    '-- properties (record values) or false; pn = property-name schema; i = items; o = options;',
    '-- key/m = discriminated union).',
    'local D = {}',
    ...em.defs.map((src, i) => `D[${i + 1}] = ${src}`),
    '',
    'P.SCHEMA = {',
    '  l2j = {',
    ...l2jRefs.map(([t, ref]) => `    ${luaKey(t)} = ${ref},`),
    '  },',
    '  j2l = {',
    ...j2lRefs.map(([t, ref]) => `    ${luaKey(t)} = ${ref},`),
    '  },',
    '}',
    '',
    VALIDATOR_LUA,
  );
  return out.join('\n');
}

/* ─── TypeScript emission (the browser's copy of the descriptors) ────────── */

/** JSON form of a descriptor for `bridge-codec.ts`: sub-descriptors are indices into `D`. */
class JsEmitter {
  private readonly index = new Map<string, number>();
  readonly defs: string[] = [];

  ref(d: Desc): number {
    const src = JSON.stringify(this.json(d));
    let i = this.index.get(src);
    if (i === undefined) {
      i = this.defs.length;
      this.defs.push(src);
      this.index.set(src, i);
    }
    return i;
  }

  private json(d: Desc): Record<string, unknown> {
    const o: Record<string, unknown> = { T: d.T };
    switch (d.T) {
      case 'any':
      case 'null':
      case 'boolean':
        break;
      case 'string':
      case 'number':
      case 'integer':
        for (const key of ['min', 'max', 'xmin', 'xmax', 'pat'] as const) {
          const v = (d as Record<string, unknown>)[key];
          if (v !== undefined) o[key] = v;
        }
        break;
      case 'const':
      case 'enum':
        o.v = d.v;
        break;
      case 'array':
        o.i = this.ref(d.i);
        if (d.min !== undefined) o.min = d.min;
        if (d.max !== undefined) o.max = d.max;
        break;
      case 'tuple':
        o.i = d.i.map((x) => this.ref(x));
        break;
      case 'object':
        o.p = Object.fromEntries(
          (d.ord ?? d.p.map(([k]) => k)).map((k) => [k, this.ref(d.p.find(([pk]) => pk === k)![1])]),
        );
        o.r = d.r;
        if (d.ap === false) o.ap = false;
        else if (d.ap) o.ap = this.ref(d.ap);
        if (d.pn) o.pn = this.ref(d.pn);
        break;
      case 'any_of':
        o.o = d.o.map((x) => this.ref(x));
        break;
      case 'union':
        o.key = d.key;
        o.m = Object.fromEntries(d.m.map(([k, v]) => [k, this.ref(v)]));
        break;
    }
    if ('n' in d && d.n) o.n = true;
    return o;
  }
}

/** The whole bridge-schema.gen.ts source. Deterministic. */
export function generateProtocolTs(): string {
  const em = new JsEmitter();
  const table = (schemas: Record<string, z.ZodType>) =>
    Object.keys(schemas)
      .sort()
      .map((t) => `    ${JSON.stringify(t)}: ${em.ref(descOf(schemas[t]))},`);
  const l2j = table(L2J);
  const j2l = table(J2L);
  const constBlock = (name: string, doc: string, values: Record<string, string | number>) => [
    `/** ${doc} */`,
    `export const ${name} = {`,
    ...Object.entries(values).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`),
    '} as const;',
  ];
  return [
    '// GENERATED FILE — do not edit by hand.',
    '// Source: lib/balatro/mp/bridge-protocol.ts (PLAN §3.c), via scripts/balatro/gen-lua-protocol.ts,',
    '// which writes the same descriptors to rmh_mp/protocol.lua. Regenerate with',
    '// `pnpm balatro:gen-protocol`; lib/balatro/mp/__tests__/protocol-lua.test.ts fails when stale.',
    '// Walked by bridge-codec.ts, the zod-free validator the lazy MP chunk uses. Unlike Lua it',
    '// also checks regex patterns (`pat`).',
    '',
    "import type { SchemaDesc } from './bridge-codec';",
    '',
    ...constBlock('BRIDGE_PATHS', 'Same values as bridge-protocol.ts BRIDGE_PATHS.', BRIDGE_PATHS),
    '',
    ...constBlock('BRIDGE_LIMITS', 'Same values as bridge-protocol.ts BRIDGE_LIMITS.', BRIDGE_LIMITS),
    '',
    '/** Message type → index into D, per direction. */',
    "export const SCHEMA: Readonly<Record<'l2j' | 'j2l', Readonly<Record<string, number>>>> = {",
    '  l2j: {',
    ...l2j,
    '  },',
    '  j2l: {',
    ...j2l,
    '  },',
    '};',
    '',
    '/**',
    ' * Shared descriptors. T = kind; n = nullable; p/r = properties/required; ap = record',
    ' * values or false; pn = key schema; i = items; o = options; key/m = discriminated union;',
    ' * pat = regex source. Sub-descriptors are indices into D.',
    ' */',
    'export const D: readonly SchemaDesc[] = [',
    ...em.defs.map((src) => `  ${src},`),
    '];',
    '',
  ].join('\n');
}

/** The hand-written validator appended to the generated tables. */
const VALIDATOR_LUA = String.raw`-- ── Validator ──────────────────────────────────────────────────────────────

P.NULL = setmetatable({}, { __tostring = function() return 'null' end })
local null_sentinel = P.NULL

function P.set_null(sentinel)
  null_sentinel = sentinel
end

local function is_null(v)
  return v == nil or v == P.NULL or (null_sentinel ~= nil and v == null_sentinel)
end
P.is_null = is_null

local function cplen(s)
  local _, n = string.gsub(s, '[^\128-\191]', '')
  return n
end

local function is_array(t)
  local n = #t
  local count = 0
  for k in pairs(t) do
    if type(k) ~= 'number' or k < 1 or k > n or math.floor(k) ~= k then return false end
    count = count + 1
  end
  return count == n
end

local function describe(v)
  if is_null(v) then return 'null' end
  return type(v)
end

local check

local function fail(path, msg)
  return false, path .. ': ' .. msg
end

local function check_number(d, v, path)
  if type(v) ~= 'number' then return fail(path, 'expected number, got ' .. describe(v)) end
  if v ~= v or v == math.huge or v == -math.huge then return fail(path, 'not a finite number') end
  if d.T == 'integer' and math.floor(v) ~= v then return fail(path, 'expected integer') end
  if d.min and v < d.min then return fail(path, 'below minimum ' .. d.min) end
  if d.max and v > d.max then return fail(path, 'above maximum ' .. d.max) end
  if d.xmin and v <= d.xmin then return fail(path, 'not above ' .. d.xmin) end
  if d.xmax and v >= d.xmax then return fail(path, 'not below ' .. d.xmax) end
  return true
end

local function check_object(d, v, path)
  if type(v) ~= 'table' then return fail(path, 'expected object, got ' .. describe(v)) end
  if v[1] ~= nil then return fail(path, 'expected object, got array') end
  for _, k in ipairs(d.r) do
    local sub = d.p[k]
    if v[k] == nil and sub and not (sub.n or sub.T == 'any' or sub.T == 'null') then
      return fail(path .. '.' .. k, 'required')
    end
  end
  for k, sub in pairs(d.p) do
    local fv = v[k]
    if fv ~= nil then
      local ok, err = check(sub, fv, path .. '.' .. k)
      if not ok then return false, err end
    end
  end
  if d.ap ~= nil or d.pn ~= nil then
    for k, fv in pairs(v) do
      if d.p[k] == nil then
        if type(k) ~= 'string' then return fail(path, 'non-string key') end
        if d.ap == false then return fail(path .. '.' .. k, 'unknown key') end
        if d.pn then
          local ok, err = check(d.pn, k, path .. '[key ' .. k .. ']')
          if not ok then return false, err end
        end
        if d.ap then
          local ok, err = check(d.ap, fv, path .. '.' .. k)
          if not ok then return false, err end
        end
      end
    end
  end
  return true
end

check = function(d, v, path)
  local T = d.T
  if T == 'any' then return true end
  if is_null(v) then
    if T == 'null' or d.n then return true end
    return fail(path, 'expected ' .. T .. ', got null')
  end
  if T == 'null' then return fail(path, 'expected null, got ' .. describe(v)) end
  if T == 'boolean' then
    if type(v) ~= 'boolean' then return fail(path, 'expected boolean, got ' .. describe(v)) end
    return true
  elseif T == 'string' then
    if type(v) ~= 'string' then return fail(path, 'expected string, got ' .. describe(v)) end
    if d.min or d.max then
      local n = cplen(v)
      if d.min and n < d.min then return fail(path, 'shorter than ' .. d.min) end
      if d.max and n > d.max then return fail(path, 'longer than ' .. d.max) end
    end
    return true
  elseif T == 'number' or T == 'integer' then
    return check_number(d, v, path)
  elseif T == 'const' then
    if v ~= d.v then return fail(path, 'expected ' .. tostring(d.v)) end
    return true
  elseif T == 'enum' then
    for _, e in ipairs(d.v) do
      if v == e then return true end
    end
    return fail(path, 'not one of the allowed values')
  elseif T == 'array' then
    if type(v) ~= 'table' or not is_array(v) then return fail(path, 'expected array, got ' .. describe(v)) end
    local n = #v
    if d.min and n < d.min then return fail(path, 'fewer than ' .. d.min .. ' items') end
    if d.max and n > d.max then return fail(path, 'more than ' .. d.max .. ' items') end
    for i = 1, n do
      local ok, err = check(d.i, v[i], path .. '[' .. i .. ']')
      if not ok then return false, err end
    end
    return true
  elseif T == 'tuple' then
    if type(v) ~= 'table' or not is_array(v) then return fail(path, 'expected array, got ' .. describe(v)) end
    if #v ~= #d.i then return fail(path, 'expected ' .. #d.i .. ' items') end
    for i = 1, #d.i do
      local ok, err = check(d.i[i], v[i], path .. '[' .. i .. ']')
      if not ok then return false, err end
    end
    return true
  elseif T == 'object' then
    return check_object(d, v, path)
  elseif T == 'union' then
    if type(v) ~= 'table' then return fail(path, 'expected object, got ' .. describe(v)) end
    local tag = v[d.key]
    local branch = type(tag) == 'string' and d.m[tag] or nil
    if not branch then return fail(path .. '.' .. d.key, 'unknown variant ' .. tostring(tag)) end
    return check(branch, v, path)
  elseif T == 'any_of' then
    local first
    for _, o in ipairs(d.o) do
      local ok, err = check(o, v, path)
      if ok then return true end
      first = first or err
    end
    return false, first or fail(path, 'no option matched')
  end
  return fail(path, 'unknown descriptor ' .. tostring(T))
end

P.check = check

--- Validate one message. dir = 'l2j' | 'j2l'. Returns true, or false and a reason.
function P.validate(dir, t, d)
  local schemas = P.SCHEMA[dir]
  if not schemas then return false, 'unknown direction ' .. tostring(dir) end
  if type(t) ~= 'string' then return false, 'type is not a string' end
  local schema = schemas[t]
  if not schema then return false, 'unknown type ' .. t end
  if d == nil then d = {} end
  return check(schema, d, t)
end

--- True if the type exists in that direction.
function P.known(dir, t)
  local schemas = P.SCHEMA[dir]
  return schemas ~= nil and schemas[t] ~= nil
end

return P
`;

/* ─── CLI ────────────────────────────────────────────────────────────────── */

function main(): void {
  const check = process.argv.includes('--check');
  const outputs: [string, string][] = [
    [PROTOCOL_LUA_PATH, generateProtocolLua()],
    [PROTOCOL_TS_PATH, generateProtocolTs()],
  ];
  let stale = false;
  for (const [path, next] of outputs) {
    let current: string;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = '';
    }
    if (check) {
      if (current !== next) {
        console.error(`${path} is stale — run \`pnpm balatro:gen-protocol\`.`);
        stale = true;
      }
      continue;
    }
    if (current !== next) writeFileSync(path, next);
    process.stdout.write(`wrote ${path}\n`);
  }
  if (!check) return;
  if (stale) process.exit(1);
  process.stdout.write('protocol.lua and bridge-schema.gen.ts are up to date.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
