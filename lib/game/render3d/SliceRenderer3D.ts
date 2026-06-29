// lib/game/render3d/SliceRenderer3D.ts
import * as THREE from 'three';
import type { GameEngine } from '@/lib/game/GameEngine';
import { BG_COLOR } from './palette';
import { NoteField, type FieldCtx } from './NoteField';
import { useGameStore } from '@/lib/store/useGameStore';
import { PostFX } from './PostFX';
import { EffectsLayer } from './EffectsLayer';
import { Environment } from './Environment';
import { AudioManager } from '@/lib/audio/AudioManager';

export class SliceRenderer3D {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private noteField: NoteField;
  private postfx!: PostFX;
  private fx!: EffectsLayer;
  private env!: Environment;
  private lastT = 0;
  private camBase = new THREE.Vector3();
  private reducedFx = false;
  public isMobileV = false;

  constructor(canvas: HTMLCanvasElement) {
    // Throws on failure; GameCanvas catches and shows a fallback message.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);
    this.scene.fog = new THREE.FogExp2(BG_COLOR, 0.012);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

    // Base lighting (Environment task adds reactive lights later).
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambient);

    this.noteField = new NoteField(this.scene);
    this.fx = new EffectsLayer(this.scene);
    this.env = new Environment(this.scene);
  }

  setReducedFx(reduced: boolean): void {
    this.reducedFx = reduced;
    this.postfx?.setReducedFx(reduced);
  }

  /**
   * Position/aim the camera to frame the field. Desktop: look down the −X scroll
   * axis from a tilted vantage. Mobile-vertical: rotate the framing 90° so the
   * scroll axis reads top→bottom on screen.
   */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.isMobileV = cssHeight > cssWidth;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.camera.aspect = cssWidth / cssHeight;

    if (this.isMobileV) {
      // Field scroll axis (world X) is shown vertically: roll the camera 90°.
      this.camera.position.set(0, 2.5, 9);
      this.camera.up.set(1, 0, 0);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.camera.position.set(6, 3.2, 9);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(0, 0, 0);
    }
    this.camBase.copy(this.camera.position);
    this.camera.updateProjectionMatrix();

    const w = Math.floor(cssWidth * Math.min(dpr, 2));
    const h = Math.floor(cssHeight * Math.min(dpr, 2));
    if (!this.postfx) this.postfx = new PostFX(this.renderer, this.scene, this.camera, w, h);
    else this.postfx.resize(w, h);
    this.postfx.setReducedFx(this.reducedFx);
  }

  renderFrame(engine: GameEngine, audioTime: number): void {
    const mods = useGameStore.getState().modifiers;
    const ctx: FieldCtx = {
      isMobileV: this.isMobileV,
      speedMod: mods.speed || 1,
      oneTrack: mods.oneTrack,
      invisible: mods.invisible,
      reducedFx: this.reducedFx,
    };

    const now = performance.now() / 1000;
    const dt = this.lastT ? now - this.lastT : 0.016;
    this.lastT = now;

    this.noteField.update(engine, audioTime, ctx);
    this.fx.consume(engine, ctx, audioTime);
    this.fx.update(dt);
    const energy = AudioManager.getInstance().getBeatEnergy();
    this.env.update(dt, energy);

    // Apply decaying screen shake around the framed base position.
    const s = this.fx.getShake() * (this.reducedFx ? 0 : 0.25);
    this.camera.position.set(
      this.camBase.x + (Math.random() - 0.5) * s,
      this.camBase.y + (Math.random() - 0.5) * s,
      this.camBase.z + (Math.random() - 0.5) * s,
    );

    this.postfx.render();
  }

  dispose(): void {
    this.noteField.dispose();
    this.fx.dispose();
    this.env.dispose();
    this.postfx?.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    this.renderer.dispose();
  }
}
