import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildScene, type SceneContext } from '../scene/build';
import { backpackGrid, BACKPACK_COLUMNS, BACKPACK_ROWS } from '../scene/inventory';
import { PC_ENV } from '../scheme/cond';
import { parseScheme } from '../scheme/scheme';

const BASE = path.resolve(__dirname, '../../../public/tf2-hud/base');
const read = (p: string): string | undefined => {
  try {
    return readFileSync(path.join(BASE, p), 'utf8');
  } catch {
    return undefined;
  }
};

describe('backpack grid', () => {
  const scheme = parseScheme(read('resource/clientscheme.res')!, PC_ENV);
  const ctx = (w: number, h: number): SceneContext => ({
    readText: read,
    scheme,
    env: PC_ENV,
    screen: { w, h },
    minmode: false,
    showHidden: true,
    forceShown: new Set(),
    forceHidden: new Set(),
    vars: new Map(),
    strings: new Map(),
    progress: 0.5,
  });
  const files = ['resource/ui/econ/backpackpanel.res'];

  it('lays out a full page of cells from the panel file', () => {
    const scene = buildScene(ctx(1920, 1080), files);
    const cells = backpackGrid(scene, read, PC_ENV);
    expect(cells).toHaveLength(BACKPACK_COLUMNS * BACKPACK_ROWS);
    const scale = 1080 / 480;
    expect(cells[0].rect.w).toBe(Math.trunc(54 * scale));
    expect(cells[0].rect.h).toBe(Math.trunc(42 * scale));
    // Starts left of centre by the file's offset, and rows clear of one another.
    expect(cells[0].rect.x).toBe(960 + Math.trunc(-288 * scale));
    expect(cells[BACKPACK_COLUMNS].rect.y).toBeGreaterThanOrEqual(
      cells[0].rect.y + cells[0].rect.h,
    );
  });

  it('keeps the grid on the screen and above the page buttons, at any size', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1280, 720],
      [1024, 768],
    ] as const) {
      const cells = backpackGrid(buildScene(ctx(w, h), files), read, PC_ENV);
      const last = cells[cells.length - 1].rect;
      expect(cells[0].rect.x).toBeGreaterThanOrEqual(0);
      expect(last.x + last.w).toBeLessThanOrEqual(w);
      expect(last.y + last.h).toBeLessThanOrEqual(Math.trunc(288 * (h / 480)));
    }
  });

  it('returns nothing on a page without a backpack', () => {
    const scene = buildScene(ctx(1920, 1080), ['resource/ui/hudplayerhealth.res']);
    expect(backpackGrid(scene, read, PC_ENV)).toEqual([]);
  });
});

describe('model panels', () => {
  it('knows which controls the game draws models into', async () => {
    const { isModelPanel, classHint } = await import('../scene/model-panels');
    for (const c of [
      'CTFPlayerModelPanel',
      'CModelPanel',
      'CItemModelPanel',
      'CEmbeddedItemModelPanel',
      'CStorePreviewItemIcon',
    ]) {
      expect(isModelPanel(c), c).toBe(true);
    }
    for (const c of ['CExLabel', 'ImagePanel', 'CAvatarImagePanel'])
      expect(isModelPanel(c), c).toBe(false);
    expect(classHint('ClassModelPanel_Medic', 'scout')).toBe('medic');
    expect(classHint('modelpanel', 'sniper')).toBe('sniper');
  });
});
