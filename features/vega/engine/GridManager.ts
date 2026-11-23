import { BOARD, type MapDef } from './data';
import { Pathfinder, type Point } from './Pathfinder';

export type CellKind = 'bench' | 'corridor' | 'fixture';

/** A route through the corridor as a pixel polyline with cumulative lengths, for O(log n) lookups by distance. */
export interface Lane {
  cells: Point[];
  points: Point[];
  /** cum[i] = distance from the entry to points[i], px. */
  cum: number[];
  length: number;
}

/**
 * The board of one map: which cells are benches (where instruments go), which are corridor, and the lanes the
 * specimens walk. Lanes come from `Pathfinder` run over the corridor from each entry to the exit.
 */
export class GridManager {
  public readonly cellSize = BOARD.CELL;
  public readonly cols = BOARD.COLS;
  public readonly rows = BOARD.ROWS;
  public readonly map: MapDef;
  public readonly lanes: Lane[] = [];
  public readonly entries: Point[] = [];
  public exit: Point = { x: 0, y: 0 };

  private kinds: CellKind[][];
  private occupiedCells: Set<string> = new Set();

  constructor(map: MapDef) {
    this.map = map;
    const pathfinder = new Pathfinder(this.cols, this.rows);
    this.kinds = Array.from({ length: this.cols }, () => Array<CellKind>(this.rows).fill('bench'));
    for (let y = 0; y < this.rows; y++) {
      const row = map.layout[y] ?? '';
      for (let x = 0; x < this.cols; x++) {
        const c = row[x] ?? '.';
        let kind: CellKind = 'bench';
        if (c === '#' || c === 'S' || c === 'E') kind = 'corridor';
        else if (c === 'x') kind = 'fixture';
        this.kinds[x]![y] = kind;
        pathfinder.updateGrid(x, y, kind !== 'corridor');
        if (c === 'S') this.entries.push({ x, y });
        if (c === 'E') this.exit = { x, y };
      }
    }
    for (const entry of this.entries) {
      const cells = pathfinder.findPath(entry, this.exit);
      if (!cells) throw new Error(`vega map ${map.id}: no route from ${entry.x},${entry.y}`);
      this.lanes.push(GridManager.toLane(cells, this.cellSize));
    }
  }

  private static toLane(cells: Point[], cell: number): Lane {
    const points = cells.map((c) => ({ x: c.x * cell + cell / 2, y: c.y * cell + cell / 2 }));
    // Enter from off the board, so a specimen walks in rather than appearing on the first tile.
    const first = points[0]!;
    const second = points[1] ?? first;
    const dx = Math.sign(second.x - first.x);
    const dy = Math.sign(second.y - first.y);
    points.unshift({ x: first.x - dx * cell, y: first.y - dy * cell });
    const last = points[points.length - 1]!;
    const prev = points[points.length - 2] ?? last;
    points.push({ x: last.x + Math.sign(last.x - prev.x) * cell, y: last.y + Math.sign(last.y - prev.y) * cell });
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    return { cells, points, cum, length: cum[cum.length - 1]! };
  }

  /** The point `dist` px along a lane. */
  public positionAt(lane: Lane, dist: number): Point {
    if (dist <= 0) return { ...lane.points[0]! };
    if (dist >= lane.length) return { ...lane.points[lane.points.length - 1]! };
    let lo = 0;
    let hi = lane.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lane.cum[mid]! <= dist) lo = mid;
      else hi = mid;
    }
    const a = lane.points[lo]!;
    const b = lane.points[hi]!;
    const t = (dist - lane.cum[lo]!) / (lane.cum[hi]! - lane.cum[lo]! || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  public kindAt(x: number, y: number): CellKind | null {
    if (!this.isValid(x, y)) return null;
    return this.kinds[x]![y]!;
  }

  public getCellFromScreen(x: number, y: number): Point {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    return {
      x: Math.max(0, Math.min(this.cols - 1, col)),
      y: Math.max(0, Math.min(this.rows - 1, row)),
    };
  }

  public cellCenter(x: number, y: number): Point {
    return { x: x * this.cellSize + this.cellSize / 2, y: y * this.cellSize + this.cellSize / 2 };
  }

  public isCellOccupied(x: number, y: number): boolean {
    return this.occupiedCells.has(`${x},${y}`);
  }

  public canBuild(x: number, y: number): boolean {
    return this.kindAt(x, y) === 'bench' && !this.isCellOccupied(x, y);
  }

  public placeTower(x: number, y: number): boolean {
    if (!this.canBuild(x, y)) return false;
    this.occupiedCells.add(`${x},${y}`);
    return true;
  }

  public removeTower(x: number, y: number) {
    this.occupiedCells.delete(`${x},${y}`);
  }

  /** Every bench cell, in reading order. */
  public benches(): Point[] {
    const out: Point[] = [];
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) if (this.kinds[x]![y] === 'bench') out.push({ x, y });
    return out;
  }

  /** How many corridor samples (every 10 px of every lane) lie within `rangeCells` of a cell's centre. */
  public coverage(x: number, y: number, rangeCells: number): number {
    const c = this.cellCenter(x, y);
    const r = rangeCells * this.cellSize;
    let n = 0;
    for (const lane of this.lanes) {
      for (let d = 0; d < lane.length; d += 10) {
        const p = this.positionAt(lane, d);
        if (Math.hypot(p.x - c.x, p.y - c.y) <= r) n++;
      }
    }
    return n;
  }

  private isValid(x: number, y: number): boolean {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }
}
