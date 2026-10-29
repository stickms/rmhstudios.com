/**
 * The names a checkpoint uses for what it does not copy: classes (to rebuild
 * an object with the right prototype), functions that are not closures
 * (prototype methods, module functions), and module-level data shared by every
 * world (weapon specs, class tables, frozen move parameters).
 *
 * A name must mean the same thing in the browser that wrote a checkpoint and
 * the one that restores it, so it is never a minified `constructor.name`: it is
 * the module's path and the export's name, as the bundler's
 * `import.meta.glob` hands them over (`../../sim/world.ts#GameWorld`). Both
 * browsers run the same bundle; a checkpoint from another build is refused by
 * its catalog fingerprint (./world-state.ts).
 *
 * Environment-agnostic: the caller supplies the module namespaces
 * (client/net/checkpoint-catalog.ts in the browser and in Vitest).
 */

/** What the codec asks of a catalog (./graph.ts). */
export interface GraphCatalog {
  classKey(proto: object): string | undefined;
  classProto(key: string): object | undefined;
  fnKey(fn: unknown): string | undefined;
  fnByKey(key: string): unknown;
  staticKey(obj: object): string | undefined;
  staticByKey(key: string): object | undefined;
}

type Namespace = Record<string, unknown>;

const isClass = (v: unknown): v is { prototype: object; name: string } =>
  typeof v === 'function' && typeof (v as { prototype?: unknown }).prototype === 'object' && (v as { prototype: object }).prototype !== null;

/** A typed array or DataView (copied by value, never indexed as a static). */
const isView = (v: unknown): boolean => ArrayBuffer.isView(v);

/** Data reachable from module exports, walked to this depth (tables are shallow; this bounds a cycle-free walk). */
const STATIC_DEPTH = 8;
/** At most this many objects are indexed per module (a guard against walking something huge). */
const STATIC_MAX_PER_MODULE = 20_000;

export interface CatalogOptions {
  /** Classes that are not exported from any module (`entity:<classname>` style keys). */
  extraClasses?: Record<string, unknown>;
  /**
   * Refuse a checkpoint written by another build (default true). A development server serves each
   * module as it is on disk when a worker first loads it, so two browsers' catalogs can differ by an
   * export someone just added: there a missing name still fails the restore, but a fingerprint alone
   * does not.
   */
  strict?: boolean;
}

export class ModuleCatalog implements GraphCatalog {
  private readonly protoKeys = new Map<object, string>();
  private readonly protos = new Map<string, object>();
  private readonly fnKeys = new Map<unknown, string>();
  private readonly fns = new Map<string, unknown>();
  private readonly staticKeys = new Map<object, string>();
  private readonly statics = new Map<string, object>();
  /** A short fingerprint of every key (two builds with different modules disagree). */
  readonly fingerprint: string;
  /** Whether a checkpoint with another fingerprint is refused. */
  readonly strict: boolean;

  constructor(modules: Record<string, Namespace>, opts: CatalogOptions = {}) {
    const moduleKeys = Object.keys(modules).sort();
    // Classes and functions first (so a class is never mistaken for data).
    for (const mk of moduleKeys) {
      const ns = modules[mk];
      for (const name of Object.keys(ns).sort()) {
        const v = ns[name];
        if (typeof v !== 'function') continue;
        const key = `${mk}#${name}`;
        if (isClass(v)) this.addClass(key, v);
        this.addFn(key, v);
      }
    }
    for (const [key, v] of Object.entries(opts.extraClasses ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (isClass(v)) this.addClass(key, v);
    }
    // Then module data.
    for (const mk of moduleKeys) {
      const ns = modules[mk];
      let budget = STATIC_MAX_PER_MODULE;
      for (const name of Object.keys(ns).sort()) {
        const v = ns[name];
        if (v === null || typeof v !== 'object') continue;
        budget = this.indexStatic(v, `${mk}#${name}`, 0, budget);
      }
    }
    this.strict = opts.strict !== false;
    let h = 0x811c9dc5;
    for (const k of [...this.protos.keys(), ...this.fns.keys()].sort()) h = fnv(k, h);
    this.fingerprint = (h >>> 0).toString(36);
  }

  private addClass(key: string, cls: { prototype: object }): void {
    const proto = cls.prototype;
    if (this.protoKeys.has(proto)) return;
    this.protoKeys.set(proto, key);
    this.protos.set(key, proto);
    // Prototype methods (and static methods) are functions a field may hold (`thinkFn = this.flyThink`).
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const d = Object.getOwnPropertyDescriptor(proto, name);
      if (d && typeof d.value === 'function') this.addFn(`${key}.p.${name}`, d.value);
    }
    for (const name of Object.getOwnPropertyNames(cls)) {
      if (name === 'prototype' || name === 'length' || name === 'name') continue;
      const d = Object.getOwnPropertyDescriptor(cls, name);
      if (d && typeof d.value === 'function') this.addFn(`${key}.s.${name}`, d.value);
    }
  }

  private addFn(key: string, fn: unknown): void {
    if (this.fnKeys.has(fn)) return;
    this.fnKeys.set(fn, key);
    this.fns.set(key, fn);
  }

  private indexStatic(v: object, path: string, depth: number, budget: number): number {
    if (budget <= 0 || this.staticKeys.has(v) || this.protoKeys.has(v)) return budget;
    // Class instances other than plain containers are left alone: a module-level instance may be a
    // registry holding per-world state, and its data is not a table.
    const proto = Object.getPrototypeOf(v);
    const plain = proto === Object.prototype || proto === null || Array.isArray(v) || v instanceof Map || v instanceof Set;
    if (!plain && !isView(v)) return budget;
    this.staticKeys.set(v, path);
    this.statics.set(path, v);
    budget--;
    if (depth >= STATIC_DEPTH || isView(v)) return budget;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length && budget > 0; i++) {
        const c = v[i];
        if (c !== null && typeof c === 'object') budget = this.indexStatic(c, `${path}[${i}]`, depth + 1, budget);
      }
    } else if (v instanceof Map) {
      for (const [k, c] of v) {
        if ((typeof k === 'string' || typeof k === 'number') && c !== null && typeof c === 'object' && budget > 0) {
          budget = this.indexStatic(c, `${path}{${String(k)}}`, depth + 1, budget);
        }
      }
    } else if (!(v instanceof Set)) {
      for (const k of Object.keys(v)) {
        const c = (v as Record<string, unknown>)[k];
        if (c !== null && typeof c === 'object' && budget > 0) budget = this.indexStatic(c, `${path}.${k}`, depth + 1, budget);
      }
    }
    return budget;
  }

  classKey(proto: object): string | undefined {
    return this.protoKeys.get(proto);
  }

  classProto(key: string): object | undefined {
    return this.protos.get(key);
  }

  fnKey(fn: unknown): string | undefined {
    return this.fnKeys.get(fn);
  }

  fnByKey(key: string): unknown {
    return this.fns.get(key);
  }

  staticKey(obj: object): string | undefined {
    return this.staticKeys.get(obj);
  }

  staticByKey(key: string): object | undefined {
    return this.statics.get(key);
  }
}

/**
 * Objects one world owns but never copies — its map (BSP, collision, the entity lump) and its bots'
 * navigation mesh — named by their path from a root both browsers build for themselves. Each root is
 * walked to its own depth: the simulation's state points into a map at a few shallow places (an
 * entity's keyvalues, a nav area), and indexing a whole BSP (~250k objects) per checkpoint would cost
 * more than the rest of the checkpoint. Anything deeper that the state does reference is copied (a
 * checkpoint stays correct, only larger).
 */
export class RootIndex {
  private readonly keys = new Map<object, string>();
  private readonly byKey = new Map<string, object>();

  constructor(roots: ReadonlyArray<[name: string, root: object | null | undefined, depth?: number]>) {
    for (const [name, root, depth] of roots) if (root) this.walk(root, `@${name}`, depth ?? Infinity);
  }

  private walk(root: object, rootPath: string, maxDepth: number): void {
    // Iterative (BSP-sized graphs would overflow a recursive walk).
    const stack: Array<[object, string, number]> = [[root, rootPath, 0]];
    while (stack.length > 0) {
      const [v, path, depth] = stack.pop()!;
      if (this.keys.has(v)) continue;
      this.keys.set(v, path);
      this.byKey.set(path, v);
      if (depth >= maxDepth) continue;
      if (isView(v) || v instanceof ArrayBuffer || typeof v === 'function') continue;
      if (v instanceof WeakMap || v instanceof WeakSet) continue;
      const d = depth + 1;
      if (Array.isArray(v)) {
        for (let i = v.length - 1; i >= 0; i--) {
          const c = v[i];
          if (c !== null && typeof c === 'object') stack.push([c, `${path}[${i}]`, d]);
        }
        continue;
      }
      if (v instanceof Map) {
        let i = 0;
        for (const [, c] of v) {
          if (c !== null && typeof c === 'object') stack.push([c, `${path}{${i}}`, d]);
          i++;
        }
        continue;
      }
      if (v instanceof Set) continue;
      const keys = Object.keys(v);
      for (let i = keys.length - 1; i >= 0; i--) {
        const c = (v as Record<string, unknown>)[keys[i]];
        if (c !== null && typeof c === 'object') stack.push([c, `${path}.${keys[i]}`, d]);
      }
    }
  }

  key(obj: object): string | undefined {
    return this.keys.get(obj);
  }

  get(key: string): object | undefined {
    return this.byKey.get(key);
  }
}

/** A catalog plus one world's roots. */
export function withRoots(catalog: GraphCatalog, roots: RootIndex): GraphCatalog {
  return {
    classKey: (p) => catalog.classKey(p),
    classProto: (k) => catalog.classProto(k),
    fnKey: (f) => catalog.fnKey(f),
    fnByKey: (k) => catalog.fnByKey(k),
    staticKey: (o) => roots.key(o) ?? catalog.staticKey(o),
    staticByKey: (k) => (k.startsWith('@') ? roots.get(k) : catalog.staticByKey(k)),
  };
}

/** FNV-1a over a string, chained. */
export function fnv(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
