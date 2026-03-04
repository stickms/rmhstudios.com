/**
 * Pixel-art sprite data and runtime texture generation for Dream Rift characters.
 *
 * Each sprite frame is a string grid where characters map to palette colors.
 * At init time, frames are rasterised onto an offscreen canvas and converted
 * to PixiJS Textures for use with Sprite objects.
 */

import { Texture } from 'pixi.js';
import type { Character } from './types';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** RGBA tuple [r, g, b, a] where each channel is 0-255. */
type RGBA = [number, number, number, number];

const REI_PALETTE: Record<string, RGBA> = {
  '.': [0, 0, 0, 0],           // transparent
  O: [14, 11, 26, 255],        // outline
  H: [28, 16, 48, 255],        // hair dark
  h: [48, 28, 72, 255],        // hair highlight
  R: [204, 17, 51, 255],       // deep red (bow, skirt)
  r: [255, 68, 102, 255],      // bright red (sleeves)
  W: [240, 232, 221, 255],     // white outfit
  w: [204, 197, 184, 255],     // white shadow
  S: [255, 213, 168, 255],     // skin
  s: [230, 176, 136, 255],     // skin shadow
  G: [212, 164, 74, 255],      // gold accent
  g: [168, 120, 48, 255],      // gold dark
  P: [139, 92, 246, 255],      // purple glow
  E: [20, 8, 30, 255],         // eye dark
  C: [34, 24, 40, 255],        // shoe dark
};

const YUME_PALETTE: Record<string, RGBA> = {
  '.': [0, 0, 0, 0],
  O: [8, 14, 26, 255],         // outline
  H: [16, 24, 56, 255],        // hair dark (blue-black)
  h: [28, 40, 88, 255],        // hair highlight
  R: [51, 102, 204, 255],      // deep blue (bow, skirt)
  r: [102, 170, 255, 255],     // bright blue (sleeves)
  W: [232, 236, 244, 255],     // white outfit
  w: [192, 200, 216, 255],     // white shadow
  S: [255, 213, 168, 255],     // skin
  s: [230, 176, 136, 255],     // skin shadow
  G: [212, 164, 74, 255],      // gold accent
  g: [168, 120, 48, 255],      // gold dark
  P: [100, 200, 255, 255],     // cyan glow
  E: [8, 14, 30, 255],         // eye dark
  C: [24, 28, 48, 255],        // shoe dark
};

// ---------------------------------------------------------------------------
// Sprite frame data — 24 wide × 32 tall
// ---------------------------------------------------------------------------

/**
 * Rei: Shrine maiden — dark hair, red hair ribbon, white blouse with gold
 * trim, large red detached sleeves, red hakama/skirt. Facing the player
 * (toward bottom of screen) in classic Touhou perspective.
 */
const REI_IDLE_1: string[] = [
  /* 0 */ '........................',
  /* 1 */ '........OhhhhO..........',
  /* 2 */ '.......OHhhhhhO.........',
  /* 3 */ '......OHHhhhhHHO........',
  /* 4 */ '.....OHHHhhHHHHHO.......',
  /* 5 */ '....OHHHHHHHHHHHO.......',
  /* 6 */ '..RROHHSSSSSHHORRr......',
  /* 7 */ '.RRRROHSSSSSSHORRRr.....',
  /* 8 */ '..RR.OHSEsSESHO.RR......',
  /* 9 */ '.....OHSsSSsSHO.........',
  /*10 */ '.....OHHSSSSHHO.........',
  /*11 */ '......OHhSShHO..........',
  /*12 */ '.......O.WW.O...........',
  /*13 */ '......HO.WW..OH.........',
  /*14 */ '....rrOH.Ww..OHOrr......',
  /*15 */ '...rrrOHGWwWGHO.rrr.....',
  /*16 */ '..rrrrO.GWWWG.O.rrrr....',
  /*17 */ '..rrrrO.GWwWG.O.rrrr....',
  /*18 */ '...rrrO.GWWWG.O.rrr.....',
  /*19 */ '....rrO..WwW..O.rr......',
  /*20 */ '.....OO..WW...OO........',
  /*21 */ '........GggG............',
  /*22 */ '.......ORRRRRO..........',
  /*23 */ '......ORRRRRRRO.........',
  /*24 */ '.....ORRRRRRRRRO........',
  /*25 */ '.....ORRRRRRRRRO........',
  /*26 */ '......ORRRRRRRO.........',
  /*27 */ '.......ORRRRRO..........',
  /*28 */ '.......OS..SO...........',
  /*29 */ '......OSs..sSO..........',
  /*30 */ '......OCC..CCO..........',
  /*31 */ '........................',
];

/** Idle 2 — slight float upward, hair sways right. */
const REI_IDLE_2: string[] = [
  /* 0 */ '........................',
  /* 1 */ '.........OhhhhO.........',
  /* 2 */ '........OHhhhhhO........',
  /* 3 */ '.......OHHhhhhHHO.......',
  /* 4 */ '......OHHHhhHHHHHO......',
  /* 5 */ '.....OHHHHHHHHHHHO......',
  /* 6 */ '..RR.OHHSSSSSHHORRr.....',
  /* 7 */ '.RRRROHSSSSSSHORRRr.....',
  /* 8 */ '..RR.OHSEsSESHO.RR......',
  /* 9 */ '.....OHSsSSsSHO.........',
  /*10 */ '.....OHHSSSSHHO.........',
  /*11 */ '......OHhSShHO..........',
  /*12 */ '.......O.WW.O...........',
  /*13 */ '......HO.WW..OH.........',
  /*14 */ '...rrOH..Ww..OHOrr......',
  /*15 */ '..rrrOHGWwwWGHO.rrr.....',
  /*16 */ '.rrrrO.GWWWWG.O.rrrr....',
  /*17 */ '.rrrrO.GWwwWG.O.rrrr....',
  /*18 */ '..rrrO.GWWWWG.O.rrr.....',
  /*19 */ '...rrO..WwwW..O.rr......',
  /*20 */ '....OO...WW...OO........',
  /*21 */ '........GggG............',
  /*22 */ '.......ORRRRRO..........',
  /*23 */ '......ORRRRRRRO.........',
  /*24 */ '.....ORRRRRRRRRO........',
  /*25 */ '.....ORRRRRRRRRO........',
  /*26 */ '......ORRRRRRRO.........',
  /*27 */ '.......ORRRRRO..........',
  /*28 */ '.......OS..SO...........',
  /*29 */ '......OSs..sSO..........',
  /*30 */ '......OCC..CCO..........',
  /*31 */ '........................',
];

/** Move left — lean left, sleeves shift. */
const REI_LEFT: string[] = [
  '........................',
  '.......OhhhhO...........',
  '......OHhhhhhO..........',
  '.....OHHhhhhHHO.........',
  '....OHHHhhHHHHHO........',
  '...OHHHHHHHHHHHO........',
  '.RROHHSSSSSHHORRr.......',
  'RRRROHSSSSSSHORRRr......',
  '.RR.OHSEsSESHO.RR.......',
  '....OHSsSSsSHO..........',
  '....OHHSSSSHHO..........',
  '.....OHhSShHO...........',
  '......O.WW.O............',
  '.....HO.WW.OH...........',
  '..rrOH..Ww..OHOrr.......',
  '.rrrOHGWwwWGHO.rrr......',
  'rrrrO.GWWWWG.O..rrrr....',
  'rrrrO.GWwwWG.O..rrrr....',
  '.rrrO.GWWWWG.O.rrr......',
  '..rrO..WwwW..Orr........',
  '...OO...WW...OO.........',
  '.......GggG.............',
  '......ORRRRRO...........',
  '.....ORRRRRRRO..........',
  '....ORRRRRRRRRO.........',
  '....ORRRRRRRRRO.........',
  '.....ORRRRRRRO..........',
  '......ORRRRRO...........',
  '......OS..SO............',
  '.....OSs..sSO...........',
  '.....OCC..CCO...........',
  '........................',
];

/** Move right — lean right, sleeves shift. */
const REI_RIGHT: string[] = [
  '........................',
  '..........OhhhhO........',
  '.........OHhhhhhO.......',
  '........OHHhhhhHHO......',
  '.......OHHHhhHHHHHO.....',
  '......OHHHHHHHHHHHO.....',
  '.....RROHHSSSSSHHORRr...',
  '....RRRROHSSSSSSHORRRr..',
  '.....RR.OHSEsSESHO.RR...',
  '.......OHSsSSsSHO.......',
  '.......OHHSSSSHHO.......',
  '........OHhSShHO........',
  '.........O.WW.O.........',
  '........HO.WW.OH........',
  '......rrOH.Ww..OHOrr....',
  '.....rrr.OGWwWGHOrrr....',
  '....rrrr..OGWWWG.Orrrr..',
  '....rrrr..OGWwWG.Orrrr..',
  '.....rrr..OGWWWG.Orrr...',
  '......rrO..WwwW..Orr....',
  '.......OO...WW...OO.....',
  '.........GggG...........',
  '........ORRRRRO.........',
  '.......ORRRRRRRO........',
  '......ORRRRRRRRRO.......',
  '......ORRRRRRRRRO.......',
  '.......ORRRRRRRO........',
  '........ORRRRRO.........',
  '........OS..SO..........',
  '.......OSs..sSO.........',
  '.......OCC..CCO.........',
  '........................',
];

// Yume uses the same frame shapes — palette swap handles the colors
const YUME_IDLE_1 = REI_IDLE_1;
const YUME_IDLE_2 = REI_IDLE_2;
const YUME_LEFT = REI_LEFT;
const YUME_RIGHT = REI_RIGHT;

// ---------------------------------------------------------------------------
// Frame sets
// ---------------------------------------------------------------------------

export interface SpriteFrameSet {
  idle: string[][];     // frames to cycle during idle (bob animation)
  left: string[];       // leaning left frame
  right: string[];      // leaning right frame
  width: number;
  height: number;
}

const REI_FRAMES: SpriteFrameSet = {
  idle: [REI_IDLE_1, REI_IDLE_2, REI_IDLE_1, REI_IDLE_2],
  left: REI_LEFT,
  right: REI_RIGHT,
  width: 24,
  height: 32,
};

const YUME_FRAMES: SpriteFrameSet = {
  idle: [YUME_IDLE_1, YUME_IDLE_2, YUME_IDLE_1, YUME_IDLE_2],
  left: YUME_LEFT,
  right: YUME_RIGHT,
  width: 24,
  height: 32,
};

export const CHARACTER_FRAMES: Record<Character, SpriteFrameSet> = {
  rei: REI_FRAMES,
  yume: YUME_FRAMES,
};

const CHARACTER_PALETTES: Record<Character, Record<string, RGBA>> = {
  rei: REI_PALETTE,
  yume: YUME_PALETTE,
};

// ---------------------------------------------------------------------------
// Texture generation
// ---------------------------------------------------------------------------

/** Rasterise a single frame grid to an offscreen canvas and return it. */
function rasteriseFrame(
  grid: string[],
  palette: Record<string, RGBA>,
  w: number,
  h: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  for (let row = 0; row < h; row++) {
    const line = grid[row] ?? '';
    for (let col = 0; col < w; col++) {
      const ch = col < line.length ? line[col] : '.';
      const rgba = palette[ch] ?? palette['.'];
      const idx = (row * w + col) * 4;
      data[idx] = rgba[0];
      data[idx + 1] = rgba[1];
      data[idx + 2] = rgba[2];
      data[idx + 3] = rgba[3];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export interface PlayerTextures {
  idle: Texture[];
  left: Texture;
  right: Texture;
  width: number;
  height: number;
}

/**
 * Generate all animation textures for a character. Call once during engine
 * init. The returned textures are PixiJS-ready and can be set on a Sprite.
 */
export function generatePlayerTextures(character: Character): PlayerTextures {
  const frames = CHARACTER_FRAMES[character];
  const palette = CHARACTER_PALETTES[character];
  const { width, height } = frames;

  const idle = frames.idle.map((grid) => {
    const canvas = rasteriseFrame(grid, palette, width, height);
    return Texture.from({ resource: canvas, label: `${character}-idle` });
  });

  const leftCanvas = rasteriseFrame(frames.left, palette, width, height);
  const rightCanvas = rasteriseFrame(frames.right, palette, width, height);

  return {
    idle,
    left: Texture.from({ resource: leftCanvas, label: `${character}-left` }),
    right: Texture.from({ resource: rightCanvas, label: `${character}-right` }),
    width,
    height,
  };
}
