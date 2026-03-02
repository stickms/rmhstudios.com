// =============================================================================
// ALTAIR -- Weapons & Evolutions (GDD Section 7)
// =============================================================================
// Each weapon can be leveled to 8. At level 8, if the player holds the matching
// evolution passive item, the weapon transforms into its evolved form.
// Players can hold a maximum of 6 weapons simultaneously.
//
// Weapon Level Scaling (per level 1->8):
//   - Damage: +10% per level (compounding) -> Level 8 ~ 1.95x base
//   - Level 2: +1 base effect (e.g., +1 projectile, +0.5s duration)
//   - Level 5: +1 base effect
//   - Level 8: Evolution (requires matching passive at lv3+), otherwise +25% damage
//   - Pierce: new stat (base 0 unless noted). Determines how many enemies
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
  evolutionPassiveId: string | null;
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
    baseDamage: 18,
    baseCooldown: 1.3,
    description: '100-degree frontal arc slash. 90px range.',
    evolutionPassiveId: 'gauntlet',
    evolvedWeaponId: 'radiant_claymore',
    color: '#C0C0C0',
    iconFrame: 0,
  },
  {
    id: 'arcane_bolt',
    name: 'Arcane Bolt',
    type: 'homing',
    baseDamage: 15,
    baseCooldown: 1.2,
    description: 'Fires a seeking bolt at nearest enemy. Single target, 300px tracking radius.',
    evolutionPassiveId: 'tome',
    evolvedWeaponId: 'arcane_barrage',
    color: '#A855F7',
    iconFrame: 1,
  },
  {
    id: 'iron_shortbow',
    name: 'Iron Shortbow',
    type: 'directional',
    baseDamage: 10,
    baseCooldown: 0.9,
    description: 'Fires arrows in facing direction. Pierce 1 (hits 2 enemies). 400px range.',
    evolutionPassiveId: 'quiver',
    evolvedWeaponId: 'storm_bow',
    color: '#78716C',
    iconFrame: 2,
  },
  {
    id: 'toxic_flask',
    name: 'Toxic Flask',
    type: 'lobbed_aoe',
    baseDamage: 6,
    baseCooldown: 4.0,
    description: 'Lobs flask creating poison pool lasting 1.5 seconds. 60px radius, 6 damage per tick.',
    evolutionPassiveId: 'vial',
    evolvedWeaponId: 'plague_bomb',
    color: '#22C55E',
    iconFrame: 3,
  },
  {
    id: 'war_axe',
    name: 'War Axe',
    type: 'circular_cleave',
    baseDamage: 24,
    baseCooldown: 2.0,
    description: '360-degree spin attack around player. 80px range. Max 8 targets per swing.',
    evolutionPassiveId: 'war_paint',
    evolvedWeaponId: 'cataclysm_axe',
    color: '#B91C1C',
    iconFrame: 4,
  },
  {
    id: 'soul_siphon',
    name: 'Soul Siphon',
    type: 'beam',
    baseDamage: 8,
    baseCooldown: 0,
    description: 'Continuously drains nearest enemy within 80px. 4 ticks/s, single target only.',
    evolutionPassiveId: 'skull_pendant',
    evolvedWeaponId: 'death_ray',
    color: '#6B21A8',
    iconFrame: 5,
  },
  {
    id: 'temporal_shard',
    name: 'Temporal Shard',
    type: 'boomerang',
    baseDamage: 12,
    baseCooldown: 2.2,
    description: 'Passes through enemies twice (out and back). Pierce 3 each way. 250px range.',
    evolutionPassiveId: 'hourglass',
    evolvedWeaponId: 'eternity_loop',
    color: '#EAB308',
    iconFrame: 6,
  },
  {
    id: 'crimson_whip',
    name: 'Crimson Whip',
    type: 'lash',
    baseDamage: 18,
    baseCooldown: 1.5,
    description: 'Lashes in facing direction. 130px range, 40px width. Pierce 4.',
    evolutionPassiveId: 'blood_ruby',
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
    evolutionPassiveId: 'sacred_charm',
    evolvedWeaponId: 'divine_deluge',
    color: '#38BDF8',
    iconFrame: 8,
  },
  {
    id: 'throwing_daggers',
    name: 'Throwing Daggers',
    type: 'multi_projectile',
    baseDamage: 6,
    baseCooldown: 0.7,
    description: '2 base projectiles with 45-degree spread. No pierce. 300px range.',
    evolutionPassiveId: 'sharpening_stone',
    evolvedWeaponId: 'knife_storm',
    color: '#9CA3AF',
    iconFrame: 9,
  },
  {
    id: 'lightning_ring',
    name: 'Lightning Ring',
    type: 'auto_strike',
    baseDamage: 20,
    baseCooldown: 3.0,
    description: 'Lightning bolt on nearest enemy within 250px. Single target.',
    evolutionPassiveId: 'conductor_coil',
    evolvedWeaponId: 'thunderstorm',
    color: '#FACC15',
    iconFrame: 10,
  },
  {
    id: 'garlic',
    name: 'Garlic',
    type: 'aura',
    baseDamage: 3,
    baseCooldown: 0.75,
    description: 'Damage aura around player, 60px radius. 3 damage per tick, 15px knockback.',
    evolutionPassiveId: 'laurel',
    evolvedWeaponId: 'soul_eater',
    color: '#FDE68A',
    iconFrame: 11,
  },
  {
    id: 'runic_orbs',
    name: 'Runic Orbs',
    type: 'orbital',
    baseDamage: 10,
    baseCooldown: 0,
    description: '2 orbs circle player at 80px orbit. 0.5s per-enemy hit cooldown.',
    evolutionPassiveId: 'star_map',
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
    evolutionPassiveId: 'ember_ring',
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
    baseDamage: 23,
    baseCooldown: 1.3,
    description: '140-degree arc, +30% damage. Holy shockwave every 4th swing: 120px radius, 50% of swing damage. Max 10 targets per shockwave.',
    baseWeaponId: 'broad_sword',
    color: '#FDE047',
    iconFrame: 0,
  },
  {
    id: 'arcane_barrage',
    name: 'Arcane Barrage',
    type: 'homing',
    baseDamage: 15,
    baseCooldown: 1.2,
    description: 'Fires 2 homing bolts, each explodes for 60px AoE. Explosion hits max 5 enemies.',
    baseWeaponId: 'arcane_bolt',
    color: '#C084FC',
    iconFrame: 1,
  },
  {
    id: 'storm_bow',
    name: 'Storm Bow',
    type: 'directional',
    baseDamage: 10,
    baseCooldown: 0.9,
    description: '+50% arrow count. Pierce 4. Lightning trails deal 3 damage/tick for 1s in 20px path.',
    baseWeaponId: 'iron_shortbow',
    color: '#60A5FA',
    iconFrame: 2,
  },
  {
    id: 'plague_bomb',
    name: 'Plague Bomb',
    type: 'lobbed_aoe',
    baseDamage: 6,
    baseCooldown: 4.0,
    description: 'Pool radius +50%. Enemies leaving carry poison 2.5s (4 damage/tick every 0.5s).',
    baseWeaponId: 'toxic_flask',
    color: '#4ADE80',
    iconFrame: 3,
  },
  {
    id: 'cataclysm_axe',
    name: 'Cataclysm Axe',
    type: 'circular_cleave',
    baseDamage: 34,
    baseCooldown: 2.0,
    description: 'Spin pulls enemies 30px. +40% damage. Fire trail 30px wide, 1.5s, 5 dmg/tick. Max 8 targets.',
    baseWeaponId: 'war_axe',
    color: '#EF4444',
    iconFrame: 4,
  },
  {
    id: 'death_ray',
    name: 'Death Ray',
    type: 'beam',
    baseDamage: 8,
    baseCooldown: 0,
    description: 'Range 180px. Chains to 2 enemies, -40% per bounce. 8% lifesteal.',
    baseWeaponId: 'soul_siphon',
    color: '#A855F7',
    iconFrame: 5,
  },
  {
    id: 'eternity_loop',
    name: 'Eternity Loop',
    type: 'boomerang',
    baseDamage: 12,
    baseCooldown: 2.2,
    description: '2 shards orbit continuously. Freeze 0.3s on hit (2s internal CD per enemy). Pierce 5 per shard.',
    baseWeaponId: 'temporal_shard',
    color: '#FCD34D',
    iconFrame: 6,
  },
  {
    id: 'sanguine_scourge',
    name: 'Sanguine Scourge',
    type: 'lash',
    baseDamage: 18,
    baseCooldown: 1.5,
    description: 'Hits 4 cardinal directions. Kill explosion: 30% max HP, 80px radius, max 6 enemies.',
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
    baseDamage: 6,
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
    baseDamage: 20,
    baseCooldown: 3.0,
    description: '2 simultaneous bolts. Chain to 1 enemy at -50% damage. 0.3s stun (3s internal CD per enemy).',
    baseWeaponId: 'lightning_ring',
    color: '#FDE047',
    iconFrame: 10,
  },
  {
    id: 'soul_eater',
    name: 'Soul Eater',
    type: 'aura',
    baseDamage: 5,
    baseCooldown: 0.75,
    description: '120px aura. 0.5% lifesteal on aura damage. -10% enemy damage in range.',
    baseWeaponId: 'garlic',
    color: '#BEF264',
    iconFrame: 11,
  },
  {
    id: 'celestial_guard',
    name: 'Celestial Guard',
    type: 'orbital',
    baseDamage: 10,
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
