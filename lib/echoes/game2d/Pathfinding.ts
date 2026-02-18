/**
 * Grid-based A* pathfinding for enemy navigation around obstacles.
 * CELL_SIZE controls grid resolution — smaller = more accurate but slower.
 */

export const CELL_SIZE = 48;

let grid: Uint8Array | null = null;
let gridW = 0;
let gridH = 0;

/** Build the walkability grid from obstacle list. Call once on world generation. */
export function buildGrid(
    worldW: number,
    worldH: number,
    obstacles: { x: number; y: number; w: number; h: number }[]
) {
    gridW = Math.ceil(worldW / CELL_SIZE);
    gridH = Math.ceil(worldH / CELL_SIZE);
    grid = new Uint8Array(gridW * gridH); // 0 = walkable, 1 = blocked

    for (const obs of obstacles) {
        // Mark cells covered by obstacles
        const x0 = Math.max(0, Math.floor(obs.x / CELL_SIZE));
        const y0 = Math.max(0, Math.floor(obs.y / CELL_SIZE));
        const x1 = Math.min(gridW - 1, Math.floor((obs.x + obs.w) / CELL_SIZE));
        const y1 = Math.min(gridH - 1, Math.floor((obs.y + obs.h) / CELL_SIZE));
        for (let gx = x0; gx <= x1; gx++) {
            for (let gy = y0; gy <= y1; gy++) {
                grid[gy * gridW + gx] = 1;
            }
        }
    }
}

/** Returns true if world-space point (wx, wy) is inside an obstacle cell, considering actor radius */
export function isBlocked(wx: number, wy: number, radius: number = 0): boolean {
    if (!grid) return false;
    
    // Check center
    const gx = Math.floor(wx / CELL_SIZE);
    const gy = Math.floor(wy / CELL_SIZE);
    if (gx < 0 || gx >= gridW || gy < 0 || gy >= gridH) return true;
    if (grid[gy * gridW + gx] === 1) return true;

    if (radius <= 0) return false;

    // Check cells overlap by radius (simple bounding box check)
    const span = Math.ceil(radius / CELL_SIZE);
    for (let dx = -span; dx <= span; dx++) {
        for (let dy = -span; dy <= span; dy++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
            if (grid[ny * gridW + nx] === 1) {
                // Precise check: is circle center close enough to this cell?
                // For simplicity on a grid, we check if the nearest point in the cell is within radius
                const cellX = nx * CELL_SIZE;
                const cellY = ny * CELL_SIZE;
                const closestX = Math.max(cellX, Math.min(wx, cellX + CELL_SIZE));
                const closestY = Math.max(cellY, Math.min(wy, cellY + CELL_SIZE));
                const distSq = (wx - closestX) ** 2 + (wy - closestY) ** 2;
                if (distSq < radius * radius) return true;
            }
        }
    }
    return false;
}

const DIRS = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [1, 1, 1.414],
];

function cellKey(x: number, y: number) { return y * gridW + x; }

/**
 * A* pathfinding from world-space (sx,sy) to (tx,ty).
 * Returns array of world-space waypoints (centers of cells), or [] if no path.
 */
export function findPath(
    sx: number, sy: number,
    tx: number, ty: number,
    radius: number = 14,
    maxNodes = 1200
): { x: number; y: number }[] {
    if (!grid) return [];

    let startGx = Math.floor(sx / CELL_SIZE);
    let startGy = Math.floor(sy / CELL_SIZE);
    let goalGx = Math.floor(tx / CELL_SIZE);
    let goalGy = Math.floor(ty / CELL_SIZE);

    // Clamp to grid bounds
    startGx = Math.max(0, Math.min(gridW - 1, startGx));
    startGy = Math.max(0, Math.min(gridH - 1, startGy));
    goalGx = Math.max(0, Math.min(gridW - 1, goalGx));
    goalGy = Math.max(0, Math.min(gridH - 1, goalGy));

    // If goal is blocked, find nearest walkable cell
    if (isBlocked(tx, ty, radius)) {
        let found = false;
        outer: for (let r = 1; r <= 5; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    const nx = goalGx + dx, ny = goalGy + dy;
                    const wx = nx * CELL_SIZE + CELL_SIZE / 2;
                    const wy = ny * CELL_SIZE + CELL_SIZE / 2;
                    if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && !isBlocked(wx, wy, radius)) {
                        goalGx = nx; goalGy = ny; found = true; break outer;
                    }
                }
            }
        }
        if (!found) return [];
    }

    const startKey = cellKey(startGx, startGy);
    const goalKey = cellKey(goalGx, goalGy);

    if (startKey === goalKey) return [];

    // g scores and parent map
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();
    const parent = new Map<number, number>(); // child -> parent key
    const openSet = new Set<number>();
    const closedSet = new Set<number>();

    gScore.set(startKey, 0);
    fScore.set(startKey, Math.abs(startGx - goalGx) + Math.abs(startGy - goalGy));
    openSet.add(startKey);

    let iterations = 0;

    while (openSet.size > 0 && iterations++ < maxNodes) {
        // Pick lowest fScore in open set
        let current = -1;
        let lowestF = Infinity;
        for (const k of openSet) {
            const f = fScore.get(k) ?? Infinity;
            if (f < lowestF) { lowestF = f; current = k; }
        }
        if (current === -1) break;

        if (current === goalKey) {
            // Reconstruct path
            const path: { x: number; y: number }[] = [];
            let cur: number | undefined = current;
            while (cur !== undefined) {
                const gx = cur % gridW;
                const gy = Math.floor(cur / gridW);
                path.unshift({
                    x: gx * CELL_SIZE + CELL_SIZE / 2,
                    y: gy * CELL_SIZE + CELL_SIZE / 2,
                });
                cur = parent.get(cur);
            }
            // Skip first waypoint (it's the start cell), return rest
            return path.slice(1);
        }

        openSet.delete(current);
        closedSet.add(current);

        const cx = current % gridW;
        const cy = Math.floor(current / gridW);

        for (const [dx, dy, cost] of DIRS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
            
            const wx = nx * CELL_SIZE + CELL_SIZE / 2;
            const wy = ny * CELL_SIZE + CELL_SIZE / 2;
            if (isBlocked(wx, wy, radius)) continue;
            
            const nk = cellKey(nx, ny);
            if (closedSet.has(nk)) continue;

            const tentativeG = (gScore.get(current) ?? Infinity) + cost;
            if (tentativeG < (gScore.get(nk) ?? Infinity)) {
                parent.set(nk, current);
                gScore.set(nk, tentativeG);
                fScore.set(nk, tentativeG + Math.abs(nx - goalGx) + Math.abs(ny - goalGy));
                openSet.add(nk);
            }
        }
    }

    return []; // no path found
}

/**
 * Get next steering direction for an enemy at (ex,ey) toward target (tx,ty).
 * Caches path per enemy; re-pathfinds every ~0.5s or when waypoint reached.
 */
export interface EnemyNav {
    path: { x: number; y: number }[];
    timer: number;
}

export function steerToward(
    ex: number, ey: number,
    tx: number, ty: number,
    nav: EnemyNav,
    delta: number,
    radius: number = 14
): { dx: number; dy: number } {
    nav.timer -= delta;

    // Re-pathfind periodically or when path is exhausted
    if (nav.timer <= 0 || nav.path.length === 0) {
        nav.path = findPath(ex, ey, tx, ty, radius);
        nav.timer = 0.45 + Math.random() * 0.1; // stagger updates
    }

    // Advance to next waypoint if close enough
    while (nav.path.length > 0) {
        const wp = nav.path[0];
        const dx = wp.x - ex, dy = wp.y - ey;
        if (dx * dx + dy * dy < CELL_SIZE * CELL_SIZE * 0.25) {
            nav.path.shift(); // reached this waypoint
        } else {
            const d = Math.sqrt(dx * dx + dy * dy);
            return { dx: dx / d, dy: dy / d };
        }
    }

    // Direct fallback with wall-sliding logic
    const dx = tx - ex, dy = ty - ey;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    let sdx = dx / dist, sdy = dy / dist;

    // If direct path is blocked, try to slide
    if (isBlocked(ex + sdx * 20, ey + sdy * 20, radius)) {
        // Try horizontal only
        if (!isBlocked(ex + sdx * 20, ey, radius)) sdy = 0;
        // Try vertical only
        else if (!isBlocked(ex, ey + sdy * 20, radius)) sdx = 0;
    }

    const finalLen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
    return { dx: sdx / finalLen, dy: sdy / finalLen };
}
