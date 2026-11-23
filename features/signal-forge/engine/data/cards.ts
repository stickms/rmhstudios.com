/**
 * Signal Forge card table (v2). Numbers are priced by `cardPower` in ../balance.ts and every card is held to
 * its cost-and-rarity band by __tests__/balance.test.ts. Card text is generated from these fields by
 * ui/text.ts, so a number here is the number on the card.
 */
import type { CardDef, Rarity, Waveform } from '../types';

type Fx = Omit<CardDef, 'id' | 'name' | 'rarity' | 'wave' | 'cost'>;
const c = (id: string, name: string, rarity: Rarity, wave: Waveform | 'any', cost: number, fx: Fx = {}): CardDef => ({
  id,
  name,
  rarity,
  wave,
  cost,
  ...fx,
});

export const CARDS: CardDef[] = [
  // ── Starter ────────────────────────────────────────────────────────────────
  c('hammer_strike', 'Hammer Strike', 'starter', 'pulse', 1, { dmg: 6 }),
  c('sine_guard', 'Sine Guard', 'starter', 'sine', 1, { block: 5 }),
  c('saw_rip', 'Saw Rip', 'starter', 'saw', 1, { dmg: 3, hits: 2 }),
  c('noise_spark', 'Noise Spark', 'starter', 'noise', 0, { dmg: 2, heat: 1 }),
  c('bellows', 'Bellows', 'starter', 'noise', 1, { draw: 1, heat: 1, block: 2 }),

  // ── Common: Pulse ──────────────────────────────────────────────────────────
  c('hammer_blow', 'Hammer Blow', 'common', 'pulse', 1, { dmg: 9 }),
  c('twin_rivet', 'Twin Rivet', 'common', 'pulse', 1, { dmg: 4, hits: 2, heat: 1 }),
  c('spark_jab', 'Spark Jab', 'common', 'pulse', 0, { dmg: 4 }),
  c('arc_lance', 'Arc Lance', 'common', 'pulse', 2, { dmg: 13, vuln: 1 }),
  c('pulse_ward', 'Pulse Ward', 'common', 'pulse', 1, { dmg: 5, block: 4 }),
  c('forge_tap', 'Forge Tap', 'common', 'pulse', 0, { dmg: 3, heat: 1 }),
  c('rising_beat', 'Rising Beat', 'common', 'pulse', 1, { dmg: 7, heat: 1 }),
  c('spot_weld', 'Spot Weld', 'common', 'pulse', 1, { dmg: 6, weak: 1 }),
  c('overstrike', 'Overstrike', 'common', 'pulse', 2, { dmg: 18, static: 1 }),
  c('tempered_edge', 'Tempered Edge', 'common', 'pulse', 1, { dmg: 5, dmgPerHeat: 1 }),
  // ── Common: Sine ───────────────────────────────────────────────────────────
  c('sine_shield', 'Sine Shield', 'common', 'sine', 1, { block: 9 }),
  c('smooth_wave', 'Smooth Wave', 'common', 'sine', 1, { block: 6, draw: 1 }),
  c('coolant', 'Coolant', 'common', 'sine', 1, { block: 6, cool: 2 }),
  c('low_hum', 'Low Hum', 'common', 'sine', 0, { block: 4 }),
  c('shell_plate', 'Shell Plate', 'common', 'sine', 2, { block: 15 }),
  c('bulwark_tone', 'Bulwark Tone', 'common', 'sine', 1, { block: 7, weak: 1 }),
  c('damper', 'Damper', 'common', 'sine', 1, { block: 5, dmg: 4 }),
  c('resonant_hull', 'Resonant Hull', 'common', 'sine', 1, { block: 5, blockPerHeat: 1 }),
  c('held_note', 'Held Note', 'common', 'sine', 1, { block: 8, retain: true }),
  c('mirror_phase', 'Mirror Phase', 'common', 'sine', 1, { block: 6, blockFromHurt: true }),
  // ── Common: Saw ────────────────────────────────────────────────────────────
  c('saw_tooth', 'Saw Tooth', 'common', 'saw', 1, { dmg: 3, hits: 3 }),
  c('rip_cord', 'Rip Cord', 'common', 'saw', 1, { dmg: 5, bleed: 3 }),
  c('bandsaw', 'Bandsaw', 'common', 'saw', 2, { dmg: 8, aoe: true }),
  c('serrate', 'Serrate', 'common', 'saw', 0, { dmg: 1, bleed: 2 }),
  c('chatter', 'Chatter', 'common', 'saw', 1, { dmg: 2, hits: 4 }),
  c('grinder', 'Grinder', 'common', 'saw', 1, { dmg: 4, hits: 2, draw: 1 }),
  c('kerf', 'Kerf', 'common', 'saw', 1, { dmg: 7, bleed: 1 }),
  c('swarf_spray', 'Swarf Spray', 'common', 'saw', 1, { dmg: 2, bleed: 3, aoe: true }),
  // ── Common: Noise ──────────────────────────────────────────────────────────
  c('static_burst', 'Static Burst', 'common', 'noise', 1, { dmg: 11, static: 1 }),
  c('white_noise', 'White Noise', 'common', 'noise', 1, { dmg: 5, dmgPerStatic: 2 }),
  c('crackle', 'Crackle', 'common', 'noise', 0, { dmg: 3, heat: 1 }),
  c('feedback', 'Feedback', 'common', 'noise', 1, { dmg: 3, draw: 2, static: 1 }),
  c('fuzz', 'Fuzz', 'common', 'noise', 1, { dmg: 6, weak: 1 }),
  c('stoke', 'Stoke', 'common', 'noise', 1, { heat: 3, draw: 1 }),
  c('signal_flare', 'Signal Flare', 'common', 'noise', 2, { dmg: 10, aoe: true, static: 1 }),
  c('ground_wire', 'Ground Wire', 'common', 'noise', 0, { cool: 3 }),
  // ── Common: Any ────────────────────────────────────────────────────────────
  c('patch_cable', 'Patch Cable', 'common', 'any', 1, { dmg: 4, block: 3 }),
  c('jumper', 'Jumper', 'common', 'any', 0, { heat: 1 }),

  // ── Uncommon: Pulse ────────────────────────────────────────────────────────
  c('piston_drive', 'Piston Drive', 'uncommon', 'pulse', 2, { dmg: 8, hits: 2, heat: 1 }),
  c('arc_welder', 'Arc Welder', 'uncommon', 'pulse', 1, { dmg: 6, vuln: 2, heat: 1 }),
  c('quench_strike', 'Quench Strike', 'uncommon', 'pulse', 1, { dmg: 4, dmgPerHeat: 3, spendHeat: true }),
  c('metronome', 'Metronome', 'uncommon', 'pulse', 1, { dmg: 6, draw: 1, heat: 1 }),
  c('drop_forge', 'Drop Forge', 'uncommon', 'pulse', 2, { dmg: 20 }),
  c('stamp', 'Stamp', 'uncommon', 'pulse', 0, { dmg: 7, heat: 1, exhaust: true }),
  c('crescendo', 'Crescendo', 'uncommon', 'pulse', 1, { dmg: 5, dmgPerPlayed: 3 }),
  c('work_harden', 'Work Harden', 'uncommon', 'pulse', 1, { strength: 2, heat: 1, exhaust: true }),
  c('pulse_train', 'Pulse Train', 'uncommon', 'pulse', 1, { dmg: 3, hits: 3, heat: 1 }),
  c('tap_tempo', 'Tap Tempo', 'uncommon', 'pulse', 0, { dmg: 3, draw: 1 }),
  // ── Uncommon: Sine ─────────────────────────────────────────────────────────
  c('standing_wave', 'Standing Wave', 'uncommon', 'sine', 2, { block: 13, draw: 1, retain: true }),
  c('phase_lock', 'Phase Lock', 'uncommon', 'sine', 1, { block: 6, jam: true }),
  c('resonance_shell', 'Resonance Shell', 'uncommon', 'sine', 1, { block: 4, blockPerHeat: 2 }),
  c('harmonic_guard', 'Harmonic Guard', 'uncommon', 'sine', 1, { block: 9, heat: 1, cool: 1 }),
  c('overtone', 'Overtone', 'uncommon', 'sine', 1, { block: 5, draw: 2 }),
  c('carrier_wave', 'Carrier Wave', 'uncommon', 'sine', 0, { block: 3, energy: 1, exhaust: true }),
  c('countertone', 'Countertone', 'uncommon', 'sine', 1, { block: 7, weak: 2 }),
  c('dampening_field', 'Dampening Field', 'uncommon', 'sine', 2, { block: 10, weak: 2, aoe: true }),
  c('reflector', 'Reflector', 'uncommon', 'sine', 2, { block: 12, blockAsDmg: true }),
  c('coolant_flood', 'Coolant Flood', 'uncommon', 'sine', 1, { block: 6, cool: 4, purge: 1 }),
  // ── Uncommon: Saw ──────────────────────────────────────────────────────────
  c('rotary_blade', 'Rotary Blade', 'uncommon', 'saw', 2, { dmg: 4, hits: 4 }),
  c('hemorrhage_coil', 'Hemorrhage Coil', 'uncommon', 'saw', 1, { dmg: 3, bleed: 6 }),
  c('jagged_edge', 'Jagged Edge', 'uncommon', 'saw', 1, { dmg: 4, bleed: 2, doubleBleed: true }),
  c('whirl', 'Whirl', 'uncommon', 'saw', 2, { dmg: 6, bleed: 2, aoe: true }),
  c('shrapnel', 'Shrapnel', 'uncommon', 'saw', 1, { dmg: 2, hits: 3, aoe: true, heat: 1 }),
  c('chain_saw', 'Chain Saw', 'uncommon', 'saw', 2, { dmg: 3, hits: 5, heat: 1 }),
  c('tear', 'Tear', 'uncommon', 'saw', 0, { dmg: 3, bleed: 2 }),
  c('flayer', 'Flayer', 'uncommon', 'saw', 1, { dmg: 6, vuln: 1, bleed: 2 }),
  c('grind_down', 'Grind Down', 'uncommon', 'saw', 1, { dmg: 3, hits: 2, weak: 1, bleed: 2 }),
  // ── Uncommon: Noise ────────────────────────────────────────────────────────
  c('overload', 'Overload', 'uncommon', 'noise', 2, { dmg: 9, dmgPerStatic: 3 }),
  c('glitch_harvest', 'Glitch Harvest', 'uncommon', 'noise', 1, { dmg: 10, draw: 1, glitch: 1 }),
  c('surge', 'Surge', 'uncommon', 'noise', 1, { energy: 2, draw: 1, static: 1, exhaust: true }),
  c('squelch', 'Squelch', 'uncommon', 'noise', 1, { cool: 3, purge: 2, draw: 1 }),
  c('interference', 'Interference', 'uncommon', 'noise', 1, { jam: true, weak: 1, vuln: 1 }),
  c('distortion', 'Distortion', 'uncommon', 'noise', 2, { dmg: 6, vuln: 1, aoe: true }),
  c('thermal_spike', 'Thermal Spike', 'uncommon', 'noise', 1, { heat: 4, draw: 1 }),
  c('broadband', 'Broadband', 'uncommon', 'noise', 2, { dmg: 14, heat: 1 }),
  // ── Uncommon: Any ──────────────────────────────────────────────────────────
  c('tuning_fork', 'Tuning Fork', 'uncommon', 'any', 1, { skipSlot: true, draw: 1 }),
  c('splice', 'Splice', 'uncommon', 'any', 1, { dmg: 6, block: 4 }),
  c('auto_tune', 'Auto-Tune', 'uncommon', 'any', 0, { skipSlot: true }),
  c('forge_link', 'Forge Link', 'uncommon', 'any', 1, { heat: 2, draw: 1 }),

  // ── Rare: Pulse ────────────────────────────────────────────────────────────
  c('trip_hammer', 'Trip Hammer', 'rare', 'pulse', 2, { dmg: 14, hits: 2 }),
  c('sunforge', 'Sunforge', 'rare', 'pulse', 3, { dmg: 22, aoe: true }),
  c('meltdown', 'Meltdown', 'rare', 'pulse', 1, { dmgPerHeat: 5, spendHeat: true }),
  c('cascade', 'Cascade', 'rare', 'pulse', 1, { dmg: 6, dmgPerPlayed: 5 }),
  c('anvil_heart', 'Anvil Heart', 'rare', 'pulse', 1, { strength: 3, exhaust: true }),
  c('perfect_pitch', 'Perfect Pitch', 'rare', 'pulse', 0, { dmg: 6, heat: 2, draw: 1 }),
  c('hammerfall', 'Hammerfall', 'rare', 'pulse', 3, { dmg: 30, vuln: 2 }),
  // ── Rare: Sine ─────────────────────────────────────────────────────────────
  c('aegis_chord', 'Aegis Chord', 'rare', 'sine', 2, { block: 22, cool: 2 }),
  c('infinite_sustain', 'Infinite Sustain', 'rare', 'sine', 1, { block: 8, blockPerHeat: 1, heat: 1, retain: true }),
  c('null_field', 'Null Field', 'rare', 'sine', 2, { jam: true, weak: 2, aoe: true }),
  c('shield_nova', 'Shield Nova', 'rare', 'sine', 2, { block: 10, blockAsDmg: true, aoe: true }),
  c('cold_forge', 'Cold Forge', 'rare', 'sine', 1, { block: 12, energy: 1, heat: 1, exhaust: true }),
  c('lullaby', 'Lullaby', 'rare', 'sine', 1, { block: 7, weak: 3 }),
  // ── Rare: Saw ──────────────────────────────────────────────────────────────
  c('buzzkill', 'Buzzkill', 'rare', 'saw', 2, { dmg: 3, hits: 7 }),
  c('crimson_tide', 'Crimson Tide', 'rare', 'saw', 2, { bleed: 9, aoe: true, draw: 1, exhaust: true }),
  c('exsanguinate', 'Exsanguinate', 'rare', 'saw', 1, { dmg: 4, bleed: 4, doubleBleed: true }),
  c('maelstrom', 'Maelstrom', 'rare', 'saw', 3, { dmg: 5, hits: 4, aoe: true }),
  c('thousand_cuts', 'Thousand Cuts', 'rare', 'saw', 1, { dmg: 1, hits: 8, bleed: 4 }),
  // ── Rare: Noise ────────────────────────────────────────────────────────────
  c('blackout', 'Blackout', 'rare', 'noise', 1, { purge: 3, cool: 4, draw: 1 }),
  c('entropy', 'Entropy', 'rare', 'noise', 2, { dmgPerStatic: 6, aoe: true }),
  c('system_crash', 'System Crash', 'rare', 'noise', 3, { dmg: 16, aoe: true, static: 2 }),
  c('static_bloom', 'Static Bloom', 'rare', 'noise', 0, { energy: 2, draw: 1, static: 1, exhaust: true }),
  c('overclock', 'Overclock', 'rare', 'noise', 1, { energy: 1, draw: 3, exhaust: true }),
  c('feedback_scream', 'Feedback Scream', 'rare', 'noise', 2, { dmg: 9, dmgPerPlayed: 3, aoe: true }),
  // ── Rare: Any ──────────────────────────────────────────────────────────────
  c('pattern_forge', 'Pattern Forge', 'rare', 'any', 1, { skipSlot: true, heat: 2, draw: 1 }),
  c('harmonic_core', 'Harmonic Core', 'rare', 'any', 2, { burstBonus: 15, block: 8 }),
  c('prism', 'Prism', 'rare', 'any', 0, { dmg: 4, block: 4, heat: 1 }),

  // ── Glitch and curses (never offered as rewards) ──────────────────────────
  c('glitch', 'Glitch', 'glitch', 'noise', 0, { unplayable: true }),
  c('slag', 'Slag', 'glitch', 'noise', 1, { exhaust: true }),
  c('rust', 'Rust', 'glitch', 'noise', 0, { unplayable: true, ethereal: true }),
];

const BY_ID = new Map(CARDS.map((d) => [d.id, d]));

export function cardDef(id: string): CardDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown card: ${id}`);
  return d;
}

export function hasCard(id: string): boolean {
  return BY_ID.has(id);
}

/** Cards that can be offered as rewards or sold, by rarity. */
export function rewardPool(rarity: 'common' | 'uncommon' | 'rare'): CardDef[] {
  return CARDS.filter((d) => d.rarity === rarity);
}

export const STARTER_DECK: string[] = [
  'hammer_strike',
  'hammer_strike',
  'hammer_strike',
  'sine_guard',
  'sine_guard',
  'sine_guard',
  'saw_rip',
  'saw_rip',
  'noise_spark',
  'bellows',
];
