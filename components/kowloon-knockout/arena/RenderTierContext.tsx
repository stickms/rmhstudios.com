'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { detectTier, TIER_FLAGS, type RenderTier } from '@/lib/kowloon-knockout/render/tier';
import { gpuTierFromRendererString } from '@/lib/kowloon-knockout/render/probe';
import { nextLowerTier } from '@/lib/kowloon-knockout/render/governor';
import { useGraphicsStore, type TierPreference } from '@/lib/kowloon-knockout/render/graphicsStore';

interface TierValue {
    tier: RenderTier;
    flags: (typeof TIER_FLAGS)[RenderTier];
    detectedTier: RenderTier;
    preference: TierPreference;
    /** Governor: lower the auto tier by one step (downscale-only). */
    downscale: () => void;
}
const Ctx = createContext<TierValue | null>(null);

export function RenderTierProvider({ children }: { children: ReactNode }) {
    const gl = useThree((s) => s.gl) as unknown as {
        backend?: { isWebGPUBackend?: boolean };
        getContext?: () => WebGL2RenderingContext;
    };
    const isMobile = useIsMobile();
    const preference = useGraphicsStore((s) => s.preference);

    const detectedTier = useMemo<RenderTier>(() => {
        const backend: 'WebGPU' | 'WebGL2' = gl.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
        let rendererString = '';
        try {
            const ctx = gl.getContext?.();
            const dbg = ctx?.getExtension('WEBGL_debug_renderer_info');
            if (ctx && dbg) rendererString = String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
        } catch {
            /* probing is best-effort; fall through to bucket 1 */
        }
        const gpuTier = rendererString ? gpuTierFromRendererString(rendererString) : (backend === 'WebGPU' ? 3 : 1);
        const tier = detectTier({ backend, gpuTier, isMobile });
        // eslint-disable-next-line no-console
        console.info(`[kowloon] detected render tier: ${tier} (backend=${backend}, gpu=${gpuTier})`);
        return tier;
    }, [gl, isMobile]);

    // The governor lowers this while in Auto. Resets to detected on remount.
    const [governorTier, setGovernorTier] = useState<RenderTier>(detectedTier);
    const downscale = useCallback(() => setGovernorTier((t) => nextLowerTier(t)), []);
    // Keep governor in sync if detection changes (e.g. viewport crosses mobile breakpoint).
    useEffect(() => { setGovernorTier(detectedTier); }, [detectedTier]);

    const value = useMemo<TierValue>(() => {
        const tier = preference === 'auto' ? governorTier : preference;
        return { tier, flags: TIER_FLAGS[tier], detectedTier, preference, downscale };
    }, [preference, governorTier, detectedTier, downscale]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRenderTier(): TierValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useRenderTier must be used within RenderTierProvider');
    return v;
}
