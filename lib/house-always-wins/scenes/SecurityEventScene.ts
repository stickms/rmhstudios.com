import type { Scene } from "../engine/Scene";
import type { GameEngine } from "../engine/GameEngine";
import type { SceneTransition, DialogueData } from "../types";
import { TILE_SIZE, CANVAS_W, CANVAS_H, COLORS } from "../constants";
import { Player, renderTiles } from "../player";
import { rectIntersect } from "../math";
import { parseSecurityEvent } from "../levels/securityEvent";

export class SecurityEventScene implements Scene {
  name = "securityEvent";
  private engine: GameEngine;
  private player: Player;
  private level = parseSecurityEvent();
  private camX = 0;
  private camY = 0;
  private done = false;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.player = new Player(this.level.spawn.x, this.level.spawn.y);
  }

  enter() {
    this.level = parseSecurityEvent();
    this.player.reset(this.level.spawn.x, this.level.spawn.y);
    this.camX = 0;
    this.camY = 0;
    this.done = false;
  }

  update(dt: number): SceneTransition | null {
    if (this.done) return null;

    this.player.update(dt, this.level.grid);
    this.updateCamera();

    const pr = this.player.rect;

    // Detection zone check
    for (const zone of this.level.detectionZones) {
      if (rectIntersect(pr, zone)) {
        this.done = true;
        return { to: "lobby", payload: { result: "fail", from: "security" } };
      }
    }

    // Exit check
    for (const e of this.level.exits) {
      if (rectIntersect(pr, e)) {
        this.done = true;
        return { to: "lobby", payload: { result: "success", from: "security" } };
      }
    }

    return null;
  }

  getActiveDialogue(): DialogueData | null { return null; }
  getPromptText(): string | null { return null; }
  handleDialogueChoice() {}
  getAreaLabel(): string { return "Security Wing"; }

  private updateCamera() {
    const levelW = this.level.grid[0].length * TILE_SIZE;
    const levelH = this.level.grid.length * TILE_SIZE;
    let targetX = this.player.x + this.player.w / 2 - CANVAS_W / 2;
    let targetY = this.player.y + this.player.h / 2 - CANVAS_H / 2;
    targetX = Math.max(0, Math.min(targetX, levelW - CANVAS_W));
    targetY = Math.max(0, Math.min(targetY, levelH - CANVAS_H));
    this.camX += (targetX - this.camX) * 0.1;
    this.camY += (targetY - this.camY) * 0.1;
  }

  render(ctx: CanvasRenderingContext2D) {
    const grid = this.level.grid;
    const startCol = Math.floor(this.camX / TILE_SIZE);
    const endCol = Math.ceil((this.camX + CANVAS_W) / TILE_SIZE);
    const startRow = Math.floor(this.camY / TILE_SIZE);
    const endRow = Math.ceil((this.camY + CANVAS_H) / TILE_SIZE);

    renderTiles(ctx, grid, this.camX, this.camY, startCol, endCol, startRow, endRow);

    // Detection zones
    for (const zone of this.level.detectionZones) {
      const zx = Math.round(zone.x - this.camX);
      const zy = Math.round(zone.y - this.camY);
      ctx.fillStyle = COLORS.detectionZone;
      ctx.fillRect(zx, zy, zone.w, zone.h);
      ctx.strokeStyle = COLORS.detectionBorder;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(zx, zy, zone.w, zone.h);
      ctx.setLineDash([]);
    }

    // Exits
    for (const e of this.level.exits) {
      const ex = Math.round(e.x - this.camX);
      const ey = Math.round(e.y - this.camY);
      ctx.fillStyle = COLORS.exit;
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 250) * 0.2;
      ctx.fillRect(ex, ey, e.w, e.h);
      ctx.globalAlpha = 1;
    }

    this.player.render(ctx, this.camX, this.camY);
  }
}
