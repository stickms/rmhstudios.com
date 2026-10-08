/**
 * **The figure** — the person RMH Fashion is built around.
 *
 * This is the whole idea of the service in one file. A garment here is not a
 * model of a garment; it is a description of WHICH PART OF A BODY IT COVERS.
 * The sleeve of a coat is lofted from the arm it is worn on, offset outward by
 * the thickness of the coat. So when the figure changes — taller, broader — the
 * coat changes with it, because it was never anything but the arm plus 4 cm.
 *
 * That is what "built around the user" means, and it is why this file has no
 * clothes in it and `garments.ts` has no geometry in it.
 *
 * ## Coordinates
 *
 *   +y  up, with the soles at y = 0
 *   +z  the way the figure faces — toward the camera at rest
 *   +x  the figure's LEFT (the viewer's right)
 *
 * Limbs are described once, on the +x side, and mirrored. Nothing here imports
 * three.js, React or the DOM.
 */

import { frameFor, monotoneSpline } from '@/lib/loft/grid';

export type SegmentId =
  'head' | 'neck' | 'torso' | 'upperArm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot';

/** Segments that exist twice, mirrored across the centreline. */
export const PAIRED_SEGMENTS: readonly SegmentId[] = [
  'upperArm',
  'forearm',
  'hand',
  'thigh',
  'shin',
  'foot',
];

/** Which way round a paired segment is. Unpaired segments are `'centre'`. */
export type Side = 'centre' | 'left' | 'right';

/** One node of a segment's spine. */
export interface SpineNode {
  /** Position along the segment, 0 (start) … 1 (end). Ascending. */
  t: number;
  /** Spine point, in metres. */
  p: readonly [number, number, number];
  /** Half-width across the body, in metres. */
  rx: number;
  /** Half-depth front-to-back, in metres. */
  rz: number;
}

export interface Segment {
  id: SegmentId;
  side: Side;
  nodes: SpineNode[];
  /** Superellipse exponent for the cross-section. 2 is a true ellipse. */
  round: number;
  /**
   * Whether the ends close to points. A head does; an arm does not, because its
   * cut end is hidden inside the shoulder it plugs into.
   */
  capStart: boolean;
  capEnd: boolean;
}

/** How the figure is shaped. This is the "design your user" part. */
export interface FigureSpec {
  /** Standing height, in metres. */
  height: number;
  /**
   * Build, 0 (slight) … 1 (broad). Scales widths and depths, never the skeleton
   * — so a broader figure is a broader figure, not a shorter one.
   */
  build: number;
  /**
   * Shoulder-to-hip ratio, 0 (even) … 1 (tapered). Independent of build so the
   * two most legible axes of a silhouette can be set separately.
   */
  taper: number;
}

export const DEFAULT_FIGURE: FigureSpec = { height: 1.75, build: 0.5, taper: 0.5 };

export const FIGURE_LIMITS = {
  height: { min: 1.45, max: 2.05, step: 0.01 },
  build: { min: 0, max: 1, step: 0.01 },
  taper: { min: 0, max: 1, step: 0.01 },
} as const;

/**
 * Canonical landmark heights, as fractions of standing height.
 *
 * Classical 7.5-head proportions, which is what figure drawing has used for a
 * couple of centuries and what makes a wireframe read as a person rather than as
 * a stack of tubes. They are fractions rather than metres precisely so the
 * height slider moves the whole body coherently.
 */
const LEVEL = {
  crown: 1.0,
  chin: 0.867,
  shoulder: 0.818,
  chest: 0.73,
  waist: 0.63,
  hip: 0.53,
  crotch: 0.475,
  knee: 0.285,
  ankle: 0.045,
  sole: 0,
} as const;

/** Girths, as fractions of height, at build 0 → build 1. */
const GIRTH = {
  headW: [0.044, 0.05],
  headD: [0.052, 0.058],
  neck: [0.021, 0.028],
  shoulderW: [0.105, 0.135],
  chestW: [0.088, 0.122],
  chestD: [0.05, 0.07],
  waistW: [0.072, 0.108],
  waistD: [0.042, 0.062],
  hipW: [0.088, 0.116],
  hipD: [0.048, 0.066],
  upperArm: [0.019, 0.028],
  forearm: [0.016, 0.023],
  wrist: [0.012, 0.016],
  thigh: [0.033, 0.046],
  knee: [0.024, 0.032],
  calf: [0.024, 0.033],
  ankle: [0.014, 0.018],
} as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const girth = (key: keyof typeof GIRTH, spec: FigureSpec) =>
  lerp(GIRTH[key][0], GIRTH[key][1], clamp01(spec.build)) * spec.height;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Clamp a spec into {@link FIGURE_LIMITS}, so a stray value cannot deform the body. */
export function normaliseFigure(spec: Partial<FigureSpec>): FigureSpec {
  const l = FIGURE_LIMITS;
  return {
    height: Math.min(l.height.max, Math.max(l.height.min, spec.height ?? DEFAULT_FIGURE.height)),
    build: clamp01(spec.build ?? DEFAULT_FIGURE.build),
    taper: clamp01(spec.taper ?? DEFAULT_FIGURE.taper),
  };
}

/**
 * Build every segment of the figure.
 *
 * Returned in a stable order — centre segments first, then left, then right — so
 * a renderer can key meshes by index and a test can diff two figures.
 */
export function buildFigure(input: FigureSpec): Segment[] {
  const spec = normaliseFigure(input);
  const H = spec.height;
  const y = (k: keyof typeof LEVEL) => LEVEL[k] * H;
  // Taper widens the shoulders and narrows the waist about their midpoint, so
  // the two ends of the slider are "column" and "V" rather than "small" and "big".
  const t = clamp01(spec.taper) - 0.5;
  const shoulderW = girth('shoulderW', spec) * (1 + 0.18 * t);
  const chestW = girth('chestW', spec) * (1 + 0.12 * t);
  const waistW = girth('waistW', spec) * (1 - 0.14 * t);
  const hipW = girth('hipW', spec) * (1 - 0.06 * t);

  const segments: Segment[] = [];

  // ── Head: an ovoid from the chin to the crown. ──────────────────────────
  const headW = girth('headW', spec);
  const headD = girth('headD', spec);
  const headMid = (y('chin') + y('crown')) / 2;
  segments.push({
    id: 'head',
    side: 'centre',
    round: 2.2,
    capStart: true,
    capEnd: true,
    nodes: [
      { t: 0, p: [0, y('chin'), 0.004], rx: 0, rz: 0 },
      {
        t: 0.18,
        p: [0, lerp(y('chin'), headMid, 0.36), 0.006],
        rx: headW * 0.72,
        rz: headD * 0.78,
      },
      { t: 0.5, p: [0, headMid, 0.004], rx: headW, rz: headD },
      {
        t: 0.82,
        p: [0, lerp(headMid, y('crown'), 0.64), -0.002],
        rx: headW * 0.86,
        rz: headD * 0.88,
      },
      { t: 1, p: [0, y('crown'), -0.006], rx: 0, rz: 0 },
    ],
  });

  // ── Neck ────────────────────────────────────────────────────────────────
  const neck = girth('neck', spec);
  segments.push({
    id: 'neck',
    side: 'centre',
    round: 2.1,
    capStart: false,
    capEnd: false,
    nodes: [
      { t: 0, p: [0, y('shoulder') - 0.01 * H, 0.004], rx: neck * 1.18, rz: neck * 1.2 },
      { t: 1, p: [0, y('chin') + 0.004 * H, 0.006], rx: neck, rz: neck * 1.02 },
    ],
  });

  // ── Torso: shoulders down to the hips. ──────────────────────────────────
  segments.push({
    id: 'torso',
    side: 'centre',
    round: 3.1,
    capStart: true,
    capEnd: true,
    nodes: [
      { t: 0, p: [0, y('hip') - 0.035 * H, 0], rx: hipW * 0.72, rz: girth('hipD', spec) * 0.76 },
      { t: 0.14, p: [0, y('hip'), 0], rx: hipW, rz: girth('hipD', spec) },
      { t: 0.42, p: [0, y('waist'), -0.004 * H], rx: waistW, rz: girth('waistD', spec) },
      { t: 0.72, p: [0, y('chest'), 0.006 * H], rx: chestW, rz: girth('chestD', spec) },
      { t: 0.93, p: [0, y('shoulder'), 0.002 * H], rx: shoulderW, rz: girth('chestD', spec) * 0.9 },
      {
        t: 1,
        p: [0, y('shoulder') + 0.022 * H, 0],
        rx: shoulderW * 0.82,
        rz: girth('chestD', spec) * 0.66,
      },
    ],
  });

  // ── Limbs, described on the +x side and mirrored. ───────────────────────
  const armTop = y('shoulder') - 0.012 * H;
  const elbow = y('waist') + 0.012 * H;
  const wrist = y('crotch') + 0.02 * H;
  // A relaxed A-pose: the arms hang clear of the body, which is the difference
  // between a coat sleeve you can see and a coat sleeve buried in a rib cage.
  const shoulderX = shoulderW * 0.9;
  const elbowX = shoulderX + 0.055 * H;
  const wristX = elbowX + 0.028 * H;

  const limb: [SegmentId, number, SpineNode[]][] = [
    [
      'upperArm',
      2.2,
      [
        {
          t: 0,
          p: [shoulderX, armTop, 0.004],
          rx: girth('upperArm', spec) * 1.12,
          rz: girth('upperArm', spec) * 1.12,
        },
        {
          t: 1,
          p: [elbowX, elbow, -0.004],
          rx: girth('upperArm', spec) * 0.82,
          rz: girth('upperArm', spec) * 0.86,
        },
      ],
    ],
    [
      'forearm',
      2.2,
      [
        {
          t: 0,
          p: [elbowX, elbow, -0.004],
          rx: girth('forearm', spec),
          rz: girth('forearm', spec),
        },
        {
          t: 1,
          p: [wristX, wrist, 0.006],
          rx: girth('wrist', spec),
          rz: girth('wrist', spec) * 1.05,
        },
      ],
    ],
    [
      'hand',
      2.6,
      [
        {
          t: 0,
          p: [wristX, wrist, 0.006],
          rx: girth('wrist', spec) * 1.05,
          rz: girth('wrist', spec) * 0.9,
        },
        {
          t: 0.55,
          p: [wristX + 0.004 * H, wrist - 0.05 * H, 0.008],
          rx: girth('wrist', spec) * 1.3,
          rz: girth('wrist', spec) * 0.72,
        },
        {
          t: 1,
          p: [wristX + 0.006 * H, wrist - 0.105 * H, 0.008],
          rx: girth('wrist', spec) * 0.5,
          rz: girth('wrist', spec) * 0.4,
        },
      ],
    ],
    [
      'thigh',
      2.3,
      [
        {
          t: 0,
          p: [hipW * 0.5, y('hip') - 0.02 * H, 0],
          rx: girth('thigh', spec) * 1.06,
          rz: girth('thigh', spec) * 1.1,
        },
        {
          t: 1,
          p: [hipW * 0.42, y('knee'), 0.004],
          rx: girth('knee', spec),
          rz: girth('knee', spec) * 1.05,
        },
      ],
    ],
    [
      'shin',
      2.3,
      [
        {
          t: 0,
          p: [hipW * 0.42, y('knee'), 0.004],
          rx: girth('knee', spec) * 0.96,
          rz: girth('calf', spec),
        },
        {
          t: 0.42,
          p: [hipW * 0.4, lerp(y('knee'), y('ankle'), 0.42), -0.006],
          rx: girth('calf', spec),
          rz: girth('calf', spec) * 1.12,
        },
        {
          t: 1,
          p: [hipW * 0.38, y('ankle'), 0.002],
          rx: girth('ankle', spec),
          rz: girth('ankle', spec) * 1.1,
        },
      ],
    ],
    [
      'foot',
      3.0,
      [
        {
          t: 0,
          p: [hipW * 0.38, y('ankle'), -0.028 * H],
          rx: girth('ankle', spec) * 1.05,
          rz: girth('ankle', spec) * 1.2,
        },
        {
          t: 0.45,
          p: [hipW * 0.38, y('ankle') * 0.62, 0.03 * H],
          rx: girth('ankle', spec) * 1.2,
          rz: girth('ankle', spec) * 1.5,
        },
        {
          t: 1,
          p: [hipW * 0.36, y('ankle') * 0.42, 0.098 * H],
          rx: girth('ankle', spec) * 0.9,
          rz: girth('ankle', spec) * 0.7,
        },
      ],
    ],
  ];

  for (const side of ['left', 'right'] as const) {
    const flip = side === 'left' ? 1 : -1;
    for (const [id, round, nodes] of limb) {
      segments.push({
        id,
        side,
        round,
        // A limb's start is buried in the joint above it, so it is never capped.
        capStart: false,
        capEnd: id === 'hand' || id === 'foot',
        nodes: nodes.map((n) => ({ ...n, p: [n.p[0] * flip, n.p[1], n.p[2]] as const })),
      });
    }
  }

  return segments;
}

/* ── Reading a segment ────────────────────────────────────────────────────── */

export interface SegmentSample {
  /** Spine point at `t`. */
  p: [number, number, number];
  /** Half-width and half-depth at `t`. */
  rx: number;
  rz: number;
}

const SAMPLE_CACHE = new WeakMap<Segment, (t: number) => SegmentSample>();

/**
 * Sample a segment's spine, with the same monotone cubic the cars use — so a
 * limb cannot bulge wider than the widest node anybody wrote down.
 */
export function sampler(segment: Segment): (t: number) => SegmentSample {
  const hit = SAMPLE_CACHE.get(segment);
  if (hit) return hit;
  const ts = segment.nodes.map((n) => n.t);
  const fx = monotoneSpline(
    ts,
    segment.nodes.map((n) => n.p[0]),
  );
  const fy = monotoneSpline(
    ts,
    segment.nodes.map((n) => n.p[1]),
  );
  const fz = monotoneSpline(
    ts,
    segment.nodes.map((n) => n.p[2]),
  );
  const frx = monotoneSpline(
    ts,
    segment.nodes.map((n) => n.rx),
  );
  const frz = monotoneSpline(
    ts,
    segment.nodes.map((n) => n.rz),
  );
  const fn = (t: number): SegmentSample => ({
    p: [fx(t), fy(t), fz(t)],
    rx: Math.max(0, frx(t)),
    rz: Math.max(0, frz(t)),
  });
  SAMPLE_CACHE.set(segment, fn);
  return fn;
}

/**
 * The figure's standing bounding box, for framing the stage.
 *
 * Inflated by the section's ACTUAL extent — `rx` along the frame's right and
 * `rz` along its up, both perpendicular to the spine — rather than by a sphere
 * at each spine point. The difference is not academic: a sphere at the top of
 * the skull adds the head's radius to the height, so a broader figure would
 * measure taller than it is and the stage would frame it smaller.
 */
export function figureBounds(segments: Segment[]): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const STEPS = 16;
  for (const segment of segments) {
    const at = sampler(segment);
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const { p, rx, rz } = at(t);
      const eps = 0.01;
      const a = at(Math.max(0, t - eps)).p;
      const b = at(Math.min(1, t + eps)).p;
      const { right, up } = frameFor([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      for (let k = 0; k < 3; k++) {
        const extent = Math.abs(right[k]) * rx + Math.abs(up[k]) * rz;
        min[k] = Math.min(min[k], p[k] - extent);
        max[k] = Math.max(max[k], p[k] + extent);
      }
    }
  }
  return { min, max };
}

/** Find one segment by id and side. */
export function findSegment(segments: Segment[], id: SegmentId, side: Side): Segment | undefined {
  return segments.find((s) => s.id === id && s.side === side);
}
