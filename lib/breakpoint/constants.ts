// ============================================================
// BREAKPOINT — Tactical 5v5 FPS · global constants
// ============================================================

/** Render the 3D scene at this internal pixel scale, then upscale with
 *  nearest-neighbour for a chunky, pixelated retro look. Lower = blockier
 *  and faster. We pick per-device in GameView. */
export const PIXEL_SCALE_DESKTOP = 0.42;
export const PIXEL_SCALE_MOBILE = 0.34;

/** Limited palette flat-shaded look — keeps the retro vibe coherent. */
export const PALETTE = {
  bg: '#0b0e13',
  ground: '#2b2f3a',
  groundLine: '#3a4150',
  wall: '#4a4f5e',
  wallDark: '#373b47',
  cover: '#6b5d4f',
  coverDark: '#4f463b',
  attacker: '#ff4655', // attackers = red
  defender: '#3b6fe0', // defenders = blue
  spike: '#ff4655',
  sky: '#10141d',
  accentGold: '#ece8d8',
};

// ── World / physics ──────────────────────────────────────────
export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;

export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE_HEIGHT = 1.05;
export const HEAD_HEIGHT = 1.66; // y of head centre for headshot test
export const HEAD_RADIUS = 0.26;

export const WALK_SPEED = 4.6;
export const RUN_SPEED = 6.2;
export const CROUCH_SPEED = 2.4;
export const JUMP_VELOCITY = 5.4;
export const GRAVITY = 16;
export const ACCEL = 60;
export const FRICTION = 50;

// ── Match rules (MR13) ───────────────────────────────────────
export const ROUNDS_TO_WIN = 13; // first to 13
export const HALF_ROUNDS = 12;   // sides swap after 12 rounds
export const TEAM_SIZE_MAX = 5;

export const BUY_TIME = 20;       // seconds
export const ROUND_TIME = 100;    // seconds of action
export const SPIKE_TIME = 45;     // seconds after plant
export const PLANT_TIME = 4;      // hold to plant
export const DEFUSE_TIME = 7;     // hold to defuse
export const ROUND_END_TIME = 5;  // post-round freeze

// ── Economy ──────────────────────────────────────────────────
export const START_CREDITS = 800;
export const MAX_CREDITS = 9000;
export const KILL_REWARD = 200;
export const WIN_REWARD = 3000;
export const PLANT_REWARD = 300;
export const LOSS_BONUS = [1900, 2400, 2900]; // escalating loss streak
export const SPIKE_PICKUP_BONUS = 300;

export const MOBILE_BREAKPOINT = 768;

// ── Team identity (everyone sees red attackers / blue defenders) ──
export const TEAM_COLORS: Record<string, string> = {
  attackers: '#ff4655',
  defenders: '#3b6fe0',
  zombies: '#5f8a2e',
};

// ── Zombie variants ──────────────────────────────────────────
export interface ZombieType {
  id: string; name: string;
  color: string; limb: string; scale: number;
  hpMul: number; speedMul: number; dmgMul: number;
  minWave: number; weight: number;
}
export const ZOMBIE_TYPES: Record<string, ZombieType> = {
  walker: { id: 'walker', name: 'Walker', color: '#5f8a2e', limb: '#7a4a3a', scale: 1.0, hpMul: 1, speedMul: 1, dmgMul: 1, minWave: 1, weight: 5 },
  runner: { id: 'runner', name: 'Runner', color: '#a7c83a', limb: '#6a8a2a', scale: 0.82, hpMul: 0.5, speedMul: 1.75, dmgMul: 0.7, minWave: 2, weight: 3 },
  brute: { id: 'brute', name: 'Brute', color: '#3f6b2a', limb: '#2f2618', scale: 1.55, hpMul: 3.2, speedMul: 0.62, dmgMul: 2.3, minWave: 3, weight: 1.4 },
  spitter: { id: 'spitter', name: 'Spitter', color: '#7ab36a', limb: '#3a5a2a', scale: 0.95, hpMul: 0.8, speedMul: 1.1, dmgMul: 1.4, minWave: 4, weight: 1.6 },
};

// ── Zombies mode ─────────────────────────────────────────────
export const ZOMBIE_WAVES = 10;          // survive this many to win
export const ZOMBIE_BASE_COUNT = 6;      // wave 1 size
export const ZOMBIE_PER_WAVE = 3;        // +N per wave
export const ZOMBIE_MAX_ALIVE = 14;      // concurrent cap (perf)
export const ZOMBIE_HP = 130;
export const ZOMBIE_HP_PER_WAVE = 18;
export const ZOMBIE_SPEED = 3.4;
export const ZOMBIE_SPEED_PER_WAVE = 0.12;
export const ZOMBIE_DAMAGE = 22;
export const ZOMBIE_ATTACK_RANGE = 2.0;
export const ZOMBIE_ATTACK_CD = 0.9;     // seconds between hits
export const ZOMBIE_KILL_REWARD = 70;
export const ZOMBIE_WAVE_REWARD = 600;
export const ZOMBIE_BUY_TIME = 18;       // between-wave prep

// ── Networking ───────────────────────────────────────────────
export const NET_PLAYER_HZ = 20;         // own-avatar broadcast rate
export const NET_MATCH_HZ = 12;          // host match-state broadcast rate
export const NET_INTERP_MS = 110;        // remote interpolation delay buffer

// ── Map bounds (a compact symmetric two-site map: "Foundry") ──
export const MAP_HALF = 26; // world spans roughly -26..26 on x/z
