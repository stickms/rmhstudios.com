// =============================================================================
// ALTAIR -- Generic Passive Items (v1.3 Balance Patch — GDD Section 8)
// =============================================================================
// Players can hold a maximum of 6 passive items simultaneously. Each has 5
// upgrade levels via level-up selection. Generic passives provide stat bonuses
// and conditional effects but do NOT evolve weapons (catalysts handle evolution
// as of v1.3).
// =============================================================================

export interface PassiveLevelBonus {
  level: number; // activates when passive reaches this level
  effectId: string; // engine handler identifier
  description: string;
  params: Record<string, number>; // effect-specific parameters
}

export interface PassiveDef {
  id: string;
  name: string;
  maxLevel: number;
  statBonusPerLevel: Record<string, number>;
  evolvesWeaponId: null; // generics never evolve (catalysts handle evolution now)
  description: string;
  color: string;
  iconFrame: number;
  levelBonuses?: PassiveLevelBonus[];
}

export const PASSIVES: readonly PassiveDef[] = [
  // ---------------------------------------------------------------------------
  // 1. Swift Boots  (retained, reworked)
  // ---------------------------------------------------------------------------
  {
    id: 'swift_boots',
    name: 'Swift Boots',
    maxLevel: 5,
    statBonusPerLevel: { moveSpeedPercent: 4 },
    evolvesWeaponId: null,
    description:
      '+4% Move Speed per level. Above an HP threshold, gain +5% bonus Move Speed. At max level, gain 0.3s invulnerability when hit at max Move Speed (10s CD).',
    color: '#0EA5E9',
    iconFrame: 14,
    levelBonuses: [
      {
        level: 2,
        effectId: 'swift_boots_hp_speed',
        description: 'Above 80% HP, gain +5% Move Speed.',
        params: { hpThreshold: 0.8, bonusMoveSpeedPercent: 5 },
      },
      {
        level: 3,
        effectId: 'swift_boots_hp_speed',
        description: 'Above 70% HP, gain +5% Move Speed.',
        params: { hpThreshold: 0.7, bonusMoveSpeedPercent: 5 },
      },
      {
        level: 4,
        effectId: 'swift_boots_hp_speed',
        description: 'Above 60% HP, gain +5% Move Speed.',
        params: { hpThreshold: 0.6, bonusMoveSpeedPercent: 5 },
      },
      {
        level: 5,
        effectId: 'swift_boots_hp_speed',
        description:
          'Above 50% HP, gain +5% Move Speed. Gain 0.3s invulnerability when hit at max Move Speed (10s CD).',
        params: { hpThreshold: 0.5, bonusMoveSpeedPercent: 5 },
      },
      {
        level: 5,
        effectId: 'swift_boots_dodge',
        description:
          '0.3s invulnerability when hit at max Move Speed (10s internal cooldown).',
        params: { invulnDuration: 0.3, cooldown: 10 },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 2. Magnetic Amulet  (retained, reworked)
  // ---------------------------------------------------------------------------
  {
    id: 'magnetic_amulet',
    name: 'Magnetic Amulet',
    maxLevel: 5,
    statBonusPerLevel: { pickupRange: 15 },
    evolvesWeaponId: null,
    description:
      '+15px Pickup Range per level. XP magnet speed, auto-coin collection, and a periodic magnet pulse at higher levels.',
    color: '#D946EF',
    iconFrame: 15,
    levelBonuses: [
      {
        level: 2,
        effectId: 'magnet_xp_speed',
        description: 'XP gems within pickup range are collected 50% faster.',
        params: { xpSpeedMultiplier: 1.5 },
      },
      {
        level: 4,
        effectId: 'magnet_auto_coins',
        description:
          'Coins within pickup range are collected automatically.',
        params: {},
      },
      {
        level: 5,
        effectId: 'magnet_pulse',
        description:
          'Every 45s, trigger a mini-magnet pulling all pickups within 250px.',
        params: { cooldown: 45, radius: 250 },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 3. Clover  (retained, reworked)
  // ---------------------------------------------------------------------------
  {
    id: 'clover',
    name: 'Clover',
    maxLevel: 5,
    statBonusPerLevel: { luckPercent: 6 },
    evolvesWeaponId: null,
    description:
      '+6% Luck per level. Bonus chest coins, improved food healing, chest weapon upgrades, and an extra level-up choice at max level.',
    color: '#22C55E',
    iconFrame: 16,
    levelBonuses: [
      {
        level: 2,
        effectId: 'clover_chest_coins',
        description: 'Treasure chests drop +2 bonus coins.',
        params: { bonusCoins: 2 },
      },
      {
        level: 3,
        effectId: 'clover_food_heal',
        description: 'Food pickups heal an additional 3% Max HP.',
        params: { healPct: 0.03 },
      },
      {
        level: 4,
        effectId: 'clover_chest_upgrade',
        description: 'Treasure chests contain +1 additional weapon upgrade.',
        params: {},
      },
      {
        level: 5,
        effectId: 'clover_extra_choice',
        description: 'Level-up selections include +1 additional option.',
        params: {},
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 4. XP Tome  (retained, reworked)
  // ---------------------------------------------------------------------------
  {
    id: 'xp_tome',
    name: 'XP Tome',
    maxLevel: 5,
    statBonusPerLevel: { growthPercent: 6 },
    evolvesWeaponId: null,
    description:
      '+6% Growth per level. Periodic free weapon upgrades, XP gem conversion, and passives start at lv2 on pickup at max level.',
    color: '#3B82F6',
    iconFrame: 17,
    levelBonuses: [
      {
        level: 2,
        effectId: 'xp_tome_weapon_boost',
        description:
          'Every 10th level-up grants +1 to all weapons.',
        params: { interval: 10 },
      },
      {
        level: 4,
        effectId: 'xp_tome_upgrade_gems',
        description:
          '15% chance for medium XP gems to drop as large XP gems.',
        params: { chance: 0.15 },
      },
      {
        level: 5,
        effectId: 'xp_tome_weapon_boost',
        description:
          'Every 8th level-up grants +1 to all weapons (replaces lv2 bonus).',
        params: { interval: 8 },
      },
      {
        level: 5,
        effectId: 'xp_tome_passive_boost',
        description:
          'Passive items start at level 2 on first pickup.',
        params: {},
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 5. Iron Hide  (new)
  // ---------------------------------------------------------------------------
  {
    id: 'iron_hide',
    name: 'Iron Hide',
    maxLevel: 5,
    statBonusPerLevel: { armor: 1 },
    evolvesWeaponId: null,
    description:
      '+1 Armor per level. Reduces heavy hits and grants knockback immunity at max level.',
    color: '#78716C',
    iconFrame: 19,
    levelBonuses: [
      {
        level: 3,
        effectId: 'iron_hide_heavy_dr',
        description:
          'Damage from hits exceeding 30 is reduced by 15%.',
        params: { threshold: 30, damageReduction: 0.15 },
      },
      {
        level: 5,
        effectId: 'iron_hide_heavy_dr',
        description:
          'Heavy-hit threshold reduced to 25 damage.',
        params: { threshold: 25, damageReduction: 0.15 },
      },
      {
        level: 5,
        effectId: 'iron_hide_kb_immune',
        description: 'Immune to knockback effects.',
        params: {},
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 6. War Banner  (new)
  // ---------------------------------------------------------------------------
  {
    id: 'war_banner',
    name: 'War Banner',
    maxLevel: 5,
    statBonusPerLevel: { mightPercent: 4 },
    evolvesWeaponId: null,
    description:
      '+4% Might per level. Kill streaks trigger Frenzy for bonus Attack Speed and Might.',
    color: '#DC2626',
    iconFrame: 20,
    levelBonuses: [
      {
        level: 3,
        effectId: 'war_banner_frenzy',
        description:
          'Kill 15 enemies in 10s → Frenzy: +15% Attack Speed for 5s (20s CD).',
        params: {
          killThreshold: 15,
          killWindow: 10,
          attackSpeedBonus: 0.15,
          frenzyDuration: 5,
          cooldown: 20,
        },
      },
      {
        level: 4,
        effectId: 'war_banner_frenzy',
        description:
          'Frenzy kill threshold reduced to 12.',
        params: {
          killThreshold: 12,
          killWindow: 10,
          attackSpeedBonus: 0.15,
          frenzyDuration: 5,
          cooldown: 20,
        },
      },
      {
        level: 5,
        effectId: 'war_banner_frenzy',
        description:
          'Frenzy threshold: 10 kills. Duration: 7s. Also +10% Might during Frenzy.',
        params: {
          killThreshold: 10,
          killWindow: 10,
          attackSpeedBonus: 0.15,
          frenzyDuration: 7,
          cooldown: 20,
          frenzyMightBonus: 0.1,
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 7. Quicksilver Flask  (new)
  // ---------------------------------------------------------------------------
  {
    id: 'quicksilver_flask',
    name: 'Quicksilver Flask',
    maxLevel: 5,
    statBonusPerLevel: { attackSpeedPercent: 5 },
    evolvesWeaponId: null,
    description:
      '+5% Attack Speed per level. Class abilities cool down faster while moving. Flat weapon CD reduction at max level.',
    color: '#94A3B8',
    iconFrame: 21,
    levelBonuses: [
      {
        level: 3,
        effectId: 'quicksilver_moving_cdr',
        description:
          'Class abilities cool down 8% faster while moving.',
        params: { cdrPercent: 0.08 },
      },
      {
        level: 5,
        effectId: 'quicksilver_moving_cdr',
        description:
          'Movement CDR bonus increased to 15%.',
        params: { cdrPercent: 0.15 },
      },
      {
        level: 5,
        effectId: 'quicksilver_flat_cdr',
        description:
          'Weapon cooldowns reduced by 0.05s flat (after all multipliers, minimum 0.2s).',
        params: { flatCdr: 0.05 },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 8. Thorn Mantle  (new)
  // ---------------------------------------------------------------------------
  {
    id: 'thorn_mantle',
    name: 'Thorn Mantle',
    maxLevel: 5,
    statBonusPerLevel: {},
    evolvesWeaponId: null,
    description:
      'Retaliation damage when hit. Scales with level, gaining AoE, Might scaling, and a slow at max level.',
    color: '#65A30D',
    iconFrame: 22,
    levelBonuses: [
      {
        level: 1,
        effectId: 'thorns',
        description: 'When hit, deal 8 damage back to the attacker.',
        params: { damage: 8 },
      },
      {
        level: 2,
        effectId: 'thorns',
        description:
          'Thorns damage: 12. Also applies to enemies within 30px of the attacker.',
        params: { damage: 12, aoeRadius: 30 },
      },
      {
        level: 3,
        effectId: 'thorns',
        description: 'Thorns damage: 16. AoE radius: 40px.',
        params: { damage: 16, aoeRadius: 40 },
      },
      {
        level: 4,
        effectId: 'thorns',
        description:
          'Thorns damage: 20. AoE radius: 50px. Scales with Might.',
        params: { damage: 20, aoeRadius: 50, scalesWithMight: 1 },
      },
      {
        level: 5,
        effectId: 'thorns',
        description:
          'Thorns damage: 25. AoE radius: 60px. Scales with Might. Enemies slowed 15% for 1.5s.',
        params: {
          damage: 25,
          aoeRadius: 60,
          scalesWithMight: 1,
          slowPercent: 0.15,
          slowDuration: 1.5,
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 9. Vital Essence  (new)
  // ---------------------------------------------------------------------------
  {
    id: 'vital_essence',
    name: 'Vital Essence',
    maxLevel: 5,
    statBonusPerLevel: { maxHpPercent: 8 },
    evolvesWeaponId: null,
    description:
      '+8% Max HP per level. Gains HP Regen at lv2+, triple Regen when low HP at lv4, and a food shield at max level.',
    color: '#E11D48',
    iconFrame: 23,
    levelBonuses: [
      {
        level: 2,
        effectId: 'vital_regen',
        description: '+0.2 HP Regen/s.',
        params: { hpRegen: 0.2 },
      },
      {
        level: 3,
        effectId: 'vital_regen',
        description: '+0.2 HP Regen/s.',
        params: { hpRegen: 0.2 },
      },
      {
        level: 4,
        effectId: 'vital_regen',
        description: '+0.2 HP Regen/s.',
        params: { hpRegen: 0.2 },
      },
      {
        level: 4,
        effectId: 'vital_low_hp_regen',
        description: 'When below 40% HP, HP Regen is tripled.',
        params: { threshold: 0.4 },
      },
      {
        level: 5,
        effectId: 'vital_regen',
        description: '+0.2 HP Regen/s.',
        params: { hpRegen: 0.2 },
      },
      {
        level: 5,
        effectId: 'vital_low_hp_regen',
        description: 'Low-HP Regen threshold raised to 50%.',
        params: { threshold: 0.5 },
      },
      {
        level: 5,
        effectId: 'vital_food_shield',
        description:
          'Food pickups grant a 10 HP shield for 5 seconds.',
        params: { shieldHp: 10, duration: 5 },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 10. Piercing Lens  (retained, reworked with levelBonuses)
  // ---------------------------------------------------------------------------
  {
    id: 'piercing_lens',
    name: 'Piercing Lens',
    maxLevel: 5,
    statBonusPerLevel: { pierce: 1 },
    evolvesWeaponId: null,
    description:
      '+1 Pierce per level. Projectiles gain escalating damage per pierce and grow in size after piercing 3+ enemies.',
    color: '#06B6D4',
    iconFrame: 18,
    levelBonuses: [
      {
        level: 3,
        effectId: 'piercing_escalate',
        description:
          'Projectiles deal +5% damage per enemy pierced.',
        params: { damagePctPerPierce: 0.05 },
      },
      {
        level: 5,
        effectId: 'piercing_escalate',
        description:
          'Pierce damage bonus increased to +8% per enemy pierced.',
        params: { damagePctPerPierce: 0.08 },
      },
      {
        level: 5,
        effectId: 'piercing_size_growth',
        description:
          'Projectiles that have pierced 3+ enemies gain +10% size.',
        params: { threshold: 3, sizePct: 0.1 },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 11. Shadow Cloak  (new)
  // ---------------------------------------------------------------------------
  {
    id: 'shadow_cloak',
    name: 'Shadow Cloak',
    maxLevel: 5,
    statBonusPerLevel: {},
    evolvesWeaponId: null,
    description:
      'Chance to dodge attacks entirely. Higher levels grant move speed on dodge and brief invisibility.',
    color: '#4B5563',
    iconFrame: 24,
    levelBonuses: [
      {
        level: 1,
        effectId: 'shadow_dodge',
        description: '5% chance to dodge attacks (take 0 damage).',
        params: { chance: 0.05 },
      },
      {
        level: 2,
        effectId: 'shadow_dodge',
        description: 'Dodge chance: 7%.',
        params: { chance: 0.07 },
      },
      {
        level: 3,
        effectId: 'shadow_dodge',
        description: 'Dodge chance: 9%.',
        params: { chance: 0.09 },
      },
      {
        level: 3,
        effectId: 'shadow_dodge_speed',
        description: 'After dodging, gain +20% Move Speed for 1.5s.',
        params: { moveSpeedBonus: 0.2, duration: 1.5 },
      },
      {
        level: 4,
        effectId: 'shadow_dodge',
        description: 'Dodge chance: 11%.',
        params: { chance: 0.11 },
      },
      {
        level: 5,
        effectId: 'shadow_dodge',
        description: 'Dodge chance: 13%.',
        params: { chance: 0.13 },
      },
      {
        level: 5,
        effectId: 'shadow_invisibility',
        description:
          'After dodging, become invisible for 1s (enemies lose aggro). 8s internal cooldown.',
        params: { duration: 1, cooldown: 8 },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // 12. Chronosphere  (new)
  // ---------------------------------------------------------------------------
  {
    id: 'chronosphere',
    name: 'Chronosphere',
    maxLevel: 5,
    statBonusPerLevel: { durationPercent: 8 },
    evolvesWeaponId: null,
    description:
      '+8% Duration per level. Ground effects deal bonus damage and gain radius in their final 25% of duration.',
    color: '#8B5CF6',
    iconFrame: 25,
    levelBonuses: [
      {
        level: 3,
        effectId: 'chrono_detonation',
        description:
          'Ground effects deal +10% damage in their final 25% of duration.',
        params: { bonusDmgPct: 0.1 },
      },
      {
        level: 5,
        effectId: 'chrono_detonation_enhanced',
        description:
          'Ground effects deal +20% damage and gain +15% radius in their final 25% of duration.',
        params: { bonusDmgPct: 0.2, bonusRadiusPct: 0.15 },
      },
    ],
  },
] as const;
