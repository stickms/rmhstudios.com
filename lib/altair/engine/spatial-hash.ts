// =============================================================================
// ALTAIR ENGINE -- Spatial Hash Grid
// =============================================================================
// Fast broad-phase spatial partitioning for collision queries.
// =============================================================================

import { Entity } from './types';

/**
 * Compute a string key for a cell coordinate.
 */
function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export class SpatialHash {
  private cellSize: number;
  private cells: Map<string, Entity[]>;

  constructor(cellSize: number = 100) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  /**
   * Remove all entities. Call once per frame before re-inserting.
   */
  clear(): void {
    this.cells.clear();
  }

  /**
   * Insert an entity into every cell its bounding circle overlaps.
   */
  insert(entity: Entity): void {
    const r = entity.radius;
    const minCX = Math.floor((entity.x - r) / this.cellSize);
    const maxCX = Math.floor((entity.x + r) / this.cellSize);
    const minCY = Math.floor((entity.y - r) / this.cellSize);
    const maxCY = Math.floor((entity.y + r) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = cellKey(cx, cy);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(entity);
      }
    }
  }

  /**
   * Return all entities whose bounding circles may overlap a query circle.
   *
   * Duplicates are filtered out so each entity appears at most once.
   */
  query(x: number, y: number, radius: number): Entity[] {
    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCY = Math.floor((y - radius) / this.cellSize);
    const maxCY = Math.floor((y + radius) / this.cellSize);

    const seen = new Set<number>();
    const results: Entity[] = [];

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(cellKey(cx, cy));
        if (!cell) continue;
        for (const e of cell) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);

          // Actual circle-circle overlap test
          const dx = e.x - x;
          const dy = e.y - y;
          const dist = dx * dx + dy * dy;
          const combinedR = e.radius + radius;
          if (dist <= combinedR * combinedR) {
            results.push(e);
          }
        }
      }
    }

    return results;
  }

  /**
   * Return all entities whose bounding circles may overlap an axis-aligned rectangle.
   */
  queryRect(x: number, y: number, w: number, h: number): Entity[] {
    const minCX = Math.floor(x / this.cellSize);
    const maxCX = Math.floor((x + w) / this.cellSize);
    const minCY = Math.floor(y / this.cellSize);
    const maxCY = Math.floor((y + h) / this.cellSize);

    const seen = new Set<number>();
    const results: Entity[] = [];

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(cellKey(cx, cy));
        if (!cell) continue;
        for (const e of cell) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);

          // AABB vs circle test: find closest point on rect to circle center
          const closestX = Math.max(x, Math.min(e.x, x + w));
          const closestY = Math.max(y, Math.min(e.y, y + h));
          const dx = e.x - closestX;
          const dy = e.y - closestY;
          if (dx * dx + dy * dy <= e.radius * e.radius) {
            results.push(e);
          }
        }
      }
    }

    return results;
  }
}
