import type { RenderTier } from '../tier';

export interface ParticleBudget {
    /** Ambient rain particle count (0 = no rain). */
    rain: number;
    /** Ground-fog mote count (0 = no fog). */
    fog: number;
    /** Max simultaneously-live CPU burst particles. */
    burstCap: number;
}

/** Per-tier particle budgets. Counts are intentionally conservative starting
 *  points — bump during browser sign-off until dense without dropping frames.
 *  rain/fog>0 only matters on compute tiers (ultra/high) except medium, which
 *  runs `rain` on the CPU path. */
const BUDGETS: Record<RenderTier, ParticleBudget> = {
    ultra:  { rain: 8000, fog: 4000, burstCap: 1500 },
    high:   { rain: 5000, fog: 2500, burstCap: 1000 },
    medium: { rain: 2000, fog: 0,    burstCap: 600 },
    low:    { rain: 0,    fog: 0,    burstCap: 300 },
};

export function particleBudget(tier: RenderTier): ParticleBudget {
    return { ...BUDGETS[tier] };
}
