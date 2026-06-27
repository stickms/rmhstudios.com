// ───────────────────────────────────────────────────────────────────────────
// House Always Wins — core constants
// A dark casino metroidvania. All numbers are in "world units" (pixels at 1x).
// ───────────────────────────────────────────────────────────────────────────

export const TILE_SIZE = 16;
export const RENDER_SCALE = 3;

// Viewport, in tiles. Rooms can be larger; the camera scrolls.
export const CANVAS_TILES_X = 25;
export const CANVAS_TILES_Y = 16;
export const CANVAS_W = CANVAS_TILES_X * TILE_SIZE; // 400
export const CANVAS_H = CANVAS_TILES_Y * TILE_SIZE; // 256

// ── Physics ──────────────────────────────────────────────────────────────────
export const GRAVITY = 980;
export const PLAYER_RUN_SPEED = 128;
export const PLAYER_ACCEL = 1400;
export const PLAYER_AIR_ACCEL = 900;
export const PLAYER_FRICTION = 1500;
export const JUMP_VELOCITY = -298;
export const JUMP_HOLD_GRAVITY_MULT = 0.46;
export const MAX_FALL_SPEED = 420;
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER_TIME = 0.12;

export const PLAYER_W = 10;
export const PLAYER_H = 14;

// ── Abilities ────────────────────────────────────────────────────────────────
export const DOUBLE_JUMP_VELOCITY = -268;
export const DASH_SPEED = 300;
export const DASH_TIME = 0.16;
export const DASH_COOLDOWN = 0.3;
export const WALL_SLIDE_SPEED = 56;
export const WALL_JUMP_VX = 176;
export const WALL_JUMP_VY = -288;
export const WALL_STICK_TIME = 0.18;

export const MAX_DT = 0.04;
export const KILL_PLANE_OFFSET = 96;

// ── Palette — dark, moody, abandoned-casino ──────────────────────────────────
// Deep blacks, muted golds, dim red/green felt, occasional sick neon.
export const COLORS = {
  bg: "#070608",
  bgFar: "#0c0a11",
  bgWall: "#16121d",
  bgWallDark: "#100c16",
  bgPanel: "#1d1726",
  solid: "#262030",
  solidTop: "#3d3149",
  solidEdge: "#181221",
  carpet: "#3c1322",
  carpetDark: "#280c17",
  felt: "#16402e",
  feltDark: "#0e2a1f",
  gold: "#d4a054",
  goldDim: "#8b6914",
  goldBright: "#f3cd7a",
  skin: "#caa886",
  skinDark: "#9c7d5f",
  player: "#cdb892",
  playerSuit: "#2b2638",
  playerSuitDark: "#1c1926",
  playerTie: "#9c2b2b",
  neonRed: "#c0392b",
  neonGreen: "#3fae6b",
  neonCyan: "#39b0c0",
  neonPurple: "#9b6cf0",
  neonGold: "#f0c674",
  hazard: "#7e1f1f",
  hazardGlow: "#e0503b",
  chip: "#e7c95a",
  chipRim: "#b8902f",
  prompt: "#f0c674",
  text: "#cabba0",
  textDim: "#6b6155",
  laser: "#ff3b5c",
  door: "#4a3a52",
  doorLocked: "#7e1f1f",
  doorGold: "#d4a054",
  save: "#5fd2a0",
} as const;

// Tile grid characters used by room layouts.
export const TILE = {
  EMPTY: ".",
  SOLID: "#",
  ONEWAY: "-", // jump-through platform (collide only from above)
  SPIKE: "^", // floor spike hazard
  SPIKE_DOWN: "v", // ceiling spike hazard
  CRUMBLE: "x", // breaks shortly after the player stands on it
  CHIP_WALL: "%", // breakable by dash
  DECO_FELT: "f", // decorative felt backing (non-solid)
  DECO_SLOT: "s", // decorative slot machine (non-solid)
} as const;
