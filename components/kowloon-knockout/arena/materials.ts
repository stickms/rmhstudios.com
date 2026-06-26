/** Shared neon palette + material prop helpers for the arena.
 *  Single source of truth so Phase 1 (PBR/bloom) has one place to tune. */
export const NEON_PALETTE = ['#ff3366', '#33ccff', '#ffcc00', '#33ff99', '#cc33ff', '#ff6633'] as const;

export function emissiveMaterialProps(color: string, intensity: number) {
    return {
        color,
        emissive: color,
        emissiveIntensity: intensity,
        toneMapped: false as const,
    };
}

/** PBR props for fighter body parts — slightly metallic, matte-ish so the neon
 *  environment glints on edges without going chrome. */
export function bodyMaterialProps(color: string) {
    return { color, roughness: 0.45, metalness: 0.35 };
}
