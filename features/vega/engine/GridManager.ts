import { Pathfinder, Point } from './Pathfinder';

export class GridManager {
  public cellSize: number = 40;
  public cols: number = 30; // 1200 / 40
  public rows: number = 20; // 800 / 40
  
  private pathfinder: Pathfinder;
  private occupiedCells: Set<string> = new Set();
  
  // Game Objective
  private startPoint: Point = { x: 0, y: 10 };
  private endPoint: Point = { x: 29, y: 10 };

  constructor() {
    this.pathfinder = new Pathfinder(this.cols, this.rows);
  }

  public getCellFromScreen(x: number, y: number): Point {
    // Clamp to ensure we are within grid bounds
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    
    return {
      x: Math.max(0, Math.min(this.cols - 1, col)),
      y: Math.max(0, Math.min(this.rows - 1, row))
    };
  }

  public getScreenFromCell(x: number, y: number): Point {
    return {
      x: x * this.cellSize,
      y: y * this.cellSize
    };
  }
  
  public isCellOccupied(x: number, y: number): boolean {
    return this.occupiedCells.has(`${x},${y}`);
  }

  public placeTower(x: number, y: number): boolean {
    if (!this.isValid(x, y)) {
        console.log(`Invalid placement at ${x},${y}`);
        return false;
    }
    if (this.isCellOccupied(x, y)) {
        console.log(`Cell occupied at ${x},${y}`);
        return false;
    }

    // Temporarily mark as blocked to check path
    this.pathfinder.updateGrid(x, y, true);
    
    // Check if path still exists
    const path = this.pathfinder.findPath(this.startPoint, this.endPoint);
    
    if (!path) {
      // Revert if blocking path
      this.pathfinder.updateGrid(x, y, false);
      return false;
    }

    // Confirm placement
    this.occupiedCells.add(`${x},${y}`);
    return true;
  }
  
  public removeTower(x: number, y: number) {
    if (this.occupiedCells.has(`${x},${y}`)) {
      this.occupiedCells.delete(`${x},${y}`);
      this.pathfinder.updateGrid(x, y, false);
    }
  }

  public getPath(): Point[] {
    // Return cached path or calculate new one
    // Ideally we cache this
    return this.pathfinder.findPath(this.startPoint, this.endPoint) || [];
  }

  private isValid(x: number, y: number): boolean {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }
}
