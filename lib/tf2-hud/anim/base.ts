/** What a panel looks like with no animation on it, read from the page's files: where animations start from. */

import { activeEntries, mergeProps, propsOf, type Props } from '../kv/props';
import { parseDim } from '../layout/geometry';
import { HUD_LAYOUT_FILE, parseCached } from '../scene/build';
import type { CondEnv } from '../scheme/cond';
import { resolveColor, type Scheme } from '../scheme/scheme';
import type { AnimEnv, AnimValue, Channel, DimValue } from './controller';

const toDim = (raw: string | undefined, axis: 'pos' | 'size'): DimValue => {
  const d = parseDim(raw);
  const prefix =
    axis === 'size'
      ? d.fill
        ? 'f'
        : ''
      : d.align === 'end'
        ? 'r'
        : d.align === 'center'
          ? 'c'
          : '';
  return { prefix, value: d.value };
};

/** Every named panel in `files` (and the layout blocks that position the HUD elements), by lower-case name. */
export function panelProps(
  files: readonly string[],
  read: (path: string) => string | undefined,
  env: CondEnv,
  minmode: boolean,
): Map<string, Props> {
  const out = new Map<string, Props>();
  const opts = { env, minmode };
  const layout = new Map<string, Props>();
  const layoutText = read(HUD_LAYOUT_FILE);
  if (layoutText !== undefined) {
    const root = parseCached(layoutText).roots.find((n) => n.children);
    if (root) {
      for (const b of activeEntries(root, env)) {
        if (b.children) layout.set(b.key.text.toLowerCase(), propsOf(b, opts));
      }
    }
  }
  for (const file of files) {
    const text = read(file);
    if (text === undefined) continue;
    const top = parseCached(text).roots.find((n) => n.children);
    if (!top) continue;
    const walk = (entries: readonly import('../kv/types').KvNode[]) => {
      for (const e of entries) {
        if (!e.children) continue;
        const k = e.key.text.toLowerCase();
        if (!out.has(k)) {
          const own = propsOf(e, opts);
          const lay = layout.get(k);
          out.set(k, lay ? mergeProps(own, lay) : own);
        }
        walk(activeEntries(e, env));
      }
    };
    walk(activeEntries(top, env));
  }
  for (const [k, p] of layout) if (!out.has(k)) out.set(k, p);
  return out;
}

export function animEnvFor(panels: ReadonlyMap<string, Props>, scheme: Scheme): AnimEnv {
  const color = (raw: string | undefined) => (raw ? resolveColor(scheme, raw) : undefined);
  return {
    color: (raw) => resolveColor(scheme, raw),
    base(panel: string, ch: Channel): AnimValue | undefined {
      const p = panels.get(panel);
      if (!p) return undefined;
      switch (ch) {
        case 'alpha':
          return p.num('alpha', 255);
        case 'fg':
          return color(
            p.get('fgcolor_override') ?? p.get('fgcolor') ?? p.get('defaultfgcolor_override'),
          );
        case 'bg':
          return color(p.get('bgcolor_override') ?? p.get('defaultbgcolor_override'));
        case 'x':
          return toDim(p.get('xpos'), 'pos');
        case 'y':
          return toDim(p.get('ypos'), 'pos');
        case 'w':
          return toDim(p.get('wide'), 'size');
        case 'h':
          return toDim(p.get('tall'), 'size');
        case 'vis':
          return p.bool('visible', true);
      }
    },
  };
}
