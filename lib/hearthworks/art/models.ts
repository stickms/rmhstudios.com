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
  'building:cottage': {
    id: 'building:cottage',
    parts: [
      box([0.7, 0.5, 0.7], [0, 0.25, 0], 'cream'),
      { shape: 'cone', size: [1.0, 0.45, 1.0], pos: [0, 0.72, 0], color: 'teal', rotY: Math.PI / 4 },
      box([0.12, 0.3, 0.12], [0.2, 0.85, 0.15], 'stone'),
      box([0.16, 0.26, 0.04], [0, 0.13, 0.36], 'blush'),
      box([0.16, 0.14, 0.04], [0.22, 0.32, 0.36], 'butter'),
    ],
  },
  'building:stall': {
    id: 'building:stall',
    parts: [
      box([0.8, 0.3, 0.5], [0, 0.15, 0.1], 'wood'),
      box([0.9, 0.06, 0.7], [0, 0.62, 0.05], 'powder'),
      box([0.06, 0.6, 0.06], [-0.4, 0.3, -0.2], 'wood'),
      box([0.06, 0.6, 0.06], [0.4, 0.3, -0.2], 'wood'),
      box([0.2, 0.12, 0.2], [-0.2, 0.36, 0.1], 'butter'),
    ],
  },
  'building:kitchen': {
    id: 'building:kitchen',
    parts: [
      box([0.76, 0.42, 0.7], [0, 0.21, 0], 'aqua'),
      box([0.84, 0.08, 0.78], [0, 0.46, 0], 'teal'),
      { shape: 'cylinder', size: [0.26, 0.3, 0.26], pos: [-0.18, 0.64, 0], color: 'deepTeal' },
      box([0.1, 0.24, 0.1], [0.24, 0.62, -0.1], 'stone'),
      box([0.16, 0.12, 0.04], [0, 0.26, 0.36], 'butter'),
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
  'crop:wheat': {
    id: 'crop:wheat',
    parts: [
      box([0.08, 0.5, 0.08], [-0.2, 0.25, -0.2], 'butter'),
      box([0.08, 0.5, 0.08], [0.2, 0.25, -0.2], 'wood'),
      box([0.08, 0.5, 0.08], [-0.2, 0.25, 0.2], 'wood'),
      box([0.08, 0.5, 0.08], [0.2, 0.25, 0.2], 'leaf'),
      box([0.7, 0.06, 0.7], [0, 0.03, 0], 'leaf'),
    ],
  },
  'crop:corn': {
    id: 'crop:corn',
    parts: [
      box([0.1, 0.8, 0.1], [-0.18, 0.4, 0], 'leafDeep'),
      box([0.1, 0.8, 0.1], [0.18, 0.4, 0], 'leafDeep'),
      box([0.1, 0.16, 0.1], [0, 0.5, 0.2], 'butter'),
    ],
  },
  'crop:tomato': {
    id: 'crop:tomato',
    parts: [
      box([0.4, 0.3, 0.4], [0, 0.15, 0], 'leaf'),
      box([0.06, 0.5, 0.06], [-0.18, 0.25, -0.18], 'wood'),
      box([0.3, 0.1, 0.3], [0, 0.35, 0], 'leafDeep'),
      { shape: 'sphere', size: [0.14, 0.14, 0.14], pos: [0.12, 0.34, 0.08], color: 'blush' },
      { shape: 'sphere', size: [0.14, 0.14, 0.14], pos: [-0.1, 0.3, -0.1], color: 'blush' },
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
      { shape: 'cylinder', size: [0.14, 0.4, 0.14], pos: [0, 0.2, 0], color: 'wood' },
      { shape: 'sphere', size: [0.7, 0.7, 0.7], pos: [0, 0.65, 0], color: 'leaf' },
    ],
  },
  pine: {
    id: 'pine',
    parts: [
      { shape: 'cylinder', size: [0.12, 0.3, 0.12], pos: [0, 0.15, 0], color: 'wood' },
      { shape: 'cone', size: [0.66, 0.5, 0.66], pos: [0, 0.5, 0], color: 'leafDeep' },
      { shape: 'cone', size: [0.46, 0.44, 0.46], pos: [0, 0.82, 0], color: 'leaf' },
    ],
  },
};
