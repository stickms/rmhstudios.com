/**
 * TF2's character loadout screen (CClassLoadoutPanel, game/client/tf/vgui/class_loadout_panel.cpp) from
 * the game's `resource/ui/classloadoutpanel.res`: the panel's own labels and lines through the HUD
 * editor's scene builder, the 3D class model at the file's `classmodelpanel`, and the item slots where
 * the game's code puts them — `item_xpos_offcenter_a` (left column: primary, secondary, melee, PDA)
 * and `item_xpos_offcenter_b` (right column: the cosmetics and the action item) from the panel's
 * centre, rows from `item_ypos` every `item_ydelta`, each the size of `modelpanels_kv`, in the
 * per-class order of `g_VisibleLoadoutSlotsPerClass` (the Spy's watch and sapper, the Engineer's PDA).
 *
 * Pure; tested in menus.test.ts (every rectangle against the editor's build of the same file).
 */

import { buildScene, type SceneContext } from '@/lib/tf2-hud/scene/build';
import { activeEntries, propsOf } from '@/lib/tf2-hud/kv/props';
import { parseCached } from '@/lib/tf2-hud/scene/build';
import { scaled, screenScale, type Rect, type Screen } from '@/lib/tf2-hud/layout/geometry';
import type { Scene } from '@/lib/tf2-hud/scene/types';
import type { SceneSource } from '../custom-hud/scene';

export const CLASS_LOADOUT_FILE = 'resource/ui/classloadoutpanel.res';

/**
 * The panel position (1-based; 0 = not shown) of each loadout slot, per class — the SDK's
 * `g_DefaultLoadoutPanelPositioning`, `_Spy` and `_Engineer`, with LOADOUT_POSITION_HEAD / MISC / MISC2
 * as this game's cosmetic1 / 2 / 3.
 */
export function slotPositions(cls: string): Readonly<Record<string, number>> {
  if (cls === 'spy') return { secondary: 1, melee: 2, pda2: 3, building: 4, cosmetic1: 5, cosmetic2: 6, cosmetic3: 7, action: 8 };
  if (cls === 'engineer') return { primary: 1, secondary: 2, melee: 3, pda: 4, cosmetic1: 5, cosmetic2: 6, cosmetic3: 7, action: 8 };
  return { primary: 1, secondary: 2, melee: 3, cosmetic1: 5, cosmetic2: 6, cosmetic3: 7, action: 8 };
}

export interface LoadoutPanelInput {
  source: SceneSource;
  /** The area the panel fills (the screen below the class row). */
  screen: Screen;
  cls: string;
  /** The class's name as the game shows it (`%loadoutclass%`). */
  className: string;
  /** The slots to place (the class's weapon slots from the catalog, the cosmetics, the action slot). */
  slots: readonly string[];
}

export interface LoadoutPanelResult {
  scene: Scene;
  /** Each placed slot's rectangle, in the order of the panel positions. */
  slots: Array<{ slot: string; rect: Rect }>;
  /** Where the class model goes (`classmodelpanel`), if the file has one. */
  model: Rect | null;
}

/** Builds the panel, or null without the game's classloadoutpanel.res (the UI lays the slots out itself). */
export function buildLoadoutPanel(input: LoadoutPanelInput): LoadoutPanelResult | null {
  const src = input.source;
  const env = src.env;
  const text = src.readText(CLASS_LOADOUT_FILE);
  if (text === undefined) return null;
  const top = parseCached(text).roots.find((n) => n.children);
  const frame = top?.children ? activeEntries(top, env).find((e) => e.children) : undefined;
  if (!frame) return null;
  const fp = propsOf(frame, { env });
  const kv = activeEntries(frame, env).find((c) => c.children && c.key.text.toLowerCase() === 'modelpanels_kv');
  const kvp = kv ? propsOf(kv, { env }) : undefined;
  const scale = screenScale(input.screen);

  const ctx: SceneContext = {
    readText: src.readText,
    scheme: src.scheme,
    env,
    screen: input.screen,
    minmode: src.minmode,
    showHidden: false,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars: new Map([['loadoutclass', input.className]]),
    strings: src.strings,
    progress: 0,
    // The taunt page's labels and the page switch (only the character page is shown here), the item
    // presets (not in this game) and the hover card (the page's own tiles name their items).
    gate: (file, name) => {
      if (file !== CLASS_LOADOUT_FILE) return undefined;
      const n = name.toLowerCase();
      if (
        n === 'tauntcaratlabel' ||
        n === 'tauntlabel' ||
        n === 'taunthintlabel' ||
        n === 'characterloadoutbutton' ||
        n === 'tauntloadoutbutton' ||
        n === 'loadout_preset_panel' ||
        n === 'mouseoveritempanel'
      )
        return false;
      return undefined;
    },
    // The class label's token is `%loadoutclass%` itself in TF2's localisation; without it, say the class.
    overridesFor: (file, keyPath) => {
      if (file !== CLASS_LOADOUT_FILE || keyPath.length !== 2 || keyPath[1].toLowerCase() !== 'classlabel') return undefined;
      return src.strings.has('classbeingequipped') ? undefined : { labeltext: '%loadoutclass%' };
    },
  };
  const scene = buildScene(ctx, [CLASS_LOADOUT_FILE]);

  const w = scaled(kvp?.num('wide', 140) ?? 140, scale);
  const h = scaled(kvp?.num('tall', 70) ?? 70, scale);
  const centre = Math.trunc(input.screen.w * 0.5);
  const a = scaled(fp.num('item_xpos_offcenter_a', 0), scale);
  const b = scaled(fp.num('item_xpos_offcenter_b', 0), scale);
  const y0 = scaled(fp.num('item_ypos', 0), scale);
  const dy = scaled(fp.num('item_ydelta', 0), scale);
  const pos = slotPositions(input.cls);
  const slots = input.slots
    .map((slot) => ({ slot, p: pos[slot] ?? 0 }))
    .filter((s) => s.p > 0 && s.p <= 8)
    .sort((x, y) => x.p - y.p)
    .map(({ slot, p }) => {
      const i = p - 1;
      const column = Math.floor(i / 4);
      const row = i % 4;
      // Columns past the second (the taunt page's) step 200 pixels, unscaled, as the SDK does.
      const x = centre + (column === 0 ? a : b + (column - 1) * 200);
      return { slot, rect: { x, y: y0 + dy * row, w, h } };
    });
  const modelNode = scene.nodes.find((n) => n.name.toLowerCase() === 'classmodelpanel' && n.shown);
  return { scene, slots, model: modelNode ? modelNode.rect : null };
}
