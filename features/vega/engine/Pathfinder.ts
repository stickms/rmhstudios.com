export interface Point {
  x: number;
  y: number;
}

export class Pathfinder {
  private width: number;
  private height: number;
  private grid: boolean[][]; // true = blocked, false = walkable

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = Array(width).fill(false).map(() => Array(height).fill(false));
  }

  public updateGrid(x: number, y: number, blocked: boolean) {
    if (this.isValid(x, y)) {
      this.grid[x][y] = blocked;
    }
  }

  public findPath(start: Point, end: Point): Point[] | null {
    // Basic A* Implementation
    const openSet: Point[] = [start];
    const cameFrom = new Map<string, Point>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    const key = (p: Point) => `${p.x},${p.y}`;
    
    gScore.set(key(start), 0);
    fScore.set(key(start), this.heuristic(start, end));

    while (openSet.length > 0) {
      // Get lowest fScore
      let current = openSet[0];
      let lowestF = fScore.get(key(current)) ?? Infinity;
      
      for (const node of openSet) {
        const f = fScore.get(key(node)) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          current = node;
        }
      }

      if (current.x === end.x && current.y === end.y) {
        return this.reconstructPath(cameFrom, current);
      }

      // Remove current from openSet
      const index = openSet.indexOf(current);
      openSet.splice(index, 1);

      // Neighbors
      const neighbors = this.getNeighbors(current);
      for (const neighbor of neighbors) {
        const tentativeG = (gScore.get(key(current)) ?? Infinity) + 1; // Cost is always 1
        
        if (tentativeG < (gScore.get(key(neighbor)) ?? Infinity)) {
          cameFrom.set(key(neighbor), current);
          gScore.set(key(neighbor), tentativeG);
          fScore.set(key(neighbor), tentativeG + this.heuristic(neighbor, end));
          
          if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    return null; // No path found
  }

  private reconstructPath(cameFrom: Map<string, Point>, current: Point): Point[] {
    const totalPath = [current];
    const key = (p: Point) => `${p.x},${p.y}`;
    
    while (cameFrom.has(key(current))) {
      current = cameFrom.get(key(current))!;
      totalPath.unshift(current);
    }
    return totalPath;
  }

  private heuristic(a: Point, b: Point): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // Manhattan distance
  }

  private getNeighbors(node: Point): Point[] {
    const dirs = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 }
    ];
    
    const neighbors: Point[] = [];
    for (const dir of dirs) {
      const x = node.x + dir.x;
      const y = node.y + dir.y;
      
      if (this.isValid(x, y) && !this.grid[x][y]) {
        neighbors.push({ x, y });
      }
    }
    return neighbors;
  }

  private isValid(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
}
