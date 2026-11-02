/**
 * Props (plan H2.4): crate, locker, heater, antenna mast, lamp post, oil drum. Rigid, no clips.
 * Origin at the centre of the base, +Y up, +Z the front (Source +X), units.
 */
import { mixRgb, PALETTE, shade } from '../palette';
import { assemble, segment, type MatDef, type ModelObject, type Part } from './parts';

const MATS: Record<string, MatDef> = {
  wood: { rgb: PALETTE.deckLight },
  wood_dark: { rgb: PALETTE.deckDark },
  steel: { rgb: PALETTE.steelMid },
  steel_dark: { rgb: PALETTE.steelDark },
  steel_light: { rgb: PALETTE.steelLight },
  enamel: { rgb: mixRgb(PALETTE.enamelAged, PALETTE.steelLight, 0.35) },
  enamel_dark: { rgb: PALETTE.enamelGrime },
  rust: { rgb: PALETTE.rustMid },
  rust_dark: { rgb: PALETTE.rustDark },
  black: { rgb: PALETTE.hazardBlack },
  void: { rgb: PALETTE.grateVoid },
  amber: { rgb: PALETTE.amber, glow: true },
  frost: { rgb: PALETTE.frostWhite },
  paint: { rgb: shade(PALETTE.steelLight, 0.78) },
};

const box = (
  c: [number, number, number],
  s: [number, number, number],
  mat: string,
  rot?: [number, number, number],
): Part => ({ shape: 'box', c, s, mat, rot });
const cyl = (
  c: [number, number, number],
  r: number,
  h: number,
  mat: string,
  k?: number,
  seg = 10,
  rot?: [number, number, number],
): Part => ({
  shape: 'cyl',
  c,
  s: [r, h, r],
  mat,
  k,
  seg,
  rot,
});

function crate(): Part[] {
  const out: Part[] = [box([0, 16, 0], [31, 31, 31], 'wood')];
  // Corner posts and rails, proud of the planks.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      out.push(box([sx * 14.4, 16, sz * 14.4], [3.4, 32, 3.4], 'wood_dark'));
  for (const y of [1.7, 30.3])
    for (const sz of [-1, 1]) {
      out.push(box([0, y, sz * 15.9], [32, 3.2, 1.2], 'wood_dark'));
      out.push(box([sz * 15.9, y, 0], [1.2, 3.2, 32], 'wood_dark'));
    }
  // Diagonal braces on the four sides.
  for (const sz of [-1, 1]) {
    out.push(box([0, 16, sz * 15.9], [38, 3, 1.1], 'wood_dark', [0, 0, 44]));
    out.push(box([sz * 15.9, 16, 0], [1.1, 3, 38], 'wood_dark', [44, 0, 0]));
  }
  // A few plank seams and a stencilled band.
  out.push(
    box([0, 16, 16.2], [30, 0.5, 0.4], 'black'),
    box([0, 22, 16.2], [30, 0.5, 0.4], 'black'),
    box([0, 10, 16.2], [30, 0.5, 0.4], 'black'),
  );
  out.push(box([5, 16, 16.5], [9, 5, 0.3], 'frost'));
  return out;
}

function locker(): Part[] {
  const out: Part[] = [
    box([0, 36.5, 0], [23, 71, 19], 'enamel'),
    box([0, 1.5, 0], [24, 3, 20], 'steel_dark'),
    box([0, 72.2, 0], [24, 1.4, 20], 'steel'),
  ];
  // Two doors with a seam between, louvre slots top and bottom, a latch each.
  out.push(box([0, 38, 9.7], [0.8, 66, 0.6], 'enamel_dark'));
  for (const sx of [-1, 1]) {
    out.push(box([sx * 5.7, 38, 9.8], [10.4, 66, 0.4], 'paint'));
    for (let i = 0; i < 4; i++) {
      out.push(box([sx * 5.7, 62 - i * 2.4, 10.1], [7, 0.8, 0.4], 'void'));
      out.push(box([sx * 5.7, 18 - i * 2.4, 10.1], [7, 0.8, 0.4], 'void'));
    }
    out.push(box([sx * 1.9, 40, 10.4], [1.2, 6, 1.2], 'steel_light'));
  }
  out.push(box([0, 28, 10.3], [2.6, 1.2, 0.8], 'amber'));
  return out;
}

function heater(): Part[] {
  const out: Part[] = [
    box([0, 17, 0], [28, 28, 17], 'steel_dark'),
    box([0, 2, 0], [29, 4, 18], 'black'),
    box([0, 33, -1], [24, 4, 14], 'steel'),
  ];
  // The warm window: an amber plate behind a grille of slim bars.
  out.push(box([0, 15, 8.6], [20, 17, 0.5], 'amber'));
  for (let i = 0; i < 7; i++) out.push(box([-9 + i * 3, 15, 9.1], [1, 18.4, 1.2], 'black'));
  out.push(box([0, 24.4, 9], [22, 1.4, 1.4], 'black'), box([0, 5.6, 9], [22, 1.4, 1.4], 'black'));
  // Flue and controls.
  out.push(cyl([-7, 38, -3], 2.8, 8, 'steel_light', 0.9, 10));
  out.push(cyl([9, 28.5, 8.9], 1.5, 1.4, 'frost', 1, 8, [90, 0, 0]));
  out.push(box([-9.5, 28.5, 8.9], [3.2, 1, 0.8], 'amber'));
  return out;
}

function antenna(): Part[] {
  const out: Part[] = [box([0, 1.5, 0], [10, 3, 10], 'steel_dark')];
  // Four tapering sections of a lattice mast, braced on every face.
  const legs = (y0: number, y1: number, w0: number, w1: number): void => {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        out.push(segment([sx * w0, y0, sz * w0], [sx * w1, y1, sz * w1], 0.55, 'steel_light'));
    const ym = (y0 + y1) / 2;
    const wm = (w0 + w1) / 2;
    for (const [a, b] of [
      [
        [-w0, y0, w0],
        [w1, y1, w1],
      ],
      [
        [w0, y0, w0],
        [-w1, y1, w1],
      ],
      [
        [-w0, y0, -w0],
        [w1, y1, -w1],
      ],
      [
        [w0, y0, -w0],
        [-w1, y1, -w1],
      ],
    ] as const) {
      out.push(segment([a[0], a[1], a[2]], [b[0], b[1], b[2]], 0.28, 'steel'));
    }
    out.push(
      box([0, ym, wm], [wm * 2, 0.8, 0.8], 'steel'),
      box([0, ym, -wm], [wm * 2, 0.8, 0.8], 'steel'),
    );
    out.push(
      box([wm, ym, 0], [0.8, 0.8, wm * 2], 'steel'),
      box([-wm, ym, 0], [0.8, 0.8, wm * 2], 'steel'),
    );
  };
  legs(3, 66, 4, 3.2);
  legs(66, 120, 3.2, 2.5);
  legs(120, 168, 2.5, 1.8);
  legs(168, 200, 1.8, 1.1);
  out.push(cyl([0, 213, 0], 0.55, 28, 'steel_light', 0.7, 6));
  out.push(cyl([0, 224, 0], 1.1, 1.6, 'amber', 1, 6));
  // A dish and a small sensor box bolted on at mid height.
  out.push(cyl([0, 140, 6.4], 5.4, 1.4, 'frost', 0.3, 10, [90, 0, 0]));
  out.push(box([0, 140, 3.1], [1.6, 1.6, 3.4], 'steel'));
  out.push(box([-3.8, 92, 0], [3, 5, 3], 'enamel'));
  return out;
}

function lamp(): Part[] {
  const out: Part[] = [
    cyl([0, 3, 0], 4.8, 6, 'steel_dark', 0.7, 10),
    cyl([0, 8, 0], 2.8, 4, 'steel', 1, 10),
    cyl([0, 74, 0], 2, 140, 'steel', 0.72, 10),
  ];
  // Arm out along +Z (Source forward) ending in a hooded lamp over the path.
  out.push(segment([0, 134, 0], [0, 142, 6], 1.2, 'steel'));
  out.push(box([0, 143.2, 13], [3, 2, 16], 'steel'));
  out.push(cyl([0, 141, 24], 4.6, 3, 'steel_dark', 0.55, 10));
  out.push(cyl([0, 138.9, 24], 3, 1.2, 'amber', 1, 10));
  out.push(box([0, 20, 2.4], [3.4, 5, 1], 'black'), box([0, 20, 3], [2.4, 1, 0.5], 'frost'));
  return out;
}

function drum(): Part[] {
  const out: Part[] = [
    cyl([0, 17, 0], 10.6, 32, 'rust', 1, 14),
    cyl([0, 33.4, 0], 10.9, 1.8, 'rust_dark', 1, 14),
    cyl([0, 0.9, 0], 10.9, 1.8, 'rust_dark', 1, 14),
    cyl([0, 10.5, 0], 11.1, 1.6, 'rust_dark', 1, 14),
    cyl([0, 24, 0], 11.1, 1.6, 'rust_dark', 1, 14),
    cyl([0, 34.4, 0], 9.2, 0.4, 'black', 1, 14),
    cyl([5, 34.8, 3], 1.6, 1, 'steel', 1, 8),
    cyl([-4, 34.8, -4], 1.2, 1, 'steel', 1, 8),
  ];
  out.push(
    box([0, 17, 11.1], [4.8, 6, 0.4], 'frost'),
    box([0, 17, 11.3], [3.2, 0.8, 0.3], 'black'),
  );
  return out;
}

const BUILD: Record<string, () => Part[]> = {
  crate,
  locker,
  heater,
  antenna_mast: antenna,
  lamp_post: lamp,
  oil_drum: drum,
};

function build(name: string): ModelObject {
  const { root } = assemble(name, BUILD[name](), MATS);
  root.userData = { skinned: false };
  return root;
}

export const PROP_BUILDERS: Record<string, () => ModelObject> = Object.fromEntries(
  Object.keys(BUILD).map((n) => [n, () => build(n)]),
);
