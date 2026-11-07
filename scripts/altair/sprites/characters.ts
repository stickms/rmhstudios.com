/**
 * The eight Altair classes as palettes and accessories over the shared figure (figure.ts).
 *
 * Ids are save data (they live in saves, runs and leaderboards), so they never change; the names, art and
 * kits do. The ids and their new crew names:
 *   knight Vanguard · arcanist Arcwright · ranger Surveyor · plague_doctor Biotech · berserker Breacher
 *   necromancer Echo-Binder · chronomancer Dilator · hemomancer Hemosurgeon
 *
 * Allies read teal and cyan with an amber or white accent (hostiles are magenta, loot and hazards amber:
 * scripts/altair/grade-sprites.ts). What tells the classes apart at 16 px is the SILHOUETTE: a shield, an
 * antenna, a long scope, a respirator, a power axe, floating orbs, a halo, a blood-bag pack.
 */
import type { Accessories, Palette, Ramp, RGB, View } from './figure';
import type { Grid } from './figure';

const c = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const ramp = (a: string, b: string, d: string): Ramp => [c(a), c(b), c(d)];

const OUTLINE = c('#04121c');
const R = {
  suitTeal: ramp('#0b3347', '#14607a', '#2a8fa6'),
  suitNavy: ramp('#06141f', '#0f3b52', '#1c6482'),
  suitGraphite: ramp('#1c2830', '#34454f', '#566b78'),
  suitPale: ramp('#4d7a88', '#8fb3bf', '#d8f3f7'),
  helmSteel: ramp('#14607a', '#2a8fa6', '#9fe6ec'),
  helmDark: ramp('#0a2536', '#14607a', '#2a8fa6'),
  helmPale: ramp('#6b95a3', '#b9dde6', '#f1fdff'),
  visorCyan: ramp('#0b8d9a', '#19d3da', '#e6fbff'),
  visorAmber: ramp('#a85f00', '#ffb44d', '#fff1d6'),
  visorDark: ramp('#021018', '#06293a', '#0b8d9a'),
  trimAmber: ramp('#8a4f0c', '#d98a22', '#ffb44d'),
  trimWhite: ramp('#8fb3bf', '#e6fbff', '#ffffff'),
  trimCyan: ramp('#0b8d9a', '#19d3da', '#8ff3f6'),
  glove: ramp('#030c12', '#0a1b2a', '#12344a'),
  pack: ramp('#06141f', '#0f3b52', '#1c6482'),
  glowCyan: ramp('#0b8d9a', '#19d3da', '#e6fbff'),
  glowWhite: ramp('#8fb3bf', '#e6fbff', '#ffffff'),
  glowAmber: ramp('#d98a22', '#ffb44d', '#fff1d6'),
  prop: ramp('#34454f', '#8fb3bf', '#e6fbff'),
};

function pal(over: Partial<Record<keyof Palette, Ramp>>): Palette {
  return {
    suit: R.suitTeal,
    helmet: R.helmSteel,
    visor: R.visorCyan,
    trim: R.trimAmber,
    glove: R.glove,
    pack: R.pack,
    glow: R.glowCyan,
    prop: R.prop,
    outline: OUTLINE,
    ...over,
  } as Palette;
}

/** Where the head is, so accessories can hang off it. */
const headY = (v: View) => 4.5 + v.headDy;

export interface ClassArt {
  id: string;
  /** Sheet file under public/sprites/altair/characters/ */
  file: string;
  palette: Palette;
  accessories: Accessories;
}

export const CLASS_ART: readonly ClassArt[] = [
  {
    id: 'knight', // Vanguard: riot shield, heavy pauldrons, amber trim
    file: 'knight.png',
    palette: pal({ suit: R.suitNavy, helmet: R.helmSteel, trim: R.trimAmber }),
    accessories: {
      front: (g: Grid, v: View) => {
        if (v.dir === 'side') {
          g.rect(10, 8, 2, 6, 'prop');
          g.rect(10, 8, 1, 6, 'trim');
        } else {
          g.rect(2, 7, 3, 2, 'trim');
          g.rect(11, 7, 3, 2, 'trim');
          if (v.dir === 'down') {
            g.rect(0, 9, 3, 5, 'prop');
            g.rect(0, 9, 1, 5, 'trim');
          } else {
            g.rect(13, 9, 3, 5, 'prop');
          }
          g.rect(7, 1 + v.headDy, 2, 1, 'trim');
        }
      },
    },
  },
  {
    id: 'arcanist', // Arcwright: antenna and coil, glowing palms
    file: 'arcanist.png',
    palette: pal({ suit: R.suitTeal, helmet: R.helmPale, trim: R.trimWhite, glow: R.glowWhite }),
    accessories: {
      behind: (g: Grid, v: View) => {
        if (v.dir === 'side') {
          g.rect(4, 2, 1, 6, 'prop');
          g.put(4, 1, 'glow');
        } else {
          g.rect(7, 0, 1, 4, 'prop');
          g.put(7, 0, 'glow');
          g.put(8, 0, 'glow');
        }
      },
      front: (g: Grid, v: View) => {
        if (v.dir === 'down') {
          g.put(3, 11, 'glow');
          g.put(12, 11, 'glow');
        } else if (v.dir === 'side') {
          g.put(9, 11, 'glow');
        }
      },
    },
  },
  {
    id: 'ranger', // Surveyor: wide visor, long scope
    file: 'ranger.png',
    palette: pal({ suit: R.suitTeal, helmet: R.helmDark, visor: R.visorCyan, trim: R.trimCyan }),
    accessories: {
      front: (g: Grid, v: View) => {
        if (v.dir === 'down') {
          g.rect(4, 4 + v.headDy, 8, 2, 'visor');
          g.rect(12, 6, 1, 5, 'prop');
        } else if (v.dir === 'up') {
          g.rect(12, 5, 1, 6, 'prop');
          g.rect(7, 7, 2, 1, 'trim');
        } else {
          g.rect(10, 10, 5, 1, 'prop');
          g.put(14, 9, 'glow');
        }
      },
    },
  },
  {
    id: 'plague_doctor', // Biotech: respirator, filter tanks
    file: 'plague-doctor.png',
    palette: pal({ suit: R.suitGraphite, helmet: R.helmDark, visor: R.visorAmber, trim: R.trimAmber, glow: R.glowAmber }),
    accessories: {
      front: (g: Grid, v: View) => {
        if (v.dir === 'down') {
          g.rect(6, 6 + v.headDy, 4, 2, 'prop');
          g.put(6, 7 + v.headDy, 'trim');
          g.put(9, 7 + v.headDy, 'trim');
        } else if (v.dir === 'side') {
          g.rect(12, 5 + v.headDy, 2, 2, 'prop');
          g.rect(3, 8, 2, 4, 'trim');
        } else {
          g.rect(5, 8, 2, 4, 'trim');
          g.rect(9, 8, 2, 4, 'trim');
        }
      },
    },
  },
  {
    id: 'berserker', // Breacher: spiked pauldrons, power axe on the back
    file: 'berserker.png',
    palette: pal({ suit: R.suitGraphite, helmet: R.helmDark, visor: R.visorAmber, trim: R.trimAmber }),
    accessories: {
      behind: (g: Grid, v: View) => {
        if (v.dir === 'up') {
          g.rect(11, 3, 1, 9, 'prop');
          g.rect(10, 3, 3, 2, 'trim');
        } else if (v.dir === 'side') {
          g.rect(3, 3, 1, 9, 'prop');
          g.rect(2, 3, 3, 2, 'trim');
        }
      },
      front: (g: Grid, v: View) => {
        if (v.dir !== 'side') {
          g.rect(2, 7, 2, 2, 'prop');
          g.rect(12, 7, 2, 2, 'prop');
          g.put(2, 6, 'trim');
          g.put(13, 6, 'trim');
          g.rect(3, 10, 2, 2, 'glove');
          g.rect(11, 10, 2, 2, 'glove');
        } else {
          g.rect(7, 7, 2, 2, 'prop');
          g.put(8, 6, 'trim');
        }
      },
    },
  },
  {
    id: 'necromancer', // Echo-Binder: dark hood, orbiting Echoes
    file: 'necromancer.png',
    palette: pal({ suit: R.suitNavy, helmet: R.helmDark, visor: R.visorDark, trim: R.trimCyan, glow: R.glowCyan }),
    accessories: {
      front: (g: Grid, v: View) => {
        if (v.dir === 'down') {
          g.put(5, 5 + v.headDy, 'glow');
          g.put(10, 5 + v.headDy, 'glow');
        }
        // two Echoes circling at shoulder height; they swap sides on alternate frames
        const a = v.frame % 2 === 0;
        g.put(a ? 1 : 2, 7, 'glow');
        g.put(a ? 14 : 13, 10, 'glow');
      },
    },
  },
  {
    id: 'chronomancer', // Dilator: a halo of slowed time, chest hourglass
    file: 'chronomancer.png',
    palette: pal({ suit: R.suitNavy, helmet: R.helmSteel, visor: R.visorAmber, trim: R.trimAmber, glow: R.glowAmber }),
    accessories: {
      behind: (g: Grid, v: View) => {
        const cx = v.dir === 'side' ? 7.8 : 7.5;
        const cy = headY(v);
        for (let y = 0; y < 12; y++) {
          for (let x = 0; x < 16; x++) {
            const d = Math.hypot(x - cx, (y - cy) * 1.05);
            if (d > 4.3 && d < 5.4) g.put(x, y, 'glow');
          }
        }
      },
      front: (g: Grid, v: View) => {
        if (v.dir === 'down') {
          g.put(7, 9, 'glow');
          g.put(8, 9, 'glow');
        }
      },
    },
  },
  {
    id: 'hemomancer', // Hemosurgeon: surgical mask, blood-bag pack
    file: 'hemomancer.png',
    palette: pal({ suit: R.suitPale, helmet: R.helmPale, visor: R.visorCyan, trim: R.trimAmber, glow: R.glowAmber }),
    accessories: {
      behind: (g: Grid, v: View) => {
        if (v.dir === 'side') g.rect(3, 8, 3, 3, 'trim');
      },
      front: (g: Grid, v: View) => {
        if (v.dir === 'down') {
          g.rect(6, 6 + v.headDy, 4, 1, 'prop');
          g.put(7, 9, 'trim');
          g.put(8, 9, 'trim');
          g.put(7, 10, 'trim');
          g.put(8, 10, 'trim');
        } else if (v.dir === 'up') {
          g.rect(5, 8, 6, 3, 'trim');
        } else {
          g.rect(10, 5 + v.headDy, 2, 1, 'prop');
        }
      },
    },
  },
];
