// =============================================================================
// ALTAIR -- Passive Items (GDD Section 8)
// =============================================================================
// Players can hold a maximum of 6 passive items simultaneously. Each has 5
// upgrade levels via level-up selection. Passives both provide stat bonuses and
// serve as evolution catalysts for weapons.
// =============================================================================

export interface PassiveDef {
  id: string;
  name: string;
  maxLevel: number;
  statBonusPerLevel: Record<string, number>;
  evolvesWeaponId: string | null;
  description: string;
  color: string;
  iconFrame: number;
}

export const PASSIVES: readonly PassiveDef[] = [
  {
    id: 'gauntlet',
    name: 'Gauntlet',
    maxLevel: 5,
    statBonusPerLevel: { armor: 1 },
    evolvesWeaponId: 'broad_sword',
    description: '+1 Armor per level. Evolves Broad Sword into Radiant Claymore.',
    color: '#A0A0A0',
    iconFrame: 0,
  },
  {
    id: 'tome',
    name: 'Tome',
    maxLevel: 5,
    statBonusPerLevel: { areaPercent: 8 },
    evolvesWeaponId: 'arcane_bolt',
    description: '+8% Area per level. Evolves Arcane Bolt into Arcane Barrage.',
    color: '#8B5CF6',
    iconFrame: 1,
  },
  {
    id: 'quiver',
    name: 'Quiver',
    maxLevel: 5,
    statBonusPerLevel: { projCount: 1 },
    evolvesWeaponId: 'iron_shortbow',
    description: '+1 Projectile Count per level. Evolves Iron Shortbow into Storm Bow.',
    color: '#92400E',
    iconFrame: 2,
  },
  {
    id: 'vial',
    name: 'Vial',
    maxLevel: 5,
    statBonusPerLevel: { durationPercent: 10 },
    evolvesWeaponId: 'toxic_flask',
    description: '+10% Duration per level. Evolves Toxic Flask into Plague Bomb.',
    color: '#10B981',
    iconFrame: 3,
  },
  {
    id: 'war_paint',
    name: 'War Paint',
    maxLevel: 5,
    statBonusPerLevel: { mightPercent: 5 },
    evolvesWeaponId: 'war_axe',
    description: '+5% Might per level. Evolves War Axe into Cataclysm Axe.',
    color: '#DC2626',
    iconFrame: 4,
  },
  {
    id: 'skull_pendant',
    name: 'Skull Pendant',
    maxLevel: 5,
    statBonusPerLevel: { cdrPercent: 5 },
    evolvesWeaponId: 'soul_siphon',
    description: '+5% CDR per level. Evolves Soul Siphon into Death Ray.',
    color: '#4B5563',
    iconFrame: 5,
  },
  {
    id: 'hourglass',
    name: 'Hourglass',
    maxLevel: 5,
    statBonusPerLevel: { cdrPercent: 4, durationPercent: 4 },
    evolvesWeaponId: 'temporal_shard',
    description: '+4% CDR and +4% Duration per level. Evolves Temporal Shard into Eternity Loop.',
    color: '#F59E0B',
    iconFrame: 6,
  },
  {
    id: 'blood_ruby',
    name: 'Blood Ruby',
    maxLevel: 5,
    statBonusPerLevel: { mightPercent: 5, hpRegen: 0.1 },
    evolvesWeaponId: 'crimson_whip',
    description: '+5% Might and +0.1 HP Regen per level. Evolves Crimson Whip into Sanguine Scourge.',
    color: '#991B1B',
    iconFrame: 7,
  },
  {
    id: 'sacred_charm',
    name: 'Sacred Charm',
    maxLevel: 5,
    statBonusPerLevel: { durationPercent: 8, maxHp: 3 },
    evolvesWeaponId: 'holy_water',
    description: '+8% Duration and +3 HP per level. Evolves Holy Water into Divine Deluge.',
    color: '#FBBF24',
    iconFrame: 8,
  },
  {
    id: 'sharpening_stone',
    name: 'Sharpening Stone',
    maxLevel: 5,
    statBonusPerLevel: { projSpeedPercent: 10 },
    evolvesWeaponId: 'throwing_daggers',
    description: '+10% Projectile Speed per level. Evolves Throwing Daggers into Knife Storm.',
    color: '#6B7280',
    iconFrame: 9,
  },
  {
    id: 'conductor_coil',
    name: 'Conductor Coil',
    maxLevel: 5,
    statBonusPerLevel: { areaPercent: 8, mightPercent: 3 },
    evolvesWeaponId: 'lightning_ring',
    description: '+8% Area and +3% Might per level. Evolves Lightning Ring into Thunderstorm.',
    color: '#2563EB',
    iconFrame: 10,
  },
  {
    id: 'laurel',
    name: 'Laurel',
    maxLevel: 5,
    statBonusPerLevel: { maxHpPercent: 8 },
    evolvesWeaponId: 'garlic',
    description: '+8% Max HP per level. Evolves Garlic into Soul Eater.',
    color: '#16A34A',
    iconFrame: 11,
  },
  {
    id: 'star_map',
    name: 'Star Map',
    maxLevel: 5,
    // +1 Proj Count at Lv 3 & 5 only -> average 0.4 per level, but handled specially in game logic
    statBonusPerLevel: { projCount: 0.4 },
    evolvesWeaponId: 'runic_orbs',
    description: '+1 Projectile Count at levels 3 and 5. Evolves Runic Orbs into Celestial Guard.',
    color: '#7C3AED',
    iconFrame: 12,
  },
  {
    id: 'ember_ring',
    name: 'Ember Ring',
    maxLevel: 5,
    statBonusPerLevel: { projSpeedPercent: 10, mightPercent: 3 },
    evolvesWeaponId: 'fire_wand',
    description: '+10% Projectile Speed and +3% Might per level. Evolves Fire Wand into Inferno Staff.',
    color: '#EA580C',
    iconFrame: 13,
  },
  {
    id: 'swift_boots',
    name: 'Swift Boots',
    maxLevel: 5,
    statBonusPerLevel: { moveSpeedPercent: 6 },
    evolvesWeaponId: null,
    description: '+6% Move Speed per level. No weapon evolution.',
    color: '#0EA5E9',
    iconFrame: 14,
  },
  {
    id: 'magnetic_amulet',
    name: 'Magnetic Amulet',
    maxLevel: 5,
    statBonusPerLevel: { pickupRange: 20 },
    evolvesWeaponId: null,
    description: '+20px Pickup Range per level. No weapon evolution.',
    color: '#D946EF',
    iconFrame: 15,
  },
  {
    id: 'clover',
    name: 'Clover',
    maxLevel: 5,
    statBonusPerLevel: { luckPercent: 8 },
    evolvesWeaponId: null,
    description: '+8% Luck per level. No weapon evolution.',
    color: '#22C55E',
    iconFrame: 16,
  },
  {
    id: 'xp_tome',
    name: 'XP Tome',
    maxLevel: 5,
    statBonusPerLevel: { growthPercent: 8 },
    evolvesWeaponId: null,
    description: '+8% Growth per level. No weapon evolution.',
    color: '#3B82F6',
    iconFrame: 17,
  },
] as const;
