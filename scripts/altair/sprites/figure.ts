/**
 * Altair character figure renderer.
 *
 * Draws a 16x16 top-down-ish humanoid (helmeted crew member) in four directions and a four-frame walk
 * cycle from a handful of shape primitives, so eight classes share one body and differ by palette and
 * accessories instead of 128 hand-placed frames. The art is original and in the Outpost 13 palette
 * (docs/game-design-schemes/altair.json): allies are teal and cyan, with an amber or white accent.
 *
 * Pipeline: shapes are painted into a 16x16 grid of PART ids, one lighting rule shades each part (light
 * from the top-left: a lit edge where the pixel above or left is empty or another part, a shadow where
 * the pixel below or right is), and an outline pass darkens every empty pixel that touches the figure.
 *
 * Sheet layout, as the engine expects (lib/altair/engine/sprites/sprite-defs.ts): 4 columns = directions
 * DOWN, UP, LEFT, RIGHT; 4 rows = walk frames. Frame index = row * 4 + col. LEFT is RIGHT mirrored.
 */

export type RGB = readonly [number, number, number];
/** [shadow, mid, light] */
export type Ramp = readonly [RGB, RGB, RGB];

export const SIZE = 16;

export type Part = 'suit' | 'helmet' | 'visor' | 'trim' | 'glove' | 'pack' | 'glow' | 'prop';
export const PARTS: readonly Part[] = ['suit', 'helmet', 'visor', 'trim', 'glove', 'pack', 'glow', 'prop'];

export type Palette = Record<Part, Ramp> & { outline: RGB };

export type Dir = 'down' | 'up' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['down', 'up', 'left', 'right'];

/** What a class adds to the shared body. Each hook paints extra shapes for one view. */
export interface Accessories {
  /** Drawn behind the body (packs, capes, halos). */
  behind?: (g: Grid, view: View) => void;
  /** Drawn over the body (shields, pauldrons, masks, held items). */
  front?: (g: Grid, view: View) => void;
}

export interface View {
  dir: 'down' | 'up' | 'side';
  frame: number;
  /** Where the head sits (it dips a pixel on contact frames). */
  headDy: number;
}

export class Grid {
  readonly parts: (Part | null)[] = new Array(SIZE * SIZE).fill(null);
  put(x: number, y: number, part: Part): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    this.parts[y * SIZE + x] = part;
  }
  rect(x: number, y: number, w: number, h: number, part: Part): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, part);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, part: Part): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.05) this.put(x, y, part);
      }
    }
  }
  at(x: number, y: number): Part | null {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
    return this.parts[y * SIZE + x];
  }
}

/**
 * The shared body for one view and frame, before accessories.
 *
 * Walk cycle (frames 0..3): 0 and 2 are CONTACT frames (a foot lands, the body dips a pixel, the lifted foot
 * is clearly off the ground); 1 and 3 are PASSING frames (standing tall, feet together). In profile the legs
 * stride wide on contact and close on passing, and the near arm swings opposite the near leg.
 */
function body(g: Grid, v: View, behind: boolean): void {
  const f = v.frame;
  const dip = f % 2 === 0 ? 1 : 0;
  const hy = v.headDy;
  if (v.dir === 'down' || v.dir === 'up') {
    if (behind) return;
    const front = v.dir === 'down';
    const liftL = f === 0; // left foot off the ground
    const liftR = f === 2;
    // legs: shorter on contact (the body is lower), the lifted one a stub with its foot raised
    const legTop = 12 + dip;
    const legLen = 14 - legTop;
    if (!liftL) {
      g.rect(5, legTop, 3, legLen, 'suit');
      g.rect(5, 14, 3, 1, 'glove');
    } else {
      g.rect(5, 13, 3, 1, 'glove');
    }
    if (!liftR) {
      g.rect(8, legTop, 3, legLen, 'suit');
      g.rect(8, 14, 3, 1, 'glove');
    } else {
      g.rect(8, 13, 3, 1, 'glove');
    }
    // torso and shoulders, dipping with the step
    g.rect(5, 8 + dip, 6, 4, 'suit');
    g.rect(4, 8 + dip, 8, 1, 'suit');
    // arms swing opposite the lifted foot
    // contact frames swing the arm opposite the lifted foot; passing frames drop the arm on the side
    // the foot is about to lift, so frames 1 and 3 are mirror images rather than copies
    const aL = liftR ? -1 : liftL ? 1 : f === 1 ? 1 : 0;
    const aR = liftL ? -1 : liftR ? 1 : f === 3 ? 1 : 0;
    g.rect(3, 9 + dip + aL, 2, 3, 'suit');
    g.rect(11, 9 + dip + aR, 2, 3, 'suit');
    g.rect(3, 11 + dip + aL, 2, 1, 'glove');
    g.rect(11, 11 + dip + aR, 2, 1, 'glove');
    g.rect(6, 10 + dip, 4, 1, 'trim');
    // the passing foot trails one pixel outward
    if (f === 1) g.put(4, 14, 'glove');
    if (f === 3) g.put(11, 14, 'glove');
    // head
    g.ellipse(7.5, 4.5 + hy, 3.7, 3.6, 'helmet');
    if (front) {
      g.rect(5, 4 + hy, 6, 2, 'visor');
      g.rect(6, 6 + hy, 4, 1, 'helmet');
    } else {
      g.rect(6, 3 + hy, 4, 1, 'trim');
    }
  } else {
    // side view, facing right
    if (behind) {
      g.rect(3, 8 + dip, 3, 4, 'pack');
      return;
    }
    // stride: wide on contact, together on passing. The far leg is the dark 'pack' ramp and the near leg the
    // suit, so which one leads reads even at 16 px. Frame 0: near leg forward; frame 2: near leg back; on the
    // passing frames the near foot (1) or the far foot (3) is lifted as it swings through.
    const legTop = 12 + dip;
    const legLen = 14 - legTop;
    const nearX = f === 0 ? 9 : f === 2 ? 5 : 7;
    const farX = f === 0 ? 5 : f === 2 ? 9 : 7;
    const leg = (x: number, part: 'suit' | 'pack', lift: boolean) => {
      const len = lift ? legLen - 1 : legLen;
      g.rect(x, legTop, 2, len, part);
      g.rect(x, legTop + len, 2, 1, 'glove');
    };
    leg(farX, 'pack', f === 3);
    leg(nearX, 'suit', f === 1);
    g.rect(6, 8 + dip, 4, 4, 'suit');
    g.rect(6, 10 + dip, 4, 1, 'trim');
    // near arm swings opposite the leading leg
    const ax = 7 + (f === 0 ? -2 : f === 2 ? 2 : 0);
    g.rect(ax, 9 + dip, 2, 3, 'suit');
    g.rect(ax, 11 + dip, 2, 1, 'glove');
    // head, visor on the right
    g.ellipse(7.8, 4.5 + hy, 3.3, 3.6, 'helmet');
    g.rect(9, 4 + hy, 3, 2, 'visor');
  }
}

function shade(grid: Grid, palette: Palette): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const lit = (x: number, y: number, p: Part) => {
    const a = grid.at(x, y - 1);
    const b = grid.at(x - 1, y);
    return a !== p || b !== p;
  };
  const shadowed = (x: number, y: number, p: Part) => {
    const a = grid.at(x, y + 1);
    const b = grid.at(x + 1, y);
    return a !== p || b !== p;
  };
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const p = grid.at(x, y);
      const i = (y * SIZE + x) * 4;
      if (p) {
        const ramp = palette[p];
        let c = ramp[1];
        if (p === 'visor' || p === 'glow') c = lit(x, y, p) ? ramp[2] : ramp[1];
        else if (lit(x, y, p) && !shadowed(x, y, p)) c = ramp[2];
        else if (shadowed(x, y, p) && !lit(x, y, p)) c = ramp[0];
        out[i] = c[0];
        out[i + 1] = c[1];
        out[i + 2] = c[2];
        out[i + 3] = 255;
      } else {
        // outline: an empty pixel touching the figure (4-neighbourhood)
        const near = grid.at(x - 1, y) || grid.at(x + 1, y) || grid.at(x, y - 1) || grid.at(x, y + 1);
        if (near) {
          const o = palette.outline;
          out[i] = o[0];
          out[i + 1] = o[1];
          out[i + 2] = o[2];
          out[i + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** One frame as RGBA. `dir` 'left' is the right-facing frame mirrored. */
export function renderFrame(dir: Dir, frame: number, palette: Palette, acc: Accessories): Uint8ClampedArray {
  const view: View = { dir: dir === 'left' || dir === 'right' ? 'side' : dir, frame, headDy: frame % 2 === 0 ? 1 : 0 };
  const g = new Grid();
  acc.behind?.(g, view);
  body(g, view, true);
  body(g, view, false);
  acc.front?.(g, view);
  const px = shade(g, palette);
  if (dir !== 'left') return px;
  const m = new Uint8ClampedArray(px.length);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const s = (y * SIZE + x) * 4;
      const d = (y * SIZE + (SIZE - 1 - x)) * 4;
      m[d] = px[s];
      m[d + 1] = px[s + 1];
      m[d + 2] = px[s + 2];
      m[d + 3] = px[s + 3];
    }
  }
  return m;
}

/** The full 64x64 sheet: columns DOWN, UP, LEFT, RIGHT; rows are walk frames. */
export function renderSheet(palette: Palette, acc: Accessories): Uint8ClampedArray {
  const W = SIZE * 4;
  const sheet = new Uint8ClampedArray(W * W * 4);
  DIRS.forEach((dir, col) => {
    for (let row = 0; row < 4; row++) {
      const px = renderFrame(dir, row, palette, acc);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const s = (y * SIZE + x) * 4;
          const d = ((row * SIZE + y) * W + col * SIZE + x) * 4;
          sheet[d] = px[s];
          sheet[d + 1] = px[s + 1];
          sheet[d + 2] = px[s + 2];
          sheet[d + 3] = px[s + 3];
        }
      }
    }
  });
  return sheet;
}
