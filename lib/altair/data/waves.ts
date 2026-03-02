// =============================================================================
// ALTAIR -- Wave Timeline & Director System (GDD Section 11) -- Balance v1.1
// =============================================================================
// The game uses a Wave Director that controls spawn rates, enemy composition,
// and intensity based on elapsed time. Full 20-minute timeline below.
// Hard cap of 450 active enemies for performance. Tier 1 enemies farthest from
// player are despawned first to make room for higher-tier spawns.
// =============================================================================

export interface WaveEvent {
  startTime: number;
  endTime: number;
  description: string;
  enemyComposition: string[];
  spawnRateMultiplier: number;
  specialEvent?: 'boss_spawn' | 'pre_boss_ramp' | 'post_boss_recovery' | 'calm_before_storm' | 'surge' | 'horde_surge' | 'elite_gauntlet';
  bossId?: string;
}

/**
 * Spawn budget per second for the Wave Director.
 * Determines how many "threat points" of enemies can spawn each second.
 *
 * budget_per_second(t) = 3 + (t_minutes * 2.0) + (t_minutes^2 * 0.25) + (t_minutes^3 * 0.005)
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns threat points budget per second
 */
export function getSpawnBudget(timeMinutes: number): number {
  return 3 + timeMinutes * 2.0 + timeMinutes * timeMinutes * 0.25 + timeMinutes * timeMinutes * timeMinutes * 0.005;
}

/**
 * Enemy threat costs used by the Wave Director to determine spawn budgets.
 * Each enemy "costs" a certain number of threat points when spawned.
 */
export const ENEMY_THREAT_COSTS: Record<string, number> = {
  shambler: 1,
  bat: 1,
  swarm_rat: 0.5,
  skeleton_warrior: 2,
  ghost: 2,
  cultist: 3,
  werewolf: 4,
  witch: 4,
  shadow: 3,
  bone_golem: 6,
  plague_bearer: 4,
  vampire_noble: 7,
  arcane_construct: 5,
  death_knight: 8,
  banshee: 6,
  lich: 10,
};

/**
 * The full 20-minute wave timeline. Each event describes the enemy composition,
 * spawn rate multiplier, and any special events (boss spawns, ramps, etc.)
 * during that time window.
 */
export const WAVE_TIMELINE: readonly WaveEvent[] = [
  // ===========================================================================
  // Minutes 0:00 - 5:00 (v1.1: faster enemy introductions, earlier pressure)
  // ===========================================================================
  {
    startTime: 0,
    endTime: 45,
    description: 'Calm start. Shamblers only, low density.',
    enemyComposition: ['shambler'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 45,
    endTime: 90,
    description: 'First swarm. Shamblers and Bats. Bat packs of 4-6.',
    enemyComposition: ['shambler', 'bat'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 90,
    endTime: 150,
    description: 'Tier 2 intro. Skeleton Warriors (1 per 6s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 150,
    endTime: 210,
    description: 'Ghost arrival. Ghosts appear (1 per 8s). First mixed groups.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 210,
    endTime: 240,
    description: 'Swarm Rat debut. Packs every 12s. Early AoE check.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 240,
    endTime: 300,
    description: 'Pre-boss ramp. 1.5x budget. First Cultist spawns (1 per 15s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist'],
    spawnRateMultiplier: 1.5,
    specialEvent: 'pre_boss_ramp',
  },

  // ===========================================================================
  // Boss 1 at 5:00
  // ===========================================================================
  {
    startTime: 300,
    endTime: 300,
    description: 'BOSS: The Hollow King spawns.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist'],
    spawnRateMultiplier: 0.7,
    specialEvent: 'boss_spawn',
    bossId: 'hollow_king',
  },

  // ===========================================================================
  // Minutes 5:00 - 10:00 (v1.1: shorter recovery, Tier 4 earlier)
  // ===========================================================================
  {
    startTime: 300,
    endTime: 320,
    description: 'Post-boss recovery. 0.4x budget for 20 seconds.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist'],
    spawnRateMultiplier: 0.4,
    specialEvent: 'post_boss_recovery',
  },
  {
    startTime: 320,
    endTime: 390,
    description: 'Tier 3 intro. Werewolves (1 per 10s). All Tier 1-3 active.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 390,
    endTime: 450,
    description: 'Witch and Shadow debut. Witches (1 per 18s), Shadows (1 per 12s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 450,
    endTime: 510,
    description: 'Bone Golem debut (1 per 20s). Cultist pairs start.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 510,
    endTime: 600,
    description: 'Pre-boss ramp. 1.5x budget. Witch+Werewolf combos. Double Bone Golems.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem'],
    spawnRateMultiplier: 1.5,
    specialEvent: 'pre_boss_ramp',
  },

  // ===========================================================================
  // Boss 2 at 10:00
  // ===========================================================================
  {
    startTime: 600,
    endTime: 600,
    description: 'BOSS: The Crimson Countess spawns.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem'],
    spawnRateMultiplier: 0.6,
    specialEvent: 'boss_spawn',
    bossId: 'crimson_countess',
  },

  // ===========================================================================
  // Minutes 10:00 - 15:00 (v1.1: very short recovery, Tier 5 earlier)
  // ===========================================================================
  {
    startTime: 600,
    endTime: 615,
    description: 'Post-boss recovery. 0.3x budget for 15 seconds.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem'],
    spawnRateMultiplier: 0.3,
    specialEvent: 'post_boss_recovery',
  },
  {
    startTime: 615,
    endTime: 660,
    description: 'Vampire Noble debut (1 per 25s). Multiple Witches, Shadow packs.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 660,
    endTime: 690,
    description: 'Arcane Construct debut (1 per 18s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 690,
    endTime: 750,
    description: 'Plague Bearer debut (1 per 12s). Poison zones everywhere.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 750,
    endTime: 810,
    description: 'Pressure mounts. Vampire Noble pairs.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 810,
    endTime: 900,
    description: 'Pre-boss ramp. 1.6x budget. Triple Cultist formations. Vampire Noble pairs.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 1.6,
    specialEvent: 'pre_boss_ramp',
  },

  // ===========================================================================
  // Boss 3 at 15:00
  // ===========================================================================
  {
    startTime: 900,
    endTime: 900,
    description: 'BOSS: Elder Lich Malachar spawns.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 0.5,
    specialEvent: 'boss_spawn',
    bossId: 'elder_lich_malachar',
  },

  // ===========================================================================
  // Minutes 15:00 - 20:00 (v1.1: minimal recovery, aggressive Tier 6, The Flood + Elite Gauntlet)
  // ===========================================================================
  {
    startTime: 900,
    endTime: 910,
    description: 'Post-boss recovery. 0.2x budget for 10 seconds. Barely any breathing room.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 0.2,
    specialEvent: 'post_boss_recovery',
  },
  {
    startTime: 910,
    endTime: 960,
    description: 'Tier 6 intro. Death Knights (1 per 20s). Banshees (1 per 25s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 960,
    endTime: 1020,
    description: 'Lich debut (1 per 35s). All enemy types active. Multiple Banshees.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 1020,
    endTime: 1080,
    description: 'Maximum variety. Lich rate increases (1 per 25s). Death Knight pairs.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 1080,
    endTime: 1140,
    description: 'Overwhelming pressure. Budget near max. Constant Tier 5-6 with massive Tier 1 swarms.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 1140,
    endTime: 1170,
    description: 'The Flood: 40+ Shamblers/Bats every 5s, mixed with 5-8 Tier 4-6 enemies every 8s.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 1.0,
    specialEvent: 'surge',
  },
  {
    startTime: 1170,
    endTime: 1190,
    description: 'Elite Gauntlet: Flood stops. Rapid back-to-back Tier 5-6 only. 3 Death Knights, 2 Liches, 2 Banshees, 4 Vampire Nobles every 10s.',
    enemyComposition: ['vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 1.0,
    specialEvent: 'elite_gauntlet',
  },
  {
    startTime: 1190,
    endTime: 1200,
    description: 'Calm before the storm. All enemies freeze for 2 seconds. Screen darkens.',
    enemyComposition: [],
    spawnRateMultiplier: 0,
    specialEvent: 'calm_before_storm',
  },

  // ===========================================================================
  // Boss 4 at 20:00
  // ===========================================================================
  {
    startTime: 1200,
    endTime: 1200,
    description: 'BOSS: Terminus, The Undying spawns. Regular enemy spawning resumes at 60% during Phase 1-2, stops in Phase 3.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'swarm_rat', 'cultist', 'werewolf', 'witch', 'shadow', 'bone_golem', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 0.6,
    specialEvent: 'boss_spawn',
    bossId: 'terminus',
  },
] as const;

/** Maximum number of active enemies on screen at once */
export const MAX_ACTIVE_ENEMIES = 450;

/**
 * Horde Surge configuration (v1.1).
 * Starting at minute 8, a Horde Surge triggers every 90 seconds.
 * Instantly spawns a ring of enemies around the player at 500-700px.
 * Surges are additive to the regular spawn budget.
 */
export interface HordeSurge {
  time: number; // seconds
  totalCount: number;
  composition: Record<string, number>;
}

export const HORDE_SURGES: readonly HordeSurge[] = [
  { time: 480, totalCount: 50, composition: { shambler: 40, bat: 10 } },
  { time: 570, totalCount: 55, composition: { shambler: 35, bat: 15, skeleton_warrior: 5 } },
  { time: 660, totalCount: 65, composition: { shambler: 40, bat: 15, skeleton_warrior: 10 } },
  { time: 750, totalCount: 70, composition: { shambler: 35, bat: 15, skeleton_warrior: 10, swarm_rat: 10 } },
  { time: 840, totalCount: 75, composition: { shambler: 30, bat: 15, skeleton_warrior: 10, swarm_rat: 12, ghost: 8 } },
  { time: 930, totalCount: 80, composition: { shambler: 30, bat: 15, skeleton_warrior: 10, swarm_rat: 12, ghost: 8, werewolf: 4, shadow: 1 } },
  { time: 1020, totalCount: 80, composition: { shambler: 28, bat: 15, skeleton_warrior: 10, swarm_rat: 12, ghost: 8, werewolf: 4, shadow: 2, witch: 1 } },
  { time: 1110, totalCount: 80, composition: { shambler: 26, bat: 15, skeleton_warrior: 10, swarm_rat: 12, ghost: 8, werewolf: 4, shadow: 2, witch: 2, bone_golem: 1 } },
] as const;

/** Horde surge spawn ring distance range. */
export const HORDE_SURGE_MIN_RADIUS = 500;
export const HORDE_SURGE_MAX_RADIUS = 700;
