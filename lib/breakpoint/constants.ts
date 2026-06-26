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
  attacker: '#ff4655', // Valorant red
  defender: '#16e0a3', // teal/green
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

// ── Map bounds (a compact symmetric two-site map: "Foundry") ──
export const MAP_HALF = 26; // world spans roughly -26..26 on x/z
