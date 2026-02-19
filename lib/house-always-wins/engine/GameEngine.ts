import { CANVAS_W, CANVAS_H, RENDER_SCALE, MAX_DT, COLORS } from "../constants";
import { Input } from "../input";
import { clamp } from "../math";
import type { Scene } from "./Scene";
import type { SceneName, SceneTransition, DialogueData } from "../types";

export type StoreAccess = {
  getDebt: () => number;
  addDebt: (amount: number) => void;
  getFlags: () => Record<string, boolean>;
  setFlag: (key: string, value: boolean) => void;
};

export type DialogueCallback = (dialogue: DialogueData | null) => void;
export type PromptCallback = (text: string | null) => void;
export type AreaLabelCallback = (label: string) => void;
export type MusicCallback = (sceneName: string) => void;

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scenes: Map<SceneName, Scene> = new Map();
  private currentScene: Scene | null = null;
  private running = false;
  private lastTime = 0;
  private rafId = 0;
  private fadeAlpha = 0;
  private fading: "in" | "out" | null = null;
  private fadeDuration = 0.35;
  private fadeTimer = 0;
  private pendingTransition: SceneTransition | null = null;
  private vignetteCanvas: HTMLCanvasElement | null = null;
  private lastDebtForVignette = -1;

  store: StoreAccess;
  onDialogueChange: DialogueCallback = () => {};
  onPromptChange: PromptCallback = () => {};
  onAreaLabelChange: AreaLabelCallback = () => {};
  onMusicChange: MusicCallback = () => {};

  constructor(canvas: HTMLCanvasElement, store: StoreAccess) {
    this.canvas = canvas;
    this.store = store;

    // Use CSS scaling only — no DPR buffer multiplication
    canvas.width = CANVAS_W * RENDER_SCALE;
    canvas.height = CANVAS_H * RENDER_SCALE;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  registerScene(name: SceneName, scene: Scene) {
    this.scenes.set(name, scene);
  }

  getScene(name: SceneName): Scene | undefined {
    return this.scenes.get(name);
  }

  getCurrentScene(): Scene | null {
    return this.currentScene;
  }

  switchScene(name: SceneName, payload?: Record<string, unknown>) {
    const scene = this.scenes.get(name);
    if (!scene) return;
    this.currentScene = scene;
    scene.enter(payload);
    this.onAreaLabelChange(scene.getAreaLabel());
    this.onMusicChange(name);
  }

  start(initialScene: SceneName) {
    Input.init();
    this.running = true;
    this.switchScene(initialScene);
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    Input.destroy();
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
    if (this.fading) {
      this.fadeTimer += dt;
      const t = clamp(this.fadeTimer / this.fadeDuration, 0, 1);

      if (this.fading === "out") {
        this.fadeAlpha = t;
        if (t >= 1) {
          this.fading = "in";
          this.fadeTimer = 0;
          if (this.pendingTransition) {
            this.switchScene(
              this.pendingTransition.to,
              this.pendingTransition.payload as Record<string, unknown> | undefined
            );
            this.pendingTransition = null;
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

    const transition = this.currentScene.update(dt);

    const dialogue = this.currentScene.getActiveDialogue();
    this.onDialogueChange(dialogue);

    const prompt = this.currentScene.getPromptText();
    this.onPromptChange(prompt);

    if (transition) {
      this.pendingTransition = transition;
      this.fading = "out";
      this.fadeTimer = 0;
    }
  }

  private getVignetteOverlay(w: number, h: number, intensity: number): HTMLCanvasElement {
    const bucket = Math.round(intensity * 20);
    if (this.vignetteCanvas && this.lastDebtForVignette === bucket) {
      return this.vignetteCanvas;
    }
    if (!this.vignetteCanvas) {
      this.vignetteCanvas = document.createElement("canvas");
      this.vignetteCanvas.width = w;
      this.vignetteCanvas.height = h;
    }
    const vc = this.vignetteCanvas.getContext("2d")!;
    vc.clearRect(0, 0, w, h);
    const grad = vc.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w * 0.65);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(1, `rgba(80, 10, 10, ${intensity})`);
    vc.fillStyle = grad;
    vc.fillRect(0, 0, w, h);
    this.lastDebtForVignette = bucket;
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
    if (this.currentScene) {
      this.currentScene.render(ctx);
    }
    ctx.restore();

    // Cached debt vignette
    const debt = this.store.getDebt();
    if (debt > 0) {
      const intensity = clamp(debt / 100, 0, 0.6);
      const overlay = this.getVignetteOverlay(w, h, intensity);
      ctx.drawImage(overlay, 0, 0);
    }

    // Fade overlay
    if (this.fadeAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
