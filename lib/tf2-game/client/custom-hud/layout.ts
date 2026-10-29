/**
 * Where a custom HUD puts the panels the game still draws itself.
 *
 * Some of the in-game HUD is made at run time in TF2 too, not by `.res`
 * panels the editor can preview: the kill feed's rows, chat, the voice menu,
 * the control point icons and the payload track, the crosshair. Those keep the
 * game's own components, and take their element's place from the HUD's
 * `scripts/hudlayout.res` — the same block the editor drags — as overrides
 * for the layout table in components/tf2-game/hud-layout.ts.
 */

import { activeEntries, propsOf } from '@/lib/tf2-hud/kv/props';
import { HUD_LAYOUT_FILE, parseCached } from '@/lib/tf2-hud/scene/build';
import type { CondEnv } from '@/lib/tf2-hud/scheme/cond';

/** The `.res` fields of one layout entry (mirrors `PanelLayout` in hud-layout.ts, which imports nothing from here). */
export interface LayoutOverride {
  xpos?: string;
  ypos?: string;
  wide?: string;
  tall?: string;
  zpos?: number;
}

/**
 * Overrides for the named elements from the HUD's `hudlayout.res` (only the keys a block sets).
 * `names` are the layout table's names; matching is case-insensitive, as in the engine.
 */
export function layoutOverrides(
  readText: (path: string) => string | undefined,
  env: CondEnv,
  names: readonly string[],
  minmode = false,
): Record<string, LayoutOverride> {
  const text = readText(HUD_LAYOUT_FILE);
  const out: Record<string, LayoutOverride> = {};
  if (text === undefined) return out;
  const root = parseCached(text).roots.find((n) => n.children);
  if (!root) return out;
  const wanted = new Map(names.map((n) => [n.toLowerCase(), n]));
  for (const b of activeEntries(root, env)) {
    if (!b.children) continue;
    const name = wanted.get(b.key.text.toLowerCase());
    if (!name || out[name]) continue;
    const p = propsOf(b, { env, minmode });
    const o: LayoutOverride = {};
    for (const k of ['xpos', 'ypos', 'wide', 'tall'] as const) {
      const v = p.get(k);
      if (v !== undefined) o[k] = v;
    }
    if (p.has('zpos')) o.zpos = p.num('zpos', 0);
    out[name] = o;
  }
  return out;
}
