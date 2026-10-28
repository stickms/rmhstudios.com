/** Turning running animation values into the property overrides the scene builder reads. */

import { mergeProps, propsFromMap, type Props } from '../kv/props';
import type { Rgba } from '../scheme/scheme';
import type { AnimController, AnimValue, Channel, DimValue } from './controller';

export type StyleFor = (file: string, name: string, props: Props) => Props;

/** Per-panel (lower-case name) animated values. */
export type AnimSnapshot = ReadonlyMap<string, Partial<Record<Channel, AnimValue>>>;

export const EMPTY_SNAPSHOT: AnimSnapshot = new Map();

/** A scene-property name for animated alpha (0–255). Not a real key; the scene builder reads it. */
export const ALPHA_KEY = '_rmh_alpha';

export function snapshotOf(controller: AnimController): AnimSnapshot {
  const out = new Map<string, Partial<Record<Channel, AnimValue>>>();
  for (const [k, v] of controller.values()) {
    const [panel, channel] = k.split('|') as [string, Channel];
    const entry = out.get(panel) ?? {};
    (entry as Record<string, AnimValue>)[channel] = v;
    out.set(panel, entry);
  }
  return out;
}

const rgba = (c: Rgba): string => `${c.r} ${c.g} ${c.b} ${c.a}`;
const num = (n: number): string => String(Math.round(n * 1000) / 1000);
const dim = (d: DimValue): string => `${d.prefix}${num(d.value)}`;

export function animStyle(snapshot: AnimSnapshot): StyleFor | undefined {
  if (snapshot.size === 0) return undefined;
  return (_file, name, props) => {
    const o = snapshot.get(name.toLowerCase());
    if (!o) return props;
    const over: Record<string, string> = {};
    if (typeof o.alpha === 'number') over[ALPHA_KEY] = num(o.alpha);
    if (o.fg && typeof o.fg === 'object' && 'r' in o.fg) {
      const c = rgba(o.fg);
      over.fgcolor = c;
      over.fgcolor_override = c;
      over.defaultfgcolor_override = c;
    }
    if (o.bg && typeof o.bg === 'object' && 'r' in o.bg) {
      const c = rgba(o.bg);
      over.bgcolor_override = c;
      over.defaultbgcolor_override = c;
    }
    for (const [ch, key] of [
      ['x', 'xpos'],
      ['y', 'ypos'],
      ['w', 'wide'],
      ['h', 'tall'],
    ] as const) {
      const v = o[ch];
      if (v && typeof v === 'object' && 'prefix' in v) over[key] = dim(v);
    }
    if (typeof o.vis === 'boolean') over.visible = o.vis ? '1' : '0';
    return Object.keys(over).length ? mergeProps(props, propsFromMap(over)) : props;
  };
}

/** Apply several styles in order. */
export function composeStyles(...styles: (StyleFor | undefined)[]): StyleFor | undefined {
  const list = styles.filter((s): s is StyleFor => s !== undefined);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  return (file, name, props) => list.reduce((p, s) => s(file, name, p), props);
}
