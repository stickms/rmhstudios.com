// =============================================================================
// ALTAIR -- Weapons & Evolutions (GDD Section 7)
// =============================================================================
// Each weapon can be leveled to 8. At level 8, if the player holds the matching
// evolution passive item, the weapon transforms into its evolved form.
// Players can hold a maximum of 6 weapons simultaneously.
//
// Weapon Level Scaling (per level 1->8):
//   - Damage: +15% per level (compounding) -> Level 8 ~ 2.66x base
//   - Level 2: +1 base effect (e.g., +1 projectile, +0.5s duration)
//   - Level 4: +1 base effect
//   - Level 6: +1 base effect
//   - Level 8: Evolution (if passive requirement met), otherwise +25% damage
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
    baseDamage: 20,
    baseCooldown: 1.2,
    description: '120-degree frontal arc slash.',
    evolutionPassiveId: 'gauntlet',
    evolvedWeaponId: 'radiant_claymore',
    color: '#C0C0C0',
    iconFrame: 0,
  },
  {
    id: 'arcane_bolt',
    name: 'Arcane Bolt',
    type: 'homing',
    baseDamage: 18,
    baseCooldown: 1.0,
    description: 'Fires a seeking bolt at nearest enemy.',
    evolutionPassiveId: 'tome',
    evolvedWeaponId: 'arcane_barrage',
    color: '#A855F7',
    iconFrame: 1,
  },
  {
    id: 'iron_shortbow',
    name: 'Iron Shortbow',
    type: 'directional',
    baseDamage: 12,
    baseCooldown: 0.8,
    description: 'Fires arrows in facing direction.',
    evolutionPassiveId: 'quiver',
    evolvedWeaponId: 'storm_bow',
    color: '#78716C',
    iconFrame: 2,
  },
  {
    id: 'toxic_flask',
    name: 'Toxic Flask',
    type: 'lobbed_aoe',
    baseDamage: 8,
    baseCooldown: 3.5,
    description: 'Lobs flask creating poison pool lasting 2 seconds. Deals 8 damage per tick.',
    evolutionPassiveId: 'vial',
    evolvedWeaponId: 'plague_bomb',
    color: '#22C55E',
    iconFrame: 3,
  },
  {
    id: 'war_axe',
    name: 'War Axe',
    type: 'circular_cleave',
    baseDamage: 28,
    baseCooldown: 1.8,
    description: '360-degree spin attack around player.',
    evolutionPassiveId: 'war_paint',
    evolvedWeaponId: 'cataclysm_axe',
    color: '#B91C1C',
    iconFrame: 4,
  },
  {
    id: 'soul_siphon',
    name: 'Soul Siphon',
    type: 'beam',
    baseDamage: 10,
    baseCooldown: 0,
    description: 'Continuously drains nearest enemy within 100px. Deals 10 damage per tick.',
    evolutionPassiveId: 'skull_pendant',
    evolvedWeaponId: 'death_ray',
    color: '#6B21A8',
    iconFrame: 5,
  },
  {
    id: 'temporal_shard',
    name: 'Temporal Shard',
    type: 'boomerang',
    baseDamage: 15,
    baseCooldown: 2.0,
    description: 'Passes through enemies twice (out and back). Deals 15 damage per pass.',
    evolutionPassiveId: 'hourglass',
    evolvedWeaponId: 'eternity_loop',
    color: '#EAB308',
    iconFrame: 6,
  },
  {
    id: 'crimson_whip',
    name: 'Crimson Whip',
    type: 'lash',
    baseDamage: 22,
    baseCooldown: 1.4,
    description: 'Lashes in facing direction, 150px range.',
    evolutionPassiveId: 'blood_ruby',
    evolvedWeaponId: 'sanguine_scourge',
    color: '#DC2626',
    iconFrame: 7,
  },
  {
    id: 'holy_water',
    name: 'Holy Water',
    type: 'ground_aoe',
    baseDamage: 6,
    baseCooldown: 3.0,
    description: 'Drops damaging pool at player feet. Deals 6 damage per tick.',
    evolutionPassiveId: 'sacred_charm',
    evolvedWeaponId: 'divine_deluge',
    color: '#38BDF8',
    iconFrame: 8,
  },
  {
    id: 'throwing_daggers',
    name: 'Throwing Daggers',
    type: 'multi_projectile',
    baseDamage: 8,
    baseCooldown: 0.6,
    description: 'Fast small projectiles with random spread.',
    evolutionPassiveId: 'sharpening_stone',
    evolvedWeaponId: 'knife_storm',
    color: '#9CA3AF',
    iconFrame: 9,
  },
  {
    id: 'lightning_ring',
    name: 'Lightning Ring',
    type: 'auto_strike',
    baseDamage: 25,
    baseCooldown: 2.5,
    description: 'Random lightning bolt on a nearby enemy.',
    evolutionPassiveId: 'conductor_coil',
    evolvedWeaponId: 'thunderstorm',
    color: '#FACC15',
    iconFrame: 10,
  },
  {
    id: 'garlic',
    name: 'Garlic',
    type: 'aura',
    baseDamage: 5,
    baseCooldown: 0.5,
    description: 'Damage aura around player, 80px radius. Deals 5 damage per tick.',
    evolutionPassiveId: 'laurel',
    evolvedWeaponId: 'soul_eater',
    color: '#FDE68A',
    iconFrame: 11,
  },
  {
    id: 'runic_orbs',
    name: 'Runic Orbs',
    type: 'orbital',
    baseDamage: 14,
    baseCooldown: 0,
    description: 'Orbs circle player, dealing damage on contact.',
    evolutionPassiveId: 'star_map',
    evolvedWeaponId: 'celestial_guard',
    color: '#818CF8',
    iconFrame: 12,
  },
  {
    id: 'fire_wand',
    name: 'Fire Wand',
    type: 'direct_shot',
    baseDamage: 30,
    baseCooldown: 1.6,
    description: 'Fires a fireball in a random direction.',
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
    baseDamage: 30,
    baseCooldown: 1.2,
    description: '180-degree arc, +50% damage, emits holy shockwave every 3rd swing dealing AoE.',
    baseWeaponId: 'broad_sword',
    color: '#FDE047',
    iconFrame: 0,
  },
  {
    id: 'arcane_barrage',
    name: 'Arcane Barrage',
    type: 'homing',
    baseDamage: 18,
    baseCooldown: 1.0,
    description: 'Fires 3 bolts simultaneously, each explodes on impact for 80px AoE.',
    baseWeaponId: 'arcane_bolt',
    color: '#C084FC',
    iconFrame: 1,
  },
  {
    id: 'storm_bow',
    name: 'Storm Bow',
    type: 'directional',
    baseDamage: 12,
    baseCooldown: 0.8,
    description: 'Fires double arrow count, arrows pierce all enemies and leave lightning trails.',
    baseWeaponId: 'iron_shortbow',
    color: '#60A5FA',
    iconFrame: 2,
  },
  {
    id: 'plague_bomb',
    name: 'Plague Bomb',
    type: 'lobbed_aoe',
    baseDamage: 8,
    baseCooldown: 3.5,
    description: 'Pool radius doubled, enemies leaving pool carry poison for 4 additional seconds.',
    baseWeaponId: 'toxic_flask',
    color: '#4ADE80',
    iconFrame: 3,
  },
  {
    id: 'cataclysm_axe',
    name: 'Cataclysm Axe',
    type: 'circular_cleave',
    baseDamage: 50,
    baseCooldown: 1.8,
    description: 'Spin pulls enemies inward 50px, +80% damage, leaves fire trail on ground.',
    baseWeaponId: 'war_axe',
    color: '#EF4444',
    iconFrame: 4,
  },
  {
    id: 'death_ray',
    name: 'Death Ray',
    type: 'beam',
    baseDamage: 10,
    baseCooldown: 0,
    description: 'Range 250px, beam chains to 3 additional enemies, 15% lifesteal.',
    baseWeaponId: 'soul_siphon',
    color: '#A855F7',
    iconFrame: 5,
  },
  {
    id: 'eternity_loop',
    name: 'Eternity Loop',
    type: 'boomerang',
    baseDamage: 15,
    baseCooldown: 2.0,
    description: '3 shards orbit continuously, freeze enemies for 0.5s on hit.',
    baseWeaponId: 'temporal_shard',
    color: '#FCD34D',
    iconFrame: 6,
  },
  {
    id: 'sanguine_scourge',
    name: 'Sanguine Scourge',
    type: 'lash',
    baseDamage: 22,
    baseCooldown: 1.4,
    description: 'Lash hits all directions, enemies killed explode for 60% of their max HP as AoE.',
    baseWeaponId: 'crimson_whip',
    color: '#F87171',
    iconFrame: 7,
  },
  {
    id: 'divine_deluge',
    name: 'Divine Deluge',
    type: 'ground_aoe',
    baseDamage: 6,
    baseCooldown: 3.0,
    description: '4 pools drop on random enemy clusters, pools heal player 2HP/tick while standing in them.',
    baseWeaponId: 'holy_water',
    color: '#7DD3FC',
    iconFrame: 8,
  },
  {
    id: 'knife_storm',
    name: 'Knife Storm',
    type: 'multi_projectile',
    baseDamage: 8,
    baseCooldown: 0.4,
    description: '360-degree knife burst every 0.4s, knives bounce off enemies once.',
    baseWeaponId: 'throwing_daggers',
    color: '#D1D5DB',
    iconFrame: 9,
  },
  {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    type: 'auto_strike',
    baseDamage: 25,
    baseCooldown: 2.5,
    description: '3 simultaneous bolts, struck enemies chain to 2 nearby, 0.5s stun.',
    baseWeaponId: 'lightning_ring',
    color: '#FDE047',
    iconFrame: 10,
  },
  {
    id: 'soul_eater',
    name: 'Soul Eater',
    type: 'aura',
    baseDamage: 5,
    baseCooldown: 0.5,
    description: '200px aura, converts 1% of aura damage to healing, reduces enemy damage by 20% in range.',
    baseWeaponId: 'garlic',
    color: '#BEF264',
    iconFrame: 11,
  },
  {
    id: 'celestial_guard',
    name: 'Celestial Guard',
    type: 'orbital',
    baseDamage: 14,
    baseCooldown: 0,
    description: '5 orbs, orbit speed doubled, orbs emit damaging light beams outward.',
    baseWeaponId: 'runic_orbs',
    color: '#C4B5FD',
    iconFrame: 12,
  },
  {
    id: 'inferno_staff',
    name: 'Inferno Staff',
    type: 'direct_shot',
    baseDamage: 30,
    baseCooldown: 1.6,
    description: 'Fireball explodes into 6 embers on impact, each ember leaves a small fire pool.',
    baseWeaponId: 'fire_wand',
    color: '#FB923C',
    iconFrame: 13,
  },
] as const;
