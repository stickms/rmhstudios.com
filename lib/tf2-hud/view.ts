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
  { id: '1152x864', label: '1152×864 (4:3)', w: 1152, h: 864 },
  { id: '1280x1024', label: '1280×1024 (5:4)', w: 1280, h: 1024 },
  { id: '1280x720', label: '1280×720 (16:9)', w: 1280, h: 720 },
  { id: '1280x800', label: '1280×800 (16:10, Steam Deck)', w: 1280, h: 800 },
  { id: '1366x768', label: '1366×768 (16:9)', w: 1366, h: 768 },
  { id: '1600x900', label: '1600×900 (16:9)', w: 1600, h: 900 },
  { id: '1440x900', label: '1440×900 (16:10)', w: 1440, h: 900 },
  { id: '1680x1050', label: '1680×1050 (16:10)', w: 1680, h: 1050 },
  { id: '1920x1080', label: '1920×1080 (16:9)', w: 1920, h: 1080 },
  { id: '1920x1200', label: '1920×1200 (16:10)', w: 1920, h: 1200 },
  { id: '2560x1080', label: '2560×1080 (21:9)', w: 2560, h: 1080 },
  { id: '2560x1440', label: '2560×1440 (16:9)', w: 2560, h: 1440 },
  { id: '3440x1440', label: '3440×1440 (21:9)', w: 3440, h: 1440 },
  { id: '2560x1600', label: '2560×1600 (16:10)', w: 2560, h: 1600 },
  { id: '3840x2160', label: '3840×2160 (4K)', w: 3840, h: 2160 },
  { id: '5120x1440', label: '5120×1440 (32:9)', w: 5120, h: 1440 },
];

/** Aspect ratios the custom size can snap to. */
export const ASPECTS = [
  { id: '4:3', value: 4 / 3 },
  { id: '5:4', value: 5 / 4 },
  { id: '16:10', value: 16 / 10 },
  { id: '16:9', value: 16 / 9 },
  { id: '21:9', value: 21 / 9 },
  { id: '32:9', value: 32 / 9 },
] as const;

/** The nearest named aspect within 2%, else a decimal like `1.60:1`. */
export function aspectLabel(w: number, h: number): string {
  if (!(w > 0 && h > 0)) return '—';
  const r = w / h;
  const hit = ASPECTS.find((a) => Math.abs(a.value - r) / a.value < 0.02);
  return hit ? hit.id : `${r.toFixed(2)}:1`;
}

/** The width that gives `aspect` at height `h`. */
export function widthForAspect(aspect: number, h: number): number {
  return clampResolution(h * aspect, h).w;
}

/**
 * The engine lays proportional values out on a 480-unit-high canvas, so a wide
 * screen has more than 640 units across — the number a HUD author actually designs for.
 */
export function virtualSize(w: number, h: number): { w: number; h: number } {
  return { w: Math.round((w * 480) / h), h: 480 };
}

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
