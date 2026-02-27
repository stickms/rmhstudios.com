// =============================================================================
// ALTAIR -- Classes (GDD Section 6)
// =============================================================================
// Each class has unique base stat modifiers, a starting weapon, and two class
// abilities (one innate from the start, one unlocked at level 10).
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
    name: 'Knight',
    description: 'A stalwart warrior with balanced stats and strong survivability. Ideal for beginners.',
    tagline: 'Shield and Steel',
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
      name: 'Shield Wall',
      description:
        'Every 25 seconds (affected by CDR), gains a shield absorbing 30 damage (scales +10 per player level milestone at 10, 20, 30). Shield lasts 8 seconds or until broken.',
      cooldown: 25,
      unlockLevel: 1,
      type: 'shield_wall',
    },
    ability2: {
      id: 'rally_cry',
      name: 'Rally Cry',
      description:
        'Every 45 seconds (affected by CDR), emits a battle shout in a 250px radius (affected by Area). Enemies in range are stunned for 1.5 seconds and take 50 damage (affected by Might). Knight gains +15% Move Speed for 5 seconds.',
      cooldown: 45,
      unlockLevel: 10,
      type: 'rally_cry',
    },
    color: '#3B82F6',
  },

  // -------------------------------------------------------------------------
  // 6.2 Arcanist
  // -------------------------------------------------------------------------
  {
    id: 'arcanist',
    name: 'Arcanist',
    description: 'A glass cannon mage who trades durability for devastating magical area attacks.',
    tagline: 'Power Unbound',
    difficulty: 'Medium',
    unlockCondition: 'Starting class',
    unlockCost: 0,
    startingWeaponId: 'arcane_bolt',
    baseStats: {
      maxHp: 80,
      hpRegen: 0,
      moveSpeed: 190,
      might: 1.2,
      attackSpeed: 1.0,
      area: 1.15,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.0,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 0.9,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'mana_surge',
      name: 'Mana Surge',
      description:
        'Every 30 seconds, the next 3 weapon attacks deal 2x damage and have +50% Area.',
      cooldown: 30,
      unlockLevel: 1,
      type: 'mana_surge',
    },
    ability2: {
      id: 'arcane_nova',
      name: 'Arcane Nova',
      description:
        'Every 40 seconds, unleashes an expanding ring of arcane energy (400px, affected by Area) dealing 80 damage (affected by Might) and applying a 30% slow for 3 seconds.',
      cooldown: 40,
      unlockLevel: 10,
      type: 'arcane_nova',
    },
    color: '#8B5CF6',
  },

  // -------------------------------------------------------------------------
  // 6.3 Ranger
  // -------------------------------------------------------------------------
  {
    id: 'ranger',
    name: 'Ranger',
    description: 'A swift, evasive fighter who excels at kiting and projectile-based combat.',
    tagline: 'Swift and Deadly',
    difficulty: 'Medium',
    unlockCondition: 'Starting class',
    unlockCost: 0,
    startingWeaponId: 'iron_shortbow',
    baseStats: {
      maxHp: 90,
      hpRegen: 0,
      moveSpeed: 230,
      might: 1.0,
      attackSpeed: 1.0,
      area: 1.0,
      projCount: 1,
      projSpeed: 1.2,
      duration: 1.0,
      pickupRange: 75,
      luck: 1.0,
      armor: 0,
      cdr: 1.0,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'evasion_roll',
      name: 'Evasion Roll',
      description:
        'Every 20 seconds, automatically dashes 150px in movement direction when an enemy comes within 60px, gaining invincibility frames for 0.5 seconds. If stationary, dashes away from the nearest enemy.',
      cooldown: 20,
      unlockLevel: 1,
      type: 'evasion_roll',
    },
    ability2: {
      id: 'hunters_mark',
      name: "Hunter's Mark",
      description:
        'Every 35 seconds, the strongest enemy on screen (highest current HP) is marked for 8 seconds. Marked enemies take +40% damage from all sources and drop 3x XP. Boss bonus damage reduced to +20%.',
      cooldown: 35,
      unlockLevel: 10,
      type: 'hunters_mark',
    },
    color: '#22C55E',
  },

  // -------------------------------------------------------------------------
  // 6.4 Plague Doctor
  // -------------------------------------------------------------------------
  {
    id: 'plague_doctor',
    name: 'Plague Doctor',
    description: 'A poison specialist who controls space with lingering damage zones.',
    tagline: 'Pestilence Incarnate',
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
      area: 1.1,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.3,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 1.0,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'miasma_trail',
      name: 'Miasma Trail',
      description:
        'Passively leaves a poison trail (30px wide, affected by Area) that persists for 2 seconds (affected by Duration). Deals 5 damage per tick every 0.5 seconds (affected by Might). Trail applies 10% slow per stack, up to 3 stacks (30% slow).',
      cooldown: 0,
      unlockLevel: 1,
      type: 'miasma_trail',
    },
    ability2: {
      id: 'pandemic',
      name: 'Pandemic',
      description:
        'Every 50 seconds, all currently poisoned enemies explode, dealing 40% of remaining poison damage as instant AoE in a 100px radius (affected by Area). Can chain up to 3 iterations with a 0.3 second delay.',
      cooldown: 50,
      unlockLevel: 10,
      type: 'pandemic',
    },
    color: '#10B981',
  },

  // -------------------------------------------------------------------------
  // 6.5 Berserker
  // -------------------------------------------------------------------------
  {
    id: 'berserker',
    name: 'Berserker',
    description: 'A high-risk melee fighter who grows stronger the more damage they take.',
    tagline: 'Fury Unleashed',
    difficulty: 'Hard',
    unlockCondition: 'Kill 3,000 enemies in one run',
    unlockCost: 0,
    startingWeaponId: 'war_axe',
    baseStats: {
      maxHp: 150,
      hpRegen: 0.5,
      moveSpeed: 205,
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
      name: 'Blood Rage',
      description:
        'Passive. Gains bonus Might based on missing HP: bonus = 0.8 * (1 - currentHp / maxHp). At 100% HP = +0.00x, 50% HP = +0.40x, 25% HP = +0.60x. Below 30% HP, also gains +20% Attack Speed.',
      cooldown: 0,
      unlockLevel: 1,
      type: 'blood_rage',
    },
    ability2: {
      id: 'savage_slam',
      name: 'Savage Slam',
      description:
        'Every 30 seconds, leaps to the densest cluster of enemies within 300px and slams down, dealing 120 damage (affected by Might) in a 180px radius (affected by Area). Inner 60px enemies are knocked back 100px and stunned for 1 second. Invulnerable during leap (~0.6s).',
      cooldown: 30,
      unlockLevel: 10,
      type: 'savage_slam',
    },
    color: '#EF4444',
  },

  // -------------------------------------------------------------------------
  // 6.6 Necromancer
  // -------------------------------------------------------------------------
  {
    id: 'necromancer',
    name: 'Necromancer',
    description: 'A summoner who raises the dead to fight. Lower personal damage, but overwhelming numbers.',
    tagline: 'Master of the Dead',
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
      duration: 1.2,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 0.85,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'raise_dead',
      name: 'Raise Dead',
      description:
        'Every enemy killed has a 25% chance (affected by Luck) to raise a skeleton minion (30 HP, 15 damage/hit affected by Might, 1 attack/s, 180 speed, 12s duration affected by Duration). Max 8 active skeletons (10 at level 15, 12 at level 25).',
      cooldown: 0,
      unlockLevel: 1,
      type: 'raise_dead',
    },
    ability2: {
      id: 'army_of_darkness',
      name: 'Army of Darkness',
      description:
        'Every 60 seconds, summons a bone wall ring (200px radius, affected by Area) of 12 bone pillars (50 HP each). Enemies touching pillars take 25 damage and are knocked back. Lasts 6 seconds (affected by Duration). Skeletons inside gain +50% damage and attack speed.',
      cooldown: 60,
      unlockLevel: 10,
      type: 'army_of_darkness',
    },
    color: '#6B21A8',
  },

  // -------------------------------------------------------------------------
  // 6.7 Chronomancer
  // -------------------------------------------------------------------------
  {
    id: 'chronomancer',
    name: 'Chronomancer',
    description: 'A time-bending spellcaster who manipulates enemy speed and cooldowns.',
    tagline: 'Lord of Time',
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
      duration: 1.15,
      pickupRange: 50,
      luck: 1.0,
      armor: 0,
      cdr: 0.8,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'time_dilation_field',
      name: 'Time Dilation Field',
      description:
        'Passive 150px radius aura (affected by Area). All enemies inside move and attack at 70% speed. Always active.',
      cooldown: 0,
      unlockLevel: 1,
      type: 'time_dilation_field',
    },
    ability2: {
      id: 'temporal_rewind',
      name: 'Temporal Rewind',
      description:
        'Every 50 seconds, rewinds 4 seconds of position and HP history. Teleports to previous position with whichever HP is higher. Invulnerable during rewind (~0.3s). All enemies within 200px of current position are frozen for 2.5 seconds.',
      cooldown: 50,
      unlockLevel: 10,
      type: 'temporal_rewind',
    },
    color: '#F59E0B',
  },

  // -------------------------------------------------------------------------
  // 6.8 Hemomancer
  // -------------------------------------------------------------------------
  {
    id: 'hemomancer',
    name: 'Hemomancer',
    description: 'A blood mage who sacrifices HP for power and heals through violence.',
    tagline: 'Blood is Power',
    difficulty: 'Hard',
    unlockCondition: 'Complete a full 20:00 run',
    unlockCost: 0,
    startingWeaponId: 'crimson_whip',
    baseStats: {
      maxHp: 110,
      hpRegen: -0.5,
      moveSpeed: 195,
      might: 1.1,
      attackSpeed: 1.0,
      area: 1.0,
      projCount: 0,
      projSpeed: 1.0,
      duration: 1.0,
      pickupRange: 50,
      luck: 1.1,
      armor: 0,
      cdr: 1.0,
      revival: 0,
      growth: 1.0,
    },
    ability1: {
      id: 'sanguine_feast',
      name: 'Sanguine Feast',
      description:
        'Passive. All damage dealt heals for 5% of damage dealt (lifesteal, after Might modifiers). Healing capped at 8 HP per second. Below 50% HP, lifesteal increases to 8%.',
      cooldown: 0,
      unlockLevel: 1,
      type: 'sanguine_feast',
    },
    ability2: {
      id: 'blood_nova',
      name: 'Blood Nova',
      description:
        'Every 35 seconds, sacrifices 15% of current HP and detonates it as a blood explosion in a 250px radius (affected by Area). Damage equals 3x HP sacrificed plus 60 base damage (affected by Might). Enemies killed heal Hemomancer for 5 HP each (uncapped).',
      cooldown: 35,
      unlockLevel: 10,
      type: 'blood_nova',
    },
    color: '#991B1B',
  },
] as const;
