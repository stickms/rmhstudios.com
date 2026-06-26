'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { detectTier, TIER_FLAGS, type RenderTier } from '@/lib/kowloon-knockout/render/tier';
import { gpuTierFromRendererString } from '@/lib/kowloon-knockout/render/probe';

interface TierValue { tier: RenderTier; flags: (typeof TIER_FLAGS)[RenderTier]; }
const Ctx = createContext<TierValue | null>(null);

export function RenderTierProvider({ children }: { children: ReactNode }) {
    const gl = useThree((s) => s.gl) as unknown as {
        backend?: { isWebGPUBackend?: boolean };
        getContext?: () => WebGL2RenderingContext;
    };
    const isMobile = useIsMobile();

    const value = useMemo<TierValue>(() => {
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
        console.info(`[kowloon] render tier: ${tier} (backend=${backend}, gpu=${gpuTier})`);
        return { tier, flags: TIER_FLAGS[tier] };
    }, [gl, isMobile]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRenderTier(): TierValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useRenderTier must be used within RenderTierProvider');
    return v;
}
