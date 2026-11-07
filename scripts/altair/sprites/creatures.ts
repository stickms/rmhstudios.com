/**
 * The sixteen Altair enemies as original 16x16 sprites, drawn with the same Grid/shade pipeline as the crew
 * (figure.ts). Hostiles are magenta and plum with an amber or white-hot eye; the allegiance code is the one in
 * scripts/altair/grade-sprites.ts (cyan allies, magenta hostiles, amber loot and hazards). Parts are reused as
 * generic colour slots: suit = body, helmet = shell, visor = eyes, trim = accent, glove = dark underside,
 * pack = secondary, glow = emissive, prop = tool or limb.
 *
 * Ids are save data and never change; the names are the Outpost 13 cast. Sheet layout as the engine expects:
 * 4 columns = DOWN, UP, LEFT, RIGHT; 4 rows = walk frames (LEFT is RIGHT mirrored).
 *
 *   shambler Husk · bat Flicker · skeleton_warrior Rigger · ghost Static · werewolf Stalker · cultist Relay
 *   swarm_rat Mite · witch Jammer · bone_golem Bulkhead · shadow Blind Spot · vampire_noble Siphon
 *   arcane_construct Lattice · plague_bearer Bloat · death_knight Warden · banshee Shriek · lich Conductor
 */
import { Grid, shade, SIZE, DIRS, type Dir, type Palette, type Ramp, type RGB } from './figure';

const c = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const ramp = (a: string, b: string, d: string): Ramp => [c(a), c(b), c(d)];

const H = {
  bodyPlum: ramp('#3a0f33', '#7a1a63', '#b8338f'),
  bodyMag: ramp('#5c1450', '#c42a98', '#ff6fd0'),
  bodyDark: ramp('#16040f', '#3d0f32', '#6e2459'),
  shell: ramp('#7a1a63', '#d63aa8', '#ffa8e6'),
  shellPale: ramp('#8c4a7e', '#d9a0cb', '#fff0fa'),
  eye: ramp('#a85f00', '#ffb44d', '#fff1d6'),
  eyeWhite: ramp('#c9a0ba', '#fff0fa', '#ffffff'),
  trim: ramp('#8a4f0c', '#d98a22', '#ffb44d'),
  dark: ramp('#0c0208', '#240a1c', '#4a1639'),
  glow: ramp('#c42a98', '#ff6fd0', '#fff0fa'),
  glowAmber: ramp('#d98a22', '#ffb44d', '#fff1d6'),
  prop: ramp('#3d0f32', '#8c4a7e', '#d9a0cb'),
};
const OUT: RGB = c('#10020b');

function pal(over: Partial<Record<keyof Palette, Ramp>> = {}): Palette {
  return {
    suit: H.bodyPlum,
    helmet: H.shell,
    visor: H.eye,
    trim: H.trim,
    glove: H.dark,
    pack: H.bodyDark,
    glow: H.glow,
    prop: H.prop,
    outline: OUT,
    ...over,
  } as Palette;
}

type D3 = 'down' | 'up' | 'side';
type Draw = (g: Grid, d: D3, f: number) => void;

const bob = (f: number) => (f % 2 === 0 ? 1 : 0);
const alt = (f: number) => (f === 0 ? -1 : f === 2 ? 1 : 0);

/** Legs that alternate: contact frames plant one and lift the other. */
function legs(g: Grid, d: D3, f: number, y: number, h: number, part: 'suit' | 'pack' = 'suit', gap = 2, w = 2) {
  const lift = f === 0 ? 0 : f === 2 ? 1 : -1;
  if (d === 'side') {
    const nx = f === 0 ? 9 : f === 2 ? 5 : 7;
    const fx = f === 0 ? 5 : f === 2 ? 9 : 7;
    g.rect(fx, y, w, h, 'pack');
    g.rect(nx, y, w, h - (f === 1 ? 1 : 0), part);
    return;
  }
  const lx = 8 - gap - w;
  const rx = 8 + gap;
  g.rect(lx, y, w, lift === 1 || f === 3 ? h - 1 : h, part);
  g.rect(rx, y, w, lift === 0 || f === 1 ? h - 1 : h, part);
}

const eyes = (g: Grid, d: D3, y: number, spread = 2, part: 'visor' | 'glow' = 'visor') => {
  if (d === 'down') {
    g.put(8 - spread, y, part);
    g.put(7 + spread, y, part);
  } else if (d === 'side') {
    g.put(10, y, part);
  }
};

export const ENEMY_ART: { id: string; file: string; palette: Palette; draw: Draw }[] = [
  {
    id: 'shambler', // Husk: a crew Echo walking its last route, arms out
    file: 'shambler.png',
    palette: pal({ suit: H.bodyPlum, helmet: H.shellPale }),
    draw: (g, d, f) => {
      const b = bob(f);
      legs(g, d, f, 11 + b, 3 - b + 1, 'suit', 1);
      g.rect(5, 7 + b, 6, 5, 'suit');
      g.rect(6, 9 + b, 4, 1, 'trim');
      const a = alt(f);
      if (d === 'side') {
        g.rect(9, 7 + b + a, 4, 2, 'suit');
        g.rect(12, 7 + b + a, 1, 2, 'glove');
      } else {
        g.rect(2, 7 + b + a, 3, 2, 'suit');
        g.rect(11, 7 + b - a, 3, 2, 'suit');
        g.rect(2, 9 + b + a, 2, 1, 'glove');
        g.rect(12, 9 + b - a, 2, 1, 'glove');
      }
      g.ellipse(d === 'side' ? 8.5 : 8, 4 + b, 3, 3, 'helmet');
      eyes(g, d, 4 + b);
      if (d === 'down') g.rect(7, 6 + b, 2, 1, 'glove');
    },
  },
  {
    id: 'bat', // Flicker: a glitching drone that beats erratic wings
    file: 'bat.png',
    palette: pal({ suit: H.bodyDark, helmet: H.bodyMag, visor: H.eye }),
    draw: (g, d, f) => {
      const up = f % 2 === 0 ? 0 : 2;
      if (d === 'side') {
        g.ellipse(8, 8, 3, 2, 'suit');
        g.rect(4, 7 - up / 2, 3, 1 + up, 'helmet');
        g.rect(9, 8, 3, 1, 'trim');
        g.put(10, 7, 'visor');
      } else {
        g.ellipse(8, 8, 2.2, 3, 'suit');
        for (let i = 0; i < 4; i++) {
          g.rect(1 + i, 6 + (d === 'down' ? up : 2 - up) - (i > 1 ? 0 : 0), 1, 3 - Math.floor(i / 2), 'helmet');
          g.rect(14 - i, 6 + (d === 'down' ? up : 2 - up), 1, 3 - Math.floor(i / 2), 'helmet');
        }
        g.rect(3, 8, 3, 1, 'helmet');
        g.rect(10, 8, 3, 1, 'helmet');
        if (d === 'down') {
          g.put(7, 7, 'visor');
          g.put(9, 7, 'visor');
        }
      }
    },
  },
  {
    id: 'skeleton_warrior', // Rigger: an unmanned work-frame with a cutter
    file: 'skeleton-warrior.png',
    palette: pal({ suit: H.bodyDark, helmet: H.shell, prop: H.shellPale, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      legs(g, d, f, 11 + b, 4 - b, 'suit', 1);
      g.rect(5, 6 + b, 6, 6, 'suit');
      g.rect(6, 7 + b, 4, 2, 'helmet');
      g.rect(4, 6 + b, 8, 1, 'helmet');
      g.rect(6, 3 + b, 4, 3, 'helmet');
      eyes(g, d, 4 + b, 1);
      const a = alt(f);
      if (d === 'side') {
        g.rect(10, 7 + b + a, 3, 1, 'prop');
        g.rect(12, 5 + b + a, 1, 5, 'prop');
        g.put(12, 4 + b + a, 'trim');
      } else {
        g.rect(3, 8 + b, 2, 3, 'suit');
        g.rect(12, 5 + b + a, 1, 7, 'prop');
        g.put(12, 4 + b + a, 'trim');
        g.rect(11, 8 + b, 2, 2, 'suit');
      }
    },
  },
  {
    id: 'ghost', // Static: a fraying echo of a person, no legs
    file: 'ghost.png',
    palette: pal({ suit: ramp('#8c4a7e', '#d9a0cb', '#fff0fa'), helmet: ramp('#b86aa8', '#f0c8e6', '#ffffff'), glow: H.glow }),
    draw: (g, d, f) => {
      const s = alt(f);
      g.ellipse(8 + (d === 'side' ? 0.5 : 0), 5, 3.2, 3.4, 'helmet');
      g.rect(5, 7, 6, 5, 'suit');
      for (let x = 5; x < 11; x++) g.put(x, 12 + ((x + f) % 2), 'suit');
      for (let x = 5; x < 11; x += 2) g.put(x + (f % 2), 14, 'glow');
      eyes(g, d, 5, 1, 'visor');
      if (d !== 'up') g.rect(7, 7, 2, 1, 'glove');
      g.put(3 + s, 9, 'glow');
      g.put(12 - s, 8, 'glow');
    },
  },
  {
    id: 'werewolf', // Stalker: a low quadruped that coils before it pounces
    file: 'werewolf.png',
    palette: pal({ suit: H.bodyPlum, helmet: H.bodyMag, visor: H.eye, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      if (d === 'side') {
        g.rect(3, 7 + b, 8, 4, 'suit');
        g.rect(2, 6 + b, 3, 2, 'helmet');
        g.rect(10, 5 + b, 4, 4, 'helmet');
        g.put(12, 6 + b, 'visor');
        g.rect(13, 8 + b, 2, 1, 'glove');
        const l = alt(f);
        g.rect(4 + l, 11, 2, 3, 'pack');
        g.rect(9 - l, 11, 2, 3, 'pack');
        g.rect(6, 11, 2, 3 - (f % 2), 'suit');
        g.rect(11 - l, 11, 2, 3 - (f % 2), 'suit');
        g.rect(1, 6 + b, 2, 1, 'trim');
      } else {
        g.rect(4, 7 + b, 8, 5, 'suit');
        g.rect(5, 3 + b, 6, 5, 'helmet');
        g.put(5, 2 + b, 'trim');
        g.put(10, 2 + b, 'trim');
        eyes(g, d, 5 + b, 2);
        if (d === 'down') g.rect(7, 7 + b, 2, 1, 'glove');
        const l = alt(f);
        g.rect(3, 11, 2, 3 + (l > 0 ? 0 : -1), 'pack');
        g.rect(11, 11, 2, 3 + (l < 0 ? 0 : -1), 'pack');
        g.rect(6, 12, 1, 2, 'suit');
        g.rect(9, 12, 1, 2, 'suit');
        g.rect(4, 12, 2, 1, 'trim');
        g.rect(10, 12, 2, 1, 'trim');
      }
    },
  },
  {
    id: 'cultist', // Relay: a hooded beacon that holds a charged signal orb
    file: 'cultist.png',
    palette: pal({ suit: H.bodyDark, helmet: H.bodyPlum, visor: H.eye, glow: H.glowAmber, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      g.ellipse(8, 5 + b, 3, 3.4, 'helmet');
      g.rect(5, 7 + b, 6, 6, 'suit');
      g.rect(4, 11 + b, 8, 3 - b, 'suit');
      eyes(g, d, 5 + b, 1);
      g.rect(7, 9 + b, 2, 1, 'trim');
      const pulse = f % 2 === 0;
      if (d === 'side') {
        g.rect(11, 6 + b, 1, 7, 'prop');
        g.put(11, 5 + b, 'glow');
        g.put(12, 5 + b, pulse ? 'glow' : 'trim');
      } else {
        g.rect(12, 6 + b, 1, 7, 'prop');
        g.put(12, 5 + b, 'glow');
        g.put(11, 5 + b, pulse ? 'glow' : 'trim');
        g.put(13, 5 + b, pulse ? 'glow' : 'trim');
      }
    },
  },
  {
    id: 'swarm_rat', // Mite: a tiny skittering drone, many legs
    file: 'swarm-rat.png',
    palette: pal({ suit: H.bodyMag, helmet: H.shell, visor: H.eyeWhite, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      if (d === 'side') {
        g.ellipse(8, 10 + b, 4, 2.3, 'suit');
        g.rect(11, 9 + b, 3, 3, 'helmet');
        g.put(13, 9 + b, 'visor');
        g.rect(3, 9 + b, 2, 1, 'trim');
        for (let i = 0; i < 3; i++) g.put(5 + i * 2 + (f % 2), 12 + b, 'glove');
      } else {
        g.ellipse(8, 10 + b, 3.2, 3.2, 'suit');
        g.rect(6, 7 + b, 4, 2, 'helmet');
        if (d === 'down') {
          g.put(6, 8 + b, 'visor');
          g.put(9, 8 + b, 'visor');
        } else g.rect(7, 12 + b, 2, 1, 'trim');
        for (let i = 0; i < 3; i++) {
          g.put(3 + (f % 2), 9 + i * 2 + b, 'glove');
          g.put(12 - (f % 2), 9 + i * 2 + b, 'glove');
        }
      }
    },
  },
  {
    id: 'witch', // Jammer: a hovering disc with antennae that broadcasts noise
    file: 'witch.png',
    palette: pal({ suit: H.bodyPlum, helmet: H.shell, visor: H.eye, glow: H.glow, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      g.ellipse(8, 8 + b, 5.4, 2.4, 'suit');
      g.ellipse(8, 6 + b, 3, 2.2, 'helmet');
      g.rect(6, 9 + b, 4, 1, 'trim');
      eyes(g, d, 6 + b, 1);
      g.rect(4, 3 + b, 1, 3, 'prop');
      g.rect(11, 3 + b, 1, 3, 'prop');
      g.put(4, 2 + b, 'glow');
      g.put(11, 2 + b, 'glow');
      const w = f % 2 === 0 ? 'glow' : 'trim';
      g.put(2, 2 + b, w);
      g.put(13, 2 + b, w);
      for (let x = 6; x < 10; x++) g.put(x, 12 + ((x + f) % 2), 'glow');
    },
  },
  {
    id: 'bone_golem', // Bulkhead: a loading frame the size of a door
    file: 'bone-golem.png',
    palette: pal({ suit: H.bodyDark, helmet: H.shell, visor: H.eye, prop: H.shellPale, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      const a = alt(f);
      g.rect(5, 12 + b, 3, 3 - b, 'suit');
      g.rect(9, 12 + b, 3 - 0, 3 - b, 'suit');
      g.rect(3, 5 + b, 10, 8, 'suit');
      g.rect(4, 6 + b, 8, 3, 'helmet');
      g.rect(3, 4 + b, 10, 2, 'prop');
      g.rect(6, 1 + b, 4, 4, 'helmet');
      eyes(g, d, 2 + b, 1);
      if (d === 'side') {
        g.rect(9, 7 + b + a, 4, 5, 'prop');
        g.rect(9, 11 + b + a, 4, 2, 'glove');
      } else {
        g.rect(0, 6 + b + a, 3, 7, 'prop');
        g.rect(13, 6 + b - a, 3, 7, 'prop');
        g.rect(0, 11 + b + a, 3, 2, 'glove');
        g.rect(13, 11 + b - a, 3, 2, 'glove');
      }
      g.rect(6, 9 + b, 4, 1, 'trim');
      g.rect(7, 10 + b, 2, 2, 'trim');
    },
  },
  {
    id: 'shadow', // Blind Spot: a dark person-shaped gap that flickers
    file: 'shadow.png',
    palette: pal({ suit: ramp('#1c0616', '#4a1239', '#8a2a70'), helmet: ramp('#24081c', '#5c1450', '#a02d86'), visor: H.eyeWhite }),
    draw: (g, d, f) => {
      const b = bob(f);
      legs(g, d, f, 11 + b, 4 - b, 'suit', 1);
      g.rect(5, 7 + b, 6, 5, 'suit');
      g.ellipse(8, 4 + b, 3, 3.2, 'helmet');
      eyes(g, d, 4 + b, 1);
      const w = alt(f);
      if (d === 'side') g.rect(9, 8 + b + w, 3, 2, 'suit');
      else {
        g.rect(3, 8 + b + w, 2, 3, 'suit');
        g.rect(11, 8 + b - w, 2, 3, 'suit');
      }
      if (f % 2) g.put(3, 5, 'glove');
      else g.put(12, 10, 'glove');
    },
  },
  {
    id: 'vampire_noble', // Siphon: a tall leech frame trailing drain cables
    file: 'vampire-noble.png',
    palette: pal({ suit: H.bodyDark, helmet: H.shellPale, visor: H.eye, trim: ramp('#7a1a63', '#ff3db8', '#ffb0e4'), glow: H.glow }),
    draw: (g, d, f) => {
      const b = bob(f);
      legs(g, d, f, 12 + b, 3 - b, 'suit', 1);
      g.rect(4, 7 + b, 8, 6, 'suit');
      g.rect(3, 6 + b, 10, 2, 'trim');
      g.rect(6, 8 + b, 4, 3, 'trim');
      g.ellipse(8, 4 + b, 2.8, 3.2, 'helmet');
      eyes(g, d, 4 + b, 1);
      const a = alt(f);
      if (d === 'side') {
        g.rect(10, 8 + b, 3, 1, 'prop');
        g.put(13, 9 + b + a, 'glow');
        g.rect(3, 9 + b, 1, 4, 'trim');
      } else {
        g.rect(2, 8 + b + a, 1, 5, 'trim');
        g.rect(13, 8 + b - a, 1, 5, 'trim');
        g.put(2, 13 + b + a, 'glow');
        g.put(13, 13 + b - a, 'glow');
      }
    },
  },
  {
    id: 'arcane_construct', // Lattice: a floating diamond of struts with a lens
    file: 'arcane-construct.png',
    palette: pal({ suit: H.bodyMag, helmet: H.shell, visor: H.eyeWhite, glow: H.glowAmber, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      const cx = 8;
      const cy = 7 + b;
      for (let i = -5; i <= 5; i++) {
        const w = 5 - Math.abs(i);
        g.rect(cx - w, cy + i, w * 2, 1, Math.abs(i) < 5 && w > 1 ? 'suit' : 'helmet');
      }
      for (let i = -3; i <= 3; i++) g.put(cx - (3 - Math.abs(i)), cy + i, 'helmet');
      g.rect(cx - 1, cy - 1, 2, 2, d === 'up' ? 'trim' : 'visor');
      const r = f % 2 === 0;
      g.put(cx, cy - 6, r ? 'glow' : 'trim');
      g.put(cx, cy + 6, r ? 'trim' : 'glow');
      g.put(cx - 6, cy, r ? 'trim' : 'glow');
      g.put(cx + 5, cy, r ? 'glow' : 'trim');
    },
  },
  {
    id: 'plague_bearer', // Bloat: a swollen sac that weeps toxin
    file: 'plague-bearer.png',
    palette: pal({ suit: ramp('#5c3a0a', '#b8741a', '#ffb44d'), helmet: ramp('#7a4a0a', '#d98a22', '#ffd88a'), visor: H.eye, glow: H.glowAmber, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      const sw = f % 2;
      g.ellipse(8, 9 + b, 5 + sw * 0.4, 4.2, 'suit');
      g.ellipse(8, 4 + b, 2.4, 2.4, 'helmet');
      eyes(g, d, 4 + b, 1);
      g.rect(5, 12 + b, 2, 3 - b, 'glove');
      g.rect(9, 12 + b, 2, 3 - b, 'glove');
      g.put(5, 8 + b, 'glow');
      g.put(10, 10 + b, 'glow');
      g.put(7, 11 + b, 'trim');
      g.put(8, 14, sw ? 'glow' : 'trim');
      if (d === 'side') g.rect(11, 8 + b, 2, 2, 'helmet');
    },
  },
  {
    id: 'death_knight', // Warden: heavy station security with an arc cutter
    file: 'death-knight.png',
    palette: pal({ suit: H.bodyDark, helmet: H.shell, visor: H.eye, prop: H.shellPale, trim: H.trim, glow: H.glowAmber }),
    draw: (g, d, f) => {
      const b = bob(f);
      const a = alt(f);
      legs(g, d, f, 11 + b, 4 - b, 'suit', 1, 3);
      g.rect(4, 6 + b, 8, 6, 'suit');
      g.rect(3, 5 + b, 10, 2, 'helmet');
      g.rect(2, 5 + b, 2, 3, 'trim');
      g.rect(12, 5 + b, 2, 3, 'trim');
      g.rect(5, 1 + b, 6, 4, 'helmet');
      g.rect(7, 0 + b, 2, 1, 'trim');
      eyes(g, d, 3 + b, 2);
      if (d === 'down') g.rect(6, 4 + b, 4, 1, 'glove');
      g.rect(6, 9 + b, 4, 1, 'trim');
      if (d === 'side') {
        g.rect(10, 7 + b + a, 2, 3, 'suit');
        g.rect(12, 2 + b + a, 1, 9, 'prop');
        g.put(12, 1 + b + a, 'glow');
      } else {
        g.rect(1, 8 + b + a, 2, 3, 'suit');
        g.rect(13, 3 + b - a, 1, 9, 'prop');
        g.put(13, 2 + b - a, 'glow');
        g.rect(12, 8 + b - a, 2, 3, 'suit');
      }
    },
  },
  {
    id: 'banshee', // Shriek: a speaker-headed drone with its cone open
    file: 'banshee.png',
    palette: pal({ suit: H.bodyPlum, helmet: H.shellPale, visor: H.eye, glow: H.glow, trim: H.trim }),
    draw: (g, d, f) => {
      const b = bob(f);
      const open = f % 2 === 0;
      g.ellipse(8, 5 + b, 3.6, 3.6, 'helmet');
      eyes(g, d, 4 + b, 2);
      if (d !== 'up') {
        g.rect(7, 6 + b, 2, open ? 3 : 2, 'glove');
      }
      g.rect(5, 9 + b, 6, 3, 'suit');
      for (let x = 5; x < 11; x++) g.put(x, 12 + b + ((x + f) % 3 === 0 ? 1 : 0), 'suit');
      g.put(8, 14 + b, 'glow');
      if (open) {
        g.put(3, 6 + b, 'glow');
        g.put(12, 6 + b, 'glow');
        g.put(2, 8 + b, 'trim');
        g.put(13, 8 + b, 'trim');
      } else {
        g.put(4, 7 + b, 'glow');
        g.put(11, 7 + b, 'glow');
      }
    },
  },
  {
    id: 'lich', // Conductor: a robed signal-master with a floating core
    file: 'lich.png',
    palette: pal({ suit: H.bodyDark, helmet: H.shellPale, visor: H.eye, glow: H.glowAmber, trim: ramp('#7a1a63', '#ff3db8', '#ffb0e4'), prop: H.shell }),
    draw: (g, d, f) => {
      const b = bob(f);
      g.ellipse(8, 4 + b, 2.8, 3, 'helmet');
      g.rect(5, 7 + b, 6, 7 - b, 'suit');
      g.rect(4, 11 + b, 8, 3 - b, 'suit');
      eyes(g, d, 4 + b, 1);
      g.rect(6, 7 + b, 4, 1, 'trim');
      g.rect(7, 9 + b, 2, 3, 'trim');
      g.rect(3, 3 + b, 1, 5, 'prop');
      g.rect(12, 3 + b, 1, 5, 'prop');
      const orb = f % 2 === 0 ? 0 : 1;
      g.put(3, 2 + b - orb, 'glow');
      g.put(12, 2 + b - orb, 'glow');
      g.put(2, 1 + b + orb, 'glow');
      g.put(13, 1 + b + orb, 'glow');
      g.put(8, 0 + orb, 'glow');
    },
  },
];

function renderEnemyFrame(draw: Draw, palette: Palette, dir: Dir, frame: number): Uint8ClampedArray {
  const g = new Grid();
  draw(g, dir === 'left' || dir === 'right' ? 'side' : dir, frame);
  const px = shade(g, palette);
  if (dir !== 'left') return px;
  const m = new Uint8ClampedArray(px.length);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const s = (y * SIZE + x) * 4;
      const t = (y * SIZE + (SIZE - 1 - x)) * 4;
      m[t] = px[s];
      m[t + 1] = px[s + 1];
      m[t + 2] = px[s + 2];
      m[t + 3] = px[s + 3];
    }
  }
  return m;
}

export function renderEnemySheet(draw: Draw, palette: Palette): Uint8ClampedArray {
  const W = SIZE * 4;
  const sheet = new Uint8ClampedArray(W * W * 4);
  DIRS.forEach((dir, col) => {
    for (let row = 0; row < 4; row++) {
      const px = renderEnemyFrame(draw, palette, dir, row);
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const s = (y * SIZE + x) * 4;
          const t = ((row * SIZE + y) * W + col * SIZE + x) * 4;
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

/** The Echo-Binder's bound Echo: a cyan ally, so it must not share the hostile sheets above. */
export const ECHO_ALLY = {
  file: 'echo.png',
  palette: pal({
    suit: ramp('#0b5f78', '#19d3da', '#8ff3f6'),
    helmet: ramp('#14879a', '#6aeaee', '#e6fbff'),
    visor: H.eyeWhite,
    trim: ramp('#0b8d9a', '#19d3da', '#e6fbff'),
    glove: ramp('#03121c', '#0b3347', '#14607a'),
    pack: ramp('#03121c', '#0b3347', '#14607a'),
    glow: ramp('#0b8d9a', '#19d3da', '#e6fbff'),
    prop: ramp('#0b5f78', '#19d3da', '#8ff3f6'),
    outline: c('#03121c'),
  }),
  draw: ((g, d, f) => {
    const s = alt(f);
    g.ellipse(8 + (d === 'side' ? 0.5 : 0), 5, 3.2, 3.4, 'helmet');
    g.rect(5, 7, 6, 5, 'suit');
    for (let x = 5; x < 11; x++) g.put(x, 12 + ((x + f) % 2), 'suit');
    eyes(g, d, 5, 1, 'visor');
    if (d !== 'up') g.rect(7, 7, 2, 1, 'glove');
    g.put(3 + s, 9, 'glow');
    g.put(12 - s, 8, 'glow');
    g.put(8, 14, 'glow');
  }) as Draw,
};
