// =============================================================================
// ALTAIR ENGINE -- Enemy Navigation (Local A* + BBox-Aware Obstacle Checks)
// =============================================================================
// Provides per-enemy cached local pathfinding around destructible prop AABBs.
// Uses enemy radius as a square half-extent to conservatively account for the
// enemy footprint when navigating narrow spaces.
// =============================================================================

import { EnemyEntity } from './types';
import { SpatialHash } from './spatial-hash';
import { DestructibleProp, PROP_COLLISION_OFFSET_Y } from './tile-generator';
import { avoidObstacles } from './obstacle-avoidance';

const NAV_CELL_SIZE = 32;
const NAV_HALF_CELLS = 18; // 37x37 local grid
const NAV_GRID_SIZE = NAV_HALF_CELLS * 2 + 1;
const NAV_REPATH_INTERVAL = 0.25;
const NAV_TARGET_SHIFT = 40;
const NAV_MAX_TARGET_DISTANCE = 420;
const NAV_WAYPOINT_REACH = 14;
const NAV_MAX_EXPANSIONS = 1200;

interface Point {
  x: number;
  y: number;
}

interface ObstacleBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface EnemyNavState {
  path: Point[];
  nextIndex: number;
  repathTimer: number;
  targetX: number;
  targetY: number;
}

const navStateByEnemy = new Map<number, EnemyNavState>();

const DIRS: ReadonlyArray<{ dx: number; dy: number; cost: number }> = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: Math.SQRT2 },
  { dx: 1, dy: -1, cost: Math.SQRT2 },
  { dx: -1, dy: 1, cost: Math.SQRT2 },
  { dx: -1, dy: -1, cost: Math.SQRT2 },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function cellIndex(gx: number, gy: number): number {
  return gy * NAV_GRID_SIZE + gx;
}

function octileHeuristic(x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const dMin = Math.min(dx, dy);
  const dMax = Math.max(dx, dy);
  return dMin * Math.SQRT2 + (dMax - dMin);
}

function pointInAABB(x: number, y: number, minX: number, maxX: number, minY: number, maxY: number): boolean {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function segmentIntersectsAABB(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: ObstacleBox,
  inflateX: number,
  inflateY: number,
): boolean {
  const minX = box.minX - inflateX;
  const maxX = box.maxX + inflateX;
  const minY = box.minY - inflateY;
  const maxY = box.maxY + inflateY;

  // If starting inside an inflated obstacle, allow line test to continue so
  // the enemy can steer outward instead of treating every segment as blocked.
  if (pointInAABB(ax, ay, minX, maxX, minY, maxY)) return false;

  const dx = bx - ax;
  const dy = by - ay;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-6) {
    if (ax < minX || ax > maxX) return false;
  } else {
    const invDx = 1 / dx;
    let t1 = (minX - ax) * invDx;
    let t2 = (maxX - ax) * invDx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dy) < 1e-6) {
    if (ay < minY || ay > maxY) return false;
  } else {
    const invDy = 1 / dy;
    let t1 = (minY - ay) * invDy;
    let t2 = (maxY - ay) * invDy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return true;
}

function hasLineOfSight(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  boxes: ObstacleBox[],
  inflateX: number,
  inflateY: number,
): boolean {
  for (const box of boxes) {
    if (segmentIntersectsAABB(fromX, fromY, toX, toY, box, inflateX, inflateY)) {
      return false;
    }
  }
  return true;
}

function collectObstacleBoxes(
  propHash: SpatialHash,
  x: number,
  y: number,
  radius: number,
): ObstacleBox[] {
  const entities = propHash.query(x, y, radius);
  if (entities.length === 0) return [];

  const boxes: ObstacleBox[] = [];
  for (const entity of entities) {
    const prop = entity as unknown as DestructibleProp;
    if (prop.destroyed) continue;
    const boxCy = prop.y + PROP_COLLISION_OFFSET_Y;
    boxes.push({
      minX: prop.x - prop.halfW,
      maxX: prop.x + prop.halfW,
      minY: boxCy - prop.halfH,
      maxY: boxCy + prop.halfH,
    });
  }
  return boxes;
}

function findNearestOpenCell(startGX: number, startGY: number, blocked: Uint8Array): number {
  const startIdx = cellIndex(startGX, startGY);
  if (blocked[startIdx] === 0) return startIdx;

  for (let radius = 1; radius <= 6; radius++) {
    const minGX = clamp(startGX - radius, 0, NAV_GRID_SIZE - 1);
    const maxGX = clamp(startGX + radius, 0, NAV_GRID_SIZE - 1);
    const minGY = clamp(startGY - radius, 0, NAV_GRID_SIZE - 1);
    const maxGY = clamp(startGY + radius, 0, NAV_GRID_SIZE - 1);

    for (let gx = minGX; gx <= maxGX; gx++) {
      const topIdx = cellIndex(gx, minGY);
      if (blocked[topIdx] === 0) return topIdx;
      const bottomIdx = cellIndex(gx, maxGY);
      if (blocked[bottomIdx] === 0) return bottomIdx;
    }
    for (let gy = minGY + 1; gy < maxGY; gy++) {
      const leftIdx = cellIndex(minGX, gy);
      if (blocked[leftIdx] === 0) return leftIdx;
      const rightIdx = cellIndex(maxGX, gy);
      if (blocked[rightIdx] === 0) return rightIdx;
    }
  }

  return -1;
}

function buildBlockedGrid(
  enemyX: number,
  enemyY: number,
  enemyHalfW: number,
  enemyHalfH: number,
  boxes: ObstacleBox[],
): { blocked: Uint8Array; originCellX: number; originCellY: number } {
  const blocked = new Uint8Array(NAV_GRID_SIZE * NAV_GRID_SIZE);
  const originCellX = Math.floor(enemyX / NAV_CELL_SIZE) - NAV_HALF_CELLS;
  const originCellY = Math.floor(enemyY / NAV_CELL_SIZE) - NAV_HALF_CELLS;
  const worldMinX = originCellX * NAV_CELL_SIZE;
  const worldMinY = originCellY * NAV_CELL_SIZE;

  for (const box of boxes) {
    const inflatedMinX = box.minX - enemyHalfW;
    const inflatedMaxX = box.maxX + enemyHalfW;
    const inflatedMinY = box.minY - enemyHalfH;
    const inflatedMaxY = box.maxY + enemyHalfH;

    const minGX = clamp(Math.floor((inflatedMinX - worldMinX) / NAV_CELL_SIZE), 0, NAV_GRID_SIZE - 1);
    const maxGX = clamp(Math.floor((inflatedMaxX - worldMinX) / NAV_CELL_SIZE), 0, NAV_GRID_SIZE - 1);
    const minGY = clamp(Math.floor((inflatedMinY - worldMinY) / NAV_CELL_SIZE), 0, NAV_GRID_SIZE - 1);
    const maxGY = clamp(Math.floor((inflatedMaxY - worldMinY) / NAV_CELL_SIZE), 0, NAV_GRID_SIZE - 1);

    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        blocked[cellIndex(gx, gy)] = 1;
      }
    }
  }

  return { blocked, originCellX, originCellY };
}

function reconstructPath(
  cameFrom: Int32Array,
  startIdx: number,
  goalIdx: number,
  originCellX: number,
  originCellY: number,
): Point[] {
  const path: Point[] = [];
  let current = goalIdx;
  let guard = 0;

  while (current !== startIdx && current !== -1 && guard < NAV_GRID_SIZE * NAV_GRID_SIZE) {
    const gx = current % NAV_GRID_SIZE;
    const gy = Math.floor(current / NAV_GRID_SIZE);
    path.push({
      x: (originCellX + gx + 0.5) * NAV_CELL_SIZE,
      y: (originCellY + gy + 0.5) * NAV_CELL_SIZE,
    });
    current = cameFrom[current];
    guard++;
  }

  path.reverse();
  return path;
}

function buildLocalPath(
  enemyX: number,
  enemyY: number,
  targetX: number,
  targetY: number,
  enemyHalfW: number,
  enemyHalfH: number,
  boxes: ObstacleBox[],
): Point[] {
  const { blocked, originCellX, originCellY } = buildBlockedGrid(enemyX, enemyY, enemyHalfW, enemyHalfH, boxes);

  const startGX = clamp(Math.floor(enemyX / NAV_CELL_SIZE) - originCellX, 0, NAV_GRID_SIZE - 1);
  const startGY = clamp(Math.floor(enemyY / NAV_CELL_SIZE) - originCellY, 0, NAV_GRID_SIZE - 1);
  const goalGX = clamp(Math.floor(targetX / NAV_CELL_SIZE) - originCellX, 0, NAV_GRID_SIZE - 1);
  const goalGY = clamp(Math.floor(targetY / NAV_CELL_SIZE) - originCellY, 0, NAV_GRID_SIZE - 1);

  const startIdx = findNearestOpenCell(startGX, startGY, blocked);
  const goalIdx = findNearestOpenCell(goalGX, goalGY, blocked);
  if (startIdx === -1 || goalIdx === -1) return [];

  const gScore = new Float32Array(NAV_GRID_SIZE * NAV_GRID_SIZE);
  const cameFrom = new Int32Array(NAV_GRID_SIZE * NAV_GRID_SIZE);
  const inOpen = new Uint8Array(NAV_GRID_SIZE * NAV_GRID_SIZE);
  const closed = new Uint8Array(NAV_GRID_SIZE * NAV_GRID_SIZE);
  const open: number[] = [];

  for (let i = 0; i < gScore.length; i++) {
    gScore[i] = Number.POSITIVE_INFINITY;
    cameFrom[i] = -1;
  }

  gScore[startIdx] = 0;
  open.push(startIdx);
  inOpen[startIdx] = 1;

  let expansions = 0;
  let reachedIdx = -1;
  let bestIdx = startIdx;
  let bestHeuristic = Number.POSITIVE_INFINITY;
  const goalXCell = goalIdx % NAV_GRID_SIZE;
  const goalYCell = Math.floor(goalIdx / NAV_GRID_SIZE);

  while (open.length > 0 && expansions < NAV_MAX_EXPANSIONS) {
    let bestOpenI = 0;
    let bestOpenIdx = open[0];
    let bestF = Number.POSITIVE_INFINITY;

    for (let i = 0; i < open.length; i++) {
      const idx = open[i];
      const gx = idx % NAV_GRID_SIZE;
      const gy = Math.floor(idx / NAV_GRID_SIZE);
      const h = octileHeuristic(gx, gy, goalXCell, goalYCell);
      const f = gScore[idx] + h;
      if (f < bestF) {
        bestF = f;
        bestOpenI = i;
        bestOpenIdx = idx;
      }
    }

    open.splice(bestOpenI, 1);
    inOpen[bestOpenIdx] = 0;
    closed[bestOpenIdx] = 1;
    expansions++;

    if (bestOpenIdx === goalIdx) {
      reachedIdx = bestOpenIdx;
      break;
    }

    const cx = bestOpenIdx % NAV_GRID_SIZE;
    const cy = Math.floor(bestOpenIdx / NAV_GRID_SIZE);
    const hCurrent = octileHeuristic(cx, cy, goalXCell, goalYCell);
    if (hCurrent < bestHeuristic) {
      bestHeuristic = hCurrent;
      bestIdx = bestOpenIdx;
    }

    for (const dir of DIRS) {
      const nx = cx + dir.dx;
      const ny = cy + dir.dy;
      if (nx < 0 || nx >= NAV_GRID_SIZE || ny < 0 || ny >= NAV_GRID_SIZE) continue;

      const nIdx = cellIndex(nx, ny);
      if (blocked[nIdx] === 1 || closed[nIdx] === 1) continue;

      // Prevent corner clipping through diagonal gaps.
      if (dir.dx !== 0 && dir.dy !== 0) {
        const sideA = cellIndex(cx + dir.dx, cy);
        const sideB = cellIndex(cx, cy + dir.dy);
        if (blocked[sideA] === 1 || blocked[sideB] === 1) continue;
      }

      const tentativeG = gScore[bestOpenIdx] + dir.cost;
      if (tentativeG >= gScore[nIdx]) continue;

      cameFrom[nIdx] = bestOpenIdx;
      gScore[nIdx] = tentativeG;

      if (inOpen[nIdx] === 0) {
        open.push(nIdx);
        inOpen[nIdx] = 1;
      }
    }
  }

  const finalIdx = reachedIdx !== -1 ? reachedIdx : bestIdx;
  if (finalIdx === startIdx) return [];
  return reconstructPath(cameFrom, startIdx, finalIdx, originCellX, originCellY);
}

export function beginEnemyNavigationFrame(enemies: EnemyEntity[]): void {
  if (navStateByEnemy.size === 0) return;
  const aliveIds = new Set<number>();
  for (const enemy of enemies) {
    aliveIds.add(enemy.id);
  }
  for (const enemyId of navStateByEnemy.keys()) {
    if (!aliveIds.has(enemyId)) {
      navStateByEnemy.delete(enemyId);
    }
  }
}

export function computePathVelocity(
  enemy: EnemyEntity,
  targetX: number,
  targetY: number,
  speed: number,
  delta: number,
  propHash: SpatialHash,
): { vx: number; vy: number } {
  if (speed <= 0.01) return { vx: 0, vy: 0 };

  const toTargetX = targetX - enemy.x;
  const toTargetY = targetY - enemy.y;
  const distToTarget = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
  if (distToTarget < 0.001) return { vx: 0, vy: 0 };

  const enemyHalfW = enemy.radius;
  const enemyHalfH = enemy.radius;

  const localQueryRadius = NAV_HALF_CELLS * NAV_CELL_SIZE + NAV_CELL_SIZE;
  const localBoxes = collectObstacleBoxes(propHash, enemy.x, enemy.y, localQueryRadius);

  const directVx = (toTargetX / distToTarget) * speed;
  const directVy = (toTargetY / distToTarget) * speed;

  if (
    localBoxes.length === 0 ||
    hasLineOfSight(enemy.x, enemy.y, targetX, targetY, localBoxes, enemyHalfW, enemyHalfH)
  ) {
    navStateByEnemy.delete(enemy.id);
    return avoidObstacles(enemy.x, enemy.y, enemy.radius, directVx, directVy, speed, propHash);
  }

  let navTargetX = targetX;
  let navTargetY = targetY;
  if (distToTarget > NAV_MAX_TARGET_DISTANCE) {
    const invDist = 1 / distToTarget;
    navTargetX = enemy.x + toTargetX * invDist * NAV_MAX_TARGET_DISTANCE;
    navTargetY = enemy.y + toTargetY * invDist * NAV_MAX_TARGET_DISTANCE;
  }

  const navState = navStateByEnemy.get(enemy.id) ?? {
    path: [],
    nextIndex: 0,
    repathTimer: 0,
    targetX: navTargetX,
    targetY: navTargetY,
  };
  navState.repathTimer -= delta;

  const dxTarget = navTargetX - navState.targetX;
  const dyTarget = navTargetY - navState.targetY;
  const targetShift = Math.sqrt(dxTarget * dxTarget + dyTarget * dyTarget);

  let shouldRepath =
    navState.path.length === 0 ||
    navState.nextIndex >= navState.path.length ||
    navState.repathTimer <= 0 ||
    targetShift > NAV_TARGET_SHIFT;

  if (!shouldRepath && navState.nextIndex < navState.path.length) {
    const wp = navState.path[navState.nextIndex];
    if (!hasLineOfSight(enemy.x, enemy.y, wp.x, wp.y, localBoxes, enemyHalfW, enemyHalfH)) {
      shouldRepath = true;
    }
  }

  if (shouldRepath) {
    navState.path = buildLocalPath(
      enemy.x,
      enemy.y,
      navTargetX,
      navTargetY,
      enemyHalfW,
      enemyHalfH,
      localBoxes,
    );
    navState.nextIndex = 0;
    navState.repathTimer = NAV_REPATH_INTERVAL;
    navState.targetX = navTargetX;
    navState.targetY = navTargetY;
  }

  while (navState.nextIndex < navState.path.length) {
    const wp = navState.path[navState.nextIndex];
    const dx = wp.x - enemy.x;
    const dy = wp.y - enemy.y;
    if (dx * dx + dy * dy <= NAV_WAYPOINT_REACH * NAV_WAYPOINT_REACH) {
      navState.nextIndex++;
      continue;
    }
    break;
  }

  navStateByEnemy.set(enemy.id, navState);

  if (navState.nextIndex >= navState.path.length) {
    return avoidObstacles(enemy.x, enemy.y, enemy.radius, directVx, directVy, speed, propHash);
  }

  const waypoint = navState.path[navState.nextIndex];
  const toWaypointX = waypoint.x - enemy.x;
  const toWaypointY = waypoint.y - enemy.y;
  const distToWaypoint = Math.sqrt(toWaypointX * toWaypointX + toWaypointY * toWaypointY);
  if (distToWaypoint < 0.001) {
    return { vx: 0, vy: 0 };
  }

  const navVx = (toWaypointX / distToWaypoint) * speed;
  const navVy = (toWaypointY / distToWaypoint) * speed;
  return avoidObstacles(enemy.x, enemy.y, enemy.radius, navVx, navVy, speed, propHash);
}
