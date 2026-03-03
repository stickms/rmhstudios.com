// =============================================================================
// ALTAIR -- Evolution Catalysts (Balance Patch v1.3, Section 2)
// =============================================================================
// Catalysts replace the old evolution passives. They have unique mechanical
// effects (not flat stat bonuses) and are consumed when a weapon evolves.
//
// Key rules:
//   - Catalysts have 3 levels (not 5 like generic passives)
//   - At level 3, they enable weapon evolution (weapon must be level 8)
//   - On evolution, the catalyst is consumed and the passive slot is freed
//   - Catalysts are useful standalone even without the matching weapon
// =============================================================================

export interface CatalystEffect {
  type:
    | 'on_damage_taken'
    | 'on_attack'
    | 'on_hit'
    | 'on_kill'
    | 'periodic'
    | 'passive_aura'
    | 'on_stationary'
    | 'on_miss'
    | 'on_hp_threshold';
  effectId: string;
  params: Record<string, number[]>; // key → [lv1, lv2, lv3] values
}

export interface CatalystDef {
  id: string;
  name: string;
  maxLevel: 3;
  evolvesWeaponId: string;
  effect: CatalystEffect;
  descriptions: string[]; // [lv1 desc, lv2 desc, lv3 desc]
  color: string;
  iconFrame: number;
}

export const CATALYSTS: readonly CatalystDef[] = [
  // -------------------------------------------------------------------------
  // 1. Warden's Crest → Broad Sword (Radiant Claymore)
  // -------------------------------------------------------------------------
  {
    id: 'wardens_crest',
    name: "Warden's Crest",
    maxLevel: 3,
    evolvesWeaponId: 'broad_sword',
    effect: {
      type: 'on_damage_taken',
      effectId: 'damage_shield',
      params: {
        shieldPercent: [8, 12, 16],
        shieldDurationS: [3, 4, 4],
        minShieldHp: [3, 3, 3],
        meleeDmgBonusWhileShielded: [0, 0, 20],
      },
    },
    descriptions: [
      'After taking damage, gain a damage shield equal to 8% of damage taken for 3s. Minimum shield: 3 HP.',
      'Shield amount increased to 12%. Shield duration: 4s.',
      'Shield amount: 16%. While shield is active, your next melee attack deals +20% damage. Evolution ready.',
    ],
    color: '#C0C0C0', // silver — matches Broad Sword
    iconFrame: 0,
  },

  // -------------------------------------------------------------------------
  // 2. Astral Focus → Arcane Bolt (Arcane Barrage)
  // -------------------------------------------------------------------------
  {
    id: 'astral_focus',
    name: 'Astral Focus',
    maxLevel: 3,
    evolvesWeaponId: 'arcane_bolt',
    effect: {
      type: 'on_attack',
      effectId: 'arcane_spark',
      params: {
        attacksPerSpark: [5, 4, 3],
        sparkDamage: [15, 20, 25],
        sparkPierce: [0, 1, 2],
        finalAoePx: [0, 0, 30],
        homingRangePx: [200, 200, 200],
      },
    },
    descriptions: [
      'Every 5th weapon attack releases a homing arcane spark dealing 15 damage to the nearest enemy within 200px.',
      'Every 4th attack. Spark damage: 20. Sparks pierce 1 enemy.',
      'Every 3rd attack. Spark damage: 25. Sparks pierce 2 enemies and explode on final target for 30px AoE. Evolution ready.',
    ],
    color: '#A855F7', // purple — matches Arcane Bolt
    iconFrame: 1,
  },

  // -------------------------------------------------------------------------
  // 3. Hawk Talon → Iron Shortbow (Storm Bow)
  // -------------------------------------------------------------------------
  {
    id: 'hawk_talon',
    name: 'Hawk Talon',
    maxLevel: 3,
    evolvesWeaponId: 'iron_shortbow',
    effect: {
      type: 'on_hit',
      effectId: 'focus_stacks',
      params: {
        maxStacks: [5, 6, 8],
        dmgPerStackPercent: [4, 5, 6],
        stackTimeoutS: [2, 2, 2],
        highlightAtMax: [0, 1, 1],
        pierceAtMax: [0, 0, 3],
      },
    },
    descriptions: [
      'Consecutive hits on the same enemy within 2s build focus stacks (max 5). Each stack: +4% damage to that enemy.',
      'Max stacks: 6. Damage per stack: 5%. At max stacks the target is highlighted for all players.',
      'Max stacks: 8. Damage per stack: 6% (48% max). At max stacks, projectiles gain +3 Pierce against this target. Evolution ready.',
    ],
    color: '#78716C', // warm stone — matches Iron Shortbow
    iconFrame: 2,
  },

  // -------------------------------------------------------------------------
  // 4. Blighted Venom → Toxic Flask (Plague Bomb)
  // -------------------------------------------------------------------------
  {
    id: 'blighted_venom',
    name: 'Blighted Venom',
    maxLevel: 3,
    evolvesWeaponId: 'toxic_flask',
    effect: {
      type: 'on_kill',
      effectId: 'toxic_corpse',
      params: {
        corpseDamage: [5, 5, 5],
        corpseDurationS: [2, 2, 2],
        poisonDps: [3, 4, 4],
        poisonDurationS: [2, 3, 3],
        slowPercent: [0, 0, 10],
        eliteCorpseSizeBonus: [0, 50, 50],
        plagueZoneMerge: [0, 0, 1],
        plagueZoneRadiusPx: [0, 0, 150],
        plagueZoneDurationS: [0, 0, 4],
        plagueZoneDmgPerTick: [0, 0, 8],
      },
    },
    descriptions: [
      'Enemies that die while poisoned leave a toxic corpse for 2s. Nearby enemies take 5 damage and become poisoned (3 dps, 2s).',
      'Corpse radius +20px. Poison: 4 dps for 3s. Elite corpses (Tier 4+) are 50% larger.',
      'Corpse poison applies 10% slow for 2s. 3+ nearby poison-deaths merge into a plague zone (150px, 4s, 8 dmg/tick). Evolution ready.',
    ],
    color: '#22C55E', // toxic green — matches Toxic Flask
    iconFrame: 3,
  },

  // -------------------------------------------------------------------------
  // 5. Berserker's Brand → War Axe (Cataclysm Axe)
  // -------------------------------------------------------------------------
  {
    id: 'berserkers_brand',
    name: "Berserker's Brand",
    maxLevel: 3,
    evolvesWeaponId: 'war_axe',
    effect: {
      type: 'on_damage_taken',
      effectId: 'counter_attack',
      params: {
        dmgBonusPercent: [15, 20, 25],
        buffWindowS: [2, 3, 3],
        areaBonusPercent: [0, 15, 15],
        shockwave: [0, 0, 1],
        shockwaveRadiusPx: [0, 0, 100],
        shockwaveDamage: [0, 0, 15],
        shockwaveCooldownS: [0, 0, 3],
      },
    },
    descriptions: [
      'After taking damage, your next attack within 2s deals +15% damage. Does not stack from multiple hits.',
      'Damage bonus: +20%. Window: 3s. Buffed attack also has +15% Area.',
      'Damage bonus: +25%. Window: 3s. Buffed attack releases a ground shockwave (100px, 15 damage). 3s internal CD. Evolution ready.',
    ],
    color: '#B91C1C', // deep red — matches War Axe
    iconFrame: 4,
  },

  // -------------------------------------------------------------------------
  // 6. Phylactery Shard → Soul Siphon (Death Ray)
  // -------------------------------------------------------------------------
  {
    id: 'phylactery_shard',
    name: 'Phylactery Shard',
    maxLevel: 3,
    evolvesWeaponId: 'soul_siphon',
    effect: {
      type: 'on_kill',
      effectId: 'soul_wisps',
      params: {
        procChancePercent: [12, 16, 20],
        wispDps: [4, 6, 8],
        wispDurationS: [6, 8, 10],
        maxWisps: [2, 3, 4],
        killProximityPx: [80, 80, 80],
        orbitRadiusPx: [100, 100, 100],
        healPerWispPerS: [0, 0, 1],
      },
    },
    descriptions: [
      'Enemies killed within 80px have a 12% chance to become a soul wisp (6s, orbits at 100px, 4 dps). Max 2 wisps.',
      'Proc chance: 16%. Wisp damage: 6 dps. Duration: 8s. Max 3 wisps.',
      'Proc chance: 20%. Wisp damage: 8 dps. Duration: 10s. Max 4 wisps. Wisps heal 1 HP/s each. Evolution ready.',
    ],
    color: '#6B21A8', // dark purple — matches Soul Siphon
    iconFrame: 5,
  },

  // -------------------------------------------------------------------------
  // 7. Paradox Gear → Temporal Shard (Eternity Loop)
  // -------------------------------------------------------------------------
  {
    id: 'paradox_gear',
    name: 'Paradox Gear',
    maxLevel: 3,
    evolvesWeaponId: 'temporal_shard',
    effect: {
      type: 'periodic',
      effectId: 'temporal_echo',
      params: {
        intervalS: [20, 16, 12],
        echoDurationS: [2, 2.5, 3],
        echoDmgPercent: [40, 50, 60],
        slowPercent: [0, 0, 15],
        slowDurationS: [0, 0, 1.5],
      },
    },
    descriptions: [
      'Every 20s, a temporal echo replays your last 2s of weapon attacks at your position. Echoed attacks deal 40% damage.',
      'Echo interval: 16s. Echo duration: 2.5s. Echo damage: 50%.',
      'Echo interval: 12s. Echo duration: 3s. Echo damage: 60%. Echoed attacks apply 15% slow for 1.5s. Evolution ready.',
    ],
    color: '#EAB308', // golden amber — matches Temporal Shard
    iconFrame: 6,
  },

  // -------------------------------------------------------------------------
  // 8. Sanguine Heart → Crimson Whip (Sanguine Scourge)
  // -------------------------------------------------------------------------
  {
    id: 'sanguine_heart',
    name: 'Sanguine Heart',
    maxLevel: 3,
    evolvesWeaponId: 'crimson_whip',
    effect: {
      type: 'on_hp_threshold',
      effectId: 'blood_pulse',
      params: {
        hpThresholdPercent: [50, 60, 60],
        pulseDamage: [20, 30, 40],
        pulseRadiusPx: [120, 140, 160],
        cooldownS: [15, 12, 10],
        healHp: [0, 5, 8],
        slowPercent: [0, 0, 20],
        slowDurationS: [0, 0, 2],
      },
    },
    descriptions: [
      'When you drop below 50% HP, release a blood pulse (120px radius, 20 damage). 15s internal cooldown.',
      'Threshold: 60% HP. Pulse: 30 damage, 140px. Cooldown: 12s. Heals 5 HP.',
      'Threshold: 60% HP. Pulse: 40 damage, 160px. Cooldown: 10s. Heals 8 HP and applies 20% slow for 2s. Evolution ready.',
    ],
    color: '#DC2626', // crimson — matches Crimson Whip
    iconFrame: 7,
  },

  // -------------------------------------------------------------------------
  // 9. Consecrated Water → Holy Water (Divine Deluge)
  // -------------------------------------------------------------------------
  {
    id: 'consecrated_water',
    name: 'Consecrated Water',
    maxLevel: 3,
    evolvesWeaponId: 'holy_water',
    effect: {
      type: 'on_stationary',
      effectId: 'hallowed_ground',
      params: {
        activationTimeS: [1.5, 1.0, 0.8],
        zoneRadiusPx: [60, 75, 90],
        dmgPerTick: [3, 4, 5],
        tickIntervalS: [0.5, 0.5, 0.5],
        enemyDmgReductionPercent: [15, 20, 25],
        selfHealPerS: [0, 0, 1],
      },
    },
    descriptions: [
      'Standing still for 1.5s creates hallowed ground (60px). Enemies take 3 dps and deal -15% damage inside.',
      'Activation: 1.0s. Zone: 75px. Damage: 4/tick. Enemy damage: -20%.',
      'Activation: 0.8s. Zone: 90px. Damage: 5/tick. Enemy damage: -25%. You heal 1 HP/s on hallowed ground. Evolution ready.',
    ],
    color: '#38BDF8', // holy blue — matches Holy Water
    iconFrame: 8,
  },

  // -------------------------------------------------------------------------
  // 10. Whetstone → Throwing Daggers (Knife Storm)
  // -------------------------------------------------------------------------
  {
    id: 'whetstone',
    name: 'Whetstone',
    maxLevel: 3,
    evolvesWeaponId: 'throwing_daggers',
    effect: {
      type: 'on_miss',
      effectId: 'ricochet',
      params: {
        ricochetChancePercent: [30, 40, 50],
        ricochetDmgPercent: [60, 70, 80],
        ricochetRangePx: [100, 120, 150],
        ricochetPierce: [0, 0, 1],
      },
    },
    descriptions: [
      'Projectiles that miss have a 30% chance to ricochet toward the nearest enemy within 100px at 60% damage.',
      'Ricochet chance: 40%. Range: 120px. Damage: 70%.',
      'Ricochet chance: 50%. Range: 150px. Damage: 80%. Ricocheted projectiles gain +1 Pierce. Evolution ready.',
    ],
    color: '#9CA3AF', // steel grey — matches Throwing Daggers
    iconFrame: 9,
  },

  // -------------------------------------------------------------------------
  // 11. Storm Conduit → Lightning Ring (Thunderstorm)
  // -------------------------------------------------------------------------
  {
    id: 'storm_conduit',
    name: 'Storm Conduit',
    maxLevel: 3,
    evolvesWeaponId: 'lightning_ring',
    effect: {
      type: 'on_hit',
      effectId: 'static_discharge',
      params: {
        procChancePercent: [6, 8, 10],
        dischargeDamage: [10, 15, 20],
        dischargeAoePx: [30, 40, 50],
        chainCount: [0, 1, 2],
        chainRangePx: [0, 60, 60],
        chainDmgPercent: [0, 50, 50],
        stunDurationS: [0, 0, 0.2],
      },
    },
    descriptions: [
      'Damaging an already-wounded enemy has a 6% chance to trigger static discharge (30px AoE, 10 damage).',
      'Proc chance: 8%. AoE: 40px, 15 damage. Discharge chains to 1 nearby enemy within 60px at 50% damage.',
      'Proc chance: 10%. AoE: 50px, 20 damage. Chains to 2 enemies. Stuns primary target for 0.2s. Evolution ready.',
    ],
    color: '#FACC15', // electric yellow — matches Lightning Ring
    iconFrame: 10,
  },

  // -------------------------------------------------------------------------
  // 12. Moonpetal Wreath → Garlic (Soul Eater)
  // -------------------------------------------------------------------------
  {
    id: 'moonpetal_wreath',
    name: 'Moonpetal Wreath',
    maxLevel: 3,
    evolvesWeaponId: 'garlic',
    effect: {
      type: 'on_kill',
      effectId: 'life_motes',
      params: {
        killProximityPx: [100, 100, 100],
        healHp: [3, 4, 5],
        moteDurationS: [5, 6, 8],
        maxMotes: [3, 4, 5],
        magnetRangePx: [0, 40, 40],
        moveSpeedBonusPercent: [0, 0, 5],
        moveSpeedDurationS: [0, 0, 2],
      },
    },
    descriptions: [
      'Enemies that die within 100px drop a life mote. Collecting a mote heals 3 HP. Motes last 5s. Max 3 on screen.',
      'Heal per mote: 4 HP. Duration: 6s. Max 4 motes. Motes attract from 40px (affected by Pickup Range).',
      'Heal per mote: 5 HP. Duration: 8s. Max 5 motes. Collecting a mote grants +5% Move Speed for 2s. Evolution ready.',
    ],
    color: '#FDE68A', // pale gold — matches Garlic
    iconFrame: 11,
  },

  // -------------------------------------------------------------------------
  // 13. Celestial Compass → Runic Orbs (Celestial Guard)
  // -------------------------------------------------------------------------
  {
    id: 'celestial_compass',
    name: 'Celestial Compass',
    maxLevel: 3,
    evolvesWeaponId: 'runic_orbs',
    effect: {
      type: 'periodic',
      effectId: 'detection_pulse',
      params: {
        intervalS: [10, 8, 6],
        pulseRangePx: [400, 500, 600],
        revealDurationS: [3, 4, 5],
        dmgBonusPercent: [5, 8, 10],
        permanentShadowReveal: [0, 0, 1],
      },
    },
    descriptions: [
      'Every 10s, a detection pulse reveals all enemies within 400px for 3s. Revealed enemies take +5% damage.',
      'Pulse interval: 8s. Range: 500px. Reveal: 4s. Damage bonus: +8%.',
      'Pulse interval: 6s. Range: 600px. Reveal: 5s. Damage bonus: +10%. Shadows and invisible enemies are permanently revealed. Evolution ready.',
    ],
    color: '#818CF8', // indigo — matches Runic Orbs
    iconFrame: 12,
  },

  // -------------------------------------------------------------------------
  // 14. Cinder Core → Fire Wand (Inferno Staff)
  // -------------------------------------------------------------------------
  {
    id: 'cinder_core',
    name: 'Cinder Core',
    maxLevel: 3,
    evolvesWeaponId: 'fire_wand',
    effect: {
      type: 'on_kill',
      effectId: 'ignite_spread',
      params: {
        igniteChancePercent: [15, 20, 25],
        burnDps: [6, 8, 10],
        burnDurationS: [2, 2.5, 3],
        spreadRadiusPx: [30, 40, 50],
        armorReductionPercent: [0, 0, 10],
      },
    },
    descriptions: [
      'Killed enemies have a 15% chance to ignite, burning for 6 dps for 2s. Fire spreads to enemies within 30px on death.',
      'Ignite chance: 20%. Burn: 8 dps for 2.5s. Spread radius: 40px.',
      'Ignite chance: 25%. Burn: 10 dps for 3s. Spread radius: 50px. Ignited enemies have -10% Armor. Evolution ready.',
    ],
    color: '#F97316', // orange flame — matches Fire Wand
    iconFrame: 13,
  },
] as const;
