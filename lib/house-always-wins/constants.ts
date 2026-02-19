export const TILE_SIZE = 16;
export const RENDER_SCALE = 3;

export const CANVAS_TILES_X = 25;
export const CANVAS_TILES_Y = 18;
export const CANVAS_W = CANVAS_TILES_X * TILE_SIZE;
export const CANVAS_H = CANVAS_TILES_Y * TILE_SIZE;

export const GRAVITY = 900;
export const PLAYER_SPEED = 300;
export const JUMP_VELOCITY = -360;
export const JUMP_HOLD_GRAVITY_MULT = 0.38;
export const COYOTE_TIME = 0.12;
export const JUMP_BUFFER_TIME = 0.15;
export const PLAYER_W = 10;
export const PLAYER_H = 14;

export const MAX_DT = 0.05;

export const KILL_PLANE_OFFSET = 64;

export const COLORS = {
  bg: "#0a0a0a",
  solid: "#1a1a1a",
  solidEdge: "#221f1a",
  player: "#d4a054",
  playerOutline: "#8b6914",
  npc: "#6b8e7b",
  npcDealer: "#7b6e5a",
  exit: "#3d6b4f",
  hazard: "#8b2020",
  hazardGlow: "#c0392b",
  detectionZone: "rgba(200, 50, 50, 0.12)",
  detectionBorder: "rgba(200, 50, 50, 0.3)",
  prompt: "#d4a054",
  hud: "#d4a054",
  debtColor: "#c0392b",
} as const;
