/**
 * Athora — Collision Grid
 *
 * Simple 2D grid-based collision detection for the room canvas.
 * Cells can be blocked (walls, stands, obstacles) or free.
 */

export class CollisionGrid {
  private grid: boolean[][];
  private cellSize: number;
  private cols: number;
  private rows: number;

  constructor(mapWidth: number, mapHeight: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(mapWidth / cellSize);
    this.rows = Math.ceil(mapHeight / cellSize);
    this.grid = Array.from({ length: this.rows }, () =>
      Array(this.cols).fill(false)
    );
  }

  /** Mark a rectangular region as blocked (for stands, walls, etc.) */
  blockRect(x: number, y: number, w: number, h: number): void {
    const startCol = Math.floor(x / this.cellSize);
    const startRow = Math.floor(y / this.cellSize);
    const endCol = Math.ceil((x + w) / this.cellSize);
    const endRow = Math.ceil((y + h) / this.cellSize);

    for (let r = startRow; r < endRow && r < this.rows; r++) {
      for (let c = startCol; c < endCol && c < this.cols; c++) {
        if (r >= 0 && c >= 0) this.grid[r][c] = true;
      }
    }
  }

  /** Check if a world position is blocked */
  isBlocked(worldX: number, worldY: number): boolean {
    const col = Math.floor(worldX / this.cellSize);
    const row = Math.floor(worldY / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows)
      return true; // Out of bounds = blocked
    return this.grid[row][col];
  }

  /** Reset the grid (clear all blocked cells) */
  reset(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c] = false;
      }
    }
  }
}
