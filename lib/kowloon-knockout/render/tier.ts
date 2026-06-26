export type RenderTier = 'ultra' | 'high' | 'medium' | 'low';

export interface RenderCaps {
    backend: 'WebGPU' | 'WebGL2';
    /** Coarse GPU strength bucket: 0 weak/integrated old, 3 strong discrete. */
    gpuTier: 0 | 1 | 2 | 3;
    isMobile: boolean;
}

export function detectTier(caps: RenderCaps): RenderTier {
    if (caps.isMobile || caps.gpuTier === 0) return 'low';
    if (caps.backend === 'WebGL2') return caps.gpuTier >= 1 ? 'medium' : 'low';
    // WebGPU desktop:
    if (caps.gpuTier >= 3) return 'ultra';
    if (caps.gpuTier === 2) return 'high';
    return 'medium';
}

export const TIER_FLAGS: Record<RenderTier, {
    bloom: boolean; gtao: boolean; ssr: boolean; volumetrics: boolean;
    shadowMapSize: number; gpuParticles: boolean;
}> = {
    ultra:  { bloom: true,  gtao: true,  ssr: true,  volumetrics: true,  shadowMapSize: 4096, gpuParticles: true },
    high:   { bloom: true,  gtao: true,  ssr: false, volumetrics: false, shadowMapSize: 2048, gpuParticles: true },
    medium: { bloom: true,  gtao: false, ssr: false, volumetrics: false, shadowMapSize: 1024, gpuParticles: false },
    low:    { bloom: false, gtao: false, ssr: false, volumetrics: false, shadowMapSize: 1024, gpuParticles: false },
};
