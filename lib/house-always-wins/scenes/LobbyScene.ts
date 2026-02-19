import type { Scene } from "../engine/Scene";
import type { GameEngine } from "../engine/GameEngine";
import type { SceneTransition, DialogueData, Rect } from "../types";
import { TILE_SIZE, CANVAS_W, CANVAS_H, COLORS } from "../constants";
import { Player, renderTiles } from "../player";
import { rectIntersect } from "../math";
import { Input } from "../input";
import { parseLobby } from "../levels/lobby";
import { getDealerDialogue } from "../dialogues";

export class LobbyScene implements Scene {
  name = "lobby";
  private engine: GameEngine;
  private player: Player;
  private level = parseLobby();
  private camX = 0;
  private camY = 0;
  private activeDialogue: DialogueData | null = null;
  private dialogueLineIndex = 0;
  private nearNpc: string | null = null;
  private pendingTransition: SceneTransition | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.player = new Player(this.level.spawn.x, this.level.spawn.y);
  }

  enter(payload?: Record<string, unknown>) {
    this.level = parseLobby();
    this.player.reset(this.level.spawn.x, this.level.spawn.y);
    this.activeDialogue = null;
    this.dialogueLineIndex = 0;
    this.nearNpc = null;
    this.pendingTransition = null;

    if (payload) {
      const result = payload.result as string | undefined;
      const from = payload.from as string | undefined;

      if (from === "dealer") {
        this.engine.store.setFlag("dealer_completed", true);
        if (result === "fail") {
          this.engine.store.addDebt(10);
        }
      } else if (from === "security") {
        this.engine.store.setFlag("security_completed", true);
        if (result === "fail") {
          this.engine.store.addDebt(20);
        }
      }
    }
  }

  update(dt: number): SceneTransition | null {
    if (this.pendingTransition) {
      const t = this.pendingTransition;
      this.pendingTransition = null;
      return t;
    }

    if (this.activeDialogue) {
      const line = this.activeDialogue.lines[this.dialogueLineIndex];
      if (!line) {
        this.activeDialogue = null;
        return null;
      }
      if (line.choices && line.choices.length > 0) {
        return null;
      }
      if (Input.interact() || Input.jump()) {
        this.dialogueLineIndex++;
        if (this.dialogueLineIndex >= this.activeDialogue.lines.length) {
          this.activeDialogue = null;
        }
      }
      return null;
    }

    this.player.update(dt, this.level.grid);
    this.updateCamera();

    // NPC proximity check
    this.nearNpc = null;
    const pr = this.player.rect;
    const interactRect: Rect = {
      x: pr.x - 8,
      y: pr.y - 4,
      w: pr.w + 16,
      h: pr.h + 8,
    };

    for (const npc of this.level.npcs) {
      if (rectIntersect(interactRect, npc)) {
        this.nearNpc = npc.id;
        if (Input.interact()) {
          this.openDealerDialogue();
        }
        break;
      }
    }

    return null;
  }

  private openDealerDialogue() {
    const debt = this.engine.store.getDebt();
    const flags = this.engine.store.getFlags();
    this.activeDialogue = getDealerDialogue(debt, flags);
    this.dialogueLineIndex = 0;
  }

  handleDialogueChoice(action: string) {
    this.activeDialogue = null;
    this.dialogueLineIndex = 0;

    if (action === "go_dealer") {
      this.pendingTransition = { to: "dealerEvent" };
    } else if (action === "go_security") {
      this.pendingTransition = { to: "securityEvent" };
    }
  }

  getActiveDialogue(): DialogueData | null {
    if (!this.activeDialogue) return null;
    const line = this.activeDialogue.lines[this.dialogueLineIndex];
    if (!line) return null;
    return {
      id: this.activeDialogue.id,
      lines: [line],
    };
  }

  getPromptText(): string | null {
    if (this.activeDialogue) return null;
    if (this.nearNpc) return "Press E to talk";
    return null;
  }

  getAreaLabel(): string {
    return "The Lobby";
  }

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

    // NPCs
    for (const npc of this.level.npcs) {
      const nx = Math.round(npc.x - this.camX);
      const ny = Math.round(npc.y - this.camY);
      ctx.fillStyle = COLORS.npcDealer;
      ctx.fillRect(nx + 2, ny + 2, npc.w - 4, npc.h - 4);

      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(nx + 4, ny + 5, 2, 2);
      ctx.fillRect(nx + 9, ny + 5, 2, 2);

      // Label
      ctx.fillStyle = COLORS.prompt;
      ctx.font = "3px monospace";
      ctx.textAlign = "center";
      ctx.fillText("DEALER", nx + npc.w / 2, ny - 2);
    }

    // Exits (subtle glow)
    for (const exit of this.level.exits) {
      const ex = Math.round(exit.x - this.camX);
      const ey = Math.round(exit.y - this.camY);
      ctx.fillStyle = COLORS.exit;
      ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 300) * 0.15;
      ctx.fillRect(ex, ey, exit.w, exit.h);
      ctx.globalAlpha = 1;
    }

    this.player.render(ctx, this.camX, this.camY);
  }
}
