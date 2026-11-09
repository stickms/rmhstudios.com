import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { probeGpu } from './probe';
import {
    detectTier,
    nextLowerTier,
    resolveDpr,
    TIER_QUALITY,
    type QualityFlags,
    type RenderTier,
    type TierPreference,
} from './tier';

export interface RenderQuality {
    tier: RenderTier;
    /** Tier detection picked before the governor stepped anything down. */
    detectedTier: RenderTier;
    quality: QualityFlags;
    /** Ready to spread onto `<Canvas dpr={...}>`. */
    dpr: [number, number];
    /** Governor hook — steps down one tier. */
    downscale: () => void;
}

/** `window.devicePixelRatio`, hydration-safe (1 on the server / first paint). */
function useDevicePixelRatio(): number {
    return useSyncExternalStore(
        (onChange) => {
            if (typeof window === 'undefined' || !window.matchMedia) return () => {};
            // No 'change' event for DPR itself; a resolution media query fires
            // when the page moves between displays or the zoom level changes.
            const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
            mq.addEventListener('change', onChange);
            return () => mq.removeEventListener('change', onChange);
        },
        () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1),
        () => 1,
    );
}

/** Fraction of the resolved ratio kept after each governor step. */
const GOVERNOR_DPR_SCALE = [1, 0.8, 0.65, 0.5];

/**
 * R3F clamps `devicePixelRatio` into the `[min, max]` range, so on a 1x display
 * a tier change like `[1, 1.25]` -> `[0.6, 1]` still renders at exactly 1 and
 * the governor's "downscale" bought nothing (measured: the canvas stayed at
 * full size at 4 fps). Once the governor has stepped, pin the ratio below the
 * range so a slow device really renders fewer pixels.
 */
export function governedDpr([min, max]: [number, number], steps: number): [number, number] {
    if (steps <= 0) return [min, max];
    const x = Math.max(0.5, max * GOVERNOR_DPR_SCALE[Math.min(steps, GOVERNOR_DPR_SCALE.length - 1)]);
    return [x, x];
}

/**
 * Resolve render quality for a 3D surface.
 *
 * Call this **outside** `<Canvas>` so the `dpr` prop is correct on first
 * render — resizing the drawing buffer afterwards costs a full reallocation.
 * Pair it with `<AdaptiveQuality>` inside the Canvas to enable the governor.
 *
 * SSR-safe: renders at DPR 1 on the server and the first client paint, then
 * settles once the probe and media queries resolve.
 */
export function useRenderQuality(preference: TierPreference = 'auto'): RenderQuality {
    const isMobile = useIsMobile();
    const reducedMotion = useReducedMotion();
    const devicePixelRatio = useDevicePixelRatio();

    const detectedTier = useMemo<RenderTier>(() => {
        const { gpuTier } = probeGpu();
        return detectTier({ gpuTier, isMobile, devicePixelRatio, reducedMotion });
    }, [isMobile, devicePixelRatio, reducedMotion]);

    // The governor only ever lowers this, and only while preference is 'auto'.
    const [governorSteps, setGovernorSteps] = useState(0);
    const downscale = useCallback(() => setGovernorSteps((n) => Math.min(n + 1, 3)), []);

    return useMemo(() => {
        let tier: RenderTier = preference === 'auto' ? detectedTier : preference;
        if (preference === 'auto') {
            for (let i = 0; i < governorSteps; i++) tier = nextLowerTier(tier);
        }
        return {
            tier,
            detectedTier,
            quality: TIER_QUALITY[tier],
            dpr: governedDpr(resolveDpr(tier, devicePixelRatio), preference === 'auto' ? governorSteps : 0),
            downscale,
        };
    }, [preference, detectedTier, governorSteps, devicePixelRatio, downscale]);
}
