// ───────────────────────────────────────────────────────────────────────────
// The player gambler. Celeste-flavoured movement (accel/friction, coyote time,
// jump buffer, variable jump height) plus three unlockable metroidvania moves:
// the Lucky Coin (double jump), the All-In Dash, and the Card Grip (wall slide
// + wall jump). Animation state is derived from the physics each frame.
// ───────────────────────────────────────────────────────────────────────────
import {
  GRAVITY,
  PLAYER_RUN_SPEED,
  PLAYER_ACCEL,
  PLAYER_AIR_ACCEL,
  PLAYER_FRICTION,
  JUMP_VELOCITY,
  JUMP_HOLD_GRAVITY_MULT,
  MAX_FALL_SPEED,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  PLAYER_W,
  PLAYER_H,
  DOUBLE_JUMP_VELOCITY,
  DASH_SPEED,
  DASH_TIME,
  DASH_COOLDOWN,
  WALL_SLIDE_SPEED,
  WALL_JUMP_VX,
  WALL_JUMP_VY,
  WALL_STICK_TIME,
} from "../constants";
import { resolveCollisionX, resolveCollisionY, touchingWall } from "../collision";
import { approach } from "../math";
import { Input } from "../input";
import type { Rect, AbilityId } from "../types";
import { drawPlayer, type PlayerVisual, type PlayerAnim } from "../sprites/player";
import type { Particles } from "../sprites/effects";

export interface PlayerCtx {
  grid: string[];
  hasAbility: (id: AbilityId) => boolean;
  particles: Particles;
  // Called when the player dashes into a chip-wall tile (col,row) — scene breaks it.
  onDashTile?: (col: number, row: number) => boolean;
}

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  grounded = false;
  facing: 1 | -1 = 1;

  private coyote = 0;
  private jumpBuffer = 0;
  private airJumps = 0;
  private dashTimer = 0;
  private dashCooldown = 0;
  private dashDirX = 1;
  private dashDirY = 0;
  private wallDir: -1 | 0 | 1 = 0;
  private wallStick = 0;
  private wallJumpLock = 0;
  invuln = 0;
  frozen = false;

  // animation
  private anim: PlayerAnim = "idle";
  private animTime = 0;
  private blinkTimer = 2;
  private spinTimer = 0;

  readonly w = PLAYER_W;
  readonly h = PLAYER_H;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  get dashing(): boolean {
    return this.dashTimer > 0;
  }

  reset(x: number, y: number, facing: 1 | -1 = 1) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.airJumps = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.wallDir = 0;
    this.wallStick = 0;
    this.wallJumpLock = 0;
    this.invuln = 0;
    this.facing = facing;
    this.anim = "idle";
    this.spinTimer = 0;
  }

  update(dt: number, ctx: PlayerCtx) {
    const grid = ctx.grid;
    this.blinkTimer -= dt;
    if (this.blinkTimer < -0.1) this.blinkTimer = 2 + Math.random() * 2.5;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.spinTimer > 0) this.spinTimer -= dt;

    if (this.frozen) {
      this.vx = 0;
      this.animTime += dt;
      return;
    }

    const wantJump = Input.jump();
    const holdJump = Input.jumpHeld();
    const left = Input.left();
    const right = Input.right();
    const moveDir = (right ? 1 : 0) - (left ? 1 : 0);

    if (this.dashCooldown > 0) this.dashCooldown -= dt;

    // ── Dash ──
    if (
      Input.dash() &&
      ctx.hasAbility("dash") &&
      this.dashCooldown <= 0 &&
      this.dashTimer <= 0 &&
      this.airJumps < 2 // dash budget tied to not being mid-multi-action; refreshed on ground
    ) {
      let dx = moveDir;
      const dy = (Input.down() ? 1 : 0) - (Input.up() ? 1 : 0);
      if (dx === 0 && dy === 0) dx = this.facing;
      const len = Math.hypot(dx, dy) || 1;
      this.dashDirX = dx / len;
      this.dashDirY = dy / len;
      this.dashTimer = DASH_TIME;
      this.dashCooldown = DASH_COOLDOWN;
      this.invuln = Math.max(this.invuln, DASH_TIME + 0.04);
      if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
      this.airJumps = Math.max(this.airJumps, 1); // consume an air action
      ctx.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 8, "#39b0c0", {
        speed: 60,
        gravity: 0,
        life: 0.25,
      });
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vx = this.dashDirX * DASH_SPEED;
      this.vy = this.dashDirY * DASH_SPEED * 0.85;
      ctx.particles.trail(this.x + this.w / 2, this.y + this.h / 2, "#39b0c0");
    } else {
      // ── Horizontal accel / friction ──
      const accel = this.grounded ? PLAYER_ACCEL : PLAYER_AIR_ACCEL;
      if (this.wallJumpLock > 0) {
        this.wallJumpLock -= dt;
      }
      if (moveDir !== 0 && this.wallJumpLock <= 0) {
        this.vx = approach(this.vx, moveDir * PLAYER_RUN_SPEED, accel * dt);
        this.facing = moveDir > 0 ? 1 : -1;
      } else if (this.wallJumpLock <= 0) {
        this.vx = approach(this.vx, 0, PLAYER_FRICTION * dt);
      }
    }

    // ── Coyote + buffer ──
    if (this.grounded) {
      this.coyote = COYOTE_TIME;
      this.airJumps = 0;
    } else {
      this.coyote -= dt;
    }
    if (wantJump) this.jumpBuffer = JUMP_BUFFER_TIME;
    else this.jumpBuffer -= dt;

    // ── Wall interaction (Card Grip) ──
    const canGrip = ctx.hasAbility("wallGrip");
    let wallSliding = false;
    if (!this.grounded && this.dashTimer <= 0 && canGrip) {
      const onRight = touchingWall(grid, this.rect, 1);
      const onLeft = touchingWall(grid, this.rect, -1);
      const pushing =
        (onRight && right) || (onLeft && left);
      if ((onRight || onLeft) && this.vy > -20) {
        this.wallDir = onRight ? 1 : -1;
        if (pushing || this.wallStick > 0) {
          wallSliding = true;
          if (pushing) this.wallStick = WALL_STICK_TIME;
          else this.wallStick -= dt;
          if (this.vy > WALL_SLIDE_SPEED) this.vy = WALL_SLIDE_SPEED;
          this.airJumps = 0; // wall refreshes air actions
          if (Math.random() < 0.3)
            ctx.particles.dust(
              this.x + (this.wallDir > 0 ? this.w : 0),
              this.y + this.h,
              -this.wallDir
            );
        }
      } else {
        this.wallDir = 0;
      }
    } else {
      this.wallDir = 0;
    }

    // ── Jump resolution ──
    if (this.jumpBuffer > 0) {
      if (this.coyote > 0) {
        this.vy = JUMP_VELOCITY;
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.grounded = false;
        ctx.particles.burst(this.x + this.w / 2, this.y + this.h, 5, "#5a5048", {
          speed: 40,
          gravity: 120,
          life: 0.25,
          size: 1,
        });
      } else if (wallSliding && canGrip) {
        this.vy = WALL_JUMP_VY;
        this.vx = -this.wallDir * WALL_JUMP_VX;
        this.facing = this.wallDir > 0 ? -1 : 1;
        this.wallJumpLock = 0.12;
        this.wallStick = 0;
        this.jumpBuffer = 0;
        ctx.particles.burst(
          this.x + (this.wallDir > 0 ? this.w : 0),
          this.y + this.h / 2,
          7,
          "#3fae6b",
          { speed: 70, gravity: 60, life: 0.3 }
        );
      } else if (ctx.hasAbility("doubleJump") && this.airJumps < 1) {
        this.vy = DOUBLE_JUMP_VELOCITY;
        this.airJumps = 1;
        this.jumpBuffer = 0;
        this.spinTimer = 0.42;
        ctx.particles.burst(this.x + this.w / 2, this.y + this.h, 10, "#e7c95a", {
          speed: 90,
          gravity: 120,
          life: 0.4,
        });
      }
    }

    // ── Gravity ──
    if (this.dashTimer <= 0) {
      const gravMult = this.vy < 0 && holdJump ? JUMP_HOLD_GRAVITY_MULT : 1;
      this.vy += GRAVITY * gravMult * dt;
      if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
    }

    // ── Collision resolve ──
    const dropThrough = Input.down();
    const dx = this.vx * dt;
    const rx = resolveCollisionX(grid, this.rect, dx);
    // Dash through chip walls
    if (rx.hitWall !== 0 && this.dashTimer > 0 && ctx.onDashTile) {
      this.tryDashBreak(grid, ctx, rx.hitWall);
    }
    this.x = rx.x;
    if (rx.vx === 0 && this.dashTimer <= 0) this.vx = 0;

    const dy = this.vy * dt;
    const ry = resolveCollisionY(grid, { ...this.rect, x: this.x }, dy, dropThrough);
    this.y = ry.y;
    if (ry.vy === 0) this.vy = 0;
    this.grounded = ry.grounded;

    this.updateAnim(dt, moveDir, wallSliding);
  }

  private tryDashBreak(grid: string[], ctx: PlayerCtx, dir: number) {
    const TILE = 16;
    const probeX = dir > 0 ? this.x + this.w + 1 : this.x - 1;
    const top = Math.floor((this.y + 1) / TILE);
    const bottom = Math.floor((this.y + this.h - 1) / TILE);
    const col = Math.floor(probeX / TILE);
    for (let row = top; row <= bottom; row++) {
      if (ctx.onDashTile?.(col, row)) {
        ctx.particles.burst(col * TILE + 8, row * TILE + 8, 14, "#e7c95a", {
          speed: 120,
          gravity: 200,
          life: 0.5,
        });
      }
    }
  }

  private updateAnim(dt: number, moveDir: number, wallSliding: boolean) {
    let next: PlayerAnim;
    if (this.spinTimer > 0) next = "spin";
    else if (this.dashTimer > 0) next = "dash";
    else if (wallSliding) next = "wall";
    else if (!this.grounded) next = this.vy < -10 ? "jump" : "fall";
    else if (moveDir !== 0) next = "run";
    else if (Input.down()) next = "down";
    else next = "idle";

    if (next !== this.anim) {
      this.anim = next;
      this.animTime = 0;
    } else {
      this.animTime += dt;
    }
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    const v: PlayerVisual = {
      anim: this.spinTimer > 0 ? "spin" : this.anim,
      facing: this.facing,
      animTime: this.spinTimer > 0 ? 0.42 - this.spinTimer : this.animTime,
      blinkTimer: this.blinkTimer,
      invuln: this.invuln > 0,
    };
    drawPlayer(ctx, this.x - camX, this.y - camY, v);
  }
}
