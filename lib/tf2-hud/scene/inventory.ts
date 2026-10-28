/**
 * Where the game lays out the cells of a backpack page. The default HUD's `backpackpanel.res` describes the
 * grid by a template cell (`modelpanels_kv`) plus a start and spacing, and the game makes the cells at run
 * time, so the scene has no panels for them. This works the positions out so the preview can show a full page
 * of items. Approximate (it follows the file's numbers, not the engine's code): 10 columns by 5 rows, which is
 * what the page's own page-button row sits under.
 */

import { propsOf } from '../kv/props';
import { kvAt } from '../kv/query';
import { scaled, type Rect } from '../layout/geometry';
import type { CondEnv } from '../scheme/cond';
import { parseCached } from './build';
import type { Scene } from './types';

export const BACKPACK_COLUMNS = 10;
export const BACKPACK_ROWS = 5;
const BACKPACK_FILE = /(^|\/)backpackpanel\.res$/i;

export interface BackpackCell {
  index: number;
  rect: Rect;
}

export function backpackGrid(
  scene: Scene,
  readText: (path: string) => string | undefined,
  env: CondEnv,
): BackpackCell[] {
  const panel = scene.nodes.find(
    (n) => BACKPACK_FILE.test(n.file) && n.keyPath[n.keyPath.length - 1] === 'backpack_panel',
  );
  if (!panel) return [];
  const text = readText(panel.file);
  if (text === undefined) return [];
  const entry = kvAt(parseCached(text), panel.keyPath);
  const cell = entry ? kvAt(entry, ['modelpanels_kv']) : undefined;
  if (!entry || !cell) return [];
  const props = propsOf(entry, { env });
  const cellProps = propsOf(cell, { env });
  const scale = scene.screen.h / 480;
  const w = scaled(cellProps.num('wide', 54), scale);
  const h = scaled(cellProps.num('tall', 42), scale);
  const x0 =
    panel.rect.x +
    Math.trunc(panel.rect.w / 2) +
    scaled(props.num('item_backpack_offcenter_x', -288), scale);
  const y0 = panel.rect.y + scaled(props.num('item_ypos', 60), scale);
  const dx = w + scaled(props.num('item_backpack_xdelta', 4), scale);
  const dy = h + scaled(props.num('item_backpack_ydelta', 3), scale);
  const out: BackpackCell[] = [];
  for (let r = 0; r < BACKPACK_ROWS; r++) {
    for (let c = 0; c < BACKPACK_COLUMNS; c++) {
      out.push({ index: r * BACKPACK_COLUMNS + c, rect: { x: x0 + c * dx, y: y0 + r * dy, w, h } });
    }
  }
  return out;
}
