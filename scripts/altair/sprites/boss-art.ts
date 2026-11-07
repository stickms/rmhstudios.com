/**
 * The four Altair bosses as original 32x32 sprites (the engine reads boss sheets as 4 columns = DOWN, UP,
 * LEFT, RIGHT by 3 rows of walk frames = 128x96). Same Grid/shade pipeline and part slots as the enemies
 * (creatures.ts): suit = body, helmet = shell, visor = eyes, trim = accent, glove = dark underside,
 * pack = secondary, glow = emissive, prop = tool.
 *
 *   hollow_king The Hollow Director · crimson_countess The Crimson Matron
 *   elder_lich_malachar Conductor Malachar · terminus Terminus, The Undying
 */
import { Grid, shade, DIRS, type Dir, type Palette, type Ramp, type RGB } from './figure';

const N = 32;
const ROWS = 3;
const c = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const ramp = (a: string, b: string, d: string): Ramp => [c(a), c(b), c(d)];

type D3 = 'down' | 'up' | 'side';
type Draw = (g: Grid, d: D3, f: number) => void;

const bob = (f: number) => (f === 1 ? 1 : 0);
const sway = (f: number) => (f === 0 ? -1 : f === 2 ? 1 : 0);

function pal(over: Partial<Record<keyof Palette, Ramp>>): Palette {
  return {
    suit: ramp('#3a0f33', '#7a1a63', '#b8338f'),
    helmet: ramp('#7a1a63', '#d63aa8', '#ffa8e6'),
    visor: ramp('#a85f00', '#ffb44d', '#fff1d6'),
    trim: ramp('#8a4f0c', '#d98a22', '#ffb44d'),
    glove: ramp('#0c0208', '#240a1c', '#4a1639'),
    pack: ramp('#16040f', '#3d0f32', '#6e2459'),
    glow: ramp('#c42a98', '#ff6fd0', '#fff0fa'),
    prop: ramp('#3d0f32', '#8c4a7e', '#d9a0cb'),
    outline: c('#10020b'),
    ...over,
  } as Palette;
}

const ART: { id: string; file: string; palette: Palette; draw: Draw }[] = [
  {
    id: 'hollow_king', // The Hollow Director: an empty command frame, arc blade, a crown of aerials
    file: 'hollow-king.png',
    palette: pal({}),
    draw: (g, d, f) => {
      const b = bob(f);
      const s = sway(f);
      // legs
      g.rect(10, 24 + b, 4, 7 - b, 'suit');
      g.rect(18, 24 + b, 4, 7 - b, 'suit');
      g.rect(9, 30, 5, 2, 'glove');
      g.rect(18, 30, 5, 2, 'glove');
      // long coat
      g.rect(8, 11 + b, 16, 15, 'suit');
      g.rect(10, 24 + b, 12, 3, 'pack');
      g.rect(6, 10 + b, 20, 4, 'helmet'); // shoulders
      g.rect(4, 10 + b, 3, 6, 'trim');
      g.rect(25, 10 + b, 3, 6, 'trim');
      g.rect(14, 14 + b, 4, 10, 'trim'); // sash
      // head: a hollow helmet
      g.ellipse(16, 6 + b, 5.2, 5.4, 'helmet');
      g.ellipse(16, 7 + b, 3.2, 3.2, 'glove');
      if (d !== 'up') {
        g.put(14, 7 + b, 'visor');
        g.put(18, 7 + b, 'visor');
        g.put(15, 8 + b, 'visor');
        g.put(17, 8 + b, 'visor');
      }
      // crown of aerials
      for (let i = 0; i < 5; i++) {
        g.rect(11 + i * 2, 0 + (i % 2) + b, 1, 3 - (i % 2), 'prop');
        g.put(11 + i * 2, (i % 2) + b, 'glow');
      }
      // arms and the arc blade
      if (d === 'side') {
        g.rect(20, 13 + b, 4, 3, 'suit');
        g.rect(23, 6 + b + s, 2, 18, 'prop');
        g.rect(23, 4 + b + s, 2, 3, 'glow');
      } else {
        g.rect(2, 14 + b + s, 4, 8, 'suit');
        g.rect(2, 22 + b + s, 4, 3, 'glove');
        g.rect(26, 14 + b - s, 4, 8, 'suit');
        g.rect(26, 22 + b - s, 4, 3, 'glove');
        g.rect(28, 3 + b - s, 2, 21, 'prop');
        g.rect(28, 1 + b - s, 2, 4, 'glow');
      }
      for (let x = 9; x < 23; x += 3) g.put(x + (f % 2), 27 + b, 'glow'); // static along the hem
    },
  },
  {
    id: 'crimson_countess', // The Crimson Matron: a hovering leech-queen in red mist with cable wings
    file: 'crimson-countess.png',
    palette: pal({
      suit: ramp('#4a0a24', '#a3103f', '#ff3d7f'),
      helmet: ramp('#8c1a4a', '#ff3db8', '#ffc2e8'),
      glow: ramp('#c4102a', '#ff5a7a', '#fff0f4'),
      trim: ramp('#8a4f0c', '#ffb44d', '#fff1d6'),
    }),
    draw: (g, d, f) => {
      const b = bob(f);
      const w = f === 1 ? 3 : 0;
      // mist skirt
      for (let y = 18; y < 31; y++) {
        const half = 4 + Math.floor((y - 18) * 0.7);
        for (let x = 16 - half; x <= 16 + half; x++) if ((x * 7 + y * 13 + f * 5) % 5 > 1) g.put(x, y, 'glow');
      }
      g.ellipse(16, 17 + b, 5.2, 7, 'suit');
      g.rect(12, 18 + b, 8, 3, 'trim');
      // wings: spread cables
      if (d !== 'side') {
        for (let i = 0; i < 6; i++) {
          g.rect(3 + i, 8 + i * 2 + b - w + (i > 2 ? w : 0), 1, 8 - i, 'pack');
          g.rect(28 - i, 8 + i * 2 + b - w + (i > 2 ? w : 0), 1, 8 - i, 'pack');
        }
        g.rect(4, 10 + b - w, 7, 2, 'helmet');
        g.rect(21, 10 + b - w, 7, 2, 'helmet');
      } else {
        g.rect(6, 9 + b - w, 9, 2, 'helmet');
        g.rect(5, 11 + b - w, 3, 9, 'pack');
      }
      // head
      g.ellipse(16, 8 + b, 4.4, 4.6, 'helmet');
      g.rect(13, 3 + b, 1, 3, 'prop');
      g.rect(18, 3 + b, 1, 3, 'prop');
      if (d !== 'up') {
        g.rect(13, 8 + b, 2, 1, 'visor');
        g.rect(17, 8 + b, 2, 1, 'visor');
        g.rect(15, 11 + b, 2, 1, 'glove');
      }
    },
  },
  {
    id: 'elder_lich_malachar', // Conductor Malachar: robed, floating, a baton and a ring of core orbs
    file: 'elder-lich.png',
    palette: pal({
      suit: ramp('#241028', '#5a2a66', '#9a4aa8'),
      helmet: ramp('#8c4a9e', '#d98ae6', '#f8e2ff'),
      glow: ramp('#9a4aa8', '#e6a8f0', '#ffffff'),
      trim: ramp('#8a4f0c', '#ffb44d', '#fff1d6'),
    }),
    draw: (g, d, f) => {
      const b = bob(f);
      // robe, tapering to a point
      for (let y = 10; y < 31; y++) {
        const half = 4 + Math.floor((y - 10) * 0.45);
        g.rect(16 - half, y + (y > 26 ? 0 : b), half * 2, 1, y % 5 === 0 ? 'pack' : 'suit');
      }
      g.rect(14, 14 + b, 4, 12, 'trim');
      // head
      g.ellipse(16, 7 + b, 4.4, 4.8, 'helmet');
      g.ellipse(16, 8 + b, 2.8, 3, 'glove');
      if (d !== 'up') {
        g.put(15, 8 + b, 'visor');
        g.put(17, 8 + b, 'visor');
      }
      // baton arm
      const sw = sway(f);
      if (d === 'side') {
        g.rect(19, 13 + b, 5, 2, 'suit');
        g.rect(24, 5 + b + sw, 1, 11, 'prop');
        g.put(24, 4 + b + sw, 'glow');
      } else {
        g.rect(22, 12 + b, 5, 2, 'suit');
        g.rect(27, 4 + b + sw, 1, 12, 'prop');
        g.put(27, 3 + b + sw, 'glow');
        g.rect(5, 13 + b, 5, 2, 'suit');
      }
      // ring of core orbs, rotating
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + f * 0.5;
        const x = 16 + Math.cos(a) * 12;
        const y = 17 + b + Math.sin(a) * 4.5;
        g.rect(x - 1, y - 1, 2, 2, 'glow');
      }
    },
  },
  {
    id: 'terminus', // Terminus: a heap of every fallen Echo — scrap, static, many eyes, one mouth
    file: 'terminus.png',
    palette: pal({
      suit: ramp('#1c0616', '#4a1239', '#8a2a70'),
      helmet: ramp('#5c1450', '#c42a98', '#ff9ee0'),
      trim: ramp('#8a4f0c', '#ffb44d', '#fff1d6'),
      visor: ramp('#c9a0ba', '#fff0fa', '#ffffff'),
    }),
    draw: (g, d, f) => {
      const b = bob(f);
      const s = sway(f);
      g.ellipse(16, 20 + b, 14, 10.5, 'suit');
      // piled limbs and plates
      for (let i = 0; i < 7; i++) {
        const x = 3 + i * 4 + ((i + f) % 2);
        g.rect(x, 9 + ((i * 3) % 5) + b, 3, 6 + (i % 3), i % 2 ? 'helmet' : 'pack');
      }
      g.rect(1, 22 + b + s, 4, 3, 'helmet');
      g.rect(27, 22 + b - s, 4, 3, 'helmet');
      for (let x = 3; x < 29; x += 2) g.put(x, 29 + (((x >> 1) + f) % 2), 'suit');
      if (d !== 'up') {
        // eyes across the heap
        const eyes: [number, number][] = [[9, 14], [14, 11], [19, 11], [23, 15], [12, 18], [20, 18], [6, 20], [26, 21]];
        eyes.forEach(([x, y], i) => {
          g.rect(x, y + b, 2, 2, 'visor');
          if ((i + f) % 3 === 0) g.put(x, y + b, 'trim');
        });
        // the mouth
        g.rect(11, 23 + b, 10, 4, 'glove');
        for (let x = 11; x < 21; x += 2) g.put(x, 23 + b, 'visor');
        for (let x = 12; x < 21; x += 2) g.put(x, 26 + b, 'visor');
        g.rect(14, 24 + b, 4, 2, f % 2 ? 'trim' : 'glow');
      } else {
        for (let i = 0; i < 5; i++) g.rect(7 + i * 4, 18 + b, 2, 5, 'trim');
      }
    },
  },
];

function frame(draw: Draw, palette: Palette, dir: Dir, f: number): Uint8ClampedArray {
  const g = new Grid(N);
  draw(g, dir === 'left' || dir === 'right' ? 'side' : dir, f);
  const px = shade(g, palette);
  if (dir !== 'left') return px;
  const m = new Uint8ClampedArray(px.length);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const s = (y * N + x) * 4;
      const t = (y * N + (N - 1 - x)) * 4;
      m[t] = px[s];
      m[t + 1] = px[s + 1];
      m[t + 2] = px[s + 2];
      m[t + 3] = px[s + 3];
    }
  }
  return m;
}

export const BOSS_SHEET = { width: N * 4, height: N * ROWS };

export function renderBossSheet(draw: Draw, palette: Palette): Uint8ClampedArray {
  const W = N * 4;
  const sheet = new Uint8ClampedArray(W * N * ROWS * 4);
  DIRS.forEach((dir, col) => {
    for (let row = 0; row < ROWS; row++) {
      const px = frame(draw, palette, dir, row);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const s = (y * N + x) * 4;
          const t = ((row * N + y) * W + col * N + x) * 4;
          sheet[t] = px[s];
          sheet[t + 1] = px[s + 1];
          sheet[t + 2] = px[s + 2];
          sheet[t + 3] = px[s + 3];
        }
      }
    }
  });
  return sheet;
}

export const BOSS_ART = ART;
