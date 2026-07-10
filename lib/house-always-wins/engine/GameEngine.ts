import { CANVAS_W, CANVAS_H, RENDER_SCALE, MAX_DT, COLORS } from "../constants";
import { Input } from "../input";
import { clamp } from "../math";
import type { Scene, SceneSwitch } from "./Scene";
import type { AbilityId, DialogueData, RoomId, QuestState } from "../types";

// Everything the scenes need from the persisted Zustand store.
export interface StoreAccess {
  getDebt: () => number;
  addDebt: (amount: number) => void;
  payDebt: (amount: number) => number;
  getChips: () => number;
  addChips: (n: number) => void;
  spendChips: (n: number) => boolean;
  getKeys: () => number;
  addKey: () => void;
  hasAbility: (id: AbilityId) => boolean;
  grantAbility: (id: AbilityId) => void;
  getFlag: (k: string) => boolean;
  setFlag: (k: string, v: boolean) => void;
  markVisited: (room: RoomId) => void;
  getCheckpoint: () => { room: RoomId; id: string };
  setCheckpoint: (room: RoomId, id: string) => void;
  registerDeath: () => void;
  getQuestState: () => QuestState;
}

export type Toast = { text: string; color?: string };

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scenes: Map<string, Scene> = new Map();
  private currentScene: Scene | null = null;
  private running = false;
  private lastTime = 0;
  private rafId = 0;

  private fadeAlpha = 0;
  private fading: "in" | "out" | null = null;
  private fadeDuration = 0.4;
  private fadeTimer = 0;
  private pendingSwitch: SceneSwitch | null = null;

  private vignetteCanvas: HTMLCanvasElement | null = null;
  private lastVignetteBucket = -1;

  store: StoreAccess;
  onDialogueChange: (d: DialogueData | null) => void = () => {};
  onPromptChange: (t: string | null) => void = () => {};
  onAreaLabelChange: (l: string) => void = () => {};
  onMusicChange: (key: string) => void = () => {};
  onToast: (t: Toast) => void = () => {};
  onHudChange: () => void = () => {};
  onEnding: (id: string) => void = () => {};
  onOpenPoker: () => void = () => {};

  private paused = false;

  constructor(canvas: HTMLCanvasElement, store: StoreAccess) {
    this.canvas = canvas;
    this.store = store;
    canvas.width = CANVAS_W * RENDER_SCALE;
    canvas.height = CANVAS_H * RENDER_SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  registerScene(name: string, scene: Scene) {
    this.scenes.set(name, scene);
  }
  getScene(name: string): Scene | undefined {
    return this.scenes.get(name);
  }
  getCurrentScene(): Scene | null {
    return this.currentScene;
  }

  toast(text: string, color?: string) {
    this.onToast({ text, color });
  }

  setPaused(v: boolean) {
    this.paused = v;
    if (v) Input.clearHeld();
  }
  isPaused() {
    return this.paused;
  }
  openPoker() {
    this.onOpenPoker();
  }

  private switchScene(name: string) {
    const scene = this.scenes.get(name);
    if (!scene) return;
    this.currentScene = scene;
    scene.enter();
    this.onAreaLabelChange(scene.getAreaLabel());
    this.onMusicChange(name === "world" ? "lobby" : name);
  }

  start(initial: string) {
    Input.init();
    this.running = true;
    this.switchScene(initial);
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    Input.destroy();
  }

  // Called by scenes to play music for the current room.
  playMusic(key: string) {
    this.onMusicChange(key);
  }

  setArea(label: string) {
    this.onAreaLabelChange(label);
  }

  private loop = () => {
    if (!this.running) return;
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, MAX_DT);
    this.update(dt);
    this.render();
    Input.endFrame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    if (this.paused) return; // a React overlay (poker/menu) owns the screen

    if (this.fading) {
      this.fadeTimer += dt;
      const t = clamp(this.fadeTimer / this.fadeDuration, 0, 1);
      if (this.fading === "out") {
        this.fadeAlpha = t;
        if (t >= 1) {
          this.fading = "in";
          this.fadeTimer = 0;
          if (this.pendingSwitch) {
            this.switchScene(this.pendingSwitch.to);
            this.pendingSwitch = null;
          }
        }
      } else {
        this.fadeAlpha = 1 - t;
        if (t >= 1) {
          this.fading = null;
          this.fadeAlpha = 0;
        }
      }
      return;
    }

    if (!this.currentScene) return;
    const sw = this.currentScene.update(dt);
    this.onDialogueChange(this.currentScene.getActiveDialogue());
    this.onPromptChange(this.currentScene.getPromptText());
    if (sw) {
      this.pendingSwitch = sw;
      this.fading = "out";
      this.fadeTimer = 0;
    }
  }

  private getVignette(w: number, h: number, intensity: number): HTMLCanvasElement {
    const bucket = Math.round(intensity * 24);
    if (this.vignetteCanvas && this.lastVignetteBucket === bucket) return this.vignetteCanvas;
    if (!this.vignetteCanvas) {
      this.vignetteCanvas = document.createElement("canvas");
      this.vignetteCanvas.width = w;
      this.vignetteCanvas.height = h;
    }
    const vc = this.vignetteCanvas.getContext("2d")!;
    vc.clearRect(0, 0, w, h);
    const grad = vc.createRadialGradient(w / 2, h / 2, w * 0.26, w / 2, h / 2, w * 0.68);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(1, `rgba(70, 8, 12, ${intensity})`);
    vc.fillStyle = grad;
    vc.fillRect(0, 0, w, h);
    this.lastVignetteBucket = bucket;
    return this.vignetteCanvas;
  }

  private render() {
    const ctx = this.ctx;
    const w = CANVAS_W * RENDER_SCALE;
    const h = CANVAS_H * RENDER_SCALE;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    if (this.currentScene) this.currentScene.render(ctx);
    ctx.restore();

    const debt = this.store.getDebt();
    if (debt > 0) {
      const intensity = clamp(debt / 120, 0, 0.7);
      ctx.drawImage(this.getVignette(w, h, intensity), 0, 0);
      // debt-driven flicker as corruption mounts
      if (debt > 60 && Math.random() < (debt - 60) / 800) {
        ctx.fillStyle = `rgba(120, 10, 14, ${0.04 + Math.random() * 0.05})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    if (this.fadeAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
