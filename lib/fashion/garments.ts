/**
 * **The wardrobe** — every article of clothing and every accessory, described
 * as coverage rather than as geometry.
 *
 * Not one line here says what a coat looks like. It says a coat covers the torso
 * and the top of the thighs and the whole of both arms, and sits 45 mm off the
 * body. The shape comes from the figure wearing it (`figure.ts`), which is what
 * makes the same coat fit a 1.5 m frame and a 2 m one without a second entry.
 *
 * ## Layering is a distance, not a z-index
 *
 * `offset` is the garment's thickness in metres, and it does two jobs at once:
 * it is how far the surface sits off the skin, and it is the draw order. A shirt
 * at 14 mm is inside a jumper at 26 mm is inside a coat at 45 mm — so the render
 * order falls out of the physical fact, and a shirt can never be drawn over the
 * coat because it is not outside it.
 *
 * ## Slots
 *
 * A slot is a place on the body that can hold one thing. Two garments claiming
 * the same slot cannot be worn together, and putting one on takes the other off
 * — the rule a dressing room already has. A dress claims two.
 */

import type { SegmentId } from './figure';
import type { SwatchId } from './palette';

export type Category =
  | 'headwear'
  | 'eyewear'
  | 'top'
  | 'midlayer'
  | 'outerwear'
  | 'bottom'
  | 'onepiece'
  | 'footwear'
  | 'accessory'
  | 'jewellery';

export type Slot =
  | 'head'
  | 'eyes'
  | 'face'
  | 'neck'
  | 'base'
  | 'mid'
  | 'outer'
  | 'waist'
  | 'legs'
  | 'socks'
  | 'feet'
  | 'hands'
  | 'wrist'
  | 'ears'
  | 'fingers'
  | 'bag';

/** Wire primitives that are not worth lofting a tube for. */
export type Trinket = 'glasses' | 'sunglasses' | 'earrings' | 'ring' | 'necklace' | 'chain';

/** One stretch of body a garment covers. */
export interface GarmentPiece {
  segment: SegmentId;
  /** Span along the segment, 0 … 1. */
  from: number;
  to: number;
  /** Multiply the body's radius before offsetting — a skirt is not a thigh. */
  scale?: number;
  /** Extra radius at the `from` end and the `to` end, in metres (flare, cuffs). */
  flareFrom?: number;
  flareTo?: number;
  /** Shift the piece off the spine, in metres. A backpack sits behind the back. */
  bias?: readonly [number, number, number];
}

export interface Garment {
  id: string;
  category: Category;
  /** Every slot this garment occupies. Wearing it evicts whatever held them. */
  slots: Slot[];
  /** Thickness off the skin, in metres. Also the layering order. */
  offset: number;
  pieces: GarmentPiece[];
  /** Section squareness. Soft fabric is round; a stiff boot is not. */
  round?: number;
  /** A wire primitive instead of a lofted layer. */
  trinket?: Trinket;
  /** Which swatch it arrives in. */
  swatch: SwatchId;
}

/* ── Spans, named once so a "long sleeve" means the same everywhere ───────── */

const SLEEVE_FULL: GarmentPiece[] = [
  { segment: 'upperArm', from: 0, to: 1 },
  { segment: 'forearm', from: 0, to: 0.92 },
];
const SLEEVE_SHORT: GarmentPiece[] = [{ segment: 'upperArm', from: 0, to: 0.48 }];
const SLEEVE_THREE_QUARTER: GarmentPiece[] = [
  { segment: 'upperArm', from: 0, to: 1 },
  { segment: 'forearm', from: 0, to: 0.55 },
];
const LEG_FULL: GarmentPiece[] = [
  { segment: 'thigh', from: 0, to: 1 },
  { segment: 'shin', from: 0, to: 0.96 },
];

export const GARMENTS: Garment[] = [
  /* ── Headwear ─────────────────────────────────────────────────────────── */
  {
    id: 'cap',
    category: 'headwear',
    slots: ['head'],
    offset: 0.012,
    swatch: 'ink',
    round: 2.4,
    pieces: [
      { segment: 'head', from: 0.52, to: 1 },
      // The peak: a shallow shelf pushed forward off the brow.
      { segment: 'head', from: 0.52, to: 0.6, scale: 1.05, flareTo: 0.055, bias: [0, 0, 0.055] },
    ],
  },
  {
    id: 'beanie',
    category: 'headwear',
    slots: ['head'],
    offset: 0.016,
    swatch: 'moss',
    round: 2.2,
    pieces: [{ segment: 'head', from: 0.4, to: 1, flareFrom: 0.006 }],
  },
  {
    id: 'bucket-hat',
    category: 'headwear',
    slots: ['head'],
    offset: 0.014,
    swatch: 'sand',
    round: 2.3,
    pieces: [
      { segment: 'head', from: 0.5, to: 1 },
      { segment: 'head', from: 0.48, to: 0.56, flareFrom: 0.075, flareTo: 0.02 },
    ],
  },
  {
    id: 'headband',
    category: 'headwear',
    slots: ['head'],
    offset: 0.01,
    swatch: 'rose',
    pieces: [{ segment: 'head', from: 0.52, to: 0.66 }],
  },
  {
    id: 'hood',
    category: 'headwear',
    slots: ['head'],
    offset: 0.03,
    swatch: 'slate',
    round: 2.4,
    pieces: [
      { segment: 'head', from: 0.34, to: 1, scale: 1.12, flareFrom: 0.02 },
      { segment: 'neck', from: 0, to: 1, scale: 1.5 },
    ],
  },

  /* ── Eyewear + face ───────────────────────────────────────────────────── */
  {
    id: 'glasses',
    category: 'eyewear',
    slots: ['eyes'],
    offset: 0.008,
    swatch: 'ink',
    trinket: 'glasses',
    pieces: [],
  },
  {
    id: 'sunglasses',
    category: 'eyewear',
    slots: ['eyes'],
    offset: 0.008,
    swatch: 'ink',
    trinket: 'sunglasses',
    pieces: [],
  },
  {
    id: 'face-mask',
    category: 'accessory',
    slots: ['face'],
    offset: 0.01,
    swatch: 'bone',
    pieces: [{ segment: 'head', from: 0.06, to: 0.34, scale: 1.02 }],
  },

  /* ── Neck ─────────────────────────────────────────────────────────────── */
  {
    id: 'scarf',
    category: 'accessory',
    slots: ['neck'],
    offset: 0.028,
    swatch: 'clay',
    round: 2.2,
    pieces: [
      { segment: 'neck', from: 0, to: 1, flareFrom: 0.012 },
      { segment: 'torso', from: 0.9, to: 1, scale: 0.5, bias: [0, 0, 0.05] },
    ],
  },
  {
    id: 'necklace',
    category: 'jewellery',
    slots: ['neck'],
    offset: 0.012,
    swatch: 'ochre',
    trinket: 'necklace',
    pieces: [],
  },
  {
    id: 'chain',
    category: 'jewellery',
    slots: ['neck'],
    offset: 0.012,
    swatch: 'bone',
    trinket: 'chain',
    pieces: [],
  },

  /* ── Base layer ───────────────────────────────────────────────────────── */
  {
    id: 'tank-top',
    category: 'top',
    slots: ['base'],
    offset: 0.01,
    swatch: 'bone',
    pieces: [{ segment: 'torso', from: 0.26, to: 0.94 }],
  },
  {
    id: 't-shirt',
    category: 'top',
    slots: ['base'],
    offset: 0.012,
    swatch: 'bone',
    pieces: [{ segment: 'torso', from: 0.22, to: 1 }, ...SLEEVE_SHORT],
  },
  {
    id: 'long-sleeve-tee',
    category: 'top',
    slots: ['base'],
    offset: 0.012,
    swatch: 'slate',
    pieces: [{ segment: 'torso', from: 0.22, to: 1 }, ...SLEEVE_FULL],
  },
  {
    id: 'polo-shirt',
    category: 'top',
    slots: ['base'],
    offset: 0.013,
    swatch: 'moss',
    pieces: [{ segment: 'torso', from: 0.2, to: 1 }, ...SLEEVE_SHORT],
  },
  {
    id: 'shirt',
    category: 'top',
    slots: ['base'],
    offset: 0.015,
    swatch: 'sky',
    round: 2.6,
    pieces: [{ segment: 'torso', from: 0.14, to: 1 }, ...SLEEVE_FULL],
  },
  {
    id: 'blouse',
    category: 'top',
    slots: ['base'],
    offset: 0.015,
    swatch: 'rose',
    pieces: [{ segment: 'torso', from: 0.16, to: 1, flareFrom: 0.012 }, ...SLEEVE_THREE_QUARTER],
  },

  /* ── Mid layer ────────────────────────────────────────────────────────── */
  {
    id: 'jumper',
    category: 'midlayer',
    slots: ['mid'],
    offset: 0.026,
    swatch: 'clay',
    round: 2.3,
    pieces: [{ segment: 'torso', from: 0.16, to: 1 }, ...SLEEVE_FULL],
  },
  {
    id: 'hoodie',
    category: 'midlayer',
    slots: ['mid'],
    offset: 0.03,
    swatch: 'slate',
    round: 2.3,
    pieces: [
      { segment: 'torso', from: 0.14, to: 1 },
      ...SLEEVE_FULL,
      // The hood, down, bunched behind the neck.
      { segment: 'torso', from: 0.92, to: 1, scale: 0.9, flareTo: 0.03, bias: [0, 0.02, -0.05] },
    ],
  },
  {
    id: 'cardigan',
    category: 'midlayer',
    slots: ['mid'],
    offset: 0.028,
    swatch: 'sand',
    pieces: [{ segment: 'torso', from: 0.1, to: 1 }, ...SLEEVE_FULL],
  },
  {
    id: 'sweatshirt',
    category: 'midlayer',
    slots: ['mid'],
    offset: 0.026,
    swatch: 'plum',
    round: 2.3,
    pieces: [{ segment: 'torso', from: 0.18, to: 1 }, ...SLEEVE_FULL],
  },

  /* ── Outerwear ────────────────────────────────────────────────────────── */
  {
    id: 'jacket',
    category: 'outerwear',
    slots: ['outer'],
    offset: 0.042,
    swatch: 'ink',
    round: 2.6,
    pieces: [{ segment: 'torso', from: 0.1, to: 1 }, ...SLEEVE_FULL],
  },
  {
    id: 'blazer',
    category: 'outerwear',
    slots: ['outer'],
    offset: 0.038,
    swatch: 'indigo',
    round: 2.8,
    pieces: [{ segment: 'torso', from: 0.04, to: 1 }, ...SLEEVE_FULL],
  },
  {
    id: 'coat',
    category: 'outerwear',
    slots: ['outer'],
    offset: 0.046,
    swatch: 'clay',
    round: 2.5,
    pieces: [
      { segment: 'torso', from: 0, to: 1 },
      { segment: 'thigh', from: 0, to: 0.55, scale: 1.75, flareTo: 0.03 },
      ...SLEEVE_FULL,
    ],
  },
  {
    id: 'parka',
    category: 'outerwear',
    slots: ['outer'],
    offset: 0.055,
    swatch: 'moss',
    round: 2.4,
    pieces: [
      { segment: 'torso', from: 0, to: 1 },
      { segment: 'thigh', from: 0, to: 0.34, scale: 1.7, flareTo: 0.02 },
      ...SLEEVE_FULL,
    ],
  },
  {
    id: 'raincoat',
    category: 'outerwear',
    slots: ['outer'],
    offset: 0.05,
    swatch: 'ochre',
    round: 2.5,
    pieces: [
      { segment: 'torso', from: 0, to: 1 },
      { segment: 'thigh', from: 0, to: 0.48, scale: 1.8, flareTo: 0.04 },
      ...SLEEVE_FULL,
    ],
  },
  {
    id: 'gilet',
    category: 'outerwear',
    slots: ['outer'],
    offset: 0.04,
    swatch: 'sand',
    round: 2.4,
    pieces: [{ segment: 'torso', from: 0.12, to: 1 }],
  },

  /* ── Bottoms ──────────────────────────────────────────────────────────── */
  {
    id: 'trousers',
    category: 'bottom',
    slots: ['legs'],
    offset: 0.016,
    swatch: 'ink',
    round: 2.4,
    pieces: [{ segment: 'torso', from: 0, to: 0.34 }, ...LEG_FULL],
  },
  {
    id: 'jeans',
    category: 'bottom',
    slots: ['legs'],
    offset: 0.018,
    swatch: 'indigo',
    round: 2.5,
    pieces: [{ segment: 'torso', from: 0, to: 0.32 }, ...LEG_FULL],
  },
  {
    id: 'joggers',
    category: 'bottom',
    slots: ['legs'],
    offset: 0.022,
    swatch: 'slate',
    round: 2.2,
    pieces: [
      { segment: 'torso', from: 0, to: 0.34 },
      { segment: 'thigh', from: 0, to: 1, flareFrom: 0.014 },
      { segment: 'shin', from: 0, to: 0.9, flareFrom: 0.012, flareTo: -0.004 },
    ],
  },
  {
    id: 'shorts',
    category: 'bottom',
    slots: ['legs'],
    offset: 0.018,
    swatch: 'sand',
    round: 2.4,
    pieces: [
      { segment: 'torso', from: 0, to: 0.3 },
      { segment: 'thigh', from: 0, to: 0.55, flareTo: 0.014 },
    ],
  },
  {
    id: 'skirt',
    category: 'bottom',
    slots: ['legs'],
    offset: 0.02,
    swatch: 'plum',
    round: 2.2,
    pieces: [
      { segment: 'torso', from: 0, to: 0.28 },
      { segment: 'thigh', from: 0, to: 0.5, scale: 1.5, flareTo: 0.05 },
    ],
  },
  {
    id: 'leggings',
    category: 'bottom',
    slots: ['legs'],
    offset: 0.008,
    swatch: 'ink',
    pieces: [{ segment: 'torso', from: 0, to: 0.3 }, ...LEG_FULL],
  },

  /* ── One-piece ────────────────────────────────────────────────────────── */
  {
    id: 'dress',
    category: 'onepiece',
    slots: ['base', 'legs'],
    offset: 0.018,
    swatch: 'rose',
    round: 2.2,
    pieces: [
      { segment: 'torso', from: 0.12, to: 1 },
      { segment: 'thigh', from: 0, to: 0.62, scale: 1.6, flareTo: 0.06 },
      ...SLEEVE_SHORT,
    ],
  },
  {
    id: 'jumpsuit',
    category: 'onepiece',
    slots: ['base', 'legs'],
    offset: 0.018,
    swatch: 'moss',
    round: 2.4,
    pieces: [{ segment: 'torso', from: 0, to: 1 }, ...SLEEVE_FULL, ...LEG_FULL],
  },

  /* ── Feet ─────────────────────────────────────────────────────────────── */
  {
    id: 'socks',
    category: 'accessory',
    slots: ['socks'],
    offset: 0.006,
    swatch: 'bone',
    pieces: [
      { segment: 'shin', from: 0.72, to: 1 },
      { segment: 'foot', from: 0, to: 0.9 },
    ],
  },
  {
    id: 'trainers',
    category: 'footwear',
    slots: ['feet'],
    offset: 0.016,
    swatch: 'bone',
    round: 2.8,
    pieces: [
      { segment: 'shin', from: 0.88, to: 1, flareTo: 0.008 },
      { segment: 'foot', from: 0, to: 1, flareFrom: 0.012 },
    ],
  },
  {
    id: 'boots',
    category: 'footwear',
    slots: ['feet'],
    offset: 0.018,
    swatch: 'clay',
    round: 2.7,
    pieces: [
      { segment: 'shin', from: 0.58, to: 1, flareFrom: 0.01 },
      { segment: 'foot', from: 0, to: 1, flareFrom: 0.012 },
    ],
  },
  {
    id: 'dress-shoes',
    category: 'footwear',
    slots: ['feet'],
    offset: 0.012,
    swatch: 'ink',
    round: 3.0,
    pieces: [
      { segment: 'shin', from: 0.93, to: 1 },
      { segment: 'foot', from: 0, to: 1, flareFrom: 0.008 },
    ],
  },
  {
    id: 'sandals',
    category: 'footwear',
    slots: ['feet'],
    offset: 0.008,
    swatch: 'sand',
    round: 3.2,
    pieces: [{ segment: 'foot', from: 0.1, to: 0.95, flareFrom: 0.006 }],
  },

  /* ── Hands, wrist, waist, bag ─────────────────────────────────────────── */
  {
    id: 'gloves',
    category: 'accessory',
    slots: ['hands'],
    offset: 0.008,
    swatch: 'ink',
    pieces: [
      { segment: 'forearm', from: 0.88, to: 1 },
      { segment: 'hand', from: 0, to: 1 },
    ],
  },
  {
    id: 'watch',
    category: 'accessory',
    slots: ['wrist'],
    offset: 0.01,
    swatch: 'ochre',
    round: 3.0,
    pieces: [{ segment: 'forearm', from: 0.86, to: 0.94 }],
  },
  {
    id: 'bracelet',
    category: 'jewellery',
    slots: ['wrist'],
    offset: 0.008,
    swatch: 'bone',
    pieces: [{ segment: 'forearm', from: 0.9, to: 0.94 }],
  },
  {
    id: 'belt',
    category: 'accessory',
    slots: ['waist'],
    offset: 0.02,
    swatch: 'clay',
    round: 3.0,
    pieces: [{ segment: 'torso', from: 0.24, to: 0.32 }],
  },
  {
    id: 'backpack',
    category: 'accessory',
    slots: ['bag'],
    offset: 0.06,
    swatch: 'moss',
    round: 2.8,
    pieces: [{ segment: 'torso', from: 0.5, to: 0.96, scale: 0.72, bias: [0, 0, -0.1] }],
  },
  {
    id: 'tote-bag',
    category: 'accessory',
    slots: ['bag'],
    offset: 0.05,
    swatch: 'sand',
    round: 3.0,
    pieces: [{ segment: 'torso', from: 0.34, to: 0.72, scale: 0.5, bias: [0.24, -0.04, 0.02] }],
  },
  {
    id: 'crossbody-bag',
    category: 'accessory',
    slots: ['bag'],
    offset: 0.045,
    swatch: 'ink',
    round: 2.8,
    pieces: [{ segment: 'torso', from: 0.36, to: 0.6, scale: 0.44, bias: [0.18, 0, 0.08] }],
  },

  /* ── Jewellery ────────────────────────────────────────────────────────── */
  {
    id: 'earrings',
    category: 'jewellery',
    slots: ['ears'],
    offset: 0.006,
    swatch: 'ochre',
    trinket: 'earrings',
    pieces: [],
  },
  {
    id: 'ring',
    category: 'jewellery',
    slots: ['fingers'],
    offset: 0.004,
    swatch: 'ochre',
    trinket: 'ring',
    pieces: [],
  },
];

const BY_ID = new Map(GARMENTS.map((g) => [g.id, g]));

export function getGarment(id: string): Garment | undefined {
  return BY_ID.get(id);
}

/** Categories in the order the wardrobe presents them — head down to feet. */
export const CATEGORY_ORDER: readonly Category[] = [
  'headwear',
  'eyewear',
  'top',
  'midlayer',
  'outerwear',
  'bottom',
  'onepiece',
  'footwear',
  'accessory',
  'jewellery',
];
