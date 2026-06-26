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
    bloom: boolean; gtao: boolean; reflection: boolean; atmosphere: boolean;
    shadowMapSize: number; gpuParticles: boolean;
}> = {
    ultra:  { bloom: true,  gtao: true,  reflection: true,  atmosphere: true,  shadowMapSize: 4096, gpuParticles: true },
    high:   { bloom: true,  gtao: true,  reflection: false, atmosphere: true,  shadowMapSize: 2048, gpuParticles: true },
    medium: { bloom: true,  gtao: false, reflection: false, atmosphere: false, shadowMapSize: 1024, gpuParticles: false },
    low:    { bloom: false, gtao: false, reflection: false, atmosphere: false, shadowMapSize: 1024, gpuParticles: false },
};
