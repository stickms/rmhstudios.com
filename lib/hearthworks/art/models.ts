import type { PaletteKey } from './palette';
import type { BuildingId, CropId } from '../content';

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

export type ModelId = `building:${BuildingId}` | `crop:${CropId}` | 'tree' | 'pine';

const box = (size: Vec3, pos: Vec3, color: PaletteKey, rotY?: number): Part => ({
  shape: 'box',
  size,
  pos,
  color,
  rotY,
});

export const PROCEDURAL_MODELS: Record<ModelId, ModelSpec> = {
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
