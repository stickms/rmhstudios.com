/**
 * The debt views' palette — the custom properties the three canvas views read
 * their colours from, and the literals to fall back to.
 *
 * Split out of the canvas host when that host moved to `hooks/useCanvasStage.ts`
 * to be shared with the Rebar & Rutabaga menu globe: the loop is general, the
 * colours are this feature's. The eight hues are in `DEBT_CATEGORIES` order, so
 * a category always draws in the same colour across the terrain, the projection
 * and the globe.
 */

import type { StagePaintSpec } from '@/hooks/useCanvasStage';

export const DEBT_PAINT: StagePaintSpec = {
  palette: [
    '--kd-cat-food',
    '--kd-cat-transit',
    '--kd-cat-rent',
    '--kd-cat-gear',
    '--kd-cat-gambling',
    '--kd-cat-emotional',
    '--kd-cat-temporal',
    '--kd-cat-other',
  ],
  paletteFallback: [
    'rgb(218 118 0)',
    'rgb(0 98 212)',
    'rgb(0 168 77)',
    'rgb(146 0 254)',
    'rgb(174 146 0)',
    'rgb(186 0 122)',
    'rgb(0 166 186)',
    'rgb(229 0 38)',
  ],
  ramp: ['--kd-seq-1', '--kd-seq-2', '--kd-seq-3', '--kd-seq-4', '--kd-seq-5'],
  rampFallback: [
    'rgb(250 156 78)',
    'rgb(236 127 31)',
    'rgb(213 104 0)',
    'rgb(187 83 0)',
    'rgb(161 63 0)',
  ],
};
