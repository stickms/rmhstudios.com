// =============================================================================
// ALTAIR -- Bosses (GDD Section 10) -- Balance v1.1
// =============================================================================
// Bosses spawn at fixed time intervals (5:00, 10:00, 15:00, 20:00). Each boss
// enters with a screen-shake, warning indicator, and dramatic audio cue.
// Non-boss enemies continue spawning during boss fights. Bosses are immune to
// knockback and stun unless specified. HP/damage/speed scale with difficulty
// multiplier (Section 13). Values below are base values.
//
// v1.1 additions:
//   - DPS Cap: limits maximum damage a boss can receive per second, preventing
//     burst-kill strategies. Excess damage is discarded.
//   - HP Regen: passive HP regeneration per second, rewarding consistent pressure.
//   - Enrage Timer: seconds after spawn when boss enrages (0 = no timer). Adds
//     urgency and prevents infinite-kite strategies.
// =============================================================================

export interface BossAttack {
  id: string;
  name: string;
  cooldown: number;
  damage: number;
  description: string;
  params: Record<string, number>;
}

export interface BossPhase {
  name: string;
  hpThreshold: number;
  attacks: BossAttack[];
  modifiers: Record<string, number>;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  spawnTime: number;
  baseHp: number;
  baseSpeed: number;
  size: number;
  armor: number;
  dpsCapPerSecond: number;    // max damage boss can receive per second
  hpRegenPerSecond: number;   // passive HP regeneration per second
  enrageTime: number;         // seconds after spawn when boss enrages (0 = no timer)
  phases: BossPhase[];
  dropCoins: number;
  dropChestCoins: [number, number];
  dropWeaponUpgrades: [number, number];
  description: string;
  color: string;
}

export const BOSSES: readonly BossDef[] = [
  // ===========================================================================
  // Boss 1 -- THE HOLLOW KING (Minute 5:00)
  // ===========================================================================
  {
    id: 'hollow_king',
    name: 'The Hollow King',
    title: 'THE HOLLOW KING',
    spawnTime: 300,
    baseHp: 2200,
    baseSpeed: 90,
    size: 3,
    armor: 3,
    dpsCapPerSecond: 120,
    hpRegenPerSecond: 5,
    enrageTime: 90,
    phases: [
      {
        name: 'Phase 1',
        hpThreshold: 1.0,
        attacks: [
          {
            id: 'hk_cleave',
            name: 'Cleave',
            cooldown: 3,
            damage: 35,
            description: 'Swings blade in a 180-degree arc (range 150px). 0.8s windup.',
            params: {
              arc: 180,
              range: 150,
              windup: 0.8,
            },
          },
          {
            id: 'hk_summon_shambler',
            name: 'Summon Shambler Guard',
            cooldown: 12,
            damage: 0,
            description: 'Summons 10 Shamblers in a circle around himself.',
            params: {
              summonCount: 10,
            },
          },
          {
            id: 'hk_bone_spikes',
            name: 'Bone Spikes',
            cooldown: 8,
            damage: 25,
            description: 'Spikes erupt from the ground in a line toward the player (7 spikes, 40px apart, 1 spike/0.2s). 0.5s ground crack telegraph.',
            params: {
              spikeCount: 7,
              spikeSpacing: 40,
              spikeInterval: 0.2,
              telegraph: 0.5,
            },
          },
        ],
        modifiers: {},
      },
      {
        name: 'Phase 2',
        hpThreshold: 0.5,
        attacks: [
          {
            id: 'hk_cleave_p2',
            name: 'Cleave (Enhanced)',
            cooldown: 3,
            damage: 45,
            description: 'Upgraded cleave: 270-degree arc, +10 damage over Phase 1.',
            params: {
              arc: 270,
              range: 150,
              windup: 0.8,
            },
          },
          {
            id: 'hk_death_march',
            name: 'Death March',
            cooldown: 15,
            damage: 15,
            description: 'Charges toward player at 280px/s for up to 400px, leaving a trail of bone spikes (persist 3s, 15 damage on contact). 1.0s telegraph.',
            params: {
              chargeSpeed: 280,
              chargeDistance: 400,
              trailDuration: 3,
              telegraph: 1.0,
            },
          },
          {
            id: 'hk_bone_prison',
            name: 'Bone Prison',
            cooldown: 20,
            damage: 20,
            description: 'Creates ring of bone spikes (250px radius) around player with 4 gaps. Spikes deal 20 damage on contact, persist 4 seconds.',
            params: {
              radius: 250,
              gapCount: 4,
              spikeDamage: 20,
              duration: 4,
            },
          },
        ],
        modifiers: {
          speedBoost: 0.3,
          allEnemySpeedBoost: 0.15,
        },
      },
    ],
    dropCoins: 35,
    dropChestCoins: [15, 25],
    dropWeaponUpgrades: [1, 2],
    description: 'An enormous skeletal monarch wreathed in green flame, dragging a massive rusted blade.',
    color: '#2D5A27',
  },

  // ===========================================================================
  // Boss 2 -- THE CRIMSON COUNTESS (Minute 10:00)
  // ===========================================================================
  {
    id: 'crimson_countess',
    name: 'The Crimson Countess',
    title: 'THE CRIMSON COUNTESS',
    spawnTime: 600,
    baseHp: 5500,
    baseSpeed: 105,
    size: 2.5,
    armor: 4,
    dpsCapPerSecond: 200,
    hpRegenPerSecond: 10,
    enrageTime: 120,
    phases: [
      {
        name: 'Phase 1',
        hpThreshold: 1.0,
        attacks: [
          {
            id: 'cc_blood_lance',
            name: 'Blood Lance',
            cooldown: 4,
            damage: 30,
            description: 'Fires a blood lance projectile at the player (speed 300, pierces enemies). 0.6s telegraph.',
            params: {
              projectileSpeed: 300,
              telegraph: 0.6,
            },
          },
          {
            id: 'cc_bat_cloud',
            name: 'Bat Cloud',
            cooldown: 10,
            damage: 5,
            description: 'Releases a spiral pattern of 16 bats expanding outward. Bats have 4 HP each, deal 5 damage, home loosely toward player, despawn after 5s.',
            params: {
              batCount: 16,
              batHp: 4,
              batLifespan: 5,
            },
          },
        ],
        modifiers: {
          shieldHp: 150,
          shieldRegenPerSecond: 15,
          shieldRegenDelay: 2,
        },
      },
      {
        name: 'Phase 2',
        hpThreshold: 0.6,
        attacks: [
          {
            id: 'cc_blood_lance_p2',
            name: 'Blood Lance Fan',
            cooldown: 4,
            damage: 25,
            description: 'Fires 3 blood lances in a fan (30-degree spread).',
            params: {
              projectileSpeed: 280,
              projectileCount: 3,
              spreadAngle: 30,
              telegraph: 0.6,
            },
          },
          {
            id: 'cc_blood_rain',
            name: 'Blood Rain',
            cooldown: 8,
            damage: 12,
            description: 'Rains blood droplets in 250px radius at player position (~20 droplets over 1.5s). 1s telegraph. Each droplet heals Countess 2 HP if it hits the player.',
            params: {
              radius: 250,
              dropletCount: 20,
              dropDuration: 1.5,
              telegraph: 1,
              healPerHit: 2,
            },
          },
        ],
        modifiers: {
          shieldRegenPerSecond: 25,
          shieldRegenDelay: 2,
        },
      },
      {
        name: 'Phase 3',
        hpThreshold: 0.25,
        attacks: [
          {
            id: 'cc_crimson_fury',
            name: 'Crimson Fury',
            cooldown: 2.5,
            damage: 25,
            description: 'Swoops toward the player every 2.5 seconds. Swoop covers 300px in 0.5s.',
            params: {
              swoopDistance: 300,
              swoopDuration: 0.5,
            },
          },
          {
            id: 'cc_blood_rain_constant',
            name: 'Blood Rain (Constant)',
            cooldown: 2,
            damage: 10,
            description: 'Constant blood rain: ~5 droplets every 2 seconds in a 200px area around player.',
            params: {
              radius: 200,
              dropletCount: 5,
            },
          },
          {
            id: 'cc_blood_fountain',
            name: 'Blood Fountain',
            cooldown: 0,
            damage: 15,
            description: 'At phase 3 start, 4 blood fountains spawn at 200px in cardinal directions. Each heals Countess 3 HP/s and fires slow blood projectile at player every 3s (15 damage). Fountains have 80 HP.',
            params: {
              fountainCount: 4,
              fountainHp: 80,
              fountainRange: 200,
              healPerSecond: 3,
              projectileCooldown: 3,
              projectileDamage: 15,
            },
          },
        ],
        modifiers: {
          speedBoost: 0.5,
          shieldRemoved: 1,
        },
      },
    ],
    dropCoins: 65,
    dropChestCoins: [15, 25],
    dropWeaponUpgrades: [2, 3],
    description: 'A vampiric matriarch hovering above the ground, surrounded by swirling blood mist.',
    color: '#8B0000',
  },

  // ===========================================================================
  // Boss 3 -- THE ELDER LICH MALACHAR (Minute 15:00)
  // ===========================================================================
  {
    id: 'elder_lich_malachar',
    name: 'Elder Lich Malachar',
    title: 'THE ELDER LICH MALACHAR',
    spawnTime: 900,
    baseHp: 12000,
    baseSpeed: 75,
    size: 2,
    armor: 6,
    dpsCapPerSecond: 350,
    hpRegenPerSecond: 15,
    enrageTime: 150,
    phases: [
      {
        name: 'Main Phase',
        hpThreshold: 1.0,
        attacks: [
          {
            id: 'elm_teleport',
            name: 'Teleport',
            cooldown: 6,
            damage: 15,
            description: 'Teleports to random position 300-500px from player (0.5s fade-out/fade-in). Leaves dark explosion at departure (100px radius, 15 damage).',
            params: {
              minRange: 300,
              maxRange: 500,
              fadeDuration: 0.5,
              explosionRadius: 100,
            },
          },
          {
            id: 'elm_soul_barrage',
            name: 'Soul Barrage',
            cooldown: 3,
            damage: 20,
            description: 'Fires 4 homing soul orbs (speed 150, 20 damage each, track for 4 seconds then dissipate). Orbs are destroyable (10 HP each).',
            params: {
              orbCount: 4,
              orbSpeed: 150,
              orbTrackDuration: 4,
              orbHp: 10,
            },
          },
          {
            id: 'elm_mass_resurrection',
            name: 'Mass Resurrection',
            cooldown: 20,
            damage: 0,
            description: 'Resurrects up to 20 enemies killed in the last 20 seconds within 500px at 50% HP. Disabled if inner phylactery is destroyed.',
            params: {
              range: 500,
              maxResurrect: 20,
              resurrectedHpPercent: 0.5,
              lookbackSeconds: 20,
            },
          },
        ],
        modifiers: {
          phylacteryCount: 3,
          phylacteryHp: 400,
          phylacteryDpsCapPerSecond: 80,
          phylacteryOrbitReversalInterval: 8,
          damageReductionWithPhylacteries: 0.5,
          innerPhylacteryOrbitRadius: 150,
          middlePhylacteryOrbitRadius: 250,
          outerPhylacteryOrbitRadius: 350,
          innerBeamDps: 40,
          innerBeamRange: 200,
          middleGravityWellCooldown: 5,
          middleGravityWellDuration: 2,
          middleGravityWellPullForce: 80,
          middleGravityWellRadius: 80,
          middleGravityWellPlayerSlow: 0.2,
          outerRingCooldown: 4,
          outerRingProjectiles: 12,
          outerRingDamage: 15,
          outerRingProjectileSpeed: 160,
        },
      },
      {
        name: 'Enrage',
        hpThreshold: 0.2,
        attacks: [
          {
            id: 'elm_teleport_enrage',
            name: 'Teleport (Enraged)',
            cooldown: 3,
            damage: 15,
            description: 'Teleport every 3 seconds (doubled from 6).',
            params: {
              minRange: 300,
              maxRange: 500,
              fadeDuration: 0.5,
              explosionRadius: 100,
            },
          },
          {
            id: 'elm_soul_barrage_enrage',
            name: 'Soul Barrage (Enraged)',
            cooldown: 1.5,
            damage: 20,
            description: 'Fires 8 orbs instead of 4, all attack speeds doubled.',
            params: {
              orbCount: 8,
              orbSpeed: 150,
              orbTrackDuration: 4,
              orbHp: 10,
            },
          },
          {
            id: 'elm_mass_resurrection_enrage',
            name: 'Mass Resurrection (Enraged)',
            cooldown: 10,
            damage: 0,
            description: 'Resurrection at doubled speed.',
            params: {
              range: 500,
              maxResurrect: 15,
              resurrectedHpPercent: 0.3,
              lookbackSeconds: 20,
            },
          },
        ],
        modifiers: {
          attackSpeedMultiplier: 2,
          resurrectedPhylacteryHp: 100,
        },
      },
    ],
    dropCoins: 90,
    dropChestCoins: [20, 25],
    dropWeaponUpgrades: [3, 3],
    description: 'An ancient skeletal sorcerer floating above a runic circle, phylactery orbs spinning around it.',
    color: '#483D8B',
  },

  // ===========================================================================
  // Boss 4 -- TERMINUS, THE UNDYING (Minute 20:00 -- Final Boss)
  // ===========================================================================
  {
    id: 'terminus',
    name: 'Terminus, The Undying',
    title: 'TERMINUS, THE UNDYING',
    spawnTime: 1200,
    baseHp: 22000,
    baseSpeed: 55,
    size: 5,
    armor: 10,
    dpsCapPerSecond: 500,
    hpRegenPerSecond: 0,
    enrageTime: 0,
    phases: [
      {
        name: 'Phase 1 - The Maw',
        hpThreshold: 1.0,
        attacks: [
          {
            id: 'term_crushing_advance',
            name: 'Crushing Advance',
            cooldown: 0,
            damage: 50,
            description: 'Walks toward player. Contact deals 50 damage per hit (large size makes it hard to avoid at close range).',
            params: {},
          },
          {
            id: 'term_consume',
            name: 'Consume',
            cooldown: 10,
            damage: 80,
            description: 'Inhales for 2.5 seconds, pulling the player toward him (150px/s pull force) and pulling all XP gems/coins (destroying them). Touching Terminus during inhale deals 80 damage.',
            params: {
              inhaleDuration: 2.5,
              pullForce: 150,
              contactDamage: 80,
            },
          },
          {
            id: 'term_spawn_amalgamation',
            name: 'Spawn Amalgamation',
            cooldown: 6,
            damage: 0,
            description: 'A body-part detaches and becomes a random Tier 3-4 enemy. Max 5 spawned this way at once.',
            params: {
              maxSpawned: 5,
              minTier: 3,
              maxTier: 4,
            },
          },
          {
            id: 'term_devour',
            name: 'Devour',
            cooldown: 0,
            damage: 80,
            description: 'If player contacts Terminus during Consume, deals 80 damage and heals Terminus for 5% of max HP.',
            params: {
              damage: 80,
              healPercent: 0.05,
            },
          },
        ],
        modifiers: {},
      },
      {
        name: 'Phase 2 - The Storm',
        hpThreshold: 0.7,
        attacks: [
          {
            id: 'term_void_zones',
            name: 'Void Zones',
            cooldown: 6,
            damage: 20,
            description: 'Slams ground, creating 4 void zones at random positions within 400px of player. Each zone is 120px radius, deals 20 damage/second, lasts 8 seconds. Max 12 active. 1s telegraph.',
            params: {
              zoneCount: 4,
              zoneRadius: 120,
              zoneDps: 20,
              zoneDuration: 8,
              maxActiveZones: 12,
              spawnRange: 400,
              telegraph: 1,
            },
          },
          {
            id: 'term_tendril_sweep',
            name: 'Tendril Sweep',
            cooldown: 5,
            damage: 30,
            description: 'Extends 5 tendrils (350px long, 30px wide) that sweep in a 90-degree rotation over 1 second. 0.8s extension telegraph.',
            params: {
              tendrilCount: 5,
              tendrilLength: 350,
              tendrilWidth: 30,
              sweepAngle: 90,
              sweepDuration: 1,
              extensionTelegraph: 0.8,
            },
          },
          {
            id: 'term_corruption_pulse',
            name: 'Corruption Pulse',
            cooldown: 15,
            damage: 0,
            description: 'Emits pulse in 500px radius. Destroys all player projectiles in flight. Consumes lingering ground effects, healing Terminus 2 HP per remaining tick.',
            params: {
              radius: 500,
              healPerTick: 2,
            },
          },
        ],
        modifiers: {
          adaptiveResistanceInterval: 8,
          adaptiveResistanceReduction: 0.6,
        },
      },
      {
        name: 'Phase 3 - The End',
        hpThreshold: 0.35,
        attacks: [
          {
            id: 'term_death_spiral',
            name: 'Death Spiral',
            cooldown: 0,
            damage: 60,
            description: 'Continuously orbits player at 200px radius, closing to 80px over 15 seconds. Contact damage increased to 60.',
            params: {
              startOrbitRadius: 200,
              endOrbitRadius: 80,
              closeDuration: 15,
            },
          },
          {
            id: 'term_soul_storm',
            name: 'Soul Storm',
            cooldown: 0,
            damage: 20,
            description: 'Permanent vortex of 16 projectiles orbiting Terminus at 250px radius, 20 damage each, rotating at 210 degrees/second.',
            params: {
              projectileCount: 16,
              orbitRadius: 250,
              rotationSpeed: 210,
            },
          },
          {
            id: 'term_final_consume',
            name: 'Final Consume',
            cooldown: 0,
            damage: 0,
            description: 'At 10% HP, performs one massive inhale (250px/s pull force, 4 seconds). If survived, Terminus staggers for 4 seconds (1.75x damage taken, stops moving).',
            params: {
              hpTrigger: 0.1,
              pullForce: 250,
              pullDuration: 4,
              staggerDuration: 4,
              staggerDamageMultiplier: 1.75,
            },
          },
          {
            id: 'term_desperation',
            name: 'Desperation',
            cooldown: 0,
            damage: 0,
            description: 'If Final Consume fails, Terminus enters Desperation: all attack speeds x1.5, Armor reduced to 0, +100% speed.',
            params: {
              attackSpeedMultiplier: 1.5,
              armorOverride: 0,
              speedMultiplier: 2.0,
            },
          },
        ],
        modifiers: {
          speedBoost: 1.0,
          regularSpawningStopped: 1,
        },
      },
    ],
    dropCoins: 125,
    dropChestCoins: [25, 25],
    dropWeaponUpgrades: [2, 3],
    description: 'A colossal amalgamation of every fallen enemy -- a towering mass of bone, shadow, and screaming faces.',
    color: '#1A1A1A',
  },
] as const;
