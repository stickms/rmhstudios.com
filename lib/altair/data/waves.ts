// =============================================================================
// ALTAIR -- Wave Timeline & Director System (GDD Section 11)
// =============================================================================
// The game uses a Wave Director that controls spawn rates, enemy composition,
// and intensity based on elapsed time. Full 20-minute timeline below.
// Hard cap of 300 active enemies for performance. Tier 1 enemies farthest from
// player are despawned first to make room for higher-tier spawns.
// =============================================================================

export interface WaveEvent {
  startTime: number;
  endTime: number;
  description: string;
  enemyComposition: string[];
  spawnRateMultiplier: number;
  specialEvent?: 'boss_spawn' | 'pre_boss_ramp' | 'post_boss_recovery' | 'calm_before_storm' | 'surge';
  bossId?: string;
}

/**
 * Spawn budget per second for the Wave Director.
 * Determines how many "threat points" of enemies can spawn each second.
 *
 * budget_per_second(t) = 2 + (t_minutes * 1.5) + (t_minutes^2 * 0.15)
 *
 * @param timeMinutes - elapsed game time in minutes
 * @returns threat points budget per second
 */
export function getSpawnBudget(timeMinutes: number): number {
  return 2 + timeMinutes * 1.5 + timeMinutes * timeMinutes * 0.15;
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
  // Minutes 0:00 - 5:00 (Tier 1-2 introduction, first boss)
  // ===========================================================================
  {
    startTime: 0,
    endTime: 60,
    description: 'Calm start. Shamblers only, low density. Let player acclimate.',
    enemyComposition: ['shambler'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 60,
    endTime: 120,
    description: 'First swarm. Shamblers and Bats. Bat packs of 3-5 every 10 seconds.',
    enemyComposition: ['shambler', 'bat'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 120,
    endTime: 180,
    description: 'Tier 2 intro. Skeleton Warriors begin spawning (1 per 8 seconds). Shamblers increase.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 180,
    endTime: 240,
    description: 'Ghost arrival. Ghosts appear (1 per 10 seconds). First mixed groups.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 240,
    endTime: 300,
    description: 'Pre-boss ramp. All Tier 1-2 enemies. Density spikes by 30% for 30 seconds before boss.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost'],
    spawnRateMultiplier: 1.3,
    specialEvent: 'pre_boss_ramp',
  },

  // ===========================================================================
  // Boss 1 at 5:00
  // ===========================================================================
  {
    startTime: 300,
    endTime: 300,
    description: 'BOSS: The Hollow King spawns.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost'],
    spawnRateMultiplier: 0.7,
    specialEvent: 'boss_spawn',
    bossId: 'hollow_king',
  },

  // ===========================================================================
  // Minutes 5:00 - 10:00 (Tier 3 introduction, second boss)
  // ===========================================================================
  {
    startTime: 300,
    endTime: 360,
    description: 'Post-boss recovery. Spawn rate drops to 50% for 30 seconds after boss dies, then resumes.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost'],
    spawnRateMultiplier: 0.5,
    specialEvent: 'post_boss_recovery',
  },
  {
    startTime: 360,
    endTime: 420,
    description: 'Tier 3 intro. Werewolves (1 per 12s), Cultists (1 per 10s) begin. Swarm Rats debut (pack every 15s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 420,
    endTime: 480,
    description: 'Escalation. All Tier 1-3 active. Bat swarms increase. Cultist pairs start appearing.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 480,
    endTime: 540,
    description: 'Tier 4 intro. Witches appear (1 per 20s). Bone Golems (1 per 25s). Shadows (1 per 15s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 540,
    endTime: 600,
    description: 'Pre-boss ramp. Density spikes 40%. Witch+Werewolf combos. Double Bone Golem spawns.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow'],
    spawnRateMultiplier: 1.4,
    specialEvent: 'pre_boss_ramp',
  },

  // ===========================================================================
  // Boss 2 at 10:00
  // ===========================================================================
  {
    startTime: 600,
    endTime: 600,
    description: 'BOSS: The Crimson Countess spawns.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow'],
    spawnRateMultiplier: 0.6,
    specialEvent: 'boss_spawn',
    bossId: 'crimson_countess',
  },

  // ===========================================================================
  // Minutes 10:00 - 15:00 (Tier 5 introduction, third boss)
  // ===========================================================================
  {
    startTime: 600,
    endTime: 660,
    description: 'Post-boss recovery. Spawn rate drops to 40% for 30 seconds.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow'],
    spawnRateMultiplier: 0.4,
    specialEvent: 'post_boss_recovery',
  },
  {
    startTime: 660,
    endTime: 720,
    description: 'Pressure builds. All Tier 1-4 active. Multiple Witches at once. Shadow packs of 2-3.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 720,
    endTime: 780,
    description: 'Tier 5 intro. Vampire Nobles appear (1 per 30s). Arcane Constructs (1 per 20s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 780,
    endTime: 840,
    description: 'Nightmare fuel. Plague Bearers arrive (1 per 15s). Poison zones dominate the map.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 840,
    endTime: 900,
    description: 'Pre-boss ramp. Density spikes 50%. Vampire Noble + Witch combos. Triple Cultist formations.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 1.5,
    specialEvent: 'pre_boss_ramp',
  },

  // ===========================================================================
  // Boss 3 at 15:00
  // ===========================================================================
  {
    startTime: 900,
    endTime: 900,
    description: 'BOSS: Elder Lich Malachar spawns.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 0.5,
    specialEvent: 'boss_spawn',
    bossId: 'elder_lich_malachar',
  },

  // ===========================================================================
  // Minutes 15:00 - 20:00 (Tier 6 introduction, final boss)
  // ===========================================================================
  {
    startTime: 900,
    endTime: 960,
    description: 'Post-boss recovery. Spawn rate drops to 30% for 30 seconds.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer'],
    spawnRateMultiplier: 0.3,
    specialEvent: 'post_boss_recovery',
  },
  {
    startTime: 960,
    endTime: 1020,
    description: 'Tier 6 intro. Death Knights appear (1 per 25s). Banshees (1 per 30s).',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 1020,
    endTime: 1080,
    description: 'Hellscape. All enemy types active. Lich appears (1 per 45s). Multiple Banshees possible.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 1080,
    endTime: 1140,
    description: 'Maximum pressure. Spawn budget at near-max. Wave compositions actively target player weaknesses.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 1.0,
  },
  {
    startTime: 1140,
    endTime: 1190,
    description: 'Final crescendo. Budget at maximum. Every 10 seconds, a surge of 30+ Tier 1 enemies + 3-5 Tier 4-5 enemies simultaneously.',
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 1.0,
    specialEvent: 'surge',
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
    enemyComposition: ['shambler', 'bat', 'skeleton_warrior', 'ghost', 'werewolf', 'cultist', 'swarm_rat', 'witch', 'bone_golem', 'shadow', 'vampire_noble', 'arcane_construct', 'plague_bearer', 'death_knight', 'banshee', 'lich'],
    spawnRateMultiplier: 0.6,
    specialEvent: 'boss_spawn',
    bossId: 'terminus',
  },
] as const;

/** Maximum number of active enemies on screen at once */
export const MAX_ACTIVE_ENEMIES = 300;
