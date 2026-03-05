// =============================================================================
// ALTAIR ENGINE -- Render Quality Profiles
// =============================================================================
// Centralized quality presets used by canvas sizing and renderer detail tuning.
// =============================================================================

export type RenderQualitySetting = 'auto' | 'performance' | 'balanced' | 'quality';
export type RenderQualityPreset = 'performance' | 'balanced' | 'quality';

export interface RenderQualityProfile {
  preset: RenderQualityPreset;
  maxPixelRatio: number;
  internalResolutionScale: number;
  particleStride: number;
  minimapEnemyStride: number;
  minimapPickupStride: number;
}

const PROFILE_MAP: Record<RenderQualityPreset, RenderQualityProfile> = {
  performance: {
    preset: 'performance',
    maxPixelRatio: 1,
    internalResolutionScale: 1,
    particleStride: 2,
    minimapEnemyStride: 2,
    minimapPickupStride: 2,
  },
  balanced: {
    preset: 'balanced',
    maxPixelRatio: 1.25,
    internalResolutionScale: 1,
    particleStride: 1,
    minimapEnemyStride: 1,
    minimapPickupStride: 1,
  },
  quality: {
    preset: 'quality',
    maxPixelRatio: 2,
    internalResolutionScale: 1,
    particleStride: 1,
    minimapEnemyStride: 1,
    minimapPickupStride: 1,
  },
};

function detectAutoPreset(): RenderQualityPreset {
  if (typeof window === 'undefined') return 'balanced';

  const nav = window.navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  if (isMobile && (cores <= 8 || memory <= 4)) return 'performance';
  if (cores <= 4 || memory <= 4) return 'performance';
  if (cores >= 12 && memory >= 8 && !isMobile) return 'quality';
  return 'balanced';
}

export function resolveRenderQualityProfile(setting: RenderQualitySetting): RenderQualityProfile {
  const preset = setting === 'auto' ? detectAutoPreset() : setting;
  return PROFILE_MAP[preset];
}

export function getCanvasPixelRatio(profile: RenderQualityProfile): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  return Math.max(0.5, Math.min(dpr, profile.maxPixelRatio) * profile.internalResolutionScale);
}
