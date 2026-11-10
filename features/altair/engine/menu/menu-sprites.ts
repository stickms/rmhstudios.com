// =============================================================================
// ALTAIR MENU -- Sprite data
// =============================================================================
// Original pixel art for the Outpost 13 palette, authored as text so it is
// reviewable in a diff and decodable anywhere (browser, worker, node script).
// One character per pixel; '.' is transparent. The key below is the card's
// palette (docs/game-design-schemes/altair.json) plus a few ramp steps.
//
// The same format feeds the in-game sheets later (scripts/altair/ can emit PNGs
// from these frames), so a sprite is drawn once and used by menu and game alike.
// =============================================================================

/** Palette key. Hex without alpha. */
export const SPRITE_PALETTE: Readonly<Record<string, string>> = {
  k: '#04080f', // void
  d: '#0a1b2a', // bulkhead
  n: '#0f3b52', // hull steel
  b: '#1c6482', // lit steel
  c: '#19d3da', // console cyan
  w: '#e6fbff', // instrument white
  g: '#8fb3bf', // fog
  a: '#ffb44d', // amber lamp
  o: '#8a4f0c', // amber shadow
  m: '#ff3db8', // hostile magenta
  p: '#7a1a63', // magenta shadow
};

export interface DecodedSprite {
  width: number;
  height: number;
  /** Packed little-endian RGBA (0xAABBGGRR), 0 where transparent. */
  pixels: Uint32Array;
}

function hexToPacked(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Decode one text frame. Throws on ragged rows or unknown keys so bad art fails loudly. */
export function decodeSprite(rows: readonly string[]): DecodedSprite {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const pixels = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (row.length !== width) {
      throw new Error(`sprite row ${y} is ${row.length} wide, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const key = row[x];
      if (key === '.') continue;
      const hex = SPRITE_PALETTE[key];
      if (!hex) throw new Error(`unknown sprite key '${key}' at ${x},${y}`);
      pixels[y * width + x] = hexToPacked(hex);
    }
  }
  return { width, height, pixels };
}

/**
 * The Echo: a suited figure standing in the doorway at the end of the corridor.
 * Drawn once; the scene flickers, fades and slices it.
 */
export const ECHO_FRAME: readonly string[] = [
  '....kkkkkk....',
  '...kddddddk...',
  '..kdnnnnnndk..',
  '..kdnccccnnk..',
  '..kdnccwcnnk..',
  '..kdnnccnnnk..',
  '...kdnnnnnk...',
  '....kkddkk....',
  '..kkddnnddkk..',
  '.kddnnbbnnddk.',
  '.kdnnnbbnnnnk.',
  '.kdnnbccbnnnk.',
  '.kdnnbbbbnnnk.',
  '.kdnnnnnnnnnk.',
  '.kddnnnnnnddk.',
  '..kdnk..kndk..',
  '..kdnk..kndk..',
  '..kdnk..kndk..',
  '..kddk..kddk..',
  '..kddk..kddk..',
  '.kdddk..kdddk.',
  '.kkkkk..kkkkk.',
];

/** The security drone's hover loop: eye pulse and thruster flicker (4 frames). */
export const DRONE_FRAMES: readonly (readonly string[])[] = [
  [
    '................',
    '.....kkkkkk.....',
    '...kkddnnddkk...',
    '..kdnnbbbbnndk..',
    '.kdnnbbmmbbnndk.',
    '.kdnnbbmmbbnndk.',
    '..kdnnbbbbnndk..',
    '...kkddddddkk...',
    '....km.kk.mk....',
    '.....m....m.....',
  ],
  [
    '................',
    '.....kkkkkk.....',
    '...kkddnnddkk...',
    '..kdnnbbbbnndk..',
    '.kdnnbbmmbbnndk.',
    '.kdnnbbwmbbnndk.',
    '..kdnnbbbbnndk..',
    '...kkddddddkk...',
    '....km.kk.mk....',
    '....mm....mm....',
  ],
  [
    '................',
    '.....kkkkkk.....',
    '...kkddnnddkk...',
    '..kdnnbbbbnndk..',
    '.kdnnbbwwbbnndk.',
    '.kdnnbbwwbbnndk.',
    '..kdnnbbbbnndk..',
    '...kkddddddkk...',
    '....kp.kk.pk....',
    '.....p....p.....',
  ],
  [
    '................',
    '.....kkkkkk.....',
    '...kkddnnddkk...',
    '..kdnnbbbbnndk..',
    '.kdnnbbmmbbnndk.',
    '.kdnnbbmwbbnndk.',
    '..kdnnbbbbnndk..',
    '...kkddddddkk...',
    '....km.kk.mk....',
    '....pm....mp....',
  ],
];
