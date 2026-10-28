/**
 * What a panel's colours are tied to. A colour property holds numbers (`"235 227 203 255"`) or the name of a
 * scheme colour, which may name another (`TanDark → Tan → 235 227 203 255`). Changing "the colour of this
 * element" can mean three things: set it directly on the element (detaching it from the name), change the
 * named colour (and so everything that uses it), or change a colour further down the chain. This module
 * works out which are on offer, who else would be affected, and refuses edits that would loop.
 */

import type { Props } from './kv/props';
import { parseKv } from './kv/parse';
import { kvWalk } from './kv/query';
import { resolveColorChain, schemeRoot } from './scheme/inspect';
import type { Rgba, Scheme } from './scheme/scheme';

/** Colour properties in the order a person would reach for them. */
const PRIORITY = [
  'fgcolor',
  'fgcolor_override',
  'defaultfgcolor_override',
  'bgcolor_override',
  'defaultbgcolor_override',
  'drawcolor',
  'fillcolor',
  'armedfgcolor_override',
  'armedbgcolor_override',
  'depressedfgcolor_override',
  'depressedbgcolor_override',
  'selectedfgcolor_override',
  'selectedbgcolor_override',
] as const;

const COLOR_KEY = /colou?r(_override)?$/i;

/** A colour property (not a `_minmode` / `_lodef` variant, which follow their base). */
export const isColorProp = (key: string): boolean =>
  COLOR_KEY.test(key) && !/_(minmode|lodef)$/i.test(key);

/** One step of a colour's name chain that can be edited. */
export interface ChainHop {
  name: string;
  /** Where the name is defined. */
  source: 'colors' | 'base';
}

export interface ColorSlot {
  key: string;
  /** What the property holds, as written. */
  value: string;
  rgba?: Rgba;
  /** `literal`: numbers · `variable`: names a scheme colour · `unknown`: neither. */
  kind: 'literal' | 'variable' | 'unknown';
  /** The names it goes through, outermost first (empty for a literal). */
  hops: ChainHop[];
}

export function describeColor(scheme: Scheme, key: string, value: string): ColorSlot {
  const r = resolveColorChain(scheme, value);
  if (r.kind === 'literal') return { key, value, rgba: r.rgba, kind: 'literal', hops: [] };
  const hops: ChainHop[] = [];
  for (const name of r.chain) {
    const k = name.trim().toLowerCase();
    if (scheme.colors.has(k))
      hops.push({ name: scheme.colorNames.get(k) ?? name, source: 'colors' });
    else if (scheme.base.has(k)) hops.push({ name, source: 'base' });
  }
  if (r.kind === 'unknown' || !hops.length) return { key, value, kind: 'unknown', hops: [] };
  return { key, value, rgba: r.rgba, kind: 'variable', hops };
}

/** The colour properties a panel has, most useful first. */
export function colorSlots(props: Props, scheme: Scheme): ColorSlot[] {
  const keys = props.keys().filter(isColorProp);
  const rank = (k: string) => {
    const i = (PRIORITY as readonly string[]).indexOf(k);
    return i < 0 ? PRIORITY.length : i;
  };
  return keys
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((k) => describeColor(scheme, k, props.get(k) ?? ''));
}

/** The property to offer adding when a panel has no colour of its own, by the kind of control. */
export function suggestedColorKey(kind: string): string {
  if (kind === 'image') return 'drawcolor';
  if (kind === 'panel') return 'bgcolor_override';
  return 'fgcolor';
}

/** Whether pointing the colour called `name` at `target` would make a loop (`A → B → A`). */
export function wouldCycle(scheme: Scheme, name: string, target: string): boolean {
  const me = name.trim().toLowerCase();
  if (target.trim().toLowerCase() === me) return true;
  const r = resolveColorChain(scheme, target);
  return r.chain.some((hop) => hop.trim().toLowerCase() === me);
}

export interface ColorUsage {
  /** Other scheme entries that name it (aliases, border layers). */
  scheme: number;
  /** Colour properties in the given panel files that name it. */
  panels: number;
  /** How many of those files. */
  files: number;
}

/** Who else would change if the scheme colour `name` did. */
export function colorUsage(
  name: string,
  schemeText: string | undefined,
  panelFiles: readonly { path: string; text: string }[],
): ColorUsage {
  const want = name.trim().toLowerCase();
  let scheme = 0;
  if (schemeText) {
    const { doc, root } = schemeRoot(schemeText);
    if (root) {
      kvWalk(doc, (n) => {
        if (
          n.value &&
          n.value.text.trim().toLowerCase() === want &&
          n.key.text.toLowerCase() !== want
        ) {
          scheme++;
        }
      });
    }
  }
  let panels = 0;
  let files = 0;
  for (const f of panelFiles) {
    let inFile = 0;
    const doc = parseKv(f.text);
    kvWalk(doc, (n) => {
      if (n.value && isColorProp(n.key.text) && n.value.text.trim().toLowerCase() === want)
        inFile++;
    });
    if (inFile) {
      panels += inFile;
      files++;
    }
  }
  return { scheme, panels, files };
}
