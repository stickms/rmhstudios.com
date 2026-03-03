// =============================================================================
// ALTAIR -- Weapons & Evolutions (GDD Section 7, Balance Patch v1.3)
// =============================================================================
// Each weapon can be leveled to 8. At level 8, if the player holds the matching
// evolution catalyst at level 3, the weapon transforms into its evolved form.
// Players can hold a maximum of 6 weapons simultaneously.
//
// Weapon Level Scaling (per level 1->8):
//   - Damage: +10% per level (compounding) -> Level 8 ~ 1.95x base
//   - Level 2: +1 base effect (weapon-specific, see balance doc)
//   - Level 5: +1 base effect (weapon-specific, see balance doc)
//   - Level 8: Evolution (requires matching passive at lv3+), otherwise +25% damage
//   - Pierce: base 0 unless noted. Determines how many enemies
//     a projectile passes through before being consumed.
// =============================================================================

export type WeaponType =
  | 'melee_sweep'
  | 'homing'
  | 'directional'
  | 'lobbed_aoe'
  | 'circular_cleave'
  | 'beam'
  | 'boomerang'
  | 'lash'
  | 'ground_aoe'
  | 'multi_projectile'
  | 'auto_strike'
  | 'aura'
  | 'orbital'
  | 'direct_shot';

export interface WeaponDef {
  id: string;
  name: string;
  type: WeaponType;
  baseDamage: number;
  baseCooldown: number;
  description: string;
  evolutionCatalystId: string | null;
  evolvedWeaponId: string | null;
  color: string;
  iconFrame: number;
}

export interface EvolvedWeaponDef {
  id: string;
  name: string;
  type: WeaponType;
  baseDamage: number;
  baseCooldown: number;
  description: string;
  baseWeaponId: string;
  color: string;
  iconFrame: number;
}

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'broad_sword',
    name: 'Broad Sword',
    type: 'melee_sweep',
    baseDamage: 19,
    baseCooldown: 1.2,
    description: '110-degree frontal arc slash. 95px range. Block: 25% DR for 0.1s on hit.',
    evolutionCatalystId: 'wardens_crest',
    evolvedWeaponId: 'radiant_claymore',
    color: '#C0C0C0',
    iconFrame: 0,
  },
  {
    id: 'arcane_bolt',
    name: 'Arcane Bolt',
    type: 'homing',
    baseDamage: 17,
    baseCooldown: 1.05,
    description: 'Fires a seeking bolt at nearest enemy. 350px tracking, 220°/s turn. 40% splash on kill (40px).',
    evolutionCatalystId: 'astral_focus',
    evolvedWeaponId: 'arcane_barrage',
    color: '#A855F7',
    iconFrame: 1,
  },
  {
    id: 'iron_shortbow',
    name: 'Iron Shortbow',
    type: 'directional',
    baseDamage: 12,
    baseCooldown: 0.75,
    description: 'Fires arrows in facing direction. Pierce 2 (hits 3). 450px range, 400 px/s. 8% crit (1.5x dmg).',
    evolutionCatalystId: 'hawk_talon',
    evolvedWeaponId: 'storm_bow',
    color: '#78716C',
    iconFrame: 2,
  },
  {
    id: 'toxic_flask',
    name: 'Toxic Flask',
    type: 'lobbed_aoe',
    baseDamage: 7,
    baseCooldown: 3.5,
    description: 'Lobs flask at densest cluster within 200px. 70px pool, 2.0s, 7 dmg/tick. 20% slow in pool.',
    evolutionCatalystId: 'blighted_venom',
    evolvedWeaponId: 'plague_bomb',
    color: '#22C55E',
    iconFrame: 3,
  },
  {
    id: 'war_axe',
    name: 'War Axe',
    type: 'circular_cleave',
    baseDamage: 20,
    baseCooldown: 2.3,
    description: '360-degree spin attack. 70px range. Max 6 targets. 0.25s windup (60% move speed).',
    evolutionCatalystId: 'berserkers_brand',
    evolvedWeaponId: 'cataclysm_axe',
    color: '#B91C1C',
    iconFrame: 4,
  },
  {
    id: 'soul_siphon',
    name: 'Soul Siphon',
    type: 'beam',
    baseDamage: 9,
    baseCooldown: 0,
    description: 'Continuously drains nearest enemy within 100px. 5 ticks/s. 15% slow. +10% Raise Dead proc.',
    evolutionCatalystId: 'phylactery_shard',
    evolvedWeaponId: 'death_ray',
    color: '#6B21A8',
    iconFrame: 5,
  },
  {
    id: 'temporal_shard',
    name: 'Temporal Shard',
    type: 'boomerang',
    baseDamage: 14,
    baseCooldown: 2.0,
    description: 'Boomerang, hits out and back. Pierce 4 each way. 280px range. Return +25% dmg. 10% slow 1.5s.',
    evolutionCatalystId: 'paradox_gear',
    evolvedWeaponId: 'eternity_loop',
    color: '#EAB308',
    iconFrame: 6,
  },
  {
    id: 'crimson_whip',
    name: 'Crimson Whip',
    type: 'lash',
    baseDamage: 20,
    baseCooldown: 1.35,
    description: 'Lashes in facing direction. 140px range, 55px width. Pierce 5. 2% inherent lifesteal.',
    evolutionCatalystId: 'sanguine_heart',
    evolvedWeaponId: 'sanguine_scourge',
    color: '#DC2626',
    iconFrame: 7,
  },
  {
    id: 'holy_water',
    name: 'Holy Water',
    type: 'ground_aoe',
    baseDamage: 5,
    baseCooldown: 3.5,
    description: 'Drops damaging pool at player feet. 70px radius, 2.0s duration, 2 ticks/s.',
    evolutionCatalystId: 'consecrated_water',
    evolvedWeaponId: 'divine_deluge',
    color: '#38BDF8',
    iconFrame: 8,
  },
  {
    id: 'throwing_daggers',
    name: 'Throwing Daggers',
    type: 'multi_projectile',
    baseDamage: 7,
    baseCooldown: 0.65,
    description: '3 base projectiles with 45-degree spread. Pierce 1 (hits 2). 300px range.',
    evolutionCatalystId: 'whetstone',
    evolvedWeaponId: 'knife_storm',
    color: '#9CA3AF',
    iconFrame: 9,
  },
  {
    id: 'lightning_ring',
    name: 'Lightning Ring',
    type: 'auto_strike',
    baseDamage: 22,
    baseCooldown: 2.5,
    description: 'Lightning bolt on nearest enemy within 250px. Single target.',
    evolutionCatalystId: 'storm_conduit',
    evolvedWeaponId: 'thunderstorm',
    color: '#FACC15',
    iconFrame: 10,
  },
  {
    id: 'garlic',
    name: 'Garlic',
    type: 'aura',
    baseDamage: 2,
    baseCooldown: 1.0,
    description: 'Damage aura, 60px radius. 2 dmg/tick, 1.0s ticks. Max 10 targets. 8px knockback. 50% falloff outer ring.',
    evolutionCatalystId: 'moonpetal_wreath',
    evolvedWeaponId: 'soul_eater',
    color: '#FDE68A',
    iconFrame: 11,
  },
  {
    id: 'runic_orbs',
    name: 'Runic Orbs',
    type: 'orbital',
    baseDamage: 11,
    baseCooldown: 0,
    description: '2 orbs circle player at 80px orbit. 0.4s per-enemy hit cooldown.',
    evolutionCatalystId: 'celestial_compass',
    evolvedWeaponId: 'celestial_guard',
    color: '#818CF8',
    iconFrame: 12,
  },
  {
    id: 'fire_wand',
    name: 'Fire Wand',
    type: 'direct_shot',
    baseDamage: 25,
    baseCooldown: 1.8,
    description: 'Fires a fireball at nearest enemy within 400px. Single target.',
    evolutionCatalystId: 'cinder_core',
    evolvedWeaponId: 'inferno_staff',
    color: '#F97316',
    iconFrame: 13,
  },
] as const;

export const EVOLVED_WEAPONS: readonly EvolvedWeaponDef[] = [
  {
    id: 'radiant_claymore',
    name: 'Radiant Claymore',
    type: 'melee_sweep',
    baseDamage: 26,
    baseCooldown: 1.2,
    description: '150-degree arc, +35% damage. Shockwave every 3rd swing: 130px, 50% damage, max 10 targets. Block: 30% DR for 0.15s.',
    baseWeaponId: 'broad_sword',
    color: '#FDE047',
    iconFrame: 0,
  },
  {
    id: 'arcane_barrage',
    name: 'Arcane Barrage',
    type: 'homing',
    baseDamage: 17,
    baseCooldown: 1.05,
    description: 'Fires 3 homing bolts, each explodes for 55px AoE (max 4 enemies). Splash on kill inherited.',
    baseWeaponId: 'arcane_bolt',
    color: '#C084FC',
    iconFrame: 1,
  },
  {
    id: 'storm_bow',
    name: 'Storm Bow',
    type: 'directional',
    baseDamage: 12,
    baseCooldown: 0.75,
    description: '+50% arrow count. Pierce 5. Lightning trails: 4 dmg/tick, 1.2s, 25px. 13% crit (1.75x dmg).',
    baseWeaponId: 'iron_shortbow',
    color: '#60A5FA',
    iconFrame: 2,
  },
  {
    id: 'plague_bomb',
    name: 'Plague Bomb',
    type: 'lobbed_aoe',
    baseDamage: 7,
    baseCooldown: 3.5,
    description: 'Pool radius +50%. Carry-poison 3.0s (5 dmg/tick/0.5s, 15% slow). Linger slow inherited.',
    baseWeaponId: 'toxic_flask',
    color: '#4ADE80',
    iconFrame: 3,
  },
  {
    id: 'cataclysm_axe',
    name: 'Cataclysm Axe',
    type: 'circular_cleave',
    baseDamage: 26,
    baseCooldown: 2.3,
    description: 'Spin pulls enemies 20px. +30% damage. Fire trail 25px wide, 1.5s, 3 dmg/tick. Max 6 targets. 0.2s windup.',
    baseWeaponId: 'war_axe',
    color: '#EF4444',
    iconFrame: 4,
  },
  {
    id: 'death_ray',
    name: 'Death Ray',
    type: 'beam',
    baseDamage: 9,
    baseCooldown: 0,
    description: 'Range 200px. Chains to 2 enemies, -30% per bounce. 10% lifesteal. 15% slow. +10% Raise Dead.',
    baseWeaponId: 'soul_siphon',
    color: '#A855F7',
    iconFrame: 5,
  },
  {
    id: 'eternity_loop',
    name: 'Eternity Loop',
    type: 'boomerang',
    baseDamage: 14,
    baseCooldown: 2.0,
    description: '3 shards orbit continuously. Freeze 0.3s on hit (1.5s CD per enemy). Pierce 5. 10% slow inherited.',
    baseWeaponId: 'temporal_shard',
    color: '#FCD34D',
    iconFrame: 6,
  },
  {
    id: 'sanguine_scourge',
    name: 'Sanguine Scourge',
    type: 'lash',
    baseDamage: 20,
    baseCooldown: 1.35,
    description: 'Hits 4 cardinal directions. 60px width, Pierce 6. Kill explosion: 30% max HP, 80px, max 6. 3% lifesteal.',
    baseWeaponId: 'crimson_whip',
    color: '#F87171',
    iconFrame: 7,
  },
  {
    id: 'divine_deluge',
    name: 'Divine Deluge',
    type: 'ground_aoe',
    baseDamage: 5,
    baseCooldown: 3.5,
    description: '3 pools at random positions within 200px. Heal 1 HP/tick while standing. 2.5s duration.',
    baseWeaponId: 'holy_water',
    color: '#7DD3FC',
    iconFrame: 8,
  },
  {
    id: 'knife_storm',
    name: 'Knife Storm',
    type: 'multi_projectile',
    baseDamage: 7,
    baseCooldown: 0.6,
    description: '360-degree burst of 8 knives every 0.6s. Bounce once at 50% damage. No pierce.',
    baseWeaponId: 'throwing_daggers',
    color: '#D1D5DB',
    iconFrame: 9,
  },
  {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    type: 'auto_strike',
    baseDamage: 22,
    baseCooldown: 2.5,
    description: '2 simultaneous bolts. Chain to 1 enemy at -50% damage. 0.3s stun (3s internal CD per enemy).',
    baseWeaponId: 'lightning_ring',
    color: '#FDE047',
    iconFrame: 10,
  },
  {
    id: 'soul_eater',
    name: 'Soul Eater',
    type: 'aura',
    baseDamage: 4,
    baseCooldown: 1.0,
    description: '100px aura. 0.3% lifesteal. -8% enemy damage in range. Max 15 targets. 10px knockback.',
    baseWeaponId: 'garlic',
    color: '#BEF264',
    iconFrame: 11,
  },
  {
    id: 'celestial_guard',
    name: 'Celestial Guard',
    type: 'orbital',
    baseDamage: 11,
    baseCooldown: 0,
    description: '4 orbs, 1.5x orbit speed. Light beams: 100px range, 6 damage each, once per orbit cycle. 0.5s per-enemy hit CD.',
    baseWeaponId: 'runic_orbs',
    color: '#C4B5FD',
    iconFrame: 12,
  },
  {
    id: 'inferno_staff',
    name: 'Inferno Staff',
    type: 'direct_shot',
    baseDamage: 25,
    baseCooldown: 1.8,
    description: 'Fireball explodes into 4 embers. Fire pools: 30px radius, 1.5s, 4 dmg/tick. 80px ember travel.',
    baseWeaponId: 'fire_wand',
    color: '#FB923C',
    iconFrame: 13,
  },
] as const;
