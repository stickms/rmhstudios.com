/**
 * Non-React entry point to the render-quality system.
 *
 * `useRenderQuality` covers the R3F games; the imperative renderers
 * (velum2099, void-breaker) are plain classes and need the same tier decision
 * without a hook. Both paths share `probeGpu` + `detectTier`, so a device is
 * classified identically no matter which game it loads.
 */

import { probeGpu } from './probe';
import { detectTier, resolveDpr, TIER_QUALITY, type QualityFlags, type RenderTier } from './tier';

const MOBILE_BREAKPOINT = 768;

function isMobileViewport(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches ?? window.innerWidth < MOBILE_BREAKPOINT;
}

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export interface RuntimeQuality {
    tier: RenderTier;
    quality: QualityFlags;
    /** Ceiling for `renderer.setPixelRatio` — already intersected with native DPR. */
    pixelRatio: number;
}

/** Resolve render quality for the current device, outside React. */
export function detectRuntimeQuality(): RuntimeQuality {
    const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const { gpuTier } = probeGpu();
    const tier = detectTier({
        gpuTier,
        isMobile: isMobileViewport(),
        devicePixelRatio,
        reducedMotion: prefersReducedMotion(),
    });
    const [, max] = resolveDpr(tier, devicePixelRatio);
    return { tier, quality: TIER_QUALITY[tier], pixelRatio: max };
}
