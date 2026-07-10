// ───────────────────────────────────────────────────────────────────────────
// WorldScene — the explorable casino. Owns the active room, the player, every
// entity, the puzzles, hazards, room-to-room doors (with their own fade),
// death/respawn, dialogue, and the finale. Rooms are data (see world/rooms.ts);
// this scene interprets them.
// ───────────────────────────────────────────────────────────────────────────
import type { Scene, SceneSwitch } from "../engine/Scene";
import type { GameEngine } from "../engine/GameEngine";
import type {
  DialogueData,
  EntitySpec,
  RoomData,
  RoomId,
  Rect,
  NpcId,
} from "../types";
import { TILE_SIZE, CANVAS_W, CANVAS_H, COLORS, KILL_PLANE_OFFSET, TILE } from "../constants";
import { clamp, lerp, rectIntersect } from "../math";
import { Input } from "../input";
import { Player } from "../entities/Player";
import { Particles } from "../sprites/effects";
import { ROOMS } from "../world/rooms";
import { getNpcDialogue, dealerHintLine } from "../dialogues";
import { SfxManager } from "../sfx";
import {
  drawBackdrop,
  drawTiles,
} from "../sprites/world";
import {
  drawChip,
  drawKey,
  drawAbilityRelic,
  drawLever,
  drawPlate,
  drawMover,
  drawLaser,
  drawSave,
  drawSign,
  drawSlotReel,
  drawDoor,
  drawVaultCore,
  drawPokerTable,
  slotSymbolCount,
} from "../sprites/entities";
import { drawNpc } from "../sprites/npcs";

const CHIP_VALUE = 8;
const SLOT_TARGET = 2; // bell (see SLOT_SYMBOLS in entities.ts)

interface REnt {
  spec: EntitySpec;
  rect: Rect;
  taken: boolean;
  on: boolean;
  pressed: boolean;
  lit: boolean;
  sym: number;
  x: number;
  y: number;
  px: number;
  py: number;
  t: number;
  dir: number;
}

interface RNpc {
  id: NpcId;
  cx: number;
  footY: number;
  facing: 1 | -1;
  t: number;
  rect: Rect;
}

type FadeAction = (() => void) | null;

export class WorldScene implements Scene {
  name = "world";
  private engine: GameEngine;
  private room!: RoomData;
  private roomId: RoomId = "lobby";
  private grid: string[] = [];
  private player: Player;
  private particles = new Particles();

  private camX = 0;
  private camY = 0;
  private worldW = 0;
  private worldH = 0;

  private ents: REnt[] = [];
  private npcs: RNpc[] = [];
  private entrySpawn = { x: 0, y: 0, facing: 1 as 1 | -1 };

  // crumbling tiles: key -> {phase, t}
  private crumble = new Map<string, { phase: "shake" | "gone"; t: number }>();

  // poker plate sequence progress
  private seq: number[] = [];

  // dialogue
  private activeDialogue: DialogueData | null = null;
  private dialogueLine = 0;
  private dialogueNpc: NpcId | null = null;

  // prompts / interaction target
  private prompt: string | null = null;
  // Brief lock after a dialogue/choice closes so the same keypress that
  // confirmed it can't immediately re-open the NPC/door (the infinite-loop bug).
  private interactLock = 0;

  // local fade for room transitions / death
  private fade = 0;
  private fadeDir: 0 | 1 | -1 = 0;
  private fadeAction: FadeAction = null;

  private ended = false;
  private time = 0;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.player = new Player(0, 0);
  }

  enter() {
    const cp = this.engine.store.getCheckpoint();
    this.gotoRoom(cp.room, cp.id, true);
  }

  // ── Room loading ──────────────────────────────────────────────────────────
  private gotoRoom(id: RoomId, doorId: string, instant = false) {
    this.roomId = id;
    this.room = ROOMS[id];
    this.worldW = this.room.grid[0].length * TILE_SIZE;
    this.worldH = this.room.grid.length * TILE_SIZE;
    this.buildGrid();
    this.buildEntities();
    this.buildNpcs();
    this.crumble.clear();
    this.seq = [];
    this.activeDialogue = null;
    this.dialogueNpc = null;

    // spawn at the named door (or save point of same id)
    const spawn = this.findSpawn(doorId);
    this.entrySpawn = spawn;
    this.player.reset(spawn.x, spawn.y, spawn.facing);
    this.snapCamera();

    this.engine.store.markVisited(id);
    this.engine.setArea(this.room.name);
    this.engine.playMusic(this.room.music);
    this.engine.onHudChange();

    if (instant) {
      this.fade = 0;
      this.fadeDir = 0;
    }
  }

  private buildGrid() {
    // mutable copy; apply persisted broken chip-walls
    this.grid = this.room.grid.map((r) => r.split(""))
      .map((chars, row) =>
        chars
          .map((c, col) =>
            c === TILE.CHIP_WALL &&
            this.engine.store.getFlag(`chipwall:${this.roomId}:${col}:${row}`)
              ? "."
              : c
          )
          .join("")
      );
  }

  private mk(spec: EntitySpec, wT = 1, hT = 1): REnt {
    return {
      spec,
      rect: { x: spec.col * TILE_SIZE, y: spec.row * TILE_SIZE, w: wT * TILE_SIZE, h: hT * TILE_SIZE },
      taken: false,
      on: false,
      pressed: false,
      lit: false,
      sym: 0,
      x: spec.col * TILE_SIZE,
      y: spec.row * TILE_SIZE,
      px: spec.col * TILE_SIZE,
      py: spec.row * TILE_SIZE,
      t: 0,
      dir: 1,
    };
  }

  private buildEntities() {
    const store = this.engine.store;
    this.ents = this.room.entities.map((spec) => {
      let wT = 1;
      let hT = 1;
      if (spec.kind === "mover") wT = spec.length ?? 3;
      if (spec.kind === "key") hT = 1;
      const e = this.mk(spec, wT, hT);
      if (spec.kind === "chip") e.taken = store.getFlag(`chip:${this.roomId}:${spec.id}`);
      if (spec.kind === "key") e.taken = store.getFlag(`key:${spec.id}`);
      if (spec.kind === "ability" && spec.ability)
        e.taken = store.hasAbility(spec.ability);
      if (spec.kind === "slotReel") e.sym = 0;
      if (spec.kind === "lever")
        e.on = store.getFlag(`lever:${this.roomId}:${spec.id}`);
      return e;
    });
  }

  private buildNpcs() {
    this.npcs = this.room.npcs.map((n) => ({
      id: n.id,
      cx: n.col * TILE_SIZE + TILE_SIZE / 2,
      footY: (n.row + 2) * TILE_SIZE,
      facing: n.facing === "right" ? 1 : -1,
      t: Math.random() * 10,
      rect: { x: n.col * TILE_SIZE - 6, y: n.row * TILE_SIZE - 8, w: TILE_SIZE + 12, h: TILE_SIZE * 2 + 8 },
    }));
  }

  private findSpawn(doorId: string): { x: number; y: number; facing: 1 | -1 } {
    const door = this.room.doors.find((d) => d.id === doorId);
    const save = this.room.entities.find((e) => e.kind === "save" && e.id === doorId);
    let col = 2;
    let row = this.room.grid.length - 3;
    let facing: 1 | -1 = 1;
    if (door) {
      col = door.col;
      row = door.row;
      facing = door.facing === "right" ? 1 : door.facing === "left" ? -1 : 1;
      // step in from the wall
      if (door.facing === "left") col += 1;
      else if (door.facing === "right") col -= 1;
    } else if (save) {
      col = save.col;
      row = save.row;
    }
    // place feet roughly at the door; physics will settle to the floor
    const x = col * TILE_SIZE + (TILE_SIZE - 10) / 2;
    const y = row * TILE_SIZE + (TILE_SIZE * 2 - 14);
    return { x, y, facing };
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  update(dt: number): SceneSwitch | null {
    this.time += dt;
    this.particles.update(dt);
    if (this.interactLock > 0) this.interactLock -= dt;
    for (const n of this.npcs) n.t += dt;

    // fade handling (room change / death)
    if (this.fadeDir !== 0) {
      this.fade += this.fadeDir * dt * 3.2;
      if (this.fadeDir === 1 && this.fade >= 1) {
        this.fade = 1;
        if (this.fadeAction) {
          this.fadeAction();
          this.fadeAction = null;
        }
        this.fadeDir = -1;
      } else if (this.fadeDir === -1 && this.fade <= 0) {
        this.fade = 0;
        this.fadeDir = 0;
      }
      // during fade, still tick particles + npcs but freeze gameplay
      this.updateCamera(dt);
      return null;
    }

    if (this.activeDialogue) {
      this.updateDialogue();
      this.updateCamera(dt);
      return null;
    }
    if (this.ended) {
      this.updateCamera(dt);
      return null;
    }

    // entities pre-step
    this.updateMovers(dt);
    this.updateLasers(dt);

    // player
    this.player.update(dt, {
      grid: this.grid,
      hasAbility: (id) => this.engine.store.hasAbility(id),
      particles: this.particles,
      onDashTile: (col, row) => this.tryBreakChipWall(col, row),
    });

    this.rideMovers(dt);
    this.updateCrumble(dt);

    // interactions + hazards + pickups
    this.handlePickups();
    if (this.handleHazards()) {
      this.updateCamera(dt);
      return null;
    }
    this.handlePlates();
    this.updatePromptAndInteract();

    this.updateCamera(dt);
    return null;
  }

  private updateDialogue() {
    const d = this.activeDialogue;
    if (!d) return;
    const line = d.lines[this.dialogueLine];
    if (!line) {
      this.activeDialogue = null;
      return;
    }
    if (line.choices && line.choices.length) return; // wait for UI choice
    if (Input.interact() || Input.jump()) {
      this.dialogueLine++;
      if (this.dialogueLine >= d.lines.length) {
        this.endDialogueChain();
      }
    }
  }

  private endDialogueChain() {
    // Setting talkedDealer once the intro chain completes.
    if (this.dialogueNpc === "dealer") this.engine.store.setFlag("talkedDealer", true);
    this.activeDialogue = null;
    this.dialogueNpc = null;
    this.interactLock = 0.3;
    this.engine.onHudChange();
  }

  // ── Movers ────────────────────────────────────────────────────────────────
  private updateMovers(dt: number) {
    for (const e of this.ents) {
      if (e.spec.kind !== "mover") continue;
      e.px = e.x;
      e.py = e.y;
      const speed = e.spec.speed ?? 24;
      const ax = e.spec.col * TILE_SIZE;
      const ay = e.spec.row * TILE_SIZE;
      const bx = (e.spec.col + (e.spec.dx ?? 0)) * TILE_SIZE;
      const by = (e.spec.row + (e.spec.dy ?? 0)) * TILE_SIZE;
      e.t += e.dir * speed * dt;
      const dist = Math.hypot(bx - ax, by - ay) || 1;
      if (e.t > dist) {
        e.t = dist;
        e.dir = -1;
      } else if (e.t < 0) {
        e.t = 0;
        e.dir = 1;
      }
      const f = e.t / dist;
      e.x = lerp(ax, bx, f);
      e.y = lerp(ay, by, f);
      e.rect.x = e.x;
      e.rect.y = e.y;
    }
  }

  private rideMovers(dt: number) {
    void dt;
    const p = this.player;
    for (const e of this.ents) {
      if (e.spec.kind !== "mover") continue;
      const top = e.y;
      const overlapX = p.x + p.w > e.x && p.x < e.x + e.rect.w;
      const feet = p.y + p.h;
      // land if falling onto the platform top
      if (overlapX && p.vy >= 0 && feet >= top - 2 && feet <= top + 8) {
        p.y = top - p.h;
        p.vy = 0;
        p.grounded = true;
        // carry the platform delta
        p.x += e.x - e.px;
        p.y += e.y - e.py;
      }
    }
  }

  // ── Lasers ────────────────────────────────────────────────────────────────
  private updateLasers(dt: number) {
    void dt;
    for (const e of this.ents) {
      if (e.spec.kind !== "laser") continue;
      const on = e.spec.onTime ?? 1;
      const off = e.spec.offTime ?? 1;
      const period = on + off;
      const phase = ((this.time + (e.spec.phase ?? 0) * period) % period);
      e.on = phase < on;
    }
  }

  private laserBeam(e: REnt): Rect {
    const len = (e.spec.length ?? 3) * TILE_SIZE;
    const x = e.spec.col * TILE_SIZE + TILE_SIZE / 2;
    const y = e.spec.row * TILE_SIZE + TILE_SIZE / 2;
    if (e.spec.vertical) return { x: x - 2, y, w: 4, h: len };
    return { x, y: y - 2, w: len, h: 4 };
  }

  // ── Crumble tiles ───────────────────────────────────────────────────────────
  private updateCrumble(dt: number) {
    const p = this.player;
    if (p.grounded) {
      const col = Math.floor((p.x + p.w / 2) / TILE_SIZE);
      const row = Math.floor((p.y + p.h + 1) / TILE_SIZE);
      if (this.cell(col, row) === TILE.CRUMBLE) {
        const key = `${col},${row}`;
        if (!this.crumble.has(key)) this.crumble.set(key, { phase: "shake", t: 0.45 });
      }
    }
    for (const [key, st] of this.crumble) {
      st.t -= dt;
      if (st.phase === "shake" && st.t <= 0) {
        const [c, r] = key.split(",").map(Number);
        this.setCell(c, r, ".");
        st.phase = "gone";
        st.t = 2.0;
        this.particles.burst(c * TILE_SIZE + 8, r * TILE_SIZE + 8, 8, "#6b4e2e", { gravity: 280 });
      } else if (st.phase === "gone" && st.t <= 0) {
        const [c, r] = key.split(",").map(Number);
        this.setCell(c, r, TILE.CRUMBLE);
        this.crumble.delete(key);
      }
    }
  }

  private tryBreakChipWall(col: number, row: number): boolean {
    if (this.cell(col, row) === TILE.CHIP_WALL) {
      this.setCell(col, row, ".");
      this.engine.store.setFlag(`chipwall:${this.roomId}:${col}:${row}`, true);
      return true;
    }
    return false;
  }

  // ── Pickups ───────────────────────────────────────────────────────────────
  private handlePickups() {
    const pr = this.player.rect;
    for (const e of this.ents) {
      if (e.taken) continue;
      if (e.spec.kind === "chip" && rectIntersect(pr, this.padRect(e.rect, 3))) {
        e.taken = true;
        this.engine.store.setFlag(`chip:${this.roomId}:${e.spec.id}`, true);
        this.engine.store.addChips(CHIP_VALUE);
        this.particles.burst(e.rect.x + 8, e.rect.y + 8, 8, COLORS.chip, { gravity: 120, life: 0.5 });
        this.engine.toast(`+${CHIP_VALUE} chips`, COLORS.chip);
        SfxManager.play("chip");
        this.engine.onHudChange();
      } else if (e.spec.kind === "key" && !this.isCaged(e) && rectIntersect(pr, this.padRect(e.rect, 4))) {
        e.taken = true;
        this.engine.store.setFlag(`key:${e.spec.id}`, true);
        this.engine.store.addKey();
        this.particles.burst(e.rect.x + 8, e.rect.y + 8, 20, COLORS.goldBright, { speed: 130, gravity: 80, life: 0.7 });
        this.engine.toast("Vault Key recovered!", COLORS.goldBright);
        SfxManager.play("key");
        this.engine.onHudChange();
      } else if (e.spec.kind === "ability" && e.spec.ability && rectIntersect(pr, this.padRect(e.rect, 5))) {
        e.taken = true;
        const ab = e.spec.ability;
        this.engine.store.grantAbility(ab);
        this.engine.store.setFlag(`ability:${ab}`, true);
        for (let i = 0; i < 3; i++)
          this.particles.burst(e.rect.x + 8, e.rect.y + 8, 16, COLORS.goldBright, { speed: 90 + i * 40, gravity: 0, life: 0.8 });
        const label = ab === "doubleJump" ? "Lucky Coin — Double Jump!" : ab === "dash" ? "All-In Dash unlocked!" : "Card Grip — Wall Climb!";
        this.engine.toast(label, COLORS.neonGold);
        SfxManager.play("ability");
        this.player.invuln = 0.4;
        this.engine.onHudChange();
      }
    }
  }

  private isCaged(e: REnt): boolean {
    const g = e.spec.group;
    if (!g) return false;
    return !this.engine.store.getFlag(`puzzle:${g}`);
  }

  // ── Hazards (returns true if the player died this frame) ───────────────────
  private handleHazards(): boolean {
    if (this.player.invuln > 0) {
      // still allow falling out of the world
    }
    const pr = this.player.rect;

    // spikes
    const c0 = Math.floor(pr.x / TILE_SIZE);
    const c1 = Math.floor((pr.x + pr.w - 1) / TILE_SIZE);
    const r0 = Math.floor(pr.y / TILE_SIZE);
    const r1 = Math.floor((pr.y + pr.h - 1) / TILE_SIZE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = this.cell(c, r);
        if (ch === TILE.SPIKE) {
          const hz = { x: c * TILE_SIZE + 2, y: r * TILE_SIZE + 8, w: TILE_SIZE - 4, h: 8 };
          if (rectIntersect(pr, hz)) return this.die(8, "The spikes find you.");
        } else if (ch === TILE.SPIKE_DOWN) {
          const hz = { x: c * TILE_SIZE + 2, y: r * TILE_SIZE, w: TILE_SIZE - 4, h: 8 };
          if (rectIntersect(pr, hz)) return this.die(8, "The spikes find you.");
        }
      }
    }

    if (this.player.invuln <= 0) {
      // lasers
      for (const e of this.ents) {
        if (e.spec.kind === "laser" && e.on && rectIntersect(pr, this.laserBeam(e)))
          return this.die(12, "Tripped a laser. The House noticed.");
      }
      // camera cones
      for (const e of this.ents) {
        if (e.spec.kind === "camera") {
          const cone = this.cameraCone(e);
          const cx = pr.x + pr.w / 2;
          const cy = pr.y + pr.h / 2;
          if (pointInTri(cx, cy, cone)) return this.die(15, "The camera caught you. Debt collected.");
        }
      }
    }

    // kill plane (rooms are bordered, but just in case)
    if (this.player.y > this.worldH + KILL_PLANE_OFFSET) return this.die(0, "");
    return false;
  }

  private cameraCone(e: REnt): [number, number, number, number, number, number] {
    const apexX = e.spec.col * TILE_SIZE + TILE_SIZE / 2;
    const apexY = e.spec.row * TILE_SIZE + TILE_SIZE;
    const reach = 80;
    const spread = 46;
    return [apexX, apexY, apexX - spread, apexY + reach, apexX + spread, apexY + reach];
  }

  private die(debt: number, msg: string): boolean {
    if (this.fadeDir !== 0) return true;
    this.engine.store.registerDeath();
    if (debt > 0) {
      this.engine.store.addDebt(debt);
      this.engine.toast(msg, COLORS.neonRed);
    }
    this.particles.burst(this.player.x + 5, this.player.y + 7, 24, COLORS.neonRed, { speed: 140, gravity: 120, life: 0.7 });
    SfxManager.play("bust");
    this.player.frozen = true;
    this.startFade(() => {
      this.player.reset(this.entrySpawn.x, this.entrySpawn.y, this.entrySpawn.facing);
      this.player.frozen = false;
      this.player.invuln = 1.0;
      this.snapCamera();
      this.engine.onHudChange();
    });
    return true;
  }

  private startFade(action: FadeAction) {
    this.fade = 0;
    this.fadeDir = 1;
    this.fadeAction = action;
  }

  // ── Plates / puzzles ────────────────────────────────────────────────────────
  private handlePlates() {
    const pr = this.player.rect;
    for (const e of this.ents) {
      if (e.spec.kind !== "plate") continue;
      const top = { x: e.rect.x + 2, y: e.rect.y + 10, w: TILE_SIZE - 4, h: 8 };
      const wasPressed = e.pressed;
      e.pressed = rectIntersect(pr, top) && this.player.vy >= 0;
      if (e.pressed && !wasPressed) this.onPlatePress(e);
      e.lit = this.seqContains(e);
    }
  }

  private seqContains(e: REnt): boolean {
    return this.seq.includes(e.spec.target ?? -1);
  }

  private onPlatePress(e: REnt) {
    const group = e.spec.group;
    if (!group) return;
    if (this.engine.store.getFlag(`puzzle:${group}`)) return;
    const target = e.spec.target ?? 0;
    const expected = this.seq.length;
    if (target === expected) {
      this.seq.push(target);
      this.particles.burst(e.rect.x + 8, e.rect.y + 12, 6, COLORS.neonGold, { gravity: 60 });
      if (this.seq.length === 3) this.solvePuzzle(group);
    } else {
      if (this.seq.length) this.engine.toast("Wrong order. The plates reset.", COLORS.neonRed);
      this.seq = target === 0 ? [0] : [];
    }
  }

  private solvePuzzle(group: string) {
    this.engine.store.setFlag(`puzzle:${group}`, true);
    this.engine.toast("A cage unlocks. The key is free.", COLORS.goldBright);
    // free the caged key visually (particles at it)
    const key = this.ents.find((e) => e.spec.kind === "key" && e.spec.group === group);
    if (key) this.particles.burst(key.rect.x + 8, key.rect.y + 8, 18, COLORS.goldBright, { speed: 120 });
    SfxManager.play("win");
    this.engine.onHudChange();
  }

  private pullLever(e: REnt) {
    e.on = !e.on;
    this.engine.store.setFlag(`lever:${this.roomId}:${e.spec.id}`, e.on);
    this.particles.burst(e.rect.x + 8, e.rect.y + 4, 6, e.on ? COLORS.neonGreen : COLORS.neonRed, { gravity: 40 });
    SfxManager.play("lever");
    // slot reels: lever group "reelN" advances the reel of the same id
    const group = e.spec.group;
    if (group && group.startsWith("reel")) {
      const reel = this.ents.find((r) => r.spec.kind === "slotReel" && r.spec.id === group);
      if (reel) {
        reel.sym = (reel.sym + 1) % slotSymbolCount();
        this.checkSlots();
      }
    }
  }

  private checkSlots() {
    const reels = this.ents.filter((e) => e.spec.kind === "slotReel");
    if (reels.length === 3 && reels.every((r) => r.sym === SLOT_TARGET)) {
      if (!this.engine.store.getFlag("puzzle:slotPuzzle")) {
        this.engine.store.setFlag("puzzle:slotPuzzle", true);
        this.engine.toast("Three bells! The cage drops.", COLORS.goldBright);
        const key = this.ents.find((e) => e.spec.id === "key2");
        if (key) this.particles.burst(key.rect.x + 8, key.rect.y + 8, 20, COLORS.goldBright, { speed: 120 });
        SfxManager.play("win");
        this.engine.onHudChange();
      }
    }
  }

  // ── Prompt + interaction ────────────────────────────────────────────────────
  private updatePromptAndInteract() {
    const pr = this.player.rect;
    const reach = this.padRect(pr, 10);
    this.prompt = null;
    // While locked (just left a dialogue), still show prompts but swallow the
    // stale keypress so we don't immediately re-open what we just closed.
    let acted = this.interactLock > 0;

    // NPCs
    for (const n of this.npcs) {
      if (rectIntersect(reach, n.rect)) {
        n.facing = this.player.x + this.player.w / 2 < n.cx ? -1 : 1;
        this.prompt = `Press E — talk to ${npcName(n.id)}`;
        if (Input.interact() && !acted) {
          acted = true;
          this.openNpc(n.id);
        }
      }
    }

    // doors (skip self-spawn doors)
    if (!acted)
      for (const d of this.room.doors) {
        if (d.to === this.roomId) continue;
        const dr = { x: d.col * TILE_SIZE - 4, y: d.row * TILE_SIZE, w: TILE_SIZE + 8, h: TILE_SIZE * 2 };
        if (!rectIntersect(reach, dr)) continue;
        const lock = this.doorLock(d.id);
        if (lock.locked) {
          this.prompt = lock.label;
        } else {
          this.prompt = lock.label;
          if (Input.interact() && !acted) {
            acted = true;
            if (lock.toll && !this.engine.store.getFlag(`door:${d.id}`)) {
              this.engine.store.spendChips(d.costChips ?? 0);
              this.engine.store.setFlag(`door:${d.id}`, true);
            }
            this.startFadeToRoom(d.to, d.toDoor);
          }
        }
      }

    // levers + save + signs
    if (!acted)
      for (const e of this.ents) {
        if (e.taken) continue;
        if (e.spec.kind === "lever" && rectIntersect(reach, this.padRect(e.rect, 4))) {
          this.prompt = "Press E — pull lever";
          if (Input.interact() && !acted) {
            acted = true;
            this.pullLever(e);
          }
        } else if (e.spec.kind === "save" && rectIntersect(reach, this.padRect(e.rect, 6))) {
          this.prompt = "Press E — save your progress";
          if (Input.interact() && !acted) {
            acted = true;
            this.engine.store.setCheckpoint(this.roomId, e.spec.id);
            this.entrySpawn = this.findSpawn(e.spec.id);
            this.particles.burst(e.rect.x + 8, e.rect.y + 8, 14, COLORS.save, { speed: 80 });
            SfxManager.play("save");
            this.engine.toast("Progress saved.", COLORS.save);
          }
        } else if (e.spec.kind === "sign" && rectIntersect(reach, this.padRect(e.rect, 4))) {
          this.prompt = "Press E — read";
          if (Input.interact() && !acted) {
            acted = true;
            this.openSign(e.spec.text ?? "");
          }
        } else if (e.spec.kind === "pokerTable" && rectIntersect(reach, this.padRect(e.rect, 14))) {
          this.prompt = "Press E — sit down for five-card draw";
          if (Input.interact() && !acted) {
            acted = true;
            this.engine.openPoker();
          }
        }
      }
  }

  private doorLock(id: string): { locked: boolean; label: string; toll: boolean } {
    const d = this.room.doors.find((x) => x.id === id)!;
    const dest = ROOMS[d.to]?.name ?? "?";
    if (d.lockedByAbility && !this.engine.store.hasAbility(d.lockedByAbility)) {
      const need = d.lockedByAbility === "doubleJump" ? "the Lucky Coin" : d.lockedByAbility === "dash" ? "the Dash" : "the Card Grip";
      return { locked: true, label: `Sealed — needs ${need}`, toll: false };
    }
    if (d.lockedByKey && this.engine.store.getKeys() < d.lockedByKey) {
      return { locked: true, label: `Vault Door — needs ${d.lockedByKey} keys (${this.engine.store.getKeys()}/${d.lockedByKey})`, toll: false };
    }
    if (d.costChips && !this.engine.store.getFlag(`door:${d.id}`)) {
      const can = this.engine.store.getChips() >= d.costChips;
      return { locked: !can, label: can ? `Press E — pay ${d.costChips} chips → ${dest}` : `Toll: ${d.costChips} chips`, toll: true };
    }
    return { locked: false, label: `Press E — enter ${dest}`, toll: false };
  }

  private startFadeToRoom(to: RoomId, toDoor: string) {
    SfxManager.play("door");
    this.player.frozen = true;
    this.startFade(() => {
      this.gotoRoom(to, toDoor);
      this.player.frozen = false;
    });
  }

  // ── Dialogue openers ────────────────────────────────────────────────────────
  private openNpc(id: NpcId) {
    if (id === "house") {
      this.openDialogue(getNpcDialogue("house", this.engine.store.getQuestState()), id);
      return;
    }
    this.openDialogue(getNpcDialogue(id, this.engine.store.getQuestState()), id);
  }

  private openDialogue(d: DialogueData, npc: NpcId | null) {
    this.activeDialogue = d;
    this.dialogueLine = 0;
    this.dialogueNpc = npc;
    this.interactLock = 0.3;
    SfxManager.play("ui");
    Input.clearHeld();
  }

  private openSign(key: string) {
    const text = SIGN_TEXT[key] ?? "The plaque is too faded to read.";
    this.openDialogue({ id: "sign", lines: [{ speaker: "Plaque", text, choices: [{ text: "(Step away.)", action: "close" }] }] }, null);
  }

  handleDialogueChoice(action: string) {
    const store = this.engine.store;
    const [verb, arg] = action.split(":");
    this.interactLock = 0.3;

    if (action === "close") {
      this.endDialogueChain();
      return;
    }
    if (verb === "dealer") {
      store.setFlag("talkedDealer", true);
      if (arg === "pay") {
        const paid = store.payDebt(store.getChips());
        this.engine.toast(paid > 0 ? `Paid ${paid} off your tab.` : "Nothing to pay with.", COLORS.chip);
        this.activeDialogue = null;
        this.dialogueNpc = null;
        this.engine.onHudChange();
      } else if (arg === "hint") {
        this.activeDialogue = dealerHintLine(store.getQuestState());
        this.dialogueLine = 0;
      } else if (arg === "debt") {
        this.activeDialogue = {
          id: "dealer_debt",
          lines: [
            { speaker: "The Dealer", text: "Does it matter? It's never the number. It's that there's always a number.", choices: [{ text: "(Step away.)", action: "close" }] },
          ],
        };
        this.dialogueLine = 0;
      } else {
        this.endDialogueChain();
      }
      this.engine.onHudChange();
      return;
    }

    if (verb === "house") {
      this.resolveEnding(arg);
      return;
    }
    // default
    this.endDialogueChain();
  }

  private resolveEnding(kind: string) {
    const store = this.engine.store;
    this.activeDialogue = null;
    this.dialogueNpc = null;
    store.setFlag("ending", true);
    let id = "refuse";
    if (kind === "pay") {
      store.payDebt(store.getChips());
      id = "settled";
    } else if (kind === "short") {
      this.engine.toast("You don't have the chips. The House smiles.", COLORS.neonRed);
      this.activeDialogue = {
        id: "house_short",
        lines: [{ speaker: "THE HOUSE", text: "Short. As always. Cut the deck, then — or crawl back to the floor and scrape together more chips.", choices: [
          { text: "Cut the deck. All in.", action: "house:gamble" },
          { text: "Crawl back for more chips.", action: "close" },
        ] }],
      };
      this.dialogueLine = 0;
      store.setFlag("ending", false);
      return;
    } else if (kind === "gamble") {
      // one cut of the deck — deterministic-ish 50/50 from deaths+chips
      const win = (store.getChips() + store.getKeys() * 7) % 2 === 0;
      id = win ? "gamble_win" : "gamble_lose";
    } else if (kind === "refuse") {
      id = "refuse";
    }
    this.ended = true;
    this.player.frozen = true;
    this.particles.burst(this.player.x + 5, this.player.y, 30, COLORS.neonPurple, { speed: 120, gravity: -20, life: 1.2 });
    this.engine.onEnding(id);
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  private snapCamera() {
    const tx = this.player.x + this.player.w / 2 - CANVAS_W / 2;
    const ty = this.player.y + this.player.h / 2 - CANVAS_H / 2;
    this.camX = clamp(tx, 0, Math.max(0, this.worldW - CANVAS_W));
    this.camY = clamp(ty, 0, Math.max(0, this.worldH - CANVAS_H));
  }

  private updateCamera(dt: number) {
    void dt;
    const tx = this.player.x + this.player.w / 2 - CANVAS_W / 2;
    const ty = this.player.y + this.player.h / 2 - CANVAS_H / 2;
    const cx = clamp(tx, 0, Math.max(0, this.worldW - CANVAS_W));
    const cy = clamp(ty, 0, Math.max(0, this.worldH - CANVAS_H));
    this.camX += (cx - this.camX) * 0.12;
    this.camY += (cy - this.camY) * 0.12;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private cell(col: number, row: number): string {
    if (row < 0 || row >= this.grid.length) return "#";
    const line = this.grid[row];
    if (col < 0 || col >= line.length) return "#";
    return line[col];
  }
  private setCell(col: number, row: number, ch: string) {
    if (row < 0 || row >= this.grid.length) return;
    const line = this.grid[row];
    if (col < 0 || col >= line.length) return;
    this.grid[row] = line.slice(0, col) + ch + line.slice(col + 1);
  }
  private padRect(r: Rect, p: number): Rect {
    return { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 };
  }

  // ── Scene interface ─────────────────────────────────────────────────────────
  getActiveDialogue(): DialogueData | null {
    if (!this.activeDialogue) return null;
    const line = this.activeDialogue.lines[this.dialogueLine];
    if (!line) return null;
    return { id: this.activeDialogue.id, lines: [line] };
  }
  getPromptText(): string | null {
    if (this.activeDialogue || this.fadeDir !== 0) return null;
    return this.prompt;
  }
  getAreaLabel(): string {
    return this.room?.name ?? "The Lobby";
  }

  // ── Render ────────────────────────────────────────────────────────────────
  render(ctx: CanvasRenderingContext2D) {
    const w = CANVAS_W;
    const h = CANVAS_H;
    drawBackdrop(ctx, this.camX, this.camY, w, h, this.room.theme, this.time);
    drawTiles(ctx, this.grid, this.camX, this.camY, this.room.theme, this.time, this.crumbleStateForRender());

    // doors (behind entities)
    for (const d of this.room.doors) {
      if (d.to === this.roomId) continue;
      const lock = this.doorLock(d.id);
      const state: "open" | "locked" | "key" | "ability" | "toll" = lock.locked
        ? d.lockedByKey
          ? "key"
          : d.lockedByAbility
            ? "ability"
            : "locked"
        : d.lockedByKey
          ? "key"
          : "open";
      drawDoor(ctx, d.col * TILE_SIZE - this.camX, d.row * TILE_SIZE - this.camY, state, this.time);
    }

    this.renderEntities(ctx);

    // npcs
    for (const n of this.npcs) drawNpc(ctx, n.cx - this.camX, n.footY - this.camY, n.id, n.t, n.facing);

    this.player.render(ctx, this.camX, this.camY);

    this.particles.render(ctx, this.camX, this.camY);

    // local fade overlay (room change / death)
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(4,3,6,${this.fade})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private crumbleStateForRender(): Map<string, number> {
    const m = new Map<string, number>();
    for (const [k, st] of this.crumble) if (st.phase === "shake") m.set(k, st.t);
    return m;
  }

  private renderEntities(ctx: CanvasRenderingContext2D) {
    for (const e of this.ents) {
      const sx = e.rect.x - this.camX;
      const sy = e.rect.y - this.camY;
      switch (e.spec.kind) {
        case "chip":
          if (!e.taken) drawChip(ctx, sx, sy, this.time);
          break;
        case "key":
          if (!e.taken) {
            drawKey(ctx, sx, sy, this.time);
            if (this.isCaged(e)) this.drawCage(ctx, sx, sy);
          }
          break;
        case "ability":
          if (!e.taken && e.spec.ability) drawAbilityRelic(ctx, sx, sy, this.time, e.spec.ability);
          break;
        case "lever":
          drawLever(ctx, sx, sy, e.on);
          break;
        case "plate":
          drawPlate(ctx, sx, sy, e.pressed, e.lit);
          break;
        case "mover":
          drawMover(ctx, sx, sy, e.spec.length ?? 3, this.time);
          break;
        case "laser": {
          const len = (e.spec.length ?? 3) * TILE_SIZE;
          const bx = e.spec.col * TILE_SIZE + TILE_SIZE / 2 - this.camX;
          const by = e.spec.row * TILE_SIZE + TILE_SIZE / 2 - this.camY;
          drawLaser(ctx, bx, by, len, !!e.spec.vertical, e.on, this.time);
          break;
        }
        case "camera":
          this.drawCamera(ctx, e);
          break;
        case "save":
          drawSave(ctx, sx, sy, this.time, true);
          break;
        case "sign":
          drawSign(ctx, sx, sy);
          break;
        case "slotReel":
          drawSlotReel(ctx, sx, e.rect.y + TILE_SIZE - this.camY, e.sym, false, this.time);
          break;
        case "vaultCore":
          drawVaultCore(ctx, sx, sy, this.time, this.engine.store.getKeys(), 3, this.engine.store.getKeys() >= 3);
          break;
        case "pokerTable":
          drawPokerTable(ctx, sx, sy, this.time);
          break;
      }
    }
  }

  private drawCage(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
    ctx.strokeStyle = "#6b6155";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.round(sx + 2 + i * 3) + 0.5, sy - 2);
      ctx.lineTo(Math.round(sx + 2 + i * 3) + 0.5, sy + 16);
      ctx.stroke();
    }
  }

  private drawCamera(ctx: CanvasRenderingContext2D, e: REnt) {
    const sx = e.spec.col * TILE_SIZE - this.camX;
    const sy = e.spec.row * TILE_SIZE - this.camY;
    // mount
    ctx.fillStyle = "#2a3038";
    ctx.fillRect(Math.round(sx + 4), Math.round(sy + 2), 8, 5);
    ctx.fillStyle = "#ff5a5a";
    ctx.fillRect(Math.round(sx + 5), Math.round(sy + 7), 2, 2);
    // cone
    const cone = this.cameraCone(e);
    ctx.fillStyle = "rgba(255,90,90,0.10)";
    ctx.beginPath();
    ctx.moveTo(cone[0] - this.camX, cone[1] - this.camY);
    ctx.lineTo(cone[2] - this.camX, cone[3] - this.camY);
    ctx.lineTo(cone[4] - this.camX, cone[5] - this.camY);
    ctx.closePath();
    ctx.fill();
  }
}

// ── module-local helpers ──────────────────────────────────────────────────────
function npcName(id: NpcId): string {
  switch (id) {
    case "dealer": return "the Dealer";
    case "janitor": return "Marlow";
    case "witch": return "Vesper";
    case "guard": return "Chief Doss";
    case "house": return "The House";
  }
}

function pointInTri(
  px: number,
  py: number,
  t: [number, number, number, number, number, number]
): boolean {
  const [ax, ay, bx, by, cx, cy] = t;
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function sign(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

const SIGN_TEXT: Record<string, string> = {
  lobbySign: "MIRAGE ROYALE — Members Only. Management is not responsible for souls left at the tables.",
  pokerSign: "POKER HALL. House rules: the house always wins. Plaque below worn smooth by a thousand hands.",
  slotSign: "SLOT VAULT. 'Loosest machines on the strip!' Someone has scratched out 'loosest' and written 'hungriest'.",
  secSign: "SECURITY WING — AUTHORIZED ONLY. Beyond this point, the cameras keep your debts.",
};
