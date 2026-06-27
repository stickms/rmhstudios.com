// ───────────────────────────────────────────────────────────────────────────
// IntroScene — the ritual opening. A coin spins in the dark; "You've been here
// before." The player calls it, the coin lands, and the casino takes them in.
// ───────────────────────────────────────────────────────────────────────────
import type { Scene, SceneSwitch } from "../engine/Scene";
import type { GameEngine } from "../engine/GameEngine";
import type { DialogueData } from "../types";
import { CANVAS_W, CANVAS_H, COLORS } from "../constants";
import { Input } from "../input";
import { Particles } from "../sprites/effects";

export class IntroScene implements Scene {
  name = "intro";
  private engine: GameEngine;
  private t = 0;
  private phase: "spin" | "land" | "leave" = "spin";
  private landed = false;
  private particles = new Particles();
  private leaveTimer = 0;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  enter() {
    this.t = 0;
    this.phase = "spin";
    this.landed = false;
    this.leaveTimer = 0;
    this.engine.playMusic("intro");
  }

  update(dt: number): SceneSwitch | null {
    this.t += dt;
    this.particles.update(dt);

    if (this.phase === "spin") {
      if ((Input.jump() || Input.interact()) && this.t > 1.0) {
        this.phase = "land";
        this.t = 0;
        this.landed = true;
        this.particles.burst(CANVAS_W / 2, CANVAS_H / 2 - 10, 24, COLORS.goldBright, {
          speed: 120,
          gravity: 140,
          life: 0.9,
        });
      }
    } else if (this.phase === "land") {
      if ((Input.jump() || Input.interact()) && this.t > 1.2) {
        this.phase = "leave";
        this.t = 0;
      }
    } else if (this.phase === "leave") {
      this.leaveTimer += dt;
      if (this.leaveTimer > 0.6) return { to: "world" };
    }
    return null;
  }

  getActiveDialogue(): DialogueData | null {
    return null;
  }
  getPromptText(): string | null {
    return null;
  }
  handleDialogueChoice(): void {}
  getAreaLabel(): string {
    return "";
  }

  render(ctx: CanvasRenderingContext2D) {
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    // vignette backdrop
    ctx.fillStyle = "#050409";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 150);
    g.addColorStop(0, "#1a1326");
    g.addColorStop(1, "#050409");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // the coin
    const coinY = cy - 14;
    if (!this.landed) {
      // spinning: width oscillates to fake rotation
      const w = Math.abs(Math.cos(this.t * 9)) * 12 + 2;
      const face = Math.cos(this.t * 9) > 0;
      ctx.fillStyle = COLORS.chipRim;
      ctx.fillRect(Math.round(cx - w / 2), Math.round(coinY - 7), Math.round(w), 14);
      ctx.fillStyle = face ? COLORS.chip : COLORS.goldDim;
      ctx.fillRect(Math.round(cx - w / 2) + 1, Math.round(coinY - 6), Math.max(1, Math.round(w) - 2), 12);
      if (w > 8) {
        ctx.fillStyle = "#1a1209";
        ctx.fillRect(cx - 1, coinY - 3, 2, 6);
        ctx.fillRect(cx - 3, coinY - 1, 6, 2);
      }
    } else {
      // landed coin sitting flat
      const bob = Math.sin(this.t * 4) * 0.5;
      ctx.fillStyle = COLORS.chipRim;
      ctx.fillRect(cx - 7, Math.round(coinY + bob), 14, 5);
      ctx.fillStyle = COLORS.chip;
      ctx.fillRect(cx - 6, Math.round(coinY + 1 + bob), 12, 3);
      ctx.fillStyle = "#fff3c0";
      ctx.fillRect(cx - 1, Math.round(coinY + 1 + bob), 2, 2);
    }

    this.particles.render(ctx, 0, 0);

    // text
    ctx.textAlign = "center";
    ctx.fillStyle = COLORS.text;
    ctx.font = "8px monospace";
    if (this.phase === "spin") {
      ctx.globalAlpha = Math.min(1, this.t / 1.2);
      ctx.fillText("You've been here before.", cx, cy + 28);
      ctx.fillStyle = COLORS.goldDim;
      ctx.font = "6px monospace";
      if (this.t > 1.0 && Math.sin(this.t * 4) > 0)
        ctx.fillText("press SPACE to call it", cx, cy + 44);
    } else if (this.phase === "land") {
      ctx.globalAlpha = Math.min(1, this.t / 0.8);
      ctx.fillStyle = COLORS.goldBright;
      ctx.fillText("Heads you wake. Tails you remember.", cx, cy + 28);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = "6px monospace";
      if (this.t > 1.2 && Math.sin(this.t * 4) > 0)
        ctx.fillText("press SPACE to enter the Mirage Royale", cx, cy + 44);
    } else {
      ctx.globalAlpha = Math.max(0, 1 - this.leaveTimer / 0.6);
      ctx.fillStyle = COLORS.goldBright;
      ctx.fillText("Welcome back.", cx, cy + 28);
    }
    ctx.globalAlpha = 1;

    // leave fade
    if (this.phase === "leave") {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.leaveTimer / 0.6)})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }
}
