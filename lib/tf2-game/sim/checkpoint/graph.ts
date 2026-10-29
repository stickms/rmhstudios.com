/**
 * A structural codec for an object graph: everything reachable from a root,
 * with shared references, cycles, class instances, Maps, Sets, typed arrays
 * (and the buffers they share), holes, -0 and NaN — so a simulation can be
 * written down mid-match and brought back exactly (host migration,
 * docs/tf2-game.md "Peer-to-peer play").
 *
 * What is NOT copied:
 *   - **statics** — anything the catalog names (module data, the map, the
 *     nav mesh): written as a name and looked up on restore;
 *   - **functions** — a prototype method or module function by its catalog
 *     name; a closure (an arrow field such as `subRemove = () => …`, a think
 *     context's callback) by WHERE it lives: on restore the owning object is
 *     rebuilt by its own constructor, which makes the closure afresh bound to
 *     the new object, and every other place that held it gets that one. A
 *     closure is matched to its home by its source text, so a field the
 *     constructor filled with a different function is never mistaken for it.
 *
 * Restoring MERGES into a template (the fresh world a successor built from the
 * same map): an object found at the same place in the template, of the same
 * class, is adopted — its fields overwritten, its constructor's closures kept —
 * and anything else is constructed (with stand-in arguments, so a constructor
 * cannot touch the world being restored) and then overwritten. Fields the
 * template has that the checkpoint does not are deleted.
 *
 * Format (JSON-able): `{ v, classes, shapes, objs, closures, root }` where an
 * object entry is `[kind, …]` and a value is a JSON primitive or a tagged
 * array (`['r', id]` reference, `['u']` undefined, `['h']` hole, `['n', 'NaN'|'+I'|'-I'|'-0']`,
 * `['s', name]` static, `['f', name]` catalog function, `['c', i]` closure).
 *
 * Environment-agnostic.
 */

import { fnv, type GraphCatalog } from './catalog';

export const GRAPH_FORMAT = 1;

const K_OBJECT = 0;
const K_ARRAY = 1;
const K_MAP = 2;
const K_SET = 3;
const K_VIEW = 4;
const K_WEAK = 5;
const K_BUFFER = 6;

type Value = number | string | boolean | null | Tagged;
type Tagged = ['r', number] | ['u'] | ['h'] | ['n', string] | ['s', string] | ['f', string] | ['c', number] | ['t'];
type Entry =
  | [typeof K_OBJECT, number, ...Value[]]
  | [typeof K_ARRAY, ...Value[]]
  | [typeof K_MAP, ...Value[]]
  | [typeof K_SET, ...Value[]]
  | [typeof K_VIEW, string, number, number, number]
  | [typeof K_WEAK, number]
  | [typeof K_BUFFER, string];

export interface EncodedGraph {
  v: number;
  /** Class keys by index. */
  classes: string[];
  /** [classIndex, ...keys] per object shape. */
  shapes: Array<[number, ...string[]]>;
  objs: Entry[];
  /** Per closure: [sourceHash, locations as [objectId, key] pairs flattened]. */
  closures: Array<[number, ...Array<number | string>]>;
  root: Value;
}

export interface EncodeOptions {
  /** Objects of these classes are written as "keep the template's" (`['t']`): caches, generators. */
  transient?: (obj: object) => boolean;
}

export class GraphEncodeError extends Error {}

const VIEW_TYPES: Record<string, new (buffer: ArrayBuffer, byteOffset: number, length: number) => ArrayBufferView> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array: BigInt64Array as unknown as new (b: ArrayBuffer, o: number, l: number) => ArrayBufferView,
  BigUint64Array: BigUint64Array as unknown as new (b: ArrayBuffer, o: number, l: number) => ArrayBufferView,
  DataView: DataView as unknown as new (b: ArrayBuffer, o: number, l: number) => ArrayBufferView,
};

function viewType(v: ArrayBufferView): string {
  for (const [name, ctor] of Object.entries(VIEW_TYPES)) if (v instanceof ctor) return name;
  throw new GraphEncodeError('unsupported view');
}

function viewLength(v: ArrayBufferView): number {
  return v instanceof DataView ? v.byteLength : (v as unknown as { length: number }).length;
}

const sourceHashes = new WeakMap<object, number>();
function sourceHash(fn: unknown): number {
  const f = fn as object;
  let h = sourceHashes.get(f);
  if (h === undefined) {
    let src: string;
    try {
      src = Function.prototype.toString.call(fn);
    } catch {
      src = '?';
    }
    h = fnv(src);
    sourceHashes.set(f, h);
  }
  return h;
}

// ─── Base64 (no Buffer / btoa dependence: workers, Node and tests alike) ─────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const parts: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    if (out.length > 8192) {
      parts.push(out);
      out = '';
    }
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((i + 1 < bytes.length ? bytes[i + 1] : 0) << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + '=';
  }
  parts.push(out);
  return parts.join('');
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_INV[clean.charCodeAt(i)];
    const b = B64_INV[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_INV[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? B64_INV[clean.charCodeAt(i + 3)] : 0;
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new GraphEncodeError('bad base64');
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ─── Encoding ────────────────────────────────────────────────────────────────

export function encodeGraph(root: unknown, catalog: GraphCatalog, opts: EncodeOptions = {}): EncodedGraph {
  const ids = new Map<object, number>();
  const queue: object[] = [];
  const classes: string[] = [];
  const classIdx = new Map<string, number>();
  const shapes: EncodedGraph['shapes'] = [];
  const shapeIdx = new Map<string, number>();
  const objs: Entry[] = [];
  const closureIdx = new Map<unknown, number>();
  const closures: EncodedGraph['closures'] = [];

  const classOf = (proto: object | null, what: object): number => {
    let key: string | undefined;
    if (proto === Object.prototype) key = 'Object';
    else if (proto === null) key = 'null';
    else key = catalog.classKey(proto);
    if (key === undefined) {
      const name = (proto as { constructor?: { name?: string } }).constructor?.name ?? '?';
      throw new GraphEncodeError(`class not in the catalog: ${name} (${Object.keys(what).slice(0, 6).join(', ')})`);
    }
    let i = classIdx.get(key);
    if (i === undefined) {
      i = classes.length;
      classes.push(key);
      classIdx.set(key, i);
    }
    return i;
  };

  const ref = (o: object): Value => {
    const s = catalog.staticKey(o);
    if (s !== undefined) return ['s', s];
    if (opts.transient?.(o)) return ['t'];
    let id = ids.get(o);
    if (id === undefined) {
      id = queue.length;
      ids.set(o, id);
      queue.push(o);
    }
    return ['r', id];
  };

  /** A function at (holder id, key). */
  const fnValue = (fn: unknown, holder: number, key: string | number): Value => {
    const k = catalog.fnKey(fn);
    if (k !== undefined) return ['f', k];
    let i = closureIdx.get(fn);
    if (i === undefined) {
      i = closures.length;
      closureIdx.set(fn, i);
      closures.push([sourceHash(fn)]);
    }
    closures[i].push(holder, key);
    return ['c', i];
  };

  const value = (v: unknown, holder: number, key: string | number): Value => {
    switch (typeof v) {
      case 'number':
        if (Number.isNaN(v)) return ['n', 'NaN'];
        if (v === Infinity) return ['n', '+I'];
        if (v === -Infinity) return ['n', '-I'];
        if (v === 0 && 1 / v < 0) return ['n', '-0'];
        return v;
      case 'string':
      case 'boolean':
        return v;
      case 'undefined':
        return ['u'];
      case 'function':
        return fnValue(v, holder, key);
      case 'bigint':
        throw new GraphEncodeError('bigint value');
      case 'symbol':
        throw new GraphEncodeError('symbol value');
      default:
        return v === null ? null : ref(v as object);
    }
  };

  const rootValue = value(root, -1, '');
  for (let id = 0; id < queue.length; id++) {
    const o = queue[id];
    if (o instanceof ArrayBuffer) {
      objs.push([K_BUFFER, bytesToBase64(new Uint8Array(o))]);
    } else if (ArrayBuffer.isView(o)) {
      const buf = ref(o.buffer as ArrayBuffer) as ['r', number];
      objs.push([K_VIEW, viewType(o), buf[1], o.byteOffset, viewLength(o)]);
    } else if (Array.isArray(o)) {
      const e: Entry = [K_ARRAY];
      for (let i = 0; i < o.length; i++) e.push(i in o ? value(o[i], id, i) : ['h']);
      objs.push(e);
    } else if (o instanceof Map) {
      const e: Entry = [K_MAP];
      let i = 0;
      for (const [k, v] of o) {
        e.push(value(k, id, `{k${i}`), value(v, id, `{v${i}`));
        i++;
      }
      objs.push(e);
    } else if (o instanceof Set) {
      const e: Entry = [K_SET];
      let i = 0;
      for (const v of o) e.push(value(v, id, `{s${i++}`));
      objs.push(e);
    } else if (o instanceof WeakMap || o instanceof WeakSet) {
      objs.push([K_WEAK, o instanceof WeakMap ? 0 : 1]);
    } else {
      const keys = Object.keys(o);
      const cls = classOf(Object.getPrototypeOf(o), o);
      const sk = `${cls}|${keys.join('|')}`;
      let s = shapeIdx.get(sk);
      if (s === undefined) {
        s = shapes.length;
        shapes.push([cls, ...keys]);
        shapeIdx.set(sk, s);
      }
      const e: Entry = [K_OBJECT, s];
      for (const k of keys) e.push(value((o as Record<string, unknown>)[k], id, k));
      objs.push(e);
    }
  }
  return { v: GRAPH_FORMAT, classes, shapes, objs, closures, root: rootValue };
}

// ─── Decoding ────────────────────────────────────────────────────────────────

export class GraphDecodeError extends Error {}

export interface DecodeReport {
  adopted: number;
  constructed: number;
  /** Closures with no home found (left as they were constructed). */
  unresolvedClosures: string[];
}

/**
 * The stand-in every constructor gets for its arguments (other than a
 * classname): any property is itself, calling it returns itself, it is 0 as a
 * number and empty as an iterable — a constructor runs to the end without
 * reaching anything real, and its fields are overwritten afterwards.
 */
const STANDIN: unknown = (() => {
  const target = function standIn() {};
  const p: unknown = new Proxy(target, {
    get: (_t, k) => {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* empty() {};
      if (k === 'then') return undefined;
      return p;
    },
    apply: () => p,
    construct: () => p as object,
    has: () => false,
    set: () => true,
    defineProperty: () => true,
    deleteProperty: () => true,
  });
  return p;
})();

/**
 * Restores `data` into `template` (which must be the root's shape: the same
 * classes at the same places adopt). Returns the restored root (the template
 * itself when its root object was adopted).
 */
export function decodeGraph<T>(data: EncodedGraph, catalog: GraphCatalog, template: T): { root: T; report: DecodeReport } {
  if (!data || data.v !== GRAPH_FORMAT) throw new GraphDecodeError(`graph format ${data?.v} (want ${GRAPH_FORMAT})`);
  const objs = data.objs;
  const out: unknown[] = new Array(objs.length);
  const bound = new Set<object>();
  const merged = new Uint8Array(objs.length);
  const report: DecodeReport = { adopted: 0, constructed: 0, unresolvedClosures: [] };
  const protos = data.classes.map((k) => {
    if (k === 'Object') return Object.prototype;
    if (k === 'null') return null;
    const p = catalog.classProto(k);
    if (!p) throw new GraphDecodeError(`unknown class ${k}`);
    return p;
  });

  const staticOf = (name: string): object => {
    const s = catalog.staticByKey(name);
    if (!s) throw new GraphDecodeError(`unknown static ${name}`);
    return s;
  };

  /** Whether `candidate` (from the template) can stand for object `id`. */
  const adoptable = (id: number, candidate: unknown): candidate is object => {
    if (candidate === null || typeof candidate !== 'object' || bound.has(candidate)) return false;
    if (catalog.staticKey(candidate) !== undefined || (!ArrayBuffer.isView(candidate) && Object.isFrozen(candidate))) return false;
    const e = objs[id];
    switch (e[0]) {
      case K_OBJECT:
        return Object.getPrototypeOf(candidate) === protos[data.shapes[e[1]][0]];
      case K_ARRAY:
        return Array.isArray(candidate) && Object.getPrototypeOf(candidate) === Array.prototype;
      case K_MAP:
        return candidate instanceof Map;
      case K_SET:
        return candidate instanceof Set;
      case K_WEAK:
        return e[1] === 0 ? candidate instanceof WeakMap : candidate instanceof WeakSet;
      case K_VIEW: {
        if (!ArrayBuffer.isView(candidate)) return false;
        const [, type, bufId, off, len] = e;
        if (viewType(candidate) !== type || candidate.byteOffset !== off || viewLength(candidate) !== len) return false;
        // Its buffer must be free (or already this one's).
        const buf = candidate.buffer as ArrayBuffer;
        const have = out[bufId];
        if (have !== undefined) return have === buf;
        const be = objs[bufId];
        return !bound.has(buf) && be[0] === K_BUFFER && Math.floor(((be[1] as string).replace(/=+$/, '').length * 3) / 4) === buf.byteLength;
      }
      case K_BUFFER:
        return candidate instanceof ArrayBuffer && !bound.has(candidate);
      default:
        return false;
    }
  };

  const bind = (id: number, o: object): object => {
    out[id] = o;
    bound.add(o);
    return o;
  };

  /** The object for `id`: adopting `candidate` when it fits, else made new. */
  const obtain = (id: number, candidate: unknown): object => {
    const have = out[id];
    if (have !== undefined) return have as object;
    if (adoptable(id, candidate)) {
      report.adopted++;
      bind(id, candidate);
      const e = objs[id];
      if (e[0] === K_VIEW) {
        // Adopting a view adopts its buffer (whose bytes are then copied in).
        if (out[e[2]] === undefined) obtain(e[2], (candidate as ArrayBufferView).buffer);
      } else if (e[0] === K_BUFFER) {
        new Uint8Array(candidate as ArrayBuffer).set(base64ToBytes(e[1]));
      }
      return candidate;
    }
    report.constructed++;
    return bind(id, construct(id));
  };

  const construct = (id: number): object => {
    const e = objs[id];
    switch (e[0]) {
      case K_ARRAY:
        return [];
      case K_MAP:
        return new Map();
      case K_SET:
        return new Set();
      case K_WEAK:
        return e[1] === 0 ? new WeakMap() : new WeakSet();
      case K_BUFFER: {
        const bytes = base64ToBytes(e[1]);
        return bytes.buffer.byteLength === bytes.byteLength ? bytes.buffer : bytes.slice().buffer;
      }
      case K_VIEW: {
        const [, type, bufId, off, len] = e;
        const buf = obtain(bufId, undefined) as ArrayBuffer;
        return new VIEW_TYPES[type](buf, off, len);
      }
      case K_OBJECT: {
        const shape = data.shapes[e[1]];
        const proto = protos[shape[0]];
        if (proto === Object.prototype) return {};
        if (proto === null) return Object.create(null) as object;
        const Ctor = (proto as { constructor?: unknown }).constructor;
        if (typeof Ctor === 'function' && Ctor.prototype === proto) {
          // An entity's classname is a real argument (some constructors branch on it); the rest are stand-ins.
          const ci = shape.indexOf('classname', 1);
          const first = ci > 0 && typeof e[ci + 1] === 'string' ? e[ci + 1] : STANDIN;
          try {
            const made = Reflect.construct(Ctor as new (...a: unknown[]) => object, [first, STANDIN, STANDIN, STANDIN]);
            if (made && Object.getPrototypeOf(made) === proto) return made;
          } catch {
            /* fall through */
          }
        }
        return Object.create(proto) as object;
      }
      default:
        throw new GraphDecodeError('bad entry');
    }
  };

  const NO_CANDIDATE = Symbol('none');

  /** A decoded value; references obtain their object (adopting `candidate`). */
  const decodeValue = (v: Value, candidate: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    switch (v[0]) {
      case 'r':
        return obtain(v[1], candidate);
      case 'u':
        return undefined;
      case 'n':
        return v[1] === 'NaN' ? NaN : v[1] === '+I' ? Infinity : v[1] === '-I' ? -Infinity : -0;
      case 's':
        return staticOf(v[1]);
      case 'f': {
        const f = catalog.fnByKey(v[1]);
        if (typeof f !== 'function') throw new GraphDecodeError(`unknown function ${v[1]}`);
        return f;
      }
      default:
        return NO_CANDIDATE;
    }
  };

  const isFnTag = (v: Value): boolean => Array.isArray(v) && (v[0] === 'c' || v[0] === 't');

  // Breadth-first merge from the root, so adoption follows the template's structure.
  const work: number[] = [];
  const enqueue = (v: Value) => {
    if (Array.isArray(v) && v[0] === 'r' && !merged[v[1]]) work.push(v[1]);
  };

  let root: unknown;
  if (Array.isArray(data.root) && data.root[0] === 'r') {
    root = obtain(data.root[1], template);
    work.push(data.root[1]);
  } else {
    root = decodeValue(data.root, template);
  }

  for (let head = 0; head < work.length; head++) {
    const id = work[head];
    if (merged[id]) continue;
    merged[id] = 1;
    const o = out[id] as Record<string | number, unknown>;
    const e = objs[id];
    switch (e[0]) {
      case K_OBJECT: {
        const keys = data.shapes[e[1]];
        const present = new Set<string>();
        for (let i = 1; i < keys.length; i++) {
          const k = keys[i] as string;
          present.add(k);
          const v = e[i + 1] as Value;
          if (isFnTag(v)) continue; // closures resolve last; transients keep the template's
          const cur = Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
          const dv = decodeValue(v, cur);
          if (!Object.is(o[k], dv) || !Object.prototype.hasOwnProperty.call(o, k)) o[k] = dv;
          enqueue(v);
        }
        for (const k of Object.keys(o)) {
          if (!present.has(k)) delete o[k];
        }
        break;
      }
      case K_ARRAY: {
        const arr = o as unknown as unknown[];
        const n = e.length - 1;
        const old = arr.slice();
        arr.length = n;
        for (let i = 0; i < n; i++) {
          const v = e[i + 1] as Value;
          if (Array.isArray(v) && v[0] === 'h') {
            delete arr[i];
            continue;
          }
          if (isFnTag(v)) continue;
          arr[i] = decodeValue(v, old[i]);
          enqueue(v);
        }
        break;
      }
      case K_MAP: {
        const m = o as unknown as Map<unknown, unknown>;
        const old = [...m.entries()];
        m.clear();
        for (let i = 1, j = 0; i < e.length; i += 2, j++) {
          const kv = e[i] as Value;
          const vv = e[i + 1] as Value;
          if (isFnTag(kv) || isFnTag(vv)) throw new GraphDecodeError('a closure in a Map');
          const key = decodeValue(kv, old[j]?.[0]);
          const val = decodeValue(vv, old[j]?.[1]);
          m.set(key, val);
          enqueue(kv);
          enqueue(vv);
        }
        break;
      }
      case K_SET: {
        const s = o as unknown as Set<unknown>;
        const old = [...s];
        s.clear();
        for (let i = 1; i < e.length; i++) {
          const vv = e[i] as Value;
          if (isFnTag(vv)) throw new GraphDecodeError('a closure in a Set');
          s.add(decodeValue(vv, old[i - 1]));
          enqueue(vv);
        }
        break;
      }
      case K_VIEW: {
        // The buffer carries the bytes; make sure it is merged (an adopted buffer gets them copied).
        if (!merged[e[2]]) work.push(e[2]);
        break;
      }
      default:
        break;
    }
  }

  // Closures: find each one's home (the place whose rebuilt object holds a function with the same
  // source), then put that function everywhere the original was.
  data.closures.forEach((c, ci) => {
    const hash = c[0];
    let found: unknown = undefined;
    for (let i = 1; i + 1 < c.length && found === undefined; i += 2) {
      const holder = c[i] as number;
      const key = c[i + 1];
      const o = holder >= 0 ? (out[holder] as Record<string | number, unknown> | undefined) : undefined;
      const f = o?.[key];
      if (typeof f === 'function' && f !== STANDIN && sourceHash(f) === hash) found = f;
    }
    if (found === undefined) {
      report.unresolvedClosures.push(describeClosure(data, c, ci));
      return;
    }
    for (let i = 1; i + 1 < c.length; i += 2) {
      const holder = c[i] as number;
      const key = c[i + 1];
      const o = holder >= 0 ? (out[holder] as Record<string | number, unknown> | undefined) : undefined;
      if (o && o[key] !== found) o[key] = found;
    }
  });

  return { root: root as T, report };
}

function describeClosure(data: EncodedGraph, c: EncodedGraph['closures'][number], ci: number): string {
  const holder = c[1] as number;
  const key = c[2];
  const e = holder >= 0 ? data.objs[holder] : null;
  const cls = e && e[0] === K_OBJECT ? data.classes[data.shapes[e[1]][0]] : e ? `kind ${e[0]}` : 'root';
  return `#${ci} ${cls}.${String(key)}`;
}
