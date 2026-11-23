/**
 * Signal Forge relic table (v2). A relic is data: a trigger with a small effect, or a passive modifier the
 * engine reads (see ../combat.ts `relicPassive`). Text is the English default for t(`relic.<id>.text`).
 */
import type { RelicDef } from '../types';

export const RELICS: RelicDef[] = [
  // Starter
  { id: 'pilot_light', name: 'Pilot Light', rarity: 'starter', text: 'Start each combat with 2 Heat.', trigger: 'combatStart', effect: { heat: 2 } },

  // Common
  { id: 'quench_tank', name: 'Quench Tank', rarity: 'common', text: 'Start each combat with 8 Block.', trigger: 'combatStart', effect: { block: 8 } },
  { id: 'tuning_pin', name: 'Tuning Pin', rarity: 'common', text: 'The beat window is 30% wider.', passive: { windowScale: 1.3 }, timedOnly: true },
  { id: 'copper_coil', name: 'Copper Coil', rarity: 'common', text: 'Each Forge Burst gives you 4 Block.', trigger: 'burst', effect: { block: 4 } },
  { id: 'spark_plug', name: 'Spark Plug', rarity: 'common', text: 'Gain 1 Energy on the first turn of each combat.', trigger: 'firstTurn', effect: { energy: 1 } },
  { id: 'bellows_pump', name: 'Bellows Pump', rarity: 'common', text: 'Venting gives 1 more Block per Heat.', passive: { ventPerHeat: 1 } },
  { id: 'slag_bucket', name: 'Slag Bucket', rarity: 'common', text: 'Gain 8 gold whenever a Glitch enters your deck.', trigger: 'glitchAdded', effect: { gold: 8 } },
  { id: 'heat_shield', name: 'Heat Shield', rarity: 'common', text: 'Venting also gives 4 Block.', trigger: 'vent', effect: { block: 4 } },
  { id: 'ember_core', name: 'Ember Core', rarity: 'common', text: 'Gain 3 Heat on the first turn of each combat.', trigger: 'firstTurn', effect: { heat: 3 } },
  { id: 'rivet_pouch', name: 'Rivet Pouch', rarity: 'common', text: 'Gain 1 Heat whenever an enemy is destroyed.', trigger: 'kill', effect: { heat: 1 } },
  { id: 'oil_can', name: 'Oil Can', rarity: 'common', text: 'Heal 4 HP after each combat.', trigger: 'combatWin', effect: { heal: 4 } },
  { id: 'fuse_wire', name: 'Fuse Wire', rarity: 'common', text: 'Each off-phrase card deals 2 damage to every enemy.', trigger: 'offPhrase', effect: { dmgAll: 2 } },
  { id: 'pressure_gauge', name: 'Pressure Gauge', rarity: 'common', text: 'Every 6th card you land on the phrase draws a card.', trigger: 'phraseHit', effect: { draw: 1 }, every: 6 },
  { id: 'cooling_fin', name: 'Cooling Fin', rarity: 'common', text: 'Remove 1 Static at the end of each turn.', trigger: 'turnEnd', effect: { cool: 1 } },
  { id: 'soldering_iron', name: 'Soldering Iron', rarity: 'common', text: 'Each Perfect deals 1 damage to every enemy.', trigger: 'perfect', effect: { dmgAll: 1 }, timedOnly: true },
  { id: 'scrap_magnet', name: 'Scrap Magnet', rarity: 'common', text: 'Gain 25% more gold from combat.', passive: { goldBonus: 0.25 } },
  { id: 'whetstone', name: 'Whetstone', rarity: 'common', text: 'Cards played on the phrase deal 1 more damage per hit.', passive: { phraseDmg: 1 } },
  { id: 'flux_jar', name: 'Flux Jar', rarity: 'common', text: 'At the start of each combat, apply 1 Vulnerable to every enemy.', trigger: 'combatStart', effect: { vulnAll: 1 } },
  { id: 'thermal_paste', name: 'Thermal Paste', rarity: 'common', text: 'You can hold 4 more Heat.', passive: { heatCap: 4 } },

  // Uncommon
  { id: 'anvil_weight', name: 'Anvil Weight', rarity: 'uncommon', text: 'Start each combat with 1 Strength.', trigger: 'combatStart', effect: { strength: 1 } },
  { id: 'capacitor_bank', name: 'Capacitor Bank', rarity: 'uncommon', text: 'Up to 10 Block carries over to your next turn.', passive: { blockCarry: 10 } },
  { id: 'forge_bellows', name: 'Forge Bellows', rarity: 'uncommon', text: 'Gain 1 Heat at the start of each turn.', trigger: 'turnStart', effect: { heat: 1 } },
  { id: 'harmonic_tuner', name: 'Harmonic Tuner', rarity: 'uncommon', text: 'Forge Bursts deal 6 more damage.', passive: { burstDmg: 6 } },
  { id: 'arc_rod', name: 'Arc Rod', rarity: 'uncommon', text: 'Each Forge Burst applies 1 Vulnerable to every enemy.', trigger: 'burst', effect: { vulnAll: 1 } },
  { id: 'gear_train', name: 'Gear Train', rarity: 'uncommon', text: 'Each Forge Burst draws a card.', trigger: 'burst', effect: { draw: 1 } },
  { id: 'surge_protector', name: 'Surge Protector', rarity: 'uncommon', text: 'Static overloads 2 later.', passive: { staticThreshold: 2 } },
  { id: 'metronome_box', name: 'Metronome Box', rarity: 'uncommon', text: 'The beat window is 50% wider.', passive: { windowScale: 1.5 }, timedOnly: true },
  { id: 'second_wind', name: 'Second Wind', rarity: 'uncommon', text: 'Each Perfect gives you 2 Block.', trigger: 'perfect', effect: { block: 2 }, timedOnly: true },
  { id: 'heat_sink', name: 'Heat Sink', rarity: 'uncommon', text: 'Forge Bursts deal 1 more damage per Heat.', passive: { burstPerHeat: 1 } },
  { id: 'scope_lens', name: 'Scope Lens', rarity: 'uncommon', text: 'Draw 2 more cards on the first turn of each combat.', trigger: 'firstTurn', effect: { draw: 2 } },
  { id: 'barbed_wire', name: 'Barbed Wire', rarity: 'uncommon', text: 'At the start of each combat, apply 3 Bleed to every enemy.', trigger: 'combatStart', effect: { bleedAll: 3 } },
  { id: 'dampener_coil', name: 'Dampener Coil', rarity: 'uncommon', text: 'At the start of each combat, apply 1 Weak to every enemy.', trigger: 'combatStart', effect: { weakAll: 1 } },
  { id: 'recycler', name: 'Recycler', rarity: 'uncommon', text: 'Draw a card whenever a card is exhausted.', trigger: 'exhaust', effect: { draw: 1 } },
  { id: 'fan_belt', name: 'Fan Belt', rarity: 'uncommon', text: 'Venting draws a card.', trigger: 'vent', effect: { draw: 1 } },
  { id: 'kettle_drum', name: 'Kettle Drum', rarity: 'uncommon', text: 'Every 6th card you land on the phrase gives 1 Strength.', trigger: 'phraseHit', effect: { strength: 1 }, every: 6 },

  // Rare
  { id: 'master_anvil', name: 'Master Anvil', rarity: 'rare', text: 'Cards played on the phrase deal 3 more damage per hit.', passive: { phraseDmg: 3 } },
  { id: 'tesla_coil', name: 'Tesla Coil', rarity: 'rare', text: 'Each Forge Burst also deals 8 damage to every enemy.', trigger: 'burst', effect: { dmgAll: 8 } },
  { id: 'perpetual_motion', name: 'Perpetual Motion', rarity: 'rare', text: 'Draw 1 more card each turn.', passive: { handSize: 1 } },
  { id: 'crucible_heart', name: 'Crucible Heart', rarity: 'rare', text: 'Forge Bursts deal 4 more damage and 2 more per Heat.', passive: { burstDmg: 4, burstPerHeat: 2 } },
  { id: 'overclocked_core', name: 'Overclocked Core', rarity: 'rare', text: 'On the first turn of each combat, gain 2 Energy and draw 2 cards.', trigger: 'firstTurn', effect: { energy: 2, draw: 2 } },
  { id: 'phoenix_plate', name: 'Phoenix Plate', rarity: 'rare', text: 'Block is never lost at the start of your turn.', passive: { blockCarry: 999 } },
  { id: 'wild_jack', name: 'Wild Jack', rarity: 'rare', text: 'The first slot of every phrase accepts any waveform.', passive: { firstSlotWild: true } },
  { id: 'time_crystal', name: 'Time Crystal', rarity: 'rare', text: 'Every 3rd turn, gain 1 Energy.', trigger: 'turnStart', effect: { energy: 1 }, every: 3 },
  { id: 'shrapnel_core', name: 'Shrapnel Core', rarity: 'rare', text: 'When an enemy is destroyed, deal 6 damage to every enemy.', trigger: 'kill', effect: { dmgAll: 6 } },
  { id: 'golden_ratio', name: 'Golden Ratio', rarity: 'rare', text: 'Card rewards offer one more card, and combat pays 20% more gold.', passive: { rewardChoices: 1, goldBonus: 0.2 } },
  { id: 'overtone_bell', name: 'Overtone Bell', rarity: 'rare', text: 'Every 2nd card you land on the phrase gives 3 Block.', trigger: 'phraseHit', effect: { block: 3 }, every: 2 },
  { id: 'sunspot', name: 'Sunspot', rarity: 'rare', text: 'Each Forge Burst gives you 1 Strength.', trigger: 'burst', effect: { strength: 1 } },

  // Boss (one is chosen after each act boss)
  { id: 'molten_heart', name: 'Molten Heart', rarity: 'boss', text: '+1 Energy each turn. Start each combat with 3 Static.', passive: { maxEnergy: 1 }, trigger: 'combatStart', effect: { static: 3 } },
  { id: 'iron_lung', name: 'Iron Lung', rarity: 'boss', text: '+1 Energy each turn. The Cooling Bay no longer heals.', passive: { maxEnergy: 1, restHeal: -1 } },
  { id: 'broken_metronome', name: 'Broken Metronome', rarity: 'boss', text: '+1 Energy each turn. Static overloads 2 sooner.', passive: { maxEnergy: 1, staticThreshold: -2 } },
  { id: 'singularity', name: 'Singularity', rarity: 'boss', text: '+1 Energy each turn. Draw 1 fewer card each turn.', passive: { maxEnergy: 1, handSize: -1 } },
  { id: 'ash_crown', name: 'Ash Crown', rarity: 'boss', text: '+1 Energy each turn. Shop prices are 50% higher.', passive: { maxEnergy: 1, shopDiscount: -0.5 } },
  { id: 'forge_core', name: 'Forge Core', rarity: 'boss', text: 'Forge Bursts deal 12 more damage and 1 more per Heat.', passive: { burstDmg: 12, burstPerHeat: 1 } },
  { id: 'choir_bell', name: 'Choir Bell', rarity: 'boss', text: 'Gain 12 max HP. Card rewards offer two more cards.', trigger: 'pickup', effect: { maxHp: 12 }, passive: { rewardChoices: 2 } },
  { id: 'eternal_spark', name: 'Eternal Spark', rarity: 'boss', text: 'Gain 2 Heat at the start of each turn.', trigger: 'turnStart', effect: { heat: 2 } },

  // Event-only
  { id: 'rusty_key', name: 'Rusty Key', rarity: 'event', text: 'Gain 10 max HP.', trigger: 'pickup', effect: { maxHp: 10 } },
  { id: 'cracked_bell', name: 'Cracked Bell', rarity: 'event', text: 'Each Forge Burst heals 3 HP.', trigger: 'burst', effect: { heal: 3 } },
  { id: 'lucky_rivet', name: 'Lucky Rivet', rarity: 'event', text: 'Gain 3 Block at the start of each turn.', trigger: 'turnStart', effect: { block: 3 } },
];

/** Lookup by id: a plain object built once (no cache, no expiry). */
const BY_ID: Readonly<Record<string, RelicDef>> = Object.fromEntries(RELICS.map((r) => [r.id, r]));
export function relicDef(id: string): RelicDef {
  const d = Object.hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
  if (!d) throw new Error(`Unknown relic: ${id}`);
  return d;
}
export function hasRelicDef(id: string): boolean {
  return Object.hasOwn(BY_ID, id);
}
