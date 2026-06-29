import type { GameState } from '@/lib/temple-of-joy/types';

/**
 * Derived "grandeur" of the temple — a single place that maps raw game progress
 * (lifetime happiness + prestige + sources owned) into the numbers that drive how
 * big, bright and elaborate the 3D world becomes. Framework-agnostic (no three
 * import) so it can be used both in React subscriptions and the render loop.
 */
export interface Progression {
  /** log10(lifetime happiness), ~0 early game → 30+ very late. */
  magnitude: number;
  /** Whole-number "grandeur tier" used to gate structural detail (rings, etc). */
  tier: number;
  /** Sun radius scalar — grows without a hard cap but with diminishing slope. */
  sunScale: number;
  /** 0..1+ overall light/emissive intensity. */
  intensity: number;
  /** How many concentric pillar rings the temple has (1..5). */
  pillarRings: number;
  /** How many floating ceremonial rings orbit the sun (0..4). */
  haloRings: number;
  /** Total source copies owned across all types. */
  totalSources: number;
  /** Distinct source types owned. */
  tiersUnlocked: number;
  /** 0..1 colour-temperature of the sun: warm gold → white-hot → violet. */
  heat: number;
}

export function getProgression(state: GameState): Progression {
  const lifetime = Math.max(1, state.lifetimeHappiness);
  const magnitude = Math.log10(lifetime); // ~0 .. 30+
  const prestige = state.prestigeCount;

  const totalSources = Object.values(state.sources).reduce((s, n) => s + (n ?? 0), 0);
  const tiersUnlocked = Object.values(state.sources).filter((n) => n > 0).length;

  // Grandeur tier climbs steadily and never truly stops (prestige keeps pushing it).
  const tier = Math.floor(magnitude / 4) + prestige;

  return {
    magnitude,
    tier,
    // 0.75 → ~3.0 over a full game; prestige keeps nudging it larger.
    sunScale: 0.75 + Math.min(magnitude, 32) * 0.07 + prestige * 0.06,
    intensity: Math.min(1.4, magnitude / 22 + prestige * 0.05),
    pillarRings: Math.max(1, Math.min(5, 1 + Math.floor(magnitude / 5) + Math.floor(prestige / 2))),
    haloRings: Math.max(0, Math.min(4, Math.floor(magnitude / 7) + Math.floor(prestige / 3))),
    totalSources,
    tiersUnlocked,
    heat: Math.min(1, magnitude / 26 + prestige * 0.03),
  };
}

/** Sun colour ramp: warm gold → white-hot → cool blue → violet at extreme heat. */
export function sunColors(heat: number): { core: string; emissive: string; light: string } {
  if (heat < 0.34) return { core: '#ffcf6b', emissive: '#ffaa2c', light: '#ffc964' };
  if (heat < 0.6) return { core: '#fff2d0', emissive: '#ffd27a', light: '#ffe6b0' };
  if (heat < 0.82) return { core: '#dcefff', emissive: '#bcd4ff', light: '#cfe2ff' };
  return { core: '#efe0ff', emissive: '#d9b3ff', light: '#e7d4ff' };
}
