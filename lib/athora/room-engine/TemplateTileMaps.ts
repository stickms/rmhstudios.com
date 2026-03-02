/**
 * Athora — Template Tile Maps
 *
 * Generates default tilemap data for each room template type.
 * Uses a standardized tileset layout so rooms look good out of the box
 * even without custom tilemap data from the server.
 *
 * Tileset layout (terrain.png — 10 cols × 6 rows, 32×32 tiles):
 * ┌────────────────────────────────────────────────────┐
 * │ Row 0: Grass variants (0-4), Flowers/weeds (5-9)  │
 * │ Row 1: Dirt/path (10-14), Sand (15-19)            │
 * │ Row 2: Stone floor (20-24), Wood floor (25-29)    │
 * │ Row 3: Carpet (30-34), Tile floor (35-39)         │
 * │ Row 4: Water (40-44), Lava/void (45-49)           │
 * │ Row 5: Walls/edges (50-54), Decorative (55-59)    │
 * └────────────────────────────────────────────────────┘
 */

import type { TileMapData, AthoraRoomTemplate } from "@/types/athora";

// ── Tile index constants ────────────────────────────────────────

/** Grass variants */
const GRASS_1 = 0;
const GRASS_2 = 1;
const GRASS_3 = 2;
const GRASS_FLOWERS = 5;
const GRASS_WEEDS = 6;

/** Path/dirt */
const DIRT_1 = 10;
const DIRT_2 = 11;
const PATH_H = 12;
const PATH_V = 13;
const PATH_CROSS = 14;

/** Stone floor */
const STONE_1 = 20;
const STONE_2 = 21;
const STONE_EDGE = 22;

/** Wood floor */
const WOOD_1 = 25;
const WOOD_2 = 26;

/** Carpet */
const CARPET_1 = 30;
const CARPET_2 = 31;
const CARPET_EDGE = 32;

/** Tile floor */
const TILE_1 = 35;
const TILE_2 = 36;

/** Water */
const WATER_1 = 40;
const WATER_EDGE = 42;

/** Walls/edges */
const WALL_TOP = 50;
const WALL_SIDE = 51;
const WALL_CORNER = 52;

const TILESET_DEF = {
  src: "tilesets/terrain.png",
  tileSize: 32,
  cols: 10,
  rows: 6,
};

const RENDER_SIZE = 64; // Each 32px tile renders at 64px on screen

// ── Helpers ─────────────────────────────────────────────────────

function makeGrid(cols: number, rows: number, fill: number): number[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

/** Scatter random variant tiles into a grid */
function scatter(
  grid: number[][],
  variants: number[],
  density: number,
  seed: number
): void {
  let hash = seed;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      // Simple deterministic pseudo-random
      hash = ((hash * 1103515245 + 12345) >>> 0) % 2147483647;
      if ((hash % 100) / 100 < density) {
        grid[r][c] = variants[hash % variants.length];
      }
    }
  }
}

/** Draw a rectangular border of wall tiles */
function drawWalls(grid: number[][], cols: number, rows: number): void {
  for (let c = 0; c < cols; c++) {
    grid[0][c] = WALL_TOP;
    grid[rows - 1][c] = WALL_TOP;
  }
  for (let r = 0; r < rows; r++) {
    grid[r][0] = WALL_SIDE;
    grid[r][cols - 1] = WALL_SIDE;
  }
  grid[0][0] = WALL_CORNER;
  grid[0][cols - 1] = WALL_CORNER;
  grid[rows - 1][0] = WALL_CORNER;
  grid[rows - 1][cols - 1] = WALL_CORNER;
}

/** Draw a horizontal path across the grid */
function drawHPath(grid: number[][], row: number, startCol: number, endCol: number): void {
  for (let c = startCol; c <= endCol; c++) {
    grid[row][c] = PATH_H;
  }
}

/** Draw a vertical path down the grid */
function drawVPath(grid: number[][], col: number, startRow: number, endRow: number): void {
  for (let r = startRow; r <= endRow; r++) {
    grid[r][col] = PATH_V;
    if (grid[r][col] === PATH_H) grid[r][col] = PATH_CROSS;
  }
}

// ── Template Generators ─────────────────────────────────────────

function generateOpenFloor(cols: number, rows: number): TileMapData {
  // Outdoor grassy area with stone paths
  const ground = makeGrid(cols, rows, GRASS_1);
  scatter(ground, [GRASS_2, GRASS_3], 0.3, 42);
  scatter(ground, [GRASS_FLOWERS, GRASS_WEEDS], 0.08, 137);

  // Central crossroads
  const midR = Math.floor(rows / 2);
  const midC = Math.floor(cols / 2);
  drawHPath(ground, midR, 1, cols - 2);
  drawVPath(ground, midC, 1, rows - 2);

  // Small gathering areas with stone
  const stoneOverlay = makeGrid(cols, rows, -1);
  const areas = [
    { r: Math.floor(rows * 0.25), c: Math.floor(cols * 0.25) },
    { r: Math.floor(rows * 0.25), c: Math.floor(cols * 0.75) },
    { r: Math.floor(rows * 0.75), c: Math.floor(cols * 0.25) },
    { r: Math.floor(rows * 0.75), c: Math.floor(cols * 0.75) },
  ];
  for (const area of areas) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = area.r + dr;
        const c = area.c + dc;
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          stoneOverlay[r][c] = (dr + dc) % 2 === 0 ? STONE_1 : STONE_2;
        }
      }
    }
  }

  return {
    tileset: TILESET_DEF,
    renderSize: RENDER_SIZE,
    layers: [
      { tiles: ground },
      { tiles: stoneOverlay, zOffset: 1 },
    ],
  };
}

function generateConference(cols: number, rows: number): TileMapData {
  // Indoor carpet with stage area at the top
  const ground = makeGrid(cols, rows, CARPET_1);
  scatter(ground, [CARPET_2], 0.2, 88);
  drawWalls(ground, cols, rows);

  // Stage area (top portion — wood floor)
  const stageOverlay = makeGrid(cols, rows, -1);
  const stageRows = Math.max(3, Math.floor(rows * 0.2));
  for (let r = 1; r <= stageRows; r++) {
    for (let c = 2; c < cols - 2; c++) {
      stageOverlay[r][c] = c % 2 === 0 ? WOOD_1 : WOOD_2;
    }
  }

  // Center aisle
  const midC = Math.floor(cols / 2);
  for (let r = stageRows + 1; r < rows - 1; r++) {
    ground[r][midC] = TILE_1;
    if (midC - 1 >= 0) ground[r][midC - 1] = TILE_2;
    if (midC + 1 < cols) ground[r][midC + 1] = TILE_2;
  }

  return {
    tileset: TILESET_DEF,
    renderSize: RENDER_SIZE,
    layers: [
      { tiles: ground },
      { tiles: stageOverlay, zOffset: 1 },
    ],
  };
}

function generateTradeShow(cols: number, rows: number): TileMapData {
  // Indoor tile floor with grid aisles for booths
  const ground = makeGrid(cols, rows, TILE_1);
  scatter(ground, [TILE_2], 0.25, 55);
  drawWalls(ground, cols, rows);

  // Aisles every 4 columns
  for (let c = 4; c < cols - 1; c += 5) {
    for (let r = 1; r < rows - 1; r++) {
      ground[r][c] = STONE_1;
    }
  }

  // Cross aisles
  for (let r = 4; r < rows - 1; r += 5) {
    for (let c = 1; c < cols - 1; c++) {
      ground[r][c] = STONE_1;
    }
  }

  return {
    tileset: TILESET_DEF,
    renderSize: RENDER_SIZE,
    layers: [{ tiles: ground }],
  };
}

function generateLounge(cols: number, rows: number): TileMapData {
  // Cozy indoor wood floor with carpet zones
  const ground = makeGrid(cols, rows, WOOD_1);
  scatter(ground, [WOOD_2], 0.35, 77);
  drawWalls(ground, cols, rows);

  // Carpet seating zones
  const carpetOverlay = makeGrid(cols, rows, -1);
  const zones = [
    { r: Math.floor(rows * 0.3), c: Math.floor(cols * 0.3), size: 2 },
    { r: Math.floor(rows * 0.3), c: Math.floor(cols * 0.7), size: 2 },
    { r: Math.floor(rows * 0.7), c: Math.floor(cols * 0.5), size: 3 },
  ];
  for (const zone of zones) {
    for (let dr = -zone.size; dr <= zone.size; dr++) {
      for (let dc = -zone.size; dc <= zone.size; dc++) {
        const r = zone.r + dr;
        const c = zone.c + dc;
        if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) {
          const isEdge =
            Math.abs(dr) === zone.size || Math.abs(dc) === zone.size;
          carpetOverlay[r][c] = isEdge ? CARPET_EDGE : CARPET_1;
        }
      }
    }
  }

  return {
    tileset: TILESET_DEF,
    renderSize: RENDER_SIZE,
    layers: [
      { tiles: ground },
      { tiles: carpetOverlay, zOffset: 1 },
    ],
  };
}

function generateClassroom(cols: number, rows: number): TileMapData {
  // Indoor tile floor with front stage area
  const ground = makeGrid(cols, rows, TILE_1);
  scatter(ground, [TILE_2], 0.2, 99);
  drawWalls(ground, cols, rows);

  // Whiteboard/stage area at top
  const stageOverlay = makeGrid(cols, rows, -1);
  for (let c = 2; c < cols - 2; c++) {
    stageOverlay[1][c] = WOOD_1;
    stageOverlay[2][c] = WOOD_2;
  }

  // Row aisles for seating
  const midC = Math.floor(cols / 2);
  for (let r = 4; r < rows - 1; r++) {
    ground[r][midC] = STONE_1;
  }
  for (let r = 4; r < rows - 1; r += 3) {
    for (let c = 1; c < cols - 1; c++) {
      if (c !== midC) ground[r][c] = STONE_2;
    }
  }

  return {
    tileset: TILESET_DEF,
    renderSize: RENDER_SIZE,
    layers: [
      { tiles: ground },
      { tiles: stageOverlay, zOffset: 1 },
    ],
  };
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Generate a default TileMapData for a room template.
 * Returns null for CUSTOM templates (those should supply their own tileMapData).
 */
export function generateTemplateTileMap(
  template: AthoraRoomTemplate,
  mapWidth: number,
  mapHeight: number
): TileMapData | null {
  const cols = Math.ceil(mapWidth / RENDER_SIZE);
  const rows = Math.ceil(mapHeight / RENDER_SIZE);

  switch (template) {
    case "OPEN_FLOOR":
      return generateOpenFloor(cols, rows);
    case "CONFERENCE":
      return generateConference(cols, rows);
    case "TRADE_SHOW":
      return generateTradeShow(cols, rows);
    case "LOUNGE":
      return generateLounge(cols, rows);
    case "CLASSROOM":
      return generateClassroom(cols, rows);
    case "CUSTOM":
      return null;
  }
}
