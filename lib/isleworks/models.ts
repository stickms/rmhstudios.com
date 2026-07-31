/**
 * Isleworks — procedural building models.
 *
 * Every structure in the game is described here as a short list of primitives
 * rather than loaded from a mesh file. Three reasons, in order of how much they
 * mattered:
 *
 *  1. **Instancing.** The renderer buckets every part in the city by primitive
 *     (box, cylinder, cone, sphere, wedge, facet) and draws each bucket in one
 *     call. A four-hundred-building city is six draw calls, on a phone.
 *  2. **Levels for free.** A building that grows gets more parts from the same
 *     function — no second asset, no swap, and the silhouette change is authored
 *     in the same place as the original.
 *  3. **No download.** The whole art direction is about 30 kB of numbers, so the
 *     game opens instantly instead of streaming glTF.
 *
 * ## The shape language
 *
 * Category is legible from silhouette alone, which is the rule the palette is
 * only reinforcing:
 *
 *   residential — pitched roofs, small windows, warm walls
 *   commercial  — flat roofs, awnings, wide glazing, signs
 *   industrial  — sawtooth roofs, chimneys, tanks, no windows to speak of
 *   civic       — symmetry, a portico or a tower, one strong accent
 *   recreation  — mostly ground plane: paving, planting, a single tall thing
 *   utility     — cylinders. Nothing else in the game is a bare cylinder.
 *   transport   — long, low, and horizontal
 *
 * ## Coordinates
 *
 * Authored at rotation 0, footprint width along +X and depth along +Z, origin at
 * the centre of the footprint, y = 0 at ground level. The renderer applies the
 * instance's rotation to the whole group, so nothing here ever thinks about it.
 */

export type PartShape = 'box' | 'cyl' | 'cone' | 'sphere' | 'wedge' | 'facet';

export type Vec3 = [number, number, number];

export interface Part {
  shape: PartShape;
  /** Centre of the primitive, except `box`/`wedge` where y is the *base*. */
  p: Vec3;
  /** Full extents: box (w,h,d), cyl/cone (dia,h,dia), sphere/facet (dia,dia,dia). */
  s: Vec3;
  /** Euler rotation in radians, applied XYZ. */
  r?: Vec3;
  color: string;
  /** Window glass and signage — lit from within after dark. */
  glow?: boolean;
  /** Turbine blades and similar: spun about the part's own Z axis. */
  spin?: number;
}

export interface BuildingModel {
  parts: Part[];
  /** Chimney mouths, in local space — the smoke system reads these. */
  smoke?: Vec3[];
  /** Points that switch on at night. */
  lights?: Vec3[];
  /** Roughly how tall the thing is, for camera framing and label anchors. */
  height: number;
}

import { MAT } from './palette';
import { makeRng } from './terrain';

/* ── primitive helpers ──────────────────────────────────────────────────── */

function box(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  extra?: Partial<Part>,
): Part {
  return { shape: 'box', p: [x, y, z], s: [w, h, d], color, ...extra };
}

function cyl(
  x: number,
  y: number,
  z: number,
  dia: number,
  h: number,
  color: string,
  extra?: Partial<Part>,
): Part {
  return { shape: 'cyl', p: [x, y, z], s: [dia, h, dia], color, ...extra };
}

function cone(
  x: number,
  y: number,
  z: number,
  dia: number,
  h: number,
  color: string,
  extra?: Partial<Part>,
): Part {
  return { shape: 'cone', p: [x, y, z], s: [dia, h, dia], color, ...extra };
}

function ball(
  x: number,
  y: number,
  z: number,
  dia: number,
  color: string,
  extra?: Partial<Part>,
): Part {
  return { shape: 'sphere', p: [x, y, z], s: [dia, dia, dia], color, ...extra };
}

function facet(
  x: number,
  y: number,
  z: number,
  dia: number,
  color: string,
  extra?: Partial<Part>,
): Part {
  return { shape: 'facet', p: [x, y, z], s: [dia, dia, dia], color, ...extra };
}

/** Triangular prism. Ridge runs along X; slopes fall toward ±Z. */
function roof(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  extra?: Partial<Part>,
): Part {
  return { shape: 'wedge', p: [x, y, z], s: [w, h, d], color, ...extra };
}

/** A horizontal band of windows around a block — the cheapest "this is a building" cue. */
function windowBand(
  y: number,
  w: number,
  d: number,
  color: string = MAT.window,
  thickness = 0.05,
): Part[] {
  return [
    box(0, y, d / 2, w * 0.82, thickness, 0.02, color, { glow: true }),
    box(0, y, -d / 2, w * 0.82, thickness, 0.02, color, { glow: true }),
    box(w / 2, y, 0, 0.02, thickness, d * 0.82, color, { glow: true }),
    box(-w / 2, y, 0, 0.02, thickness, d * 0.82, color, { glow: true }),
  ];
}

function tree(x: number, z: number, scale: number, leaf: string, pine = false): Part[] {
  const h = 0.36 * scale;
  return pine
    ? [
        cyl(x, 0, z, 0.06 * scale, h * 0.5, MAT.trunk),
        cone(x, h * 0.4, z, 0.3 * scale, h * 1.25, leaf),
      ]
    : [cyl(x, 0, z, 0.07 * scale, h * 0.6, MAT.trunk), facet(x, h * 0.85, z, 0.36 * scale, leaf)];
}

/* ── the catalogue of shapes ────────────────────────────────────────────── */

type Builder = (level: number, rng: () => number) => BuildingModel;

const BUILDERS: Record<string, Builder> = {
  /* ── Residential ─────────────────────────────────────────────────────── */
  cottage: (level) => {
    const h = 0.34 + level * 0.05;
    return {
      height: h + 0.28,
      parts: [
        box(0, 0, 0, 0.62, h, 0.56, MAT.wallCream),
        roof(0, h, 0, 0.7, 0.26, 0.64, MAT.roofRed),
        box(0, 0, 0.29, 0.14, h * 0.62, 0.02, MAT.trunk),
        box(-0.19, h * 0.45, 0.29, 0.13, 0.11, 0.02, MAT.window, { glow: true }),
        box(0.19, h * 0.45, 0.29, 0.13, 0.11, 0.02, MAT.window, { glow: true }),
        ...(level > 1 ? [box(0.24, h, -0.12, 0.09, 0.2, 0.09, MAT.roofTerracotta)] : []),
        ...(level > 2 ? tree(0.34, 0.3, 0.6, MAT.leafDeep) : []),
      ],
      lights: [[0, h * 0.7, 0.3]],
    };
  },

  duplex: (level) => {
    const h = 0.44 + level * 0.06;
    return {
      height: h + 0.3,
      parts: [
        box(-0.17, 0, 0, 0.36, h, 0.6, MAT.wallCoral),
        box(0.19, 0, 0.04, 0.34, h * 0.86, 0.54, MAT.wallCream),
        roof(-0.17, h, 0, 0.42, 0.22, 0.66, MAT.roofRed),
        roof(0.19, h * 0.86, 0.04, 0.4, 0.2, 0.6, MAT.roofTerracotta),
        box(-0.17, h * 0.4, 0.31, 0.14, 0.12, 0.02, MAT.window, { glow: true }),
        box(0.19, h * 0.36, 0.32, 0.14, 0.12, 0.02, MAT.window, { glow: true }),
        ...(level > 1 ? [box(0, 0, 0.34, 0.5, 0.04, 0.1, MAT.concrete)] : []),
      ],
      lights: [[0, h * 0.8, 0.32]],
    };
  },

  rowhouses: (level) => {
    const h = 0.5 + level * 0.08;
    const colors = [MAT.wallCoral, MAT.wallCream, MAT.wallPink, MAT.wallRose];
    const parts: Part[] = [];
    for (let i = 0; i < 4; i++) {
      const x = -0.75 + i * 0.5;
      const bh = h + (i % 2) * 0.06;
      parts.push(box(x, 0, 0, 0.46, bh, 0.66, colors[i]));
      parts.push(roof(x, bh, 0, 0.5, 0.16, 0.7, i % 2 ? MAT.roofPlum : MAT.roofRed));
      parts.push(box(x, bh * 0.45, 0.34, 0.2, 0.13, 0.02, MAT.window, { glow: true }));
      parts.push(box(x, 0, 0.34, 0.12, 0.22, 0.02, MAT.trunk));
    }
    if (level > 1) parts.push(box(0, 0, 0.42, 1.9, 0.04, 0.14, MAT.concrete));
    return { height: h + 0.2, parts, lights: [[0, h, 0.4]] };
  },

  apartments: (level) => {
    const floors = 3 + level;
    const h = floors * 0.22;
    const parts: Part[] = [
      box(0, 0, 0, 1.5, h, 1.4, MAT.wallCream),
      box(0.15, 0, 0.1, 1.1, h * 0.6, 1.6, MAT.wallCoral),
      box(0, h, 0, 1.56, 0.06, 1.46, MAT.roofSlate),
    ];
    for (let f = 0; f < floors; f++) {
      parts.push(...windowBand(0.12 + f * 0.22, 1.5, 1.4));
    }
    parts.push(box(0, 0, 0.72, 0.34, 0.28, 0.06, MAT.glassCyan, { glow: true }));
    parts.push(box(0, h + 0.06, 0.3, 0.3, 0.14, 0.3, MAT.metalGrey));
    return { height: h + 0.2, parts, lights: [[0, h * 0.5, 0.75]] };
  },

  'residential-tower': (level) => {
    const h = 1.5 + level * 0.35;
    const parts: Part[] = [
      box(0, 0, 0, 1.3, h * 0.55, 1.3, MAT.wallCream),
      box(0, h * 0.55, 0, 1.05, h * 0.35, 1.05, MAT.wallRose),
      box(0, h * 0.9, 0, 0.8, h * 0.12, 0.8, MAT.wallCream),
      box(0, h * 1.02, 0, 0.86, 0.05, 0.86, MAT.roofSlate),
      cyl(0.22, h * 1.02, 0.22, 0.12, 0.3, MAT.metalGrey),
    ];
    for (let f = 0; f < 8; f++) {
      const y = 0.12 + f * (h / 9);
      const w = y < h * 0.55 ? 1.3 : y < h * 0.9 ? 1.05 : 0.8;
      parts.push(...windowBand(y, w, w));
    }
    return { height: h + 0.3, parts, lights: [[0, h * 0.6, 0.7]] };
  },

  condominium: (level) => {
    const h = 1.2 + level * 0.28;
    const parts: Part[] = [
      box(-0.32, 0, 0, 0.62, h, 1.1, MAT.wallIce),
      box(0.34, 0, -0.1, 0.58, h * 0.75, 0.95, MAT.wallLavender),
      box(0, 0, 0.5, 1.5, 0.14, 0.4, MAT.concrete),
      box(-0.32, h, 0, 0.68, 0.05, 1.16, MAT.roofSlate),
      box(0.34, h * 0.75, -0.1, 0.64, 0.05, 1.0, MAT.roofSlate),
    ];
    for (let f = 0; f < 5; f++) {
      parts.push(box(-0.32, 0.16 + f * 0.24, 0.56, 0.56, 0.03, 0.16, MAT.concrete));
      parts.push(box(-0.32, 0.2 + f * 0.24, 0.5, 0.5, 0.16, 0.02, MAT.glassCyan, { glow: true }));
    }
    parts.push(...tree(0.55, 0.55, 0.7, MAT.leafTeal));
    return { height: h + 0.2, parts, lights: [[0, h * 0.5, 0.6]] };
  },

  /* ── Commercial ──────────────────────────────────────────────────────── */
  'corner-store': (level) => {
    const h = 0.42 + level * 0.05;
    return {
      height: h + 0.2,
      parts: [
        box(0, 0, 0, 0.66, h, 0.6, MAT.wallIce),
        box(0, h, 0, 0.72, 0.07, 0.66, MAT.glassBlue),
        box(0, h * 0.55, 0.31, 0.5, 0.26, 0.03, MAT.glassCyan, { glow: true }),
        box(0, h * 0.9, 0.36, 0.56, 0.07, 0.12, MAT.awning),
        box(0, h + 0.09, 0, 0.34, 0.12, 0.05, MAT.awning, { glow: true }),
        ...(level > 1 ? [box(0.36, 0, 0.28, 0.1, 0.16, 0.1, MAT.leafDeep)] : []),
      ],
      lights: [[0, h, 0.35]],
    };
  },

  cafe: () => {
    const h = 0.4;
    return {
      height: h + 0.34,
      parts: [
        box(-0.1, 0, 0, 0.5, h, 0.55, MAT.wallCream),
        box(-0.1, h, 0, 0.56, 0.06, 0.6, MAT.roofTerracotta),
        box(-0.1, h * 0.5, 0.29, 0.36, 0.24, 0.02, MAT.glassCyan, { glow: true }),
        box(-0.1, h * 0.92, 0.34, 0.5, 0.06, 0.12, MAT.awning),
        cyl(0.28, 0, 0.22, 0.05, 0.24, MAT.metalGrey),
        cone(0.28, 0.24, 0.22, 0.42, 0.14, MAT.awning),
        cyl(0.28, 0, 0.22, 0.2, 0.02, MAT.concrete),
        cyl(0.3, 0.16, 0.16, 0.13, 0.02, MAT.wallWhite),
      ],
      lights: [[-0.1, h, 0.36]],
    };
  },

  grocery: () => {
    const h = 0.5;
    return {
      height: h + 0.24,
      parts: [
        box(0, 0, 0, 1.7, h, 0.72, MAT.wallIce),
        box(0, h, 0, 1.78, 0.08, 0.8, MAT.glassBlue),
        box(-0.3, h * 0.5, 0.37, 0.7, 0.28, 0.02, MAT.glassCyan, { glow: true }),
        box(0.5, h * 0.4, 0.37, 0.34, 0.34, 0.02, MAT.window, { glow: true }),
        box(0, h * 0.95, 0.44, 1.6, 0.06, 0.14, MAT.awning),
        box(-0.4, h + 0.12, 0, 0.7, 0.14, 0.06, MAT.awning, { glow: true }),
        box(0.66, h + 0.09, -0.1, 0.3, 0.1, 0.3, MAT.metalGrey),
      ],
      lights: [[0, h, 0.46]],
    };
  },

  'office-block': (level) => {
    const h = 0.9 + level * 0.22;
    const parts: Part[] = [
      box(0, 0, 0, 1.44, h, 1.3, MAT.glassBlue),
      box(0, 0, 0, 1.5, 0.16, 1.36, MAT.concrete),
      box(0, h, 0, 1.5, 0.07, 1.36, MAT.metalDark),
      box(0, h + 0.07, 0.3, 0.4, 0.14, 0.4, MAT.metalGrey),
    ];
    for (let i = 0; i < 6; i++) {
      const x = -0.66 + i * 0.264;
      parts.push(box(x, 0.16, 0.66, 0.05, h - 0.16, 0.04, MAT.wallIce));
      parts.push(box(x, 0.16, -0.66, 0.05, h - 0.16, 0.04, MAT.wallIce));
    }
    for (let f = 0; f < 4; f++)
      parts.push(...windowBand(0.28 + f * 0.22, 1.44, 1.3, MAT.glassCyan));
    return { height: h + 0.25, parts, lights: [[0, h * 0.5, 0.7]] };
  },

  'shopping-centre': () => {
    const h = 0.62;
    const parts: Part[] = [
      box(0, 0, 0, 2.7, h, 1.6, MAT.wallIce),
      box(0, h, 0, 2.78, 0.08, 1.68, MAT.glassBlue),
      box(0, 0, 0.86, 1.1, h * 0.9, 0.18, MAT.glassCyan, { glow: true }),
      box(0, h * 0.92, 0.98, 1.5, 0.07, 0.34, MAT.awning),
      box(-0.9, h + 0.16, 0, 0.9, 0.18, 0.08, MAT.awning, { glow: true }),
    ];
    for (let i = 0; i < 5; i++) {
      parts.push(box(-1.0 + i * 0.5, h + 0.1, -0.3, 0.26, 0.12, 0.26, MAT.metalGrey));
    }
    for (let i = 0; i < 6; i++) {
      parts.push(box(-1.15 + i * 0.46, 0.02, -0.95, 0.3, 0.02, 0.5, MAT.asphaltDark));
    }
    return { height: h + 0.34, parts, lights: [[0, h, 1.0]] };
  },

  'business-tower': (level) => {
    const h = 2.1 + level * 0.4;
    const parts: Part[] = [
      box(0, 0, 0, 1.2, h * 0.6, 1.2, MAT.glassBlue),
      box(0, h * 0.6, 0, 0.96, h * 0.3, 0.96, MAT.glassCyan),
      box(0, h * 0.9, 0, 0.7, h * 0.1, 0.7, MAT.wallIce),
      box(0, 0, 0, 1.34, 0.14, 1.34, MAT.concrete),
      cyl(0, h, 0, 0.06, 0.5, MAT.metalGrey),
      ball(0, h + 0.52, 0, 0.1, MAT.danger, { glow: true }),
    ];
    for (let f = 0; f < 10; f++) {
      const y = 0.2 + f * (h / 11);
      const w = y < h * 0.6 ? 1.2 : y < h * 0.9 ? 0.96 : 0.7;
      parts.push(...windowBand(y, w, w, MAT.window));
    }
    return { height: h + 0.7, parts, lights: [[0, h * 0.4, 0.65]] };
  },

  /* ── Industrial ──────────────────────────────────────────────────────── */
  workshop: () => ({
    height: 0.56,
    parts: [
      box(0, 0, 0, 0.68, 0.36, 0.6, MAT.wallBrown),
      roof(0, 0.36, 0, 0.76, 0.16, 0.68, MAT.metalGrey),
      box(0, 0, 0.31, 0.3, 0.26, 0.02, MAT.metalDark),
      cyl(0.24, 0.5, -0.18, 0.1, 0.22, MAT.metalDark),
      box(-0.22, 0.16, 0.31, 0.14, 0.12, 0.02, MAT.window, { glow: true }),
    ],
    smoke: [[0.24, 0.62, -0.18]],
  }),

  warehouse: () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.6, 0.52, 1.5, MAT.wallOchre),
      box(0, 0.52, 0, 1.68, 0.06, 1.58, MAT.metalGrey),
    ];
    for (let i = 0; i < 3; i++) {
      parts.push(box(-0.5 + i * 0.5, 0, 0.76, 0.36, 0.36, 0.02, MAT.metalDark));
    }
    for (let i = 0; i < 4; i++) {
      parts.push(box(0, 0.58, -0.6 + i * 0.4, 1.68, 0.05, 0.08, MAT.metalDark));
    }
    parts.push(box(0.6, 0, 0.9, 0.4, 0.12, 0.24, MAT.concrete));
    return { height: 0.7, parts };
  },

  factory: () => {
    const parts: Part[] = [
      box(-0.2, 0, 0, 1.2, 0.6, 1.4, MAT.wallMustard),
      box(0.62, 0, 0.3, 0.6, 0.42, 0.8, MAT.wallOchre),
      box(-0.2, 0.6, 0, 1.28, 0.05, 1.48, MAT.metalGrey),
    ];
    for (let i = 0; i < 4; i++) {
      parts.push(roof(-0.2, 0.65, -0.55 + i * 0.36, 1.28, 0.18, 0.3, MAT.glassCyan));
    }
    parts.push(cyl(-0.62, 0.6, -0.5, 0.2, 0.7, MAT.metalDark));
    parts.push(cyl(-0.62, 1.3, -0.5, 0.24, 0.06, MAT.wallBrown));
    parts.push(cyl(0.66, 0.42, -0.4, 0.36, 0.4, MAT.pipeSteel));
    parts.push(cyl(0.66, 0.82, -0.4, 0.4, 0.05, MAT.metalGrey));
    return { height: 1.4, parts, smoke: [[-0.62, 1.4, -0.5]] };
  },

  'recycling-plant': () => {
    const parts: Part[] = [
      box(-0.3, 0, 0, 1.0, 0.5, 1.3, MAT.wallIce),
      box(-0.3, 0.5, 0, 1.08, 0.06, 1.38, MAT.leafDeep),
      box(0.55, 0.28, 0.1, 0.7, 0.06, 0.3, MAT.metalGrey, { r: [0, 0, -0.35] }),
    ];
    const bins = [MAT.leafDeep, MAT.glassBlue, MAT.accentGold];
    bins.forEach((color, i) => {
      parts.push(cyl(0.5, 0, -0.5 + i * 0.42, 0.3, 0.3, color));
      parts.push(cyl(0.5, 0.3, -0.5 + i * 0.42, 0.33, 0.04, MAT.metalGrey));
    });
    parts.push(box(-0.3, 0.58, 0, 0.5, 0.12, 0.06, MAT.good, { glow: true }));
    return { height: 0.8, parts };
  },

  'fabrication-lab': () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.5, 0.62, 1.4, MAT.wallWhite),
      box(0, 0.62, 0, 1.56, 0.06, 1.46, MAT.metalGrey),
      box(0, 0.3, 0.71, 1.2, 0.22, 0.03, MAT.glassCyan, { glow: true }),
      box(0, 0.3, -0.71, 1.2, 0.22, 0.03, MAT.glassCyan, { glow: true }),
    ];
    for (let i = 0; i < 3; i++) {
      parts.push(cyl(-0.4 + i * 0.4, 0.68, -0.3, 0.16, 0.18, MAT.pipeSteel));
    }
    parts.push(box(0.5, 0.68, 0.35, 0.5, 0.1, 0.5, MAT.solarBlue));
    return { height: 0.9, parts };
  },

  /* ── Civic ───────────────────────────────────────────────────────────── */
  clinic: () => ({
    height: 0.6,
    parts: [
      box(0, 0, 0, 0.68, 0.46, 0.62, MAT.wallWhite),
      box(0, 0.46, 0, 0.74, 0.06, 0.68, MAT.glassBlue),
      box(0, 0.24, 0.32, 0.4, 0.16, 0.02, MAT.glassCyan, { glow: true }),
      box(0, 0.42, 0.36, 0.5, 0.05, 0.12, MAT.wallIce),
      box(0, 0.56, -0.1, 0.2, 0.06, 0.06, MAT.danger),
      box(0, 0.49, -0.1, 0.06, 0.2, 0.06, MAT.danger),
    ],
    lights: [[0, 0.5, 0.36]],
  }),

  hospital: () => {
    const parts: Part[] = [
      box(-0.5, 0, 0, 1.6, 0.9, 1.4, MAT.wallWhite),
      box(0.9, 0, 0.1, 1.0, 0.6, 1.1, MAT.wallIce),
      box(-0.5, 0.9, 0, 1.68, 0.07, 1.48, MAT.glassBlue),
      box(0.9, 0.6, 0.1, 1.06, 0.06, 1.16, MAT.glassBlue),
      cyl(0.9, 0.66, 0.1, 0.6, 0.03, MAT.metalGrey),
      cyl(0.9, 0.7, 0.1, 0.44, 0.02, MAT.wallWhite),
      box(-0.5, 0.5, 0.72, 0.3, 0.1, 0.06, MAT.danger),
      box(-0.5, 0.3, 0.72, 0.1, 0.3, 0.06, MAT.danger),
    ];
    for (let f = 0; f < 4; f++) parts.push(...windowBand(0.14 + f * 0.2, 1.6, 1.4, MAT.window));
    parts.push(box(-0.5, 0.86, 0.78, 0.9, 0.06, 0.2, MAT.wallIce));
    return { height: 1.1, parts, lights: [[-0.5, 0.9, 0.8]] };
  },

  'fire-station': () => ({
    height: 0.86,
    parts: [
      box(-0.2, 0, 0, 1.3, 0.5, 0.72, MAT.danger),
      box(0.62, 0, 0, 0.34, 0.82, 0.5, MAT.wallBrown),
      box(-0.2, 0.5, 0, 1.38, 0.06, 0.8, MAT.metalDark),
      box(0.62, 0.82, 0, 0.4, 0.05, 0.56, MAT.metalDark),
      box(-0.45, 0, 0.37, 0.42, 0.36, 0.02, MAT.wallIce),
      box(0.05, 0, 0.37, 0.42, 0.36, 0.02, MAT.wallIce),
      box(0.62, 0.6, 0.26, 0.16, 0.14, 0.02, MAT.window, { glow: true }),
    ],
    lights: [[-0.2, 0.56, 0.4]],
  }),

  'police-station': () => ({
    height: 0.72,
    parts: [
      box(0, 0, 0, 1.5, 0.56, 0.72, MAT.wallLavender),
      box(0, 0.56, 0, 1.58, 0.06, 0.8, MAT.roofSlate),
      box(0, 0.2, 0.37, 0.9, 0.2, 0.02, MAT.glassCyan, { glow: true }),
      box(0, 0.5, 0.42, 0.6, 0.05, 0.12, MAT.wallIce),
      box(0, 0.62, 0, 0.3, 0.06, 0.1, MAT.solarBlue, { glow: true }),
      cyl(-0.62, 0, 0.34, 0.06, 0.3, MAT.metalGrey),
    ],
    lights: [[0, 0.6, 0.44]],
  }),

  school: () => {
    const parts: Part[] = [
      box(-0.25, 0, -0.3, 1.4, 0.52, 0.7, MAT.wallCream),
      box(0.3, 0, 0.45, 0.9, 0.46, 0.6, MAT.wallCoral),
      roof(-0.25, 0.52, -0.3, 1.48, 0.2, 0.78, MAT.roofRed),
      roof(0.3, 0.46, 0.45, 0.98, 0.18, 0.68, MAT.roofRed),
      box(-0.85, 0.52, -0.3, 0.22, 0.42, 0.22, MAT.wallWhite),
      cone(-0.85, 0.94, -0.3, 0.3, 0.18, MAT.accentGold),
      box(-0.55, 0.02, 0.5, 0.5, 0.02, 0.5, MAT.leafDeep),
    ];
    for (let i = 0; i < 4; i++) {
      parts.push(box(-0.7 + i * 0.32, 0.22, 0.06, 0.2, 0.16, 0.02, MAT.window, { glow: true }));
    }
    return { height: 1.0, parts, lights: [[-0.25, 0.6, 0.1]] };
  },

  university: () => {
    const parts: Part[] = [
      box(0, 0, -1.0, 2.4, 0.72, 0.6, MAT.wallCream),
      box(-1.0, 0, 0.1, 0.6, 0.64, 1.6, MAT.wallCream),
      box(1.0, 0, 0.1, 0.6, 0.64, 1.6, MAT.wallCream),
      box(0, 0, 1.1, 1.4, 0.56, 0.5, MAT.wallCream),
      roof(0, 0.72, -1.0, 2.5, 0.22, 0.68, MAT.roofSlate),
      box(-1.0, 0.64, 0.1, 0.68, 0.06, 1.68, MAT.roofSlate),
      box(1.0, 0.64, 0.1, 0.68, 0.06, 1.68, MAT.roofSlate),
      ball(0, 0.98, -1.0, 0.7, MAT.accentGold),
      cyl(0, 1.28, -1.0, 0.07, 0.24, MAT.metalGrey),
      box(0, 0.02, 0.2, 1.2, 0.02, 1.0, MAT.leafLight),
    ];
    for (let i = 0; i < 6; i++) {
      parts.push(cyl(-0.6 + i * 0.24, 0, -0.66, 0.12, 0.62, MAT.wallWhite));
    }
    for (let i = 0; i < 5; i++) {
      parts.push(box(-1.28, 0.3, -0.5 + i * 0.3, 0.02, 0.2, 0.16, MAT.window, { glow: true }));
      parts.push(box(1.28, 0.3, -0.5 + i * 0.3, 0.02, 0.2, 0.16, MAT.window, { glow: true }));
    }
    parts.push(...tree(-0.45, 0.3, 0.9, MAT.leafDeep));
    parts.push(...tree(0.45, 0.3, 0.9, MAT.leafDeep));
    return { height: 1.5, parts, lights: [[0, 0.8, 0.4]] };
  },

  'city-hall': () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.5, 0.14, 1.5, MAT.concrete),
      box(0, 0.14, 0, 1.3, 0.6, 1.3, MAT.wallWhite),
      box(0, 0.74, 0, 1.4, 0.08, 1.4, MAT.wallIce),
      roof(0, 0.82, 0, 1.0, 0.2, 0.7, MAT.roofSlate),
      ball(0, 0.98, 0, 0.62, MAT.roofSlate),
      cyl(0, 1.26, 0, 0.05, 0.34, MAT.metalGrey),
      box(0.13, 1.5, 0, 0.24, 0.14, 0.02, MAT.accentGold),
      box(0, 0.14, 0.72, 0.36, 0.34, 0.03, MAT.trunk),
    ];
    for (let i = 0; i < 5; i++) {
      parts.push(cyl(-0.48 + i * 0.24, 0.14, 0.64, 0.13, 0.6, MAT.wallWhite));
    }
    for (let i = 0; i < 3; i++) {
      parts.push(box(-0.36 + i * 0.36, 0.36, -0.66, 0.2, 0.24, 0.02, MAT.window, { glow: true }));
    }
    return { height: 1.7, parts, lights: [[0, 0.8, 0.75]] };
  },

  /* ── Recreation ──────────────────────────────────────────────────────── */
  'pocket-park': (_, rng) => {
    const parts: Part[] = [
      box(0, 0, 0, 0.86, 0.05, 0.86, MAT.leafLight),
      box(0, 0.05, 0.24, 0.6, 0.02, 0.18, MAT.concrete),
      box(-0.02, 0.07, 0.24, 0.3, 0.05, 0.1, MAT.trunk),
    ];
    parts.push(...tree(-0.2, -0.16, 1, MAT.leafDeep));
    parts.push(...tree(0.24, -0.08, 0.8, MAT.leafTeal, rng() > 0.5));
    parts.push(ball(0.3, 0.08, 0.3, 0.12, MAT.flowerPink));
    return { height: 0.6, parts };
  },

  playground: () => ({
    height: 0.5,
    parts: [
      box(0, 0, 0, 0.86, 0.05, 0.86, MAT.wallCream),
      box(-0.22, 0.05, -0.1, 0.28, 0.24, 0.24, MAT.glassBlue),
      { shape: 'wedge', p: [-0.22, 0.29, 0.12], s: [0.26, 0.24, 0.36], color: MAT.accentGold },
      cyl(0.14, 0.05, -0.2, 0.05, 0.36, MAT.danger),
      cyl(0.36, 0.05, -0.2, 0.05, 0.36, MAT.danger),
      box(0.25, 0.4, -0.2, 0.3, 0.04, 0.04, MAT.metalGrey),
      box(0.25, 0.16, -0.2, 0.14, 0.03, 0.1, MAT.leafDeep),
      cyl(0.28, 0.05, 0.26, 0.34, 0.06, MAT.flowerPink),
    ],
  }),

  'sports-court': () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.86, 0.05, 0.86, MAT.leafTeal),
      box(0, 0.055, 0, 1.7, 0.01, 0.72, MAT.wallIce),
      box(0, 0.06, 0, 0.03, 0.01, 0.72, MAT.wallWhite),
      cyl(0, 0.06, 0, 0.4, 0.01, MAT.wallWhite),
    ];
    for (const side of [-1, 1]) {
      parts.push(cyl(side * 0.8, 0.05, 0, 0.05, 0.4, MAT.metalDark));
      parts.push(box(side * 0.72, 0.42, 0, 0.14, 0.12, 0.16, MAT.wallWhite));
    }
    return { height: 0.6, parts };
  },

  plaza: () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.86, 0.06, 1.86, MAT.concrete),
      cyl(0, 0.06, 0, 0.6, 0.1, MAT.wallIce),
      cyl(0, 0.16, 0, 0.14, 0.26, MAT.wallWhite),
      cone(0, 0.42, 0, 0.34, 0.24, MAT.water, { glow: true }),
    ];
    for (const [x, z] of [
      [-0.6, 0.6],
      [0.6, 0.6],
      [-0.6, -0.6],
      [0.6, -0.6],
    ]) {
      parts.push(box(x, 0.06, z, 0.34, 0.06, 0.12, MAT.trunk));
    }
    parts.push(...tree(-0.68, 0, 0.9, MAT.leafDeep));
    parts.push(...tree(0.68, 0, 0.9, MAT.leafDeep));
    parts.push(cyl(0, 0.06, 0.8, 0.05, 0.42, MAT.metalDark));
    parts.push(ball(0, 0.5, 0.8, 0.13, MAT.window, { glow: true }));
    return { height: 0.8, parts, lights: [[0, 0.5, 0.8]] };
  },

  'botanical-garden': () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.86, 0.05, 1.86, MAT.leafLight),
      box(-0.3, 0.05, 0, 1.0, 0.5, 1.2, MAT.glassCyan, { glow: true }),
      roof(-0.3, 0.55, 0, 1.06, 0.3, 1.26, MAT.glassCyan, { glow: true }),
      box(-0.3, 0.05, 0.62, 0.24, 0.34, 0.03, MAT.wallWhite),
    ];
    for (let i = 0; i < 3; i++) {
      parts.push(box(0.62, 0.05, -0.6 + i * 0.6, 0.44, 0.08, 0.4, MAT.trunk));
      parts.push(
        ball(0.62, 0.14, -0.6 + i * 0.6, 0.28, i === 1 ? MAT.flowerYellow : MAT.flowerPink),
      );
    }
    parts.push(...tree(0.7, 0.85, 1.1, MAT.leafDeep, true));
    return { height: 0.95, parts, lights: [[-0.3, 0.5, 0.66]] };
  },

  museum: () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.7, 0.14, 1.5, MAT.concrete),
      box(0, 0.14, -0.1, 1.4, 0.66, 1.2, MAT.wallWhite),
      box(0, 0.8, -0.1, 1.5, 0.08, 1.3, MAT.wallIce),
      roof(0, 0.88, 0.2, 1.5, 0.24, 0.6, MAT.wallIce),
    ];
    for (let i = 0; i < 6; i++) {
      parts.push(cyl(-0.6 + i * 0.24, 0.14, 0.52, 0.14, 0.66, MAT.wallWhite));
    }
    parts.push(box(0, 0.02, 0.72, 0.9, 0.04, 0.2, MAT.concrete));
    parts.push(box(0, 0.3, -0.7, 0.7, 0.24, 0.03, MAT.glassBlue, { glow: true }));
    parts.push(...tree(-0.78, 0.62, 0.8, MAT.leafTeal));
    parts.push(...tree(0.78, 0.62, 0.8, MAT.leafTeal));
    return { height: 1.15, parts, lights: [[0, 0.7, 0.76]] };
  },

  observatory: () => ({
    height: 1.9,
    parts: [
      box(0, 0, 0, 1.5, 0.12, 1.5, MAT.concrete),
      cyl(0, 0.12, 0, 1.0, 0.9, MAT.wallWhite),
      cyl(0, 1.02, 0, 1.14, 0.08, MAT.wallIce),
      ball(0, 1.1, 0, 1.06, MAT.wallIce),
      box(0, 1.1, 0.4, 0.2, 0.7, 0.4, MAT.metalDark),
      cyl(0.1, 1.3, 0.3, 0.16, 0.7, MAT.pipeSteel, { r: [-0.6, 0, 0] }),
      box(0, 0.3, 0.76, 0.3, 0.3, 0.03, MAT.glassCyan, { glow: true }),
      cyl(-0.66, 0.12, 0.66, 0.06, 0.4, MAT.metalGrey),
      ball(-0.66, 0.56, 0.66, 0.13, MAT.window, { glow: true }),
    ],
    lights: [
      [-0.66, 0.56, 0.66],
      [0, 1.7, 0],
    ],
  }),

  /* ── Utility ─────────────────────────────────────────────────────────── */
  'wind-turbine': () => ({
    height: 1.5,
    parts: [
      cyl(0, 0, 0, 0.22, 0.1, MAT.concrete),
      cyl(0, 0.1, 0, 0.13, 1.0, MAT.turbineWhite),
      box(0, 1.06, 0.06, 0.16, 0.16, 0.3, MAT.turbineWhite),
      { shape: 'box', p: [0, 1.14, 0.24], s: [0.06, 0.9, 0.03], color: MAT.turbineWhite, spin: 0 },
      {
        shape: 'box',
        p: [0, 1.14, 0.24],
        s: [0.06, 0.9, 0.03],
        color: MAT.turbineWhite,
        spin: 2.094,
      },
      {
        shape: 'box',
        p: [0, 1.14, 0.24],
        s: [0.06, 0.9, 0.03],
        color: MAT.turbineWhite,
        spin: 4.189,
      },
      ball(0, 1.14, 0.26, 0.12, MAT.metalGrey),
    ],
  }),

  'solar-array': () => {
    const parts: Part[] = [box(0, 0, 0, 1.86, 0.04, 1.86, MAT.concrete)];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const x = -0.45 + col * 0.9;
        const z = -0.6 + row * 0.6;
        parts.push(box(x, 0.18, z, 0.8, 0.03, 0.44, MAT.solarBlue, { r: [-0.5, 0, 0] }));
        parts.push(cyl(x, 0.04, z, 0.05, 0.18, MAT.pipeSteel));
      }
    }
    parts.push(box(0.72, 0.04, 0.78, 0.24, 0.24, 0.16, MAT.metalGrey));
    return { height: 0.4, parts };
  },

  'gas-plant': () => {
    const parts: Part[] = [
      box(-0.4, 0, 0.3, 1.0, 0.5, 1.0, MAT.metalGrey),
      box(-0.4, 0.5, 0.3, 1.06, 0.06, 1.06, MAT.metalDark),
      cyl(0.6, 0, -0.4, 0.7, 0.9, MAT.wallIce),
      cyl(0.6, 0.9, -0.4, 0.78, 0.08, MAT.metalGrey),
      cyl(-0.6, 0, -0.5, 0.34, 1.3, MAT.wallIce),
      cyl(-0.6, 1.3, -0.5, 0.4, 0.08, MAT.danger),
      cyl(0, 0.55, 0.3, 0.14, 0.6, MAT.pipeSteel, { r: [0, 0, 1.5708] }),
      box(-0.4, 0.2, 0.82, 0.4, 0.2, 0.03, MAT.window, { glow: true }),
    ];
    return {
      height: 1.5,
      parts,
      smoke: [
        [-0.6, 1.4, -0.5],
        [0.6, 1.0, -0.4],
      ],
    };
  },

  'battery-bank': () => ({
    height: 0.44,
    parts: [
      box(0, 0, 0, 0.72, 0.06, 0.6, MAT.concrete),
      box(0, 0.06, 0, 0.62, 0.3, 0.48, MAT.tankTeal),
      box(0, 0.36, 0, 0.66, 0.04, 0.52, MAT.metalGrey),
      box(0, 0.14, 0.25, 0.14, 0.08, 0.02, MAT.good, { glow: true }),
      cyl(0.26, 0.06, -0.2, 0.08, 0.24, MAT.pipeSteel),
    ],
  }),

  'water-tower': () => ({
    height: 1.0,
    parts: [
      cyl(-0.16, 0, -0.16, 0.06, 0.5, MAT.pipeSteel),
      cyl(0.16, 0, -0.16, 0.06, 0.5, MAT.pipeSteel),
      cyl(-0.16, 0, 0.16, 0.06, 0.5, MAT.pipeSteel),
      cyl(0.16, 0, 0.16, 0.06, 0.5, MAT.pipeSteel),
      cyl(0, 0.48, 0, 0.62, 0.32, MAT.tankTeal),
      cyl(0, 0.44, 0, 0.66, 0.05, MAT.metalGrey),
      cone(0, 0.8, 0, 0.66, 0.18, MAT.wallIce),
      box(0, 0.56, 0.31, 0.22, 0.1, 0.02, MAT.wallWhite),
    ],
  }),

  'pumping-station': () => ({
    height: 0.72,
    parts: [
      box(-0.4, 0, 0, 0.9, 0.44, 0.7, MAT.wallIce),
      box(-0.4, 0.44, 0, 0.96, 0.06, 0.76, MAT.tankTeal),
      cyl(0.5, 0.22, 0, 0.4, 0.9, MAT.pipeSteel, { r: [0, 0, 1.5708] }),
      cyl(0.5, 0.22, 0, 0.46, 0.08, MAT.metalGrey, { r: [0, 0, 1.5708] }),
      cyl(0.5, 0.5, 0, 0.22, 0.06, MAT.danger),
      box(-0.4, 0.18, 0.36, 0.3, 0.16, 0.02, MAT.window, { glow: true }),
      cyl(-0.75, 0, 0.3, 0.12, 0.3, MAT.pipeSteel),
    ],
  }),

  'sewage-works': () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.86, 0.05, 1.86, MAT.concrete),
      box(-0.6, 0.05, 0.6, 0.6, 0.36, 0.5, MAT.wallIce),
      box(-0.6, 0.41, 0.6, 0.66, 0.05, 0.56, MAT.metalGrey),
    ];
    for (const [x, z] of [
      [0.4, 0.4],
      [0.4, -0.5],
      [-0.5, -0.5],
    ]) {
      parts.push(cyl(x, 0.05, z, 0.72, 0.2, MAT.pipeSteel));
      parts.push(cyl(x, 0.25, z, 0.62, 0.03, MAT.tankTeal));
      parts.push(box(x, 0.26, z, 0.7, 0.03, 0.06, MAT.metalGrey));
    }
    return { height: 0.6, parts, smoke: [[-0.6, 0.5, 0.6]] };
  },

  'waste-depot': () => {
    const parts: Part[] = [
      box(-0.45, 0, 0, 0.86, 0.44, 0.72, MAT.wallOchre),
      roof(-0.45, 0.44, 0, 0.94, 0.14, 0.8, MAT.metalGrey),
      box(-0.45, 0, 0.37, 0.4, 0.34, 0.02, MAT.metalDark),
    ];
    for (let i = 0; i < 3; i++) {
      parts.push(
        box(
          0.35 + (i % 2) * 0.42,
          0,
          -0.3 + i * 0.3,
          0.34,
          0.22,
          0.26,
          i === 1 ? MAT.leafDeep : MAT.solarBlue,
        ),
      );
    }
    parts.push(cyl(0.2, 0.44, -0.3, 0.06, 0.4, MAT.metalGrey));
    return { height: 0.7, parts };
  },

  /* ── Transport ───────────────────────────────────────────────────────── */
  road: () => ({ height: 0.02, parts: [] }),

  'bus-stop': () => ({
    height: 0.42,
    parts: [
      box(0, 0, 0, 0.5, 0.03, 0.34, MAT.concrete),
      cyl(-0.2, 0.03, -0.12, 0.04, 0.34, MAT.metalGrey),
      cyl(0.2, 0.03, -0.12, 0.04, 0.34, MAT.metalGrey),
      box(0, 0.37, -0.04, 0.52, 0.03, 0.3, MAT.glassCyan, { glow: true }),
      box(0, 0.03, -0.14, 0.44, 0.2, 0.02, MAT.glassCyan),
      box(0, 0.1, 0.06, 0.4, 0.05, 0.1, MAT.trunk),
      box(0.28, 0.03, 0.12, 0.04, 0.4, 0.04, MAT.metalDark),
      box(0.28, 0.4, 0.12, 0.14, 0.1, 0.02, MAT.solarBlue, { glow: true }),
    ],
    lights: [[0, 0.4, 0]],
  }),

  'transit-hub': () => {
    const parts: Part[] = [
      box(0, 0, 0, 1.86, 0.12, 1.5, MAT.concrete),
      box(0, 0.12, -0.5, 1.7, 0.06, 0.5, MAT.asphaltDark),
      box(0, 0.12, 0.5, 1.7, 0.06, 0.5, MAT.asphaltDark),
      box(-0.6, 0.18, 0, 0.5, 0.5, 0.44, MAT.wallIce),
      box(-0.6, 0.68, 0, 0.56, 0.05, 0.5, MAT.glassBlue),
    ];
    for (let i = 0; i < 5; i++) {
      parts.push(cyl(-0.8 + i * 0.4, 0.18, 0.72, 0.05, 0.5, MAT.metalGrey));
      parts.push(cyl(-0.8 + i * 0.4, 0.18, -0.72, 0.05, 0.5, MAT.metalGrey));
    }
    parts.push(roof(0, 0.68, 0, 1.9, 0.24, 1.6, MAT.glassCyan, { glow: true }));
    parts.push(box(0.55, 0.18, 0.5, 0.9, 0.28, 0.3, MAT.wallCream));
    parts.push(box(0.55, 0.24, 0.5, 0.94, 0.1, 0.24, MAT.glassBlue, { glow: true }));
    return { height: 1.0, parts, lights: [[0, 0.7, 0]] };
  },

  'ferry-dock': () => {
    const parts: Part[] = [
      box(-0.4, 0, 0, 0.9, 0.1, 0.7, MAT.trunk),
      box(0.5, 0.02, 0, 0.9, 0.06, 0.5, MAT.trunk),
      box(-0.5, 0.1, -0.1, 0.4, 0.32, 0.4, MAT.wallIce),
      roof(-0.5, 0.42, -0.1, 0.46, 0.14, 0.46, MAT.roofRed),
    ];
    for (let i = 0; i < 3; i++) {
      parts.push(cyl(0.2 + i * 0.35, 0, 0.28, 0.08, 0.26, MAT.trunk));
      parts.push(cyl(0.2 + i * 0.35, 0, -0.28, 0.08, 0.26, MAT.trunk));
    }
    parts.push(cyl(-0.5, 0.1, 0.24, 0.05, 0.4, MAT.metalGrey));
    parts.push(ball(-0.5, 0.52, 0.24, 0.12, MAT.window, { glow: true }));
    return { height: 0.7, parts, lights: [[-0.5, 0.52, 0.24]] };
  },

  /* ── Decoration ──────────────────────────────────────────────────────── */
  'tree-cluster': (_, rng) => ({
    height: 0.55,
    parts: [
      ...tree(-0.18, -0.12, 1.1, MAT.leafDeep, rng() > 0.5),
      ...tree(0.2, 0.06, 0.85, MAT.leafLight),
      ...tree(0.02, 0.28, 0.7, MAT.leafTeal, rng() > 0.6),
    ],
  }),

  flowerbed: (_, rng) => {
    const parts: Part[] = [box(0, 0, 0, 0.62, 0.07, 0.62, MAT.trunk)];
    for (let i = 0; i < 6; i++) {
      const x = -0.2 + (i % 3) * 0.2;
      const z = -0.14 + Math.floor(i / 3) * 0.26;
      parts.push(cyl(x, 0.07, z, 0.03, 0.1, MAT.leafDeep));
      parts.push(ball(x, 0.19, z, 0.12, rng() > 0.5 ? MAT.flowerPink : MAT.flowerYellow));
    }
    return { height: 0.26, parts };
  },

  fountain: () => ({
    height: 0.44,
    parts: [
      cyl(0, 0, 0, 0.68, 0.12, MAT.concrete),
      cyl(0, 0.1, 0, 0.56, 0.06, MAT.water, { glow: true }),
      cyl(0, 0.12, 0, 0.14, 0.2, MAT.wallWhite),
      cyl(0, 0.3, 0, 0.3, 0.04, MAT.wallIce),
      cone(0, 0.34, 0, 0.2, 0.16, MAT.water, { glow: true }),
    ],
  }),

  'lamp-post': () => ({
    height: 0.62,
    parts: [
      cyl(0, 0, 0, 0.14, 0.05, MAT.concrete),
      cyl(0, 0.05, 0, 0.05, 0.5, MAT.metalDark),
      box(0, 0.55, 0, 0.22, 0.04, 0.06, MAT.metalDark),
      ball(0.08, 0.53, 0, 0.14, MAT.window, { glow: true }),
    ],
    lights: [[0.08, 0.53, 0]],
  }),

  statue: () => ({
    height: 0.68,
    parts: [
      box(0, 0, 0, 0.44, 0.12, 0.44, MAT.concrete),
      box(0, 0.12, 0, 0.3, 0.24, 0.3, MAT.wallIce),
      box(0, 0.36, 0, 0.16, 0.24, 0.12, MAT.accentGold),
      ball(0, 0.64, 0, 0.16, MAT.accentGold),
      box(0.12, 0.5, 0, 0.2, 0.05, 0.05, MAT.accentGold, { r: [0, 0, 0.6] }),
    ],
  }),
};

/** Fallback so an unknown model id renders as an obvious grey block, not a crash. */
const PLACEHOLDER: BuildingModel = {
  height: 0.5,
  parts: [box(0, 0, 0, 0.6, 0.5, 0.6, MAT.metalGrey)],
};

const cache = new Map<string, BuildingModel>();

/**
 * Parts for one building.
 *
 * Cached by `modelId:level` because the same definition at the same level is
 * geometrically identical, and a 300-building city asks for the same twenty
 * models over and over. `seed` only perturbs the handful of builders that use
 * randomness (planting, flower colour), and it is folded into the cache key.
 */
export function buildingModel(modelId: string, level = 1, seed = 0): BuildingModel {
  const key = `${modelId}:${level}:${seed % 8}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const builder = BUILDERS[modelId];
  const model = builder ? builder(level, makeRng(seed + 1)) : PLACEHOLDER;
  cache.set(key, model);
  return model;
}

export function hasModel(modelId: string): boolean {
  return modelId in BUILDERS;
}

export function modelIds(): string[] {
  return Object.keys(BUILDERS);
}
