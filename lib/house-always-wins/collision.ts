import { TILE_SIZE, TILE } from "./constants";
import type { Rect } from "./types";

// Cells that block movement on all sides.
const SOLID_CHARS = new Set<string>([TILE.SOLID, TILE.CRUMBLE, TILE.CHIP_WALL]);

export function cellAt(grid: string[], col: number, row: number): string {
  if (row < 0 || row >= grid.length) return TILE.EMPTY;
  const line = grid[row];
  if (!line || col < 0 || col >= line.length) return TILE.EMPTY;
  return line[col];
}

export function isSolid(grid: string[], col: number, row: number): boolean {
  return SOLID_CHARS.has(cellAt(grid, col, row));
}

export function isOneWay(grid: string[], col: number, row: number): boolean {
  return cellAt(grid, col, row) === TILE.ONEWAY;
}

export function resolveCollisionX(
  grid: string[],
  rect: Rect,
  vx: number
): { x: number; vx: number; hitWall: -1 | 0 | 1 } {
  const newX = rect.x + vx;
  const testRect = { ...rect, x: newX };

  const top = Math.floor(testRect.y / TILE_SIZE);
  const bottom = Math.floor((testRect.y + testRect.h - 0.01) / TILE_SIZE);
  const leading =
    vx > 0
      ? Math.floor((testRect.x + testRect.w - 0.01) / TILE_SIZE)
      : Math.floor(testRect.x / TILE_SIZE);

  for (let row = top; row <= bottom; row++) {
    if (isSolid(grid, leading, row)) {
      if (vx > 0) return { x: leading * TILE_SIZE - testRect.w, vx: 0, hitWall: 1 };
      return { x: (leading + 1) * TILE_SIZE, vx: 0, hitWall: -1 };
    }
  }
  return { x: newX, vx, hitWall: 0 };
}

export function resolveCollisionY(
  grid: string[],
  rect: Rect,
  vy: number,
  dropThrough = false
): { y: number; vy: number; grounded: boolean } {
  const prevBottom = rect.y + rect.h;
  const newY = rect.y + vy;
  const testRect = { ...rect, y: newY };

  const left = Math.floor(testRect.x / TILE_SIZE);
  const right = Math.floor((testRect.x + testRect.w - 0.01) / TILE_SIZE);

  if (vy > 0) {
    // Moving down — check the row at the new feet position.
    const leading = Math.floor((testRect.y + testRect.h - 0.01) / TILE_SIZE);
    for (let col = left; col <= right; col++) {
      const ch = cellAt(grid, col, leading);
      const tileTop = leading * TILE_SIZE;
      if (SOLID_CHARS.has(ch)) {
        return { y: tileTop - testRect.h, vy: 0, grounded: true };
      }
      // One-way: land only if feet were above the platform top this frame.
      if (ch === TILE.ONEWAY && !dropThrough && prevBottom <= tileTop + 1) {
        return { y: tileTop - testRect.h, vy: 0, grounded: true };
      }
    }
  } else if (vy < 0) {
    // Moving up — only full-solid ceilings block.
    const leading = Math.floor(testRect.y / TILE_SIZE);
    for (let col = left; col <= right; col++) {
      if (isSolid(grid, col, leading)) {
        return { y: (leading + 1) * TILE_SIZE, vy: 0, grounded: false };
      }
    }
  }
  return { y: newY, vy, grounded: false };
}

// True if the player rect is resting on a wall to the given side (for wall grip).
export function touchingWall(grid: string[], rect: Rect, dir: -1 | 1): boolean {
  const col =
    dir > 0
      ? Math.floor((rect.x + rect.w + 0.5) / TILE_SIZE)
      : Math.floor((rect.x - 0.5) / TILE_SIZE);
  const top = Math.floor((rect.y + 1) / TILE_SIZE);
  const bottom = Math.floor((rect.y + rect.h - 1) / TILE_SIZE);
  for (let row = top; row <= bottom; row++) {
    if (isSolid(grid, col, row)) return true;
  }
  return false;
}
