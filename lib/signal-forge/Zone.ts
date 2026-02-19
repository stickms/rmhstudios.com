// lib/signal-forge/Zone.ts — Random combat zone modifiers

export interface CombatZone {
  id: string;
  name: string;
  description: string;
  effect: ZoneEffect;
}

export type ZoneEffect =
  | { type: 'damage_mult'; value: number }
  | { type: 'shield_mult'; value: number }
  | { type: 'static_per_turn'; value: number }
  | { type: 'forge_burst_bonus'; value: number }
  | { type: 'tempo_cap'; value: number }
  | { type: 'heal_per_turn'; value: number }
  | { type: 'glitch_inject'; value: number }
  | { type: 'no_keywords' }
  | { type: 'none' };

export const zoneTemplates: CombatZone[] = [
  { id: 'neutral', name: 'Stable Signal', description: 'No modifiers.', effect: { type: 'none' } },
  { id: 'amplified', name: 'Amplified Zone', description: 'All damage +25%.', effect: { type: 'damage_mult', value: 1.25 } },
  { id: 'dampened', name: 'Dampened Zone', description: 'All shield +50%.', effect: { type: 'shield_mult', value: 1.5 } },
  { id: 'static_field', name: 'Static Field', description: '+1 Static per turn.', effect: { type: 'static_per_turn', value: 1 } },
  { id: 'resonant', name: 'Resonant Zone', description: 'Forge Burst bonus is +20 (not +12).', effect: { type: 'forge_burst_bonus', value: 20 } },
  { id: 'tempo_storm', name: 'Tempo Storm', description: 'Tempo cap is 8 (not 6).', effect: { type: 'tempo_cap', value: 8 } },
  { id: 'healing', name: 'Healing Grounds', description: 'Heal 2 HP per turn.', effect: { type: 'heal_per_turn', value: 2 } },
  { id: 'corrupted', name: 'Corrupted Zone', description: '1 Glitch injected at combat start.', effect: { type: 'glitch_inject', value: 1 } },
  { id: 'silence', name: 'Silence Zone', description: 'All keywords disabled.', effect: { type: 'no_keywords' } },
  { id: 'volatile', name: 'Volatile Zone', description: 'All damage +50%, all shield -25%.', effect: { type: 'damage_mult', value: 1.5 } },
];

/** Select a random zone for a floor */
export function selectZone(): CombatZone {
  const zones = zoneTemplates.filter(z => z.id !== 'neutral');
  return Math.random() < 0.3
    ? zoneTemplates[0] // 30% chance neutral
    : zones[Math.floor(Math.random() * zones.length)];
}
