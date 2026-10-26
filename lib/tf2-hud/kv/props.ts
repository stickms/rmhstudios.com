/**
 * Flatten a KeyValues block into the property bag a panel actually sees.
 *
 * Entries guarded by a conditional that is false in the active environment do
 * not exist as far as the engine is concerned, and when a key repeats (the
 * `[$WIN32]` / `[$X360]` pairs) the first surviving one wins — that is how
 * `KeyValues::GetString` resolves it.
 */

import { evalCond, type CondEnv } from '../scheme/cond';
import type { KvNode } from './types';

export interface Props {
  get(key: string): string | undefined;
  has(key: string): boolean;
  num(key: string, fallback?: number): number;
  bool(key: string, fallback?: boolean): boolean;
  keys(): string[];
}

export interface PropOptions {
  env: CondEnv;
  /** Prefer `<key>_minmode` over `<key>` (the HUD's compact "minmode" layout). */
  minmode?: boolean;
}

export function activeEntries(node: KvNode, env: CondEnv): KvNode[] {
  return (node.children ?? []).filter((c) => evalCond(c.cond?.text, env));
}

export function propsOf(node: KvNode, opts: PropOptions): Props {
  const map = new Map<string, string>();
  for (const c of activeEntries(node, opts.env)) {
    if (c.value === undefined) continue;
    const k = c.key.text.toLowerCase();
    if (!map.has(k)) map.set(k, c.value.text);
  }
  const get = (key: string): string | undefined => {
    const k = key.toLowerCase();
    if (opts.minmode) {
      const m = map.get(`${k}_minmode`);
      if (m !== undefined) return m;
    }
    return map.get(k);
  };
  return {
    get,
    has: (key) => get(key) !== undefined,
    num(key, fallback = 0) {
      const v = Number.parseFloat(get(key) ?? '');
      return Number.isFinite(v) ? v : fallback;
    },
    bool(key, fallback = false) {
      const v = get(key);
      if (v === undefined) return fallback;
      return v !== '0' && v.toLowerCase() !== 'false' && v !== '';
    },
    keys: () => [...map.keys()],
  };
}

/**
 * `over` wins for every key it defines. This is how `scripts/hudlayout.res`
 * works: it re-states the position and size of a HUD element, and whatever it
 * says replaces what the element's own `.res` file declared.
 */
export function mergeProps(base: Props, over: Props): Props {
  return {
    get: (key) => over.get(key) ?? base.get(key),
    has: (key) => over.has(key) || base.has(key),
    num(key, fallback = 0) {
      const v = Number.parseFloat(this.get(key) ?? '');
      return Number.isFinite(v) ? v : fallback;
    },
    bool(key, fallback = false) {
      const v = this.get(key);
      if (v === undefined) return fallback;
      return v !== '0' && v.toLowerCase() !== 'false' && v !== '';
    },
    keys: () => [...new Set([...base.keys(), ...over.keys()])],
  };
}
