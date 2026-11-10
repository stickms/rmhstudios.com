// =============================================================================
// ALTAIR -- Classes: the Outpost 13 crew (GDD Section 6)
// =============================================================================
// Each class has unique base stat modifiers, a starting weapon, and two class
// abilities (one innate from the start, one unlocked at level 10).
// Ids and ability `type`s are save data and never change; names, text and colours are the crew's.
// Allies read teal, cyan and amber (hostiles are magenta), so class colours stay in that family.
// =============================================================================

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  unlockLevel: number;
  type: string;
}

export interface ClassDef {
  id: string;
  name: string;
  description: string;
  tagline: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  unlockCondition: string;
  unlockCost: number;
  startingWeaponId: string;
  baseStats: Record<string, number>;
  ability1: AbilityDef;
  ability2: AbilityDef;
  color: string;
}

export const CLASSES: readonly ClassDef[] = [
  // -------------------------------------------------------------------------
  // 6.1 Knight
  // -------------------------------------------------------------------------
  {
    id: 'knight',
    name: 'Vanguard',
    description: 'Riot-shield point crew with balanced stats and the best survivability aboard. Ideal for a first descent.',
    tagline: 'Hold the Line',
    difficulty: 'Easy',
    unlockCondition: 'Starting class',
    unlockCost: 0,
    startingWeaponId: 'broad_sword',
    baseStats: {
      maxHp: 120,
      hpRegen: 0,
      moveSpeed: 195,
      might: 1.0,
      attackSpeed: 1.0,
      area: 1.0,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.0,
      pickupRange: 50,
      luck: 1.0,
      armor: 1,
      cdr: 1.0,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'shield_wall',
      name: 'Barrier Field',
      description:
        'Every 25 seconds (affected by CDR), raises a barrier absorbing 30 damage (scales +10 per player level milestone at 10, 20, 30). The barrier lasts 8 seconds or until broken.',
      cooldown: 25,
      unlockLevel: 1,
      type: 'shield_wall',
    },
    ability2: {
      id: 'rally_cry',
      name: 'Klaxon',
      description:
        'Every 45 seconds (affected by CDR), sounds the station klaxon in a 250px radius (affected by Area). Enemies in range are stunned for 1.5 seconds and take 50 damage (affected by Might). The Vanguard gains +15% Move Speed for 5 seconds.',
      cooldown: 45,
      unlockLevel: 10,
      type: 'rally_cry',
    },
    color: '#19D3DA',
  },

  // -------------------------------------------------------------------------
  // 6.2 Arcanist
  // -------------------------------------------------------------------------
  {
    id: 'arcanist',
    name: 'Arcwright',
    description: 'A field engineer who trades durability for devastating electromagnetic area attacks.',
    tagline: 'Overcharge',
    difficulty: 'Medium',
    unlockCondition: 'Starting class',
    unlockCost: 0,
    startingWeaponId: 'arcane_bolt',
    baseStats: {
      maxHp: 80,
      hpRegen: 0,
      moveSpeed: 190,
      might: 1.1,
      attackSpeed: 1.0,
      area: 1.1,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.0,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 0.92,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'mana_surge',
      name: 'Capacitor Surge',
      description:
        'Every 30 seconds, the next 2 weapon attacks deal 1.6x damage and have +30% Area. 5 second window to use.',
      cooldown: 30,
      unlockLevel: 1,
      type: 'mana_surge',
    },
    ability2: {
      id: 'arcane_nova',
      name: 'EM Pulse',
      description:
        'Every 40 seconds, releases an expanding ring of electromagnetic energy (300px, affected by Area) dealing 60 damage (affected by Might) and applying a 25% slow for 2 seconds.',
      cooldown: 40,
      unlockLevel: 10,
      type: 'arcane_nova',
    },
    color: '#E6FBFF',
  },

  // -------------------------------------------------------------------------
  // 6.3 Ranger
  // -------------------------------------------------------------------------
  {
    id: 'ranger',
    name: 'Surveyor',
    description: 'A fast scout who maps the dark ahead and wins by kiting and long-range fire.',
    tagline: 'Eyes on the Dark',
    difficulty: 'Medium',
    unlockCondition: 'Starting class',
    unlockCost: 0,
    startingWeaponId: 'iron_shortbow',
    baseStats: {
      maxHp: 90,
      hpRegen: 0,
      moveSpeed: 235,
      might: 1.0,
      attackSpeed: 1.0,
      area: 1.0,
      projCount: 0,
      projSpeed: 1.25,
      duration: 1.0,
      pickupRange: 70,
      luck: 1.0,
      armor: 0,
      cdr: 1.0,
      revival: 0,
      growth: 1.0,
      pierce: 1,
    },
    ability1: {
      id: 'evasion_roll',
      name: 'Thruster Dash',
      description:
        'Every 16 seconds, automatically dashes 170px in movement direction when an enemy comes within 60px, gaining invincibility frames for 0.5 seconds. Leaves a brief damage trail (8 dmg, 1s). If stationary, dashes away from the nearest enemy.',
      cooldown: 16,
      unlockLevel: 1,
      type: 'evasion_roll',
    },
    ability2: {
      id: 'hunters_mark',
      name: 'Survey Lock',
      description:
        "Every 30 seconds, the strongest enemy on screen is marked for 8 seconds. Marked enemies take +30% damage (+15% bosses) and drop 2x XP. Mark transfers to nearest enemy on kill (up to 2 times).",
      cooldown: 30,
      unlockLevel: 10,
      type: 'hunters_mark',
    },
    color: '#6EE7B7',
  },

  // -------------------------------------------------------------------------
  // 6.4 Plague Doctor
  // -------------------------------------------------------------------------
  {
    id: 'plague_doctor',
    name: 'Biotech',
    description: 'A hazmat specialist who controls space with lingering toxin zones.',
    tagline: 'Contain and Spread',
    difficulty: 'Medium',
    unlockCondition: 'Survive 10 minutes',
    unlockCost: 0,
    startingWeaponId: 'toxic_flask',
    baseStats: {
      maxHp: 95,
      hpRegen: 0.3,
      moveSpeed: 185,
      might: 1.0,
      attackSpeed: 1.0,
      area: 1.05,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.2,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 1.0,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'miasma_trail',
      name: 'Toxin Trail',
      description:
        'Passively leaves a toxin trail (25px wide, affected by Area) that persists for 1.5 seconds (affected by Duration). Deals 4 damage per tick every 0.5 seconds (affected by Might). Trail applies 10% slow per stack, up to 2 stacks (20% slow).',
      cooldown: 0,
      unlockLevel: 1,
      type: 'miasma_trail',
    },
    ability2: {
      id: 'pandemic',
      name: 'Outbreak',
      description:
        'Every 50 seconds, all currently poisoned enemies rupture, dealing 30% of remaining poison damage as instant AoE in an 80px radius (affected by Area). Can chain up to 2 iterations with a 0.3 second delay.',
      cooldown: 50,
      unlockLevel: 10,
      type: 'pandemic',
    },
    color: '#FFB44D',
  },

  // -------------------------------------------------------------------------
  // 6.5 Berserker
  // -------------------------------------------------------------------------
  {
    id: 'berserker',
    name: 'Breacher',
    description: 'A high-risk close-quarters demolitionist who hits harder the more damage the suit has taken.',
    tagline: 'Through the Bulkhead',
    difficulty: 'Hard',
    unlockCondition: 'Kill 3,000 enemies in one run',
    unlockCost: 0,
    startingWeaponId: 'war_axe',
    baseStats: {
      maxHp: 130,
      hpRegen: 0.2,
      moveSpeed: 200,
      might: 0.9,
      attackSpeed: 1.0,
      area: 1.0,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.0,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 1.0,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'blood_rage',
      name: 'Suit Breach',
      description:
        'Passive. Gains bonus Might based on missing HP: bonus = 0.6 * (1 - currentHp / maxHp). At 100% HP = +0.00x, 50% HP = +0.30x, 25% HP = +0.45x.',
      cooldown: 0,
      unlockLevel: 1,
      type: 'blood_rage',
    },
    ability2: {
      id: 'savage_slam',
      name: 'Hull Slam',
      description:
        'Every 35 seconds, leaps to the densest cluster of enemies within 300px and slams down, dealing 90 damage (affected by Might) in a 150px radius (affected by Area). Inner 50px enemies are knocked back 80px and stunned for 0.7 seconds. Invulnerable during leap (~0.4s).',
      cooldown: 35,
      unlockLevel: 10,
      type: 'savage_slam',
    },
    color: '#FF8A3D',
  },

  // -------------------------------------------------------------------------
  // 6.6 Necromancer
  // -------------------------------------------------------------------------
  {
    id: 'necromancer',
    name: 'Echo-Binder',
    description: 'A signals tech who binds Echoes of the lost crew to fight. Lower personal damage, but overwhelming numbers.',
    tagline: 'Nobody Is Lost',
    difficulty: 'Hard',
    unlockCondition: 'Purchase in shop',
    unlockCost: 1500,
    startingWeaponId: 'soul_siphon',
    baseStats: {
      maxHp: 85,
      hpRegen: 0,
      moveSpeed: 180,
      might: 0.85,
      attackSpeed: 1.0,
      area: 1.0,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.15,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 0.9,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'raise_dead',
      name: 'Bind Echo',
      description:
        'Every enemy killed has an 18% chance (affected by Luck) to bind an Echo (25 HP, 10 damage/hit affected by Might, 1 attack/s, 180 speed, 10s duration affected by Duration). Max 6 active Echoes (8 at level 15, 10 at level 25).',
      cooldown: 0,
      unlockLevel: 1,
      type: 'raise_dead',
    },
    ability2: {
      id: 'army_of_darkness',
      name: 'Echo Wall',
      description:
        'Every 60 seconds, raises a ring of 8 resonance pillars (200px radius, affected by Area; 40 HP each). Enemies touching pillars take 25 damage and are knocked back. Lasts 5 seconds (affected by Duration). Echoes inside gain +30% damage and attack speed.',
      cooldown: 60,
      unlockLevel: 10,
      type: 'army_of_darkness',
    },
    color: '#7AA2F7',
  },

  // -------------------------------------------------------------------------
  // 6.7 Chronomancer
  // -------------------------------------------------------------------------
  {
    id: 'chronomancer',
    name: 'Dilator',
    description: 'A physicist with a time-dilation rig who slows enemies and bends cooldowns.',
    tagline: 'Borrowed Seconds',
    difficulty: 'Hard',
    unlockCondition: 'Defeat the 15-minute boss',
    unlockCost: 0,
    startingWeaponId: 'temporal_shard',
    baseStats: {
      maxHp: 85,
      hpRegen: 0,
      moveSpeed: 200,
      might: 1.0,
      attackSpeed: 1.0,
      area: 1.0,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.1,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 0.88,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'time_dilation_field',
      name: 'Dilation Field',
      description:
        'Passive 120px radius aura (affected by Area). All enemies inside move and attack at 75% speed. Always active.',
      cooldown: 0,
      unlockLevel: 1,
      type: 'time_dilation_field',
    },
    ability2: {
      id: 'temporal_rewind',
      name: 'Rewind',
      description:
        'Every 55 seconds, rewinds 3 seconds of position and HP history. Teleports to previous position with whichever HP is higher. Invulnerable during rewind (~0.3s). All enemies within 150px of current position are frozen for 2.0 seconds.',
      cooldown: 55,
      unlockLevel: 10,
      type: 'temporal_rewind',
    },
    color: '#F5D76E',
  },

  // -------------------------------------------------------------------------
  // 6.8 Hemomancer
  // -------------------------------------------------------------------------
  {
    id: 'hemomancer',
    name: 'Hemosurgeon',
    description: 'A field surgeon who spends their own blood for power and heals through violence.',
    tagline: 'First, Do Some Harm',
    difficulty: 'Hard',
    unlockCondition: 'Complete a full 20:00 run',
    unlockCost: 0,
    startingWeaponId: 'crimson_whip',
    baseStats: {
      maxHp: 110,
      hpRegen: -0.8,
      moveSpeed: 195,
      might: 1.05,
      attackSpeed: 1.0,
      area: 1.0,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.0,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 1.0,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'sanguine_feast',
      name: 'Transfusion',
      description:
        'Passive. All damage dealt heals for 4% of damage dealt (lifesteal, after Might modifiers). Healing capped at 6 HP per second. Below 50% HP, lifesteal increases to 6%.',
      cooldown: 0,
      unlockLevel: 1,
      type: 'sanguine_feast',
    },
    ability2: {
      id: 'blood_nova',
      name: 'Hemorrhage Burst',
      description:
        'Every 35 seconds, sacrifices 12% of current HP and detonates it as a blood burst in a 250px radius (affected by Area). Damage equals 2.5x HP sacrificed plus 40 base damage (affected by Might). Enemies killed heal the Hemosurgeon for 3 HP each (capped at 30 HP per burst).',
      cooldown: 35,
      unlockLevel: 10,
      type: 'blood_nova',
    },
    color: '#FFC9B8',
  },
] as const;
