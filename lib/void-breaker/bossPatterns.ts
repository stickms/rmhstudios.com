/**
 * bossPatterns.ts — Per-boss unique mechanic configs.
 * Each BOSS_WAVE_INTERVAL boss introduces a new mechanical system.
 * Boss tier = wave / BOSS_WAVE_INTERVAL.
 */

export type BossSpecialMechanic =
    | 'standard'      // tier 1  (wave 5)
    | 'multi_phase'   // tier 2  (wave 10) — 3-phase tentacles, already impl.
    | 'laser_beams'   // tier 3  (wave 15) — rotating laser beams + area denial
    | 'arena_shrink'  // tier 4  (wave 20) — arena contracts, swarm summons
    | 'multi_phase'   // tier 5  (wave 25) — enhanced multi-phase
    | 'reality_warp'  // tier 6  (wave 30) — control inversion, time dilation
    | 'enhanced'      // tier 7  (wave 35) — faster version of all above
    | 'void_form';    // tier 8  (wave 40) — 4 phases, void invisibility

export interface BossPatternConfig {
    tier: number;
    wave: number;
    /** Display name */
    name: string;
    /** Atmospheric Chinese title */
    title: string;
    special: BossSpecialMechanic;
    phases: number;
    popupColor: string;
    /** HP multiplier on top of standard scaling */
    hpMult: number;
    /** Spawn message shown on boss arrival */
    arrivalText: string;
}

export const BOSS_PATTERNS: BossPatternConfig[] = [
    {
        tier: 1, wave: 5,
        name: 'Void Construct I', title: '虚空构体',
        special: 'standard', phases: 1, popupColor: '#ff3355', hpMult: 0.7,
        arrivalText: '虚空构体 EMERGES',
    },
    {
        tier: 2, wave: 10,
        name: 'Fallen Angel Ω', title: '堕落天使',
        special: 'multi_phase', phases: 3, popupColor: '#ff2244', hpMult: 1.2,
        arrivalText: '堕落天使 APPROACHES',
    },
    {
        tier: 3, wave: 15,
        name: 'Pattern Engine', title: '规律引擎',
        special: 'laser_beams', phases: 2, popupColor: '#ff6a00', hpMult: 1.3,
        arrivalText: '规律引擎 — PATTERN LOCK ENGAGED',
    },
    {
        tier: 4, wave: 20,
        name: 'Domain Collapser', title: '领域崩塌者',
        special: 'arena_shrink', phases: 2, popupColor: '#cc00ff', hpMult: 1.4,
        arrivalText: '领域崩塌者 — DOMAIN COLLAPSING',
    },
    {
        tier: 5, wave: 25,
        name: 'The Resonance', title: '共鸣体',
        special: 'multi_phase', phases: 3, popupColor: '#ff3355', hpMult: 1.5,
        arrivalText: '共鸣体 — RESONANCE DETECTED',
    },
    {
        tier: 6, wave: 30,
        name: 'Reality Breacher', title: '现实撕裂者',
        special: 'reality_warp', phases: 3, popupColor: '#0066ff', hpMult: 1.7,
        arrivalText: '现实撕裂者 — REALITY FRACTURING',
    },
    {
        tier: 7, wave: 35,
        name: 'The Architect', title: '设计者',
        special: 'enhanced', phases: 3, popupColor: '#ff8800', hpMult: 1.9,
        arrivalText: '设计者 — THE ARCHITECT STIRS',
    },
    {
        tier: 8, wave: 40,
        name: 'The Equilibrium', title: '均衡',
        special: 'void_form', phases: 4, popupColor: '#ffffff', hpMult: 2.5,
        arrivalText: '均衡 — THE VOID SPEAKS',
    },
];

/** Get pattern config for a given wave. Returns null if not a boss wave. */
export function getBossPattern(wave: number): BossPatternConfig | null {
    return BOSS_PATTERNS.find(p => p.wave === wave) ?? null;
}

/** Get pattern by tier number */
export function getBossPatternByTier(tier: number): BossPatternConfig | null {
    return BOSS_PATTERNS.find(p => p.tier === tier) ?? null;
}

/** Generic tier → config with fallback */
export function getBossPatternForTier(tier: number): BossPatternConfig {
    const found = BOSS_PATTERNS.find(p => p.tier === tier);
    if (found) return found;
    // Fallback for non-milestone tiers — use standard multi-phase
    return {
        tier, wave: tier * 5,
        name: `Void Construct ${toRoman(tier)}`, title: '虚空构体',
        special: 'multi_phase', phases: Math.min(tier, 3),
        popupColor: '#ff3355', hpMult: 1 + tier * 0.1,
        arrivalText: '堕落天使 APPROACHES',
    };
}

function toRoman(n: number): string {
    const vals = [10, 9, 5, 4, 1];
    const syms = ['X', 'IX', 'V', 'IV', 'I'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
        while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
    }
    return result;
}
