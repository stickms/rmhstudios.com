import type { PaletteKey } from './palette';
import type { BuildingId, CropId, UtilityId, ZoneId } from '../content';

export type Vec3 = readonly [number, number, number];
export interface Part {
  shape: 'box' | 'cylinder' | 'cone' | 'sphere';
  /** Full extents (x, y, z) in tile units; a cylinder/cone/sphere uses x as its diameter. */
  size: Vec3;
  /** Centre of the part, relative to the tile centre at ground level (y up). */
  pos: Vec3;
  color: PaletteKey;
  rotY?: number;
}
export interface ModelSpec {
  id: string;
  parts: readonly Part[];
}

export type LotLevel = 1 | 2 | 3;
export type ModelId =
  | `building:${BuildingId}`
  | `crop:${CropId}`
  | `lot:${ZoneId}:${LotLevel}`
  | `utility:${UtilityId}`
  | 'city:green'
  | 'marker:unserved'
  | 'tree'
  | 'pine';

const box = (size: Vec3, pos: Vec3, color: PaletteKey, rotY?: number): Part => ({
  shape: 'box',
  size,
  pos,
  color,
  rotY,
});

const cyl = (size: Vec3, pos: Vec3, color: PaletteKey): Part => ({ shape: 'cylinder', size, pos, color });
const cone = (size: Vec3, pos: Vec3, color: PaletteKey, rotY?: number): Part => ({ shape: 'cone', size, pos, color, rotY });
/** The thin lawn every lot stands on, so a lot reads as a plot of land and not a model dropped on the ground. */
const pad = (color: PaletteKey = 'leaf'): Part => box([0.94, 0.03, 0.94], [0, 0.015, 0], color);

/**
 * The city layer's models: three levels of lot per zone (a lot's front is +z; the scene turns it to face its road),
 * the utilities, the town green and the marker over a lot that is short of power or water. They obey the same
 * style rules as everything else (palette keys only, <=12 parts, inside the tile).
 */
const CITY_MODELS: Record<Exclude<ModelId, `building:${string}` | `crop:${string}` | 'tree' | 'pine'>, ModelSpec> = {
  'lot:homes:1': {
    id: 'lot:homes:1',
    parts: [
      pad(),
      box([0.54, 0.34, 0.48], [0, 0.2, 0], 'cream'),
      cone([0.78, 0.32, 0.78], [0, 0.53, 0], 'blush', Math.PI / 4),
      box([0.12, 0.2, 0.04], [-0.1, 0.13, 0.25], 'wood'),
      box([0.14, 0.12, 0.04], [0.14, 0.24, 0.25], 'butter'),
      box([0.1, 0.2, 0.1], [0.16, 0.6, -0.1], 'stone'),
    ],
  },
  'lot:homes:2': {
    id: 'lot:homes:2',
    parts: [
      pad(),
      box([0.62, 0.62, 0.54], [0, 0.33, 0], 'cream'),
      cone([0.92, 0.4, 0.92], [0, 0.84, 0], 'teal', Math.PI / 4),
      box([0.14, 0.26, 0.04], [-0.14, 0.16, 0.29], 'wood'),
      box([0.13, 0.13, 0.04], [0.15, 0.22, 0.29], 'butter'),
      box([0.13, 0.13, 0.04], [-0.15, 0.5, 0.29], 'butter'),
      box([0.13, 0.13, 0.04], [0.15, 0.5, 0.29], 'butter'),
      box([0.12, 0.26, 0.12], [0.22, 0.95, -0.14], 'stone'),
    ],
  },
  'lot:homes:3': {
    id: 'lot:homes:3',
    parts: [
      pad(),
      box([0.88, 0.96, 0.7], [0, 0.5, 0], 'cream'),
      box([0.94, 0.08, 0.76], [0, 1.0, 0], 'deepTeal'),
      box([0.44, 0.34, 0.4], [-0.16, 1.21, -0.04], 'aqua'),
      box([0.16, 0.3, 0.04], [0, 0.17, 0.37], 'wood'),
      box([0.14, 0.14, 0.04], [-0.28, 0.4, 0.37], 'butter'),
      box([0.14, 0.14, 0.04], [0.28, 0.4, 0.37], 'butter'),
      box([0.14, 0.14, 0.04], [-0.28, 0.72, 0.37], 'butter'),
      box([0.14, 0.14, 0.04], [0.28, 0.72, 0.37], 'butter'),
      box([0.1, 0.18, 0.1], [0.3, 1.13, -0.2], 'stone'),
    ],
  },
  'lot:market:1': {
    id: 'lot:market:1',
    parts: [
      pad('stone'),
      box([0.62, 0.38, 0.5], [0, 0.22, -0.04], 'aqua'),
      box([0.72, 0.05, 0.3], [0, 0.46, 0.2], 'blush'),
      box([0.05, 0.4, 0.05], [-0.32, 0.22, 0.32], 'wood'),
      box([0.05, 0.4, 0.05], [0.32, 0.22, 0.32], 'wood'),
      box([0.24, 0.14, 0.04], [0, 0.6, 0.2], 'butter'),
    ],
  },
  'lot:market:2': {
    id: 'lot:market:2',
    parts: [
      pad('stone'),
      box([0.8, 0.54, 0.6], [0, 0.3, -0.06], 'aqua'),
      box([0.86, 0.07, 0.62], [0, 0.6, -0.06], 'teal'),
      box([0.84, 0.05, 0.3], [0, 0.46, 0.3], 'blush'),
      box([0.84, 0.05, 0.14], [0, 0.46, 0.4], 'powder'),
      box([0.16, 0.28, 0.04], [0, 0.17, 0.25], 'wood'),
      box([0.2, 0.18, 0.04], [-0.26, 0.28, 0.25], 'butter'),
      box([0.2, 0.18, 0.04], [0.26, 0.28, 0.25], 'butter'),
    ],
  },
  'lot:market:3': {
    id: 'lot:market:3',
    parts: [
      pad('stone'),
      box([0.86, 0.9, 0.68], [0, 0.48, -0.06], 'cream'),
      box([0.92, 0.08, 0.74], [0, 0.96, -0.06], 'deepTeal'),
      box([0.9, 0.05, 0.3], [0, 0.46, 0.32], 'blush'),
      box([0.9, 0.05, 0.14], [0, 0.46, 0.42], 'powder'),
      box([0.5, 0.16, 0.05], [0, 1.1, 0.26], 'butter'),
      box([0.16, 0.3, 0.04], [0, 0.17, 0.29], 'wood'),
      box([0.22, 0.2, 0.04], [-0.28, 0.3, 0.29], 'aqua'),
      box([0.22, 0.2, 0.04], [0.28, 0.3, 0.29], 'aqua'),
      box([0.16, 0.14, 0.04], [-0.28, 0.72, 0.29], 'aqua'),
      box([0.16, 0.14, 0.04], [0.28, 0.72, 0.29], 'aqua'),
    ],
  },
  'lot:workshop:1': {
    id: 'lot:workshop:1',
    parts: [
      pad('stone'),
      box([0.62, 0.34, 0.54], [0, 0.2, 0], 'stone'),
      box([0.68, 0.06, 0.6], [0, 0.4, 0], 'wood'),
      cyl([0.12, 0.34, 0.12], [0.2, 0.56, -0.12], 'deepTeal'),
      box([0.2, 0.2, 0.04], [-0.12, 0.17, 0.28], 'wood'),
    ],
  },
  'lot:workshop:2': {
    id: 'lot:workshop:2',
    parts: [
      pad('stone'),
      box([0.82, 0.5, 0.7], [0, 0.28, 0], 'stone'),
      box([0.84, 0.08, 0.32], [0, 0.58, 0.18], 'teal'),
      box([0.84, 0.2, 0.32], [0, 0.66, -0.18], 'teal'),
      cyl([0.14, 0.46, 0.14], [0.28, 0.78, -0.24], 'deepTeal'),
      box([0.26, 0.28, 0.04], [-0.18, 0.15, 0.36], 'wood'),
      box([0.16, 0.12, 0.04], [0.22, 0.34, 0.36], 'butter'),
    ],
  },
  'lot:workshop:3': {
    id: 'lot:workshop:3',
    parts: [
      pad('stone'),
      box([0.9, 0.72, 0.8], [0, 0.38, 0], 'stone'),
      box([0.94, 0.08, 0.84], [0, 0.8, 0], 'deepTeal'),
      cyl([0.16, 1.1, 0.16], [0.3, 0.86, -0.26], 'stone'),
      cyl([0.16, 0.06, 0.16], [0.3, 1.43, -0.26], 'deepTeal'),
      cyl([0.3, 0.5, 0.3], [-0.28, 1.1, -0.18], 'powder'),
      box([0.3, 0.34, 0.04], [0, 0.18, 0.42], 'wood'),
      box([0.14, 0.12, 0.04], [-0.3, 0.5, 0.42], 'butter'),
      box([0.14, 0.12, 0.04], [0.3, 0.5, 0.42], 'butter'),
    ],
  },
  'utility:well': {
    id: 'utility:well',
    parts: [
      pad('stone'),
      cyl([0.5, 0.26, 0.5], [0, 0.13, 0], 'stone'),
      cyl([0.38, 0.05, 0.38], [0, 0.265, 0], 'water'),
      box([0.05, 0.5, 0.05], [-0.22, 0.42, 0], 'wood'),
      box([0.05, 0.5, 0.05], [0.22, 0.42, 0], 'wood'),
      cone([0.6, 0.22, 0.6], [0, 0.78, 0], 'teal', Math.PI / 4),
    ],
  },
  'utility:windmill': {
    id: 'utility:windmill',
    parts: [
      pad(),
      cyl([0.44, 0.7, 0.44], [0, 0.37, 0], 'cream'),
      cone([0.5, 0.28, 0.5], [0, 0.84, 0], 'teal'),
      box([0.1, 0.18, 0.04], [0, 0.12, 0.23], 'wood'),
      box([0.96, 0.07, 0.04], [0, 0.78, 0.27], 'wood'),
      box([0.07, 0.96, 0.04], [0, 0.78, 0.27], 'wood'),
      box([0.34, 0.1, 0.03], [0.26, 0.9, 0.3], 'powder'),
      box([0.34, 0.1, 0.03], [-0.26, 0.66, 0.3], 'powder'),
      cyl([0.1, 0.06, 0.1], [0, 0.78, 0.3], 'deepTeal'),
    ],
  },
  'utility:pump': {
    id: 'utility:pump',
    parts: [
      pad('stone'),
      box([0.7, 0.36, 0.52], [0, 0.2, 0.06], 'stone'),
      box([0.76, 0.06, 0.58], [0, 0.42, 0.06], 'deepTeal'),
      cyl([0.3, 0.56, 0.3], [-0.22, 0.58, -0.12], 'powder'),
      cone([0.34, 0.14, 0.34], [-0.22, 0.93, -0.12], 'teal'),
      box([0.1, 0.1, 0.4], [0.22, 0.34, -0.34], 'aqua'),
      box([0.2, 0.22, 0.04], [0.14, 0.17, 0.34], 'wood'),
    ],
  },
  'utility:waterwheel': {
    id: 'utility:waterwheel',
    parts: [
      pad('stone'),
      box([0.5, 0.42, 0.56], [0.12, 0.23, 0], 'stone'),
      box([0.56, 0.06, 0.62], [0.12, 0.47, 0], 'wood'),
      box([0.08, 0.64, 0.64], [-0.28, 0.4, 0], 'deepTeal'),
      box([0.1, 0.1, 0.84], [-0.28, 0.4, 0], 'wood'),
      box([0.1, 0.8, 0.1], [-0.28, 0.42, 0], 'wood'),
      box([0.1, 0.14, 0.14], [-0.28, 0.72, 0.3], 'powder'),
      box([0.12, 0.2, 0.04], [0.12, 0.14, 0.3], 'butter'),
    ],
  },
  'city:green': {
    id: 'city:green',
    parts: [
      cyl([0.96, 0.04, 0.96], [0, 0.02, 0], 'cream'),
      cyl([0.74, 0.05, 0.74], [0, 0.045, 0], 'sand'),
      cyl([0.36, 0.14, 0.36], [0, 0.09, 0], 'stone'),
      cyl([0.28, 0.16, 0.28], [0, 0.1, 0], 'water'),
      cyl([0.08, 0.34, 0.08], [0, 0.26, 0], 'stone'),
      box([0.16, 0.1, 0.05], [0.4, 0.07, 0.3], 'wood'),
    ],
  },
  'marker:unserved': {
    id: 'marker:unserved',
    // A little signpost with an exclamation mark floating above a lot that is short of power or water.
    parts: [
      box([0.03, 0.14, 0.03], [0, 1.08, 0], 'deepTeal'),
      box([0.16, 0.26, 0.03], [0, 1.28, 0], 'cream'),
      box([0.19, 0.29, 0.02], [0, 1.28, -0.015], 'deepTeal'),
      box([0.045, 0.11, 0.04], [0, 1.32, 0.025], 'blush'),
      box([0.045, 0.045, 0.04], [0, 1.2, 0.025], 'blush'),
    ],
  },
};

export const PROCEDURAL_MODELS: Record<ModelId, ModelSpec> = {
  ...CITY_MODELS,
  'building:road': {
    id: 'building:road',
    parts: [box([1, 0.06, 1], [0, 0.03, 0], 'stone'), box([0.12, 0.07, 0.5], [0, 0.04, 0], 'cream')],
  },
  'building:plot': {
    id: 'building:plot',
    parts: [
      box([0.94, 0.1, 0.94], [0, 0.05, 0], 'wood'),
      box([0.8, 0.12, 0.8], [0, 0.06, 0], 'deepTeal'),
    ],
  },
  // Scale: one tile is about 4 m, a person about 0.4 tiles tall — so a cottage's door is taller than a person.
  'building:cottage': {
    id: 'building:cottage',
    parts: [
      box([0.78, 0.66, 0.78], [0, 0.33, 0], 'cream'),
      { shape: 'cone', size: [1.08, 0.52, 1.08], pos: [0, 0.92, 0], color: 'teal', rotY: Math.PI / 4 },
      box([0.14, 0.34, 0.14], [0.22, 1.0, 0.16], 'stone'),
      box([0.2, 0.44, 0.04], [-0.12, 0.22, 0.4], 'blush'),
      box([0.2, 0.18, 0.04], [0.2, 0.4, 0.4], 'butter'),
    ],
  },
  'building:stall': {
    id: 'building:stall',
    parts: [
      box([0.84, 0.22, 0.5], [0, 0.11, 0.1], 'wood'),
      box([0.94, 0.06, 0.74], [0, 0.7, 0.05], 'powder'),
      box([0.06, 0.68, 0.06], [-0.42, 0.34, -0.22], 'wood'),
      box([0.06, 0.68, 0.06], [0.42, 0.34, -0.22], 'wood'),
      box([0.16, 0.1, 0.16], [-0.2, 0.27, 0.1], 'butter'),
    ],
  },
  'building:kitchen': {
    id: 'building:kitchen',
    parts: [
      box([0.8, 0.56, 0.74], [0, 0.28, 0], 'aqua'),
      box([0.88, 0.08, 0.82], [0, 0.6, 0], 'teal'),
      { shape: 'cylinder', size: [0.26, 0.34, 0.26], pos: [-0.2, 0.81, 0], color: 'deepTeal' },
      box([0.12, 0.3, 0.12], [0.26, 0.79, -0.1], 'stone'),
      box([0.2, 0.42, 0.04], [0.06, 0.21, 0.38], 'butter'),
    ],
  },
  'building:park': {
    id: 'building:park',
    parts: [
      box([0.94, 0.05, 0.94], [0, 0.025, 0], 'leaf'),
      { shape: 'sphere', size: [0.4, 0.4, 0.4], pos: [-0.15, 0.3, -0.1], color: 'leafDeep' },
      box([0.3, 0.1, 0.1], [0.2, 0.1, 0.25], 'wood'),
    ],
  },
  'building:harvester': {
    id: 'building:harvester',
    parts: [
      box([0.8, 0.12, 0.8], [0, 0.06, 0], 'stone'),
      box([0.5, 0.34, 0.5], [0, 0.29, 0], 'teal'),
      { shape: 'cylinder', size: [0.34, 0.1, 0.34], pos: [0, 0.51, 0], color: 'deepTeal' },
      box([0.08, 0.5, 0.08], [0.34, 0.37, 0], 'wood'),
      box([0.34, 0.06, 0.06], [0.2, 0.62, 0], 'wood'),
      box([0.14, 0.12, 0.14], [-0.28, 0.18, 0.28], 'butter'),
    ],
  },
  'crop:wheat': {
    id: 'crop:wheat',
    parts: [
      box([0.07, 0.3, 0.07], [-0.2, 0.15, -0.2], 'butter'),
      box([0.07, 0.3, 0.07], [0.2, 0.15, -0.2], 'wood'),
      box([0.07, 0.3, 0.07], [-0.2, 0.15, 0.2], 'wood'),
      box([0.07, 0.3, 0.07], [0.2, 0.15, 0.2], 'leaf'),
      box([0.7, 0.06, 0.7], [0, 0.03, 0], 'leaf'),
    ],
  },
  'crop:corn': {
    id: 'crop:corn',
    parts: [
      box([0.1, 0.55, 0.1], [-0.18, 0.275, 0], 'leafDeep'),
      box([0.1, 0.55, 0.1], [0.18, 0.275, 0], 'leafDeep'),
      box([0.1, 0.14, 0.1], [0, 0.34, 0.2], 'butter'),
    ],
  },
  'crop:tomato': {
    id: 'crop:tomato',
    parts: [
      box([0.4, 0.2, 0.4], [0, 0.1, 0], 'leaf'),
      box([0.05, 0.34, 0.05], [-0.18, 0.17, -0.18], 'wood'),
      box([0.3, 0.08, 0.3], [0, 0.24, 0], 'leafDeep'),
      { shape: 'sphere', size: [0.14, 0.14, 0.14], pos: [0.12, 0.22, 0.08], color: 'blush' },
      { shape: 'sphere', size: [0.14, 0.14, 0.14], pos: [-0.1, 0.2, -0.1], color: 'blush' },
    ],
  },
  'crop:pumpkin': {
    id: 'crop:pumpkin',
    parts: [
      { shape: 'sphere', size: [0.5, 0.4, 0.5], pos: [0, 0.2, 0], color: 'butter' },
      box([0.06, 0.1, 0.06], [0, 0.45, 0], 'leafDeep'),
      box([0.4, 0.04, 0.12], [0.1, 0.03, 0.3], 'leaf'),
    ],
  },
  tree: {
    id: 'tree',
    parts: [
      { shape: 'cylinder', size: [0.16, 0.6, 0.16], pos: [0, 0.3, 0], color: 'wood' },
      { shape: 'sphere', size: [0.82, 0.8, 0.82], pos: [0, 0.95, 0], color: 'leaf' },
    ],
  },
  pine: {
    id: 'pine',
    parts: [
      { shape: 'cylinder', size: [0.14, 0.4, 0.14], pos: [0, 0.2, 0], color: 'wood' },
      { shape: 'cone', size: [0.8, 0.7, 0.8], pos: [0, 0.65, 0], color: 'leafDeep' },
      { shape: 'cone', size: [0.56, 0.6, 0.56], pos: [0, 1.15, 0], color: 'leaf' },
    ],
  },
};
