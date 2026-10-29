/**
 * `ent_fire`'s completion: entity names and classnames, and the inputs a
 * target accepts — from what the client knows of the server's entities (the
 * map's entity lump the level was loaded from, the classes the simulation
 * registers, the single-player world itself).
 *
 * Inputs are read from the classes: each `acceptInput` override handles its
 * inputs as `case 'name':` (lower-cased, as the I/O system compares them —
 * Source's inputs are case-insensitive), so a class's inputs are the case
 * labels along its prototype chain; the map's own output connections add the
 * spelling its authors used (`Open`, `SetAnimation`).
 *
 * Environment-agnostic.
 */

import { entityClassFor, registeredClassnames } from '../sim/entity-registry';

/** What the console needs to complete entity arguments. */
export interface EntityIndex {
  /** targetname → classname. */
  names: ReadonlyMap<string, string>;
  classnames: readonly string[];
  /** Inputs the map's outputs send to a target (its authors' spelling), by lower-cased target. */
  mapInputs: ReadonlyMap<string, readonly string[]>;
  /** The class a classname makes (default: the TF2 simulation's registry). */
  ctorFor?: (classname: string) => { prototype: object } | null;
}

const ESC = String.fromCharCode(27);
const CASE_RE = /case\s*["'`]([a-z0-9_]+)["'`]\s*:/g;
const inputsCache = new WeakMap<object, string[]>();

/** The inputs a class's `acceptInput` chain handles (lower-case), [] when it has none. */
export function classInputs(ctor: { prototype: object } | null): string[] {
  if (!ctor) return [];
  const hit = inputsCache.get(ctor);
  if (hit) return hit;
  const out = new Set<string>();
  for (let p: object | null = ctor.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    const own = Object.getOwnPropertyDescriptor(p, 'acceptInput');
    if (!own || typeof own.value !== 'function') continue;
    let src: string;
    try {
      src = Function.prototype.toString.call(own.value);
    } catch {
      continue;
    }
    for (const m of src.matchAll(CASE_RE)) out.add(m[1]);
  }
  const list = [...out].sort();
  inputsCache.set(ctor, list);
  return list;
}

/** Builds an index from a map's entity lump (`targetname`, `classname`, and its outputs' targets and inputs). */
export function indexFromLump(entities: ReadonlyArray<{ get(key: string): string | undefined; readonly props: ReadonlyArray<[string, string]> }>): EntityIndex {
  const names = new Map<string, string>();
  const classnames = new Set<string>(registeredClassnames());
  const mapInputs = new Map<string, Set<string>>();
  for (const kv of entities) {
    const cls = (kv.get('classname') ?? '').toLowerCase();
    if (cls) classnames.add(cls);
    const name = kv.get('targetname');
    if (name && !names.has(name)) names.set(name, cls);
    for (const [k, v] of kv.props) {
      // Outputs are "target,input,param,delay,times" (ESC-separated in newer maps).
      const sep = v.includes(ESC) ? ESC : ',';
      if (!/^on/i.test(k) || !v.includes(sep)) continue;
      const parts = v.split(sep);
      const target = parts[0]?.trim().toLowerCase();
      const input = parts[1]?.trim();
      if (!target || !input || !/^\w{1,64}$/.test(input)) continue;
      let set = mapInputs.get(target);
      if (!set) mapInputs.set(target, (set = new Set()));
      set.add(input);
    }
  }
  return {
    names,
    classnames: [...classnames].sort(),
    mapInputs: new Map([...mapInputs].map(([k, v]) => [k, [...v].sort()])),
  };
}

/** Completion for `ent_fire <target>`: specials, names, classnames. */
export function completeTargets(index: EntityIndex | null): string[] {
  const specials = ['!picker', '!self', '!player', '!activator', '!caller'];
  if (!index) return specials;
  return [...specials, ...index.names.keys(), ...index.classnames];
}

/** Completion for `ent_fire <target> <input>`: what that target accepts (the map's spelling first). */
export function completeInputs(index: EntityIndex | null, target: string): string[] {
  const fallback = ['Use', 'Open', 'Close', 'Toggle', 'Enable', 'Disable', 'Kill', 'Trigger', 'FireUser1'];
  if (!index) return fallback;
  const t = target.toLowerCase();
  const fromMap = index.mapInputs.get(t) ?? [];
  const cls = index.names.get(target) ?? [...index.names].find(([n]) => n.toLowerCase() === t)?.[1] ?? (index.classnames.includes(t) ? t : null);
  const fromClass = cls ? classInputs((index.ctorFor ?? entityClassFor)(cls)) : [];
  const seen = new Set(fromMap.map((i) => i.toLowerCase()));
  const out = [...fromMap];
  for (const i of fromClass) if (!seen.has(i)) out.push(i);
  return out.length ? out : fallback;
}

/** A live world's index (single-player: the client runs the world itself) — names, classes and their outputs' inputs. */
export function indexFromEntities(
  entities: Iterable<{ classname: string; targetname: string; readonly outputs: ReadonlyMap<string, { readonly actions: ReadonlyArray<{ target: string; input: string }> }>; removed?: boolean } | undefined>,
): EntityIndex {
  const names = new Map<string, string>();
  const classnames = new Set<string>();
  const ctors = new Map<string, { prototype: object }>();
  const mapInputs = new Map<string, Set<string>>();
  for (const e of entities) {
    if (!e || e.removed) continue;
    classnames.add(e.classname);
    if (!ctors.has(e.classname)) ctors.set(e.classname, (e as unknown as { constructor: { prototype: object } }).constructor);
    if (e.targetname && !names.has(e.targetname)) names.set(e.targetname, e.classname);
    for (const out of e.outputs.values()) {
      for (const a of out.actions) {
        const t = a.target.toLowerCase();
        if (!t || !/^\w{1,64}$/.test(a.input)) continue;
        let set = mapInputs.get(t);
        if (!set) mapInputs.set(t, (set = new Set()));
        set.add(a.input);
      }
    }
  }
  return {
    names,
    classnames: [...classnames].sort(),
    mapInputs: new Map([...mapInputs].map(([k, v]) => [k, [...v].sort()])),
    ctorFor: (c) => ctors.get(c.toLowerCase()) ?? null,
  };
}
