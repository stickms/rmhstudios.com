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
