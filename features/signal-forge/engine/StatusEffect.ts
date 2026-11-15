/**
 * Status Effect System
 * Tracks buffs/debuffs on players and enemies with turn-based duration
 */

export type StatusType = 'vulnerable' | 'weak' | 'bleed' | 'freeze' | 'marked';

export interface StatusEffect {
  type: StatusType;
  stacks: number;    // intensity (bleed damage) or flat count
  duration: number;  // turns remaining (-1 = permanent until cleansed)
}

/**
 * Helper function to apply or update a status effect
 */
export function applyStatus(
  effects: StatusEffect[],
  type: StatusType,
  stacks: number,
  duration: number
): StatusEffect[] {
  const existing = effects.find(s => s.type === type);
  
  if (existing) {
    // For bleed, stack additively
    if (type === 'bleed') {
      existing.stacks += stacks;
      existing.duration = Math.max(existing.duration, duration);
    } else {
      // For other effects, extend duration
      existing.duration += duration;
    }
    return effects;
  } else {
    // Add new status effect
    return [...effects, { type, stacks, duration }];
  }
}

/**
 * Helper function to get the value of a status effect
 */
export function getStatusStacks(effects: StatusEffect[], type: StatusType): number {
  const status = effects.find(s => s.type === type);
  return status ? status.stacks : 0;
}

/**
 * Helper function to check if a status effect is active
 */
export function hasStatus(effects: StatusEffect[], type: StatusType): boolean {
  return effects.some(s => s.type === type);
}

/**
 * Helper function to decrement all status effect durations and remove expired ones
 */
export function tickStatusEffects(effects: StatusEffect[]): StatusEffect[] {
  effects.forEach(s => {
    if (s.duration > 0) s.duration--;
  });
  return effects.filter(s => s.duration !== 0);
}

/**
 * Helper function to remove a specific status effect
 */
export function removeStatus(effects: StatusEffect[], type: StatusType): StatusEffect[] {
  return effects.filter(s => s.type !== type);
}
