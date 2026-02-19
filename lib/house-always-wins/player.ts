import {
  TILE_SIZE,
  GRAVITY,
  PLAYER_SPEED,
  JUMP_VELOCITY,
  JUMP_HOLD_GRAVITY_MULT,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  PLAYER_W,
  PLAYER_H,
  COLORS,
} from "./constants";
import { resolveCollisionX, resolveCollisionY } from "./collision";
import { Input } from "./input";
import type { Rect } from "./types";

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  grounded = false;
  coyoteTimer = 0;
  jumpBufferTimer = 0;
  facingRight = true;

  readonly w = PLAYER_W;
  readonly h = PLAYER_H;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  reset(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  update(dt: number, grid: string[]) {
    const moveLeft = Input.left();
    const moveRight = Input.right();
    const wantJump = Input.jump();
    const holdJump = Input.jumpHeld();

    // Instant horizontal — no acceleration ramp
    if (moveLeft && !moveRight) {
      this.vx = -PLAYER_SPEED;
      this.facingRight = false;
    } else if (moveRight && !moveLeft) {
      this.vx = PLAYER_SPEED;
      this.facingRight = true;
    } else {
      this.vx = 0;
    }

    // Coyote time
    if (this.grounded) {
      this.coyoteTimer = COYOTE_TIME;
    } else {
      this.coyoteTimer -= dt;
    }

    // Jump buffer
    if (wantJump) {
      this.jumpBufferTimer = JUMP_BUFFER_TIME;
    } else {
      this.jumpBufferTimer -= dt;
    }

    // Jump execute
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.vy = JUMP_VELOCITY;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.grounded = false;
    }

    // Gravity — reduced while going up + holding jump for variable height
    const gravMult = (this.vy < 0 && holdJump) ? JUMP_HOLD_GRAVITY_MULT : 1;
    this.vy += GRAVITY * gravMult * dt;

    // Cap fall speed
    if (this.vy > 500) this.vy = 500;

    // Resolve X collision
    const dx = this.vx * dt;
    const rx = resolveCollisionX(grid, this.rect, dx);
    this.x = rx.x;
    if (rx.vx === 0) this.vx = 0;

    // Resolve Y collision
    const dy = this.vy * dt;
    const ry = resolveCollisionY(grid, { ...this.rect, x: this.x }, dy);
    this.y = ry.y;
    if (ry.vy === 0) this.vy = 0;
    this.grounded = ry.grounded;
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const sx = Math.round(this.x - camX);
    const sy = Math.round(this.y - camY);

    // Body
    ctx.fillStyle = COLORS.player;
    ctx.fillRect(sx + 1, sy + 2, this.w - 2, this.h - 2);

    // Outline
    ctx.strokeStyle = COLORS.playerOutline;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx + 0.5, sy + 1.5, this.w - 1, this.h - 1);

    // Eyes
    const eyeY = sy + 5;
    const eyeBaseX = this.facingRight ? sx + 5 : sx + 2;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(eyeBaseX, eyeY, 1, 2);
    ctx.fillRect(eyeBaseX + 3, eyeY, 1, 2);
  }
}

export function renderTiles(
  ctx: CanvasRenderingContext2D,
  grid: string[],
  camX: number,
  camY: number,
  startCol: number,
  endCol: number,
  startRow: number,
  endRow: number
) {
  ctx.fillStyle = COLORS.solid;
  for (let row = startRow; row <= endRow; row++) {
    if (row < 0 || row >= grid.length) continue;
    const line = grid[row];
    for (let col = startCol; col <= endCol; col++) {
      if (col < 0 || col >= line.length) continue;
      if (line[col] === "#") {
        ctx.fillRect(
          Math.round(col * TILE_SIZE - camX),
          Math.round(row * TILE_SIZE - camY),
          TILE_SIZE,
          TILE_SIZE
        );
      }
    }
  }

  // Subtle top-edge highlight on solid tiles (batched)
  ctx.fillStyle = COLORS.solidEdge;
  for (let row = startRow; row <= endRow; row++) {
    if (row < 0 || row >= grid.length) continue;
    const line = grid[row];
    const above = row > 0 ? grid[row - 1] : undefined;
    for (let col = startCol; col <= endCol; col++) {
      if (col < 0 || col >= line.length) continue;
      if (line[col] === "#" && (!above || above[col] !== "#")) {
        ctx.fillRect(
          Math.round(col * TILE_SIZE - camX),
          Math.round(row * TILE_SIZE - camY),
          TILE_SIZE,
          1
        );
      }
    }
  }
}
