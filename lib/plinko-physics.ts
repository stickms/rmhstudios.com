/**
 * Shared deterministic physics for Plinko.
 * Used by both server (trial search) and client (animation).
 * No browser or Node-specific dependencies.
 */

// ---- Board geometry ----
export const CANVAS_W = 390;
export const CANVAS_H = 420;
export const PEG_ROWS = 6;
export const NUM_BINS = 5;
export const BALL_RADIUS = 8;
export const PEG_RADIUS = 4;
export const GROUND_Y = CANVAS_H - 40; // top of bin area

// ---- Physics ----
export const GRAVITY = 900; // px/s²
export const BOUNCE_DAMPING = 0.55; // velocity retained on peg bounce
export const MAX_VY = 500; // terminal velocity
export const SUB_STEPS = 3; // sub-steps per tick for stability
export const FIXED_DT = 1 / 60; // fixed timestep (seconds)
export const INITIAL_VY = 30; // tiny initial downward push
export const START_Y = 20; // ball starting y (top of playfield)

// ---- Types ----
export interface PegPosition {
  /** Canvas pixel x */
  px: number;
  /** Canvas pixel y */
  py: number;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// ---- Coordinate conversion ----
export function toCanvas(nx: number, ny: number): [number, number] {
  return [nx * CANVAS_W, ny * (CANVAS_H - 60) + 20];
}

// ---- Peg layout ----
function computePegPositions(): PegPosition[] {
  const pegs: PegPosition[] = [];
  for (let row = 0; row < PEG_ROWS; row++) {
    const count = row % 2 === 0 ? 7 : 8;
    const ny = (row + 1) / (PEG_ROWS + 1);

    // Wall pegs (left + right) at each row
    const [, wallY] = toCanvas(0, ny);
    pegs.push({ px: PEG_RADIUS, py: wallY });
    pegs.push({ px: CANVAS_W - PEG_RADIUS, py: wallY });

    // Interior pegs — odd rows offset by half-spacing for proper stagger
    for (let i = 0; i < count; i++) {
      const nx = row % 2 === 0
        ? (i + 1) / 8        // even rows: 7 pegs at 1/8, 2/8, ..., 7/8
        : (i + 0.5) / 8;     // odd rows: 8 pegs at midpoints of even-row gaps
      const [px, py] = toCanvas(nx, ny);
      pegs.push({ px, py });
    }
  }
  return pegs;
}

export const PEGS: PegPosition[] = computePegPositions();

// ---- Physics tick ----
/**
 * Advance ball by one fixed timestep (FIXED_DT).
 * Pure physics: gravity, peg collision/reflection, wall bounce.
 * No guidance forces.
 *
 * @param ball - mutated in place
 * @param onPegHit - optional callback for visual effects (client glow)
 */
export function physicsTick(
  ball: BallState,
  onPegHit?: (peg: PegPosition) => void
): void {
  const subDt = FIXED_DT / SUB_STEPS;
  const colDist = BALL_RADIUS + PEG_RADIUS;
  const colDistSq = colDist * colDist;

  for (let s = 0; s < SUB_STEPS; s++) {
    // Gravity
    ball.vy += GRAVITY * subDt;
    if (ball.vy > MAX_VY) ball.vy = MAX_VY;

    // Move
    ball.x += ball.vx * subDt;
    ball.y += ball.vy * subDt;

    // Wall bounds
    if (ball.x < BALL_RADIUS) {
      ball.x = BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * 0.5;
    }
    if (ball.x > CANVAS_W - BALL_RADIUS) {
      ball.x = CANVAS_W - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * 0.5;
    }

    // Peg collisions
    for (const peg of PEGS) {
      const dx = ball.x - peg.px;
      const dy = ball.y - peg.py;
      const distSq = dx * dx + dy * dy;

      if (distSq < colDistSq && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;

        // Only bounce if moving toward the peg
        const velDot = ball.vx * nx + ball.vy * ny;
        if (velDot >= 0) continue;

        // Push ball out of overlap
        ball.x = peg.px + nx * (colDist + 0.5);
        ball.y = peg.py + ny * (colDist + 0.5);

        // Reflect velocity and damp
        ball.vx -= 2 * velDot * nx;
        ball.vy -= 2 * velDot * ny;
        ball.vx *= BOUNCE_DAMPING;
        ball.vy *= BOUNCE_DAMPING;

        if (onPegHit) onPegHit(peg);
        break; // one collision per sub-step
      }
    }
  }
}

// ---- Full simulation ----
/**
 * Run the physics from a starting x until the ball reaches the bins.
 * Returns which bin it landed in and how many ticks it took.
 */
export function simulateFull(startX: number): {
  landedBin: number;
  totalTicks: number;
} {
  const ball: BallState = {
    x: startX,
    y: START_Y,
    vx: 0,
    vy: INITIAL_VY,
  };

  const MAX_TICKS = 600; // 10 seconds safety limit
  let ticks = 0;

  while (ball.y < GROUND_Y && ticks < MAX_TICKS) {
    physicsTick(ball);
    ticks++;
  }

  const binWidth = CANVAS_W / NUM_BINS;
  const landedBin = Math.min(
    NUM_BINS - 1,
    Math.max(0, Math.floor(ball.x / binWidth))
  );

  return { landedBin, totalTicks: ticks };
}
