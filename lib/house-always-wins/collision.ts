import { TILE_SIZE } from "./constants";
import type { Rect } from "./types";

export function isSolid(grid: string[], col: number, row: number): boolean {
  if (row < 0 || row >= grid.length) return false;
  const line = grid[row];
  if (!line || col < 0 || col >= line.length) return false;
  return line[col] === "#";
}

export function resolveCollisionX(
  grid: string[],
  rect: Rect,
  vx: number
): { x: number; vx: number } {
  const newX = rect.x + vx;
  const testRect = { ...rect, x: newX };

  const top = Math.floor(testRect.y / TILE_SIZE);
  const bottom = Math.floor((testRect.y + testRect.h - 0.01) / TILE_SIZE);
  const leading = vx > 0
    ? Math.floor((testRect.x + testRect.w - 0.01) / TILE_SIZE)
    : Math.floor(testRect.x / TILE_SIZE);

  for (let row = top; row <= bottom; row++) {
    if (isSolid(grid, leading, row)) {
      if (vx > 0) {
        return { x: leading * TILE_SIZE - testRect.w, vx: 0 };
      } else {
        return { x: (leading + 1) * TILE_SIZE, vx: 0 };
      }
    }
  }
  return { x: newX, vx };
}

export function resolveCollisionY(
  grid: string[],
  rect: Rect,
  vy: number
): { y: number; vy: number; grounded: boolean } {
  const newY = rect.y + vy;
  const testRect = { ...rect, y: newY };

  const left = Math.floor(testRect.x / TILE_SIZE);
  const right = Math.floor((testRect.x + testRect.w - 0.01) / TILE_SIZE);
  const leading = vy > 0
    ? Math.floor((testRect.y + testRect.h - 0.01) / TILE_SIZE)
    : Math.floor(testRect.y / TILE_SIZE);

  for (let col = left; col <= right; col++) {
    if (isSolid(grid, col, leading)) {
      if (vy > 0) {
        return { y: leading * TILE_SIZE - testRect.h, vy: 0, grounded: true };
      } else {
        return { y: (leading + 1) * TILE_SIZE, vy: 0, grounded: false };
      }
    }
  }
  return { y: newY, vy, grounded: false };
}
