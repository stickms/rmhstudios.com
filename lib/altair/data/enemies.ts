// =============================================================================
// ALTAIR -- Enemies: the Echoes, drones and anomalies of Outpost 13 (GDD Section 9)
// =============================================================================
// Enemies are organized into tiers that progressively unlock as the run
// progresses. All HP, damage, and speed values are base values at spawn time --
// they are further modified by the difficulty scaling system (Section 13).
// Ids are save data and never change; names and text are the cast's.
// =============================================================================

export type EnemyTier = 1 | 2 | 3 | 4 | 5 | 6;

export type AIBehavior =
  | 'direct_chase'
  | 'sinusoidal'
  | 'melee_lunger'
  | 'phaser'
  | 'pouncer'
  | 'ranged_kiter'
  | 'swarm'
  | 'support_caster'
  | 'tank_slammer'
  | 'stealth'
  | 'elite_melee'
  | 'elite_ranged'
  | 'zone_denier'
  | 'heavy_melee'
  | 'disabler'
  | 'necro_caster';

export interface EnemyDef {
  id: string;
  name: string;
  tier: EnemyTier;
  baseHp: number;
  baseDamage: number;
  baseSpeed: number;
  xpDrop: number;
  threatCost: number;
  behavior: AIBehavior;
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon' | 'star' | 'pentagon';
  color: string;
  radius: number;
  canFly: boolean;
  description: string;
  specialParams: Record<string, number>;
}

export const ENEMIES: readonly EnemyDef[] = [
  // ===========================================================================
  // TIER 1 -- Fodder (Minute 0:00+)
  // ===========================================================================
  {
    id: 'shambler',
    name: 'Husk',
    tier: 1,
    baseHp: 10,
    baseDamage: 12,
    baseSpeed: 85,
    xpDrop: 1,
    threatCost: 1,
    behavior: 'direct_chase',
    shape: 'circle',
    color: '#6B8E23',
    radius: 12,
    canFly: false,
    description: 'An Echo of a crew member still walking its last route. Walks directly toward the player. No special abilities. Appears in massive swarms.',
    specialParams: {},
  },
  {
    id: 'bat',
    name: 'Flicker',
    tier: 1,
    baseHp: 6,
    baseDamage: 10,
    baseSpeed: 130,
    xpDrop: 1,
    threatCost: 1,
    behavior: 'sinusoidal',
    shape: 'triangle',
    color: '#4A4A4A',
    radius: 13,
    canFly: true,
    description: 'Small glitching drone with erratic flight. Moves in a sinusoidal wave pattern, harder to hit with narrow projectiles.',
    specialParams: {
      waveAmplitude: 30,
      wavePeriod: 2.2,
    },
  },

  // ===========================================================================
  // TIER 2 -- Threats (Minute 2:00+)
  // ===========================================================================
  {
    id: 'skeleton_warrior',
    name: 'Rigger',
    tier: 2,
    baseHp: 28,
    baseDamage: 18,
    baseSpeed: 100,
    xpDrop: 3,
    threatCost: 2,
    behavior: 'melee_lunger',
    shape: 'square',
    color: '#D2B48C',
    radius: 14,
    canFly: false,
    description: 'Unmanned work-frame with a plasma cutter. When within 50px, performs a lunging cutter strike (70px reach, 0.3s duration, 0.5s windup). Attacks every 1.5s when adjacent.',
    specialParams: {
      lungeRange: 50,
      lungeReach: 70,
      lungeDuration: 0.3,
      lungeWindup: 0.5,
      attackInterval: 1.5,
    },
  },
  {
    id: 'ghost',
    name: 'Static',
    tier: 2,
    baseHp: 18,
    baseDamage: 14,
    baseSpeed: 120,
    xpDrop: 3,
    threatCost: 2,
    behavior: 'phaser',
    shape: 'diamond',
    color: '#B0C4DE',
    radius: 12,
    canFly: true,
    description: 'Fraying, translucent echo. Passes through other enemies. Every 4 seconds, becomes intangible for 1.5 seconds (immune to damage, still deals contact damage).',
    specialParams: {
      phaseCooldown: 4,
      phaseDuration: 1.5,
    },
  },

  // ===========================================================================
  // TIER 3 -- Elites (Minute 5:00+)
  // ===========================================================================
  {
    id: 'werewolf',
    name: 'Stalker',
    tier: 3,
    baseHp: 75,
    baseDamage: 22,
    baseSpeed: 90,
    xpDrop: 10,
    threatCost: 4,
    behavior: 'pouncer',
    shape: 'pentagon',
    color: '#8B4513',
    radius: 18,
    canFly: false,
    description: 'Low, fast quadruped anomaly. At 200px range, coils for 1 second then pounces at 350px/s covering 250px. Pauses 0.8s after landing. Pounce cooldown: 6 seconds.',
    specialParams: {
      pounceRange: 200,
      pounceSpeed: 380,
      pounceDistance: 250,
      crouchDuration: 1.0,
      landingPause: 0.8,
      pounceCooldown: 6,
    },
  },
  {
    id: 'cultist',
    name: 'Relay',
    tier: 3,
    baseHp: 35,
    baseDamage: 14,
    baseSpeed: 70,
    xpDrop: 8,
    threatCost: 3,
    behavior: 'ranged_kiter',
    shape: 'diamond',
    color: '#800080',
    radius: 12,
    canFly: false,
    description: 'Hooded beacon holding a charged signal orb. Maintains 200px distance from the player. Every 3 seconds, fires a signal orb (200px/s speed, 12px size, lasts 3 seconds, passes through enemies).',
    specialParams: {
      preferredRange: 200,
      projectileSpeed: 200,
      projectileSize: 12,
      projectileLifespan: 3,
      fireCooldown: 3,
    },
  },
  {
    id: 'swarm_rat',
    name: 'Mite',
    tier: 3,
    baseHp: 4,
    baseDamage: 2,
    baseSpeed: 200,
    xpDrop: 1,
    threatCost: 0.5,
    behavior: 'swarm',
    shape: 'circle',
    color: '#A0522D',
    radius: 9,
    canFly: false,
    description: 'Tiny skittering drone. Always spawns in packs of 8-12 with slightly randomized speed (+/-20%). Moves directly toward the player.',
    specialParams: {
      packSizeMin: 8,
      packSizeMax: 12,
      speedVariance: 0.2,
    },
  },

  // ===========================================================================
  // TIER 4 -- Dangerous (Minute 8:00+)
  // ===========================================================================
  {
    id: 'witch',
    name: 'Jammer',
    tier: 4,
    baseHp: 50,
    baseDamage: 0,
    baseSpeed: 90,
    xpDrop: 12,
    threatCost: 4,
    behavior: 'support_caster',
    shape: 'diamond',
    color: '#9400D3',
    radius: 14,
    canFly: true,
    description: 'Hovering disc that broadcasts noise. Stays at 250px range. Every 8s casts Jam: -15% Move Speed for 4s (stacks 2x). Every 12s casts Overclock: +25% speed and +20% damage to allies in 200px for 5s.',
    specialParams: {
      preferredRange: 250,
      curseCooldown: 8,
      curseSlow: 0.15,
      curseDuration: 4,
      curseMaxStacks: 2,
      empowerCooldown: 12,
      empowerRange: 200,
      empowerSpeedBonus: 0.25,
      empowerDamageBonus: 0.3,
      empowerDuration: 5,
    },
  },
  {
    id: 'bone_golem',
    name: 'Bulkhead',
    tier: 4,
    baseHp: 180,
    baseDamage: 25,
    baseSpeed: 60,
    xpDrop: 20,
    threatCost: 6,
    behavior: 'tank_slammer',
    shape: 'hexagon',
    color: '#F5F5DC',
    radius: 24,
    canFly: false,
    description: 'Hulking loading frame, twice normal size. Every 5s performs a ground slam: 1s windup (50% damage reduction during), 150px radius shockwave dealing 30 damage with 0.5s stun. On death, splits into 3 Riggers.',
    specialParams: {
      slamCooldown: 5,
      slamWindup: 1.0,
      slamRadius: 150,
      slamDamage: 35,
      slamStunDuration: 0.5,
      windupDamageReduction: 0.5,
      deathSplitCount: 3,
      contactDamage: 25,
      armor: 2,
    },
  },
  {
    id: 'shadow',
    name: 'Blind Spot',
    tier: 4,
    baseHp: 40,
    baseDamage: 18,
    baseSpeed: 155,
    xpDrop: 8,
    threatCost: 3,
    behavior: 'stealth',
    shape: 'circle',
    color: '#1A1A2E',
    radius: 12,
    canFly: false,
    description: 'Dark person-shaped gap that flickers. Invisible until within 150px of the player (fades in over 0.3s). Damage while invisible reveals immediately. Re-cloaks every 10s when >200px from the player.',
    specialParams: {
      revealRange: 150,
      fadeInDuration: 0.3,
      recloakCooldown: 10,
      recloakMinRange: 200,
    },
  },

  // ===========================================================================
  // TIER 5 -- Nightmare (Minute 12:00+)
  // ===========================================================================
  {
    id: 'vampire_noble',
    name: 'Siphon',
    tier: 5,
    baseHp: 120,
    baseDamage: 25,
    baseSpeed: 140,
    xpDrop: 25,
    threatCost: 7,
    behavior: 'elite_melee',
    shape: 'pentagon',
    color: '#8B0000',
    radius: 16,
    canFly: false,
    description: 'Tall leech frame trailing drain cables. At 100px, performs a rapid 3-hit claw combo (22 damage each, 0.2s between hits). Every 8s releases 4 Flickers. Passively heals 5 HP/s (lifesteal aura).',
    specialParams: {
      meleeRange: 100,
      comboDamage: 25,
      comboHits: 3,
      comboInterval: 0.2,
      batSummonCooldown: 8,
      batSummonCount: 4,
      passiveHealPerSecond: 5,
      batSwarmDamage: 15,
      armor: 1,
    },
  },
  {
    id: 'arcane_construct',
    name: 'Lattice',
    tier: 5,
    baseHp: 85,
    baseDamage: 28,
    baseSpeed: 100,
    xpDrop: 15,
    threatCost: 5,
    behavior: 'elite_ranged',
    shape: 'hexagon',
    color: '#00CED1',
    radius: 16,
    canFly: true,
    description: 'Floating diamond of struts around a lens. Hovers at 300px from the player. Every 4s telegraphs a laser beam (red line for 1s) then fires a piercing beam (20px wide, infinite range, 0.5s, 25 damage). Uses leading shots.',
    specialParams: {
      preferredRange: 300,
      laserCooldown: 4,
      laserTelegraph: 1.0,
      laserWidth: 20,
      laserDuration: 0.5,
      laserDamage: 28,
    },
  },
  {
    id: 'plague_bearer',
    name: 'Bloat',
    tier: 5,
    baseHp: 65,
    baseDamage: 10,
    baseSpeed: 70,
    xpDrop: 10,
    threatCost: 4,
    behavior: 'zone_denier',
    shape: 'circle',
    color: '#2E8B57',
    radius: 16,
    canFly: false,
    description: 'Swollen sac that weeps toxin. Leaves a 40px poison trail (3s duration, 4 damage/tick, 2 ticks/s). On death, bursts into a 120px radius poison cloud lasting 4s. Contact also applies 3 damage/s poison DoT for 3s.',
    specialParams: {
      trailWidth: 40,
      trailDuration: 3,
      trailDamagePerTick: 4,
      trailTicksPerSecond: 2,
      deathExplosionRadius: 120,
      deathCloudDuration: 4,
      contactPoisonDps: 3,
      contactPoisonDuration: 4,
    },
  },

  // ===========================================================================
  // TIER 6 -- Cataclysm (Minute 16:00+)
  // ===========================================================================
  {
    id: 'death_knight',
    name: 'Warden',
    tier: 6,
    baseHp: 220,
    baseDamage: 40,
    baseSpeed: 120,
    xpDrop: 25,
    threatCost: 8,
    behavior: 'heavy_melee',
    shape: 'star',
    color: '#4B0082',
    radius: 20,
    canFly: false,
    description: 'Heavy station security with an arc cutter. Melee swing every 2s in a 140-degree arc (100px reach). Every 6s emits 4 directional shockwaves (N/S/E/W, 30px wide, 300px travel, 20 damage). Has 3 Armor. Drops Food on death.',
    specialParams: {
      meleeArc: 140,
      meleeReach: 100,
      meleeCooldown: 2,
      shockwaveCooldown: 6,
      shockwaveDirections: 4,
      shockwaveWidth: 30,
      shockwaveRange: 300,
      shockwaveDamage: 25,
      armor: 3,
      dropsFood: 1,
    },
  },
  {
    id: 'banshee',
    name: 'Shriek',
    tier: 6,
    baseHp: 55,
    baseDamage: 12,
    baseSpeed: 160,
    xpDrop: 12,
    threatCost: 6,
    behavior: 'disabler',
    shape: 'diamond',
    color: '#E6E6FA',
    radius: 14,
    canFly: true,
    description: 'Speaker-headed drone. Phases through all enemies. Every 7s performs a Wailing Scream: disables all player weapons for 2s within 400px range. The scream has a 1.5s windup (killing during windup cancels).',
    specialParams: {
      screamCooldown: 7,
      screamWindup: 1.5,
      screamRange: 400,
      screamDisableDuration: 2,
    },
  },
  {
    id: 'lich',
    name: 'Conductor',
    tier: 6,
    baseHp: 160,
    baseDamage: 22,
    baseSpeed: 60,
    xpDrop: 30,
    threatCost: 10,
    behavior: 'necro_caster',
    shape: 'star',
    color: '#483D8B',
    radius: 16,
    canFly: false,
    description: 'Robed signal-master with a floating core. Stays at 350px range. Every 5s fires a fan of 5 projectiles (60-degree arc, 20 damage each, 180 speed). Every 15s restarts up to 3 nearby dead enemies at 50% HP. Has a core (30 HP) that must be destroyed first.',
    specialParams: {
      preferredRange: 350,
      volleyCooldown: 5,
      volleyProjectiles: 5,
      volleyArc: 60,
      volleyProjectileSpeed: 180,
      resurrectCooldown: 15,
      resurrectCount: 3,
      resurrectRange: 200,
      resurrectHpPercent: 0.5,
      phylacteryHp: 45,
      phylacteryRegenHpPercent: 0.5,
      phylacteryRegenDuration: 3,
      armor: 2,
    },
  },
] as const;
