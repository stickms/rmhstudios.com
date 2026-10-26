/**
 * Preview settings: which resolution to lay out for, how to show it, and what to
 * paint behind it. Pure data + constants; the store owns the current values.
 */

import type { CondEnvName } from './scheme/cond';

export interface Resolution {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const RESOLUTIONS: readonly Resolution[] = [
  { id: '640x480', label: '640×480 (4:3)', w: 640, h: 480 },
  { id: '800x600', label: '800×600 (4:3)', w: 800, h: 600 },
  { id: '1024x768', label: '1024×768 (4:3)', w: 1024, h: 768 },
  { id: '1280x720', label: '1280×720 (16:9)', w: 1280, h: 720 },
  { id: '1280x800', label: '1280×800 (16:10, Steam Deck)', w: 1280, h: 800 },
  { id: '1366x768', label: '1366×768 (16:9)', w: 1366, h: 768 },
  { id: '1600x900', label: '1600×900 (16:9)', w: 1600, h: 900 },
  { id: '1680x1050', label: '1680×1050 (16:10)', w: 1680, h: 1050 },
  { id: '1920x1080', label: '1920×1080 (16:9)', w: 1920, h: 1080 },
  { id: '1920x1200', label: '1920×1200 (16:10)', w: 1920, h: 1200 },
  { id: '2560x1080', label: '2560×1080 (21:9)', w: 2560, h: 1080 },
  { id: '2560x1440', label: '2560×1440 (16:9)', w: 2560, h: 1440 },
  { id: '3440x1440', label: '3440×1440 (21:9)', w: 3440, h: 1440 },
  { id: '3840x2160', label: '3840×2160 (4K)', w: 3840, h: 2160 },
];

export const DEFAULT_RESOLUTION = '1920x1080';

export const MIN_DIMENSION = 320;
export const MAX_DIMENSION = 7680;

export function resolutionById(id: string): Resolution | undefined {
  return RESOLUTIONS.find((r) => r.id === id);
}

export function clampResolution(w: number, h: number): { w: number; h: number } {
  const c = (v: number) =>
    Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.round(v) || MIN_DIMENSION));
  return { w: c(w), h: c(h) };
}

export type BackdropKind = 'auto' | 'checker' | 'game' | 'menu' | 'image';

export interface ViewSettings {
  resolution: string;
  custom: { w: number; h: number };
  /** `'fit'` scales the scene to the available space. */
  zoom: 'fit' | number;
  env: CondEnvName;
  minmode: boolean;
  showHidden: boolean;
  showBounds: boolean;
  backdrop: BackdropKind;
  /** Object URL of a screenshot the author supplied. */
  backdropImage?: string;
  /** Opacity of the HUD over the backdrop (the "onion skin"). */
  hudOpacity: number;
  /** Draw the backdrop image above the HUD at this opacity (0 = off) for pixel comparison. */
  compareOpacity: number;
}

export const DEFAULT_VIEW: ViewSettings = {
  resolution: DEFAULT_RESOLUTION,
  custom: { w: 1920, h: 1080 },
  zoom: 'fit',
  env: 'windows',
  minmode: false,
  showHidden: false,
  showBounds: false,
  backdrop: 'auto',
  hudOpacity: 1,
  compareOpacity: 0,
};

export function screenOf(view: ViewSettings): { w: number; h: number } {
  if (view.resolution === 'custom') return clampResolution(view.custom.w, view.custom.h);
  const r = resolutionById(view.resolution) ?? resolutionById(DEFAULT_RESOLUTION)!;
  return { w: r.w, h: r.h };
}

export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
