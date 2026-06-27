import * as THREE from 'three';
import type { ClothingType } from './types';
import { COLOR_HEX, FIELD_HEIGHT, FIELD_WIDTH, BIN_Y, BIN_HEIGHT } from './constants';
import type { LaundryEngine } from './engine';

/**
 * LaundryRenderer — imperative Three.js view, driven each frame by the engine.
 *
 * Design goals, in priority order:
 *  1. Cozy pixelated-3D look — voxel clothes with flat shading, warm laundromat
 *     lighting, and a deliberately low-resolution draw buffer upscaled with
 *     nearest-neighbour for crunchy pixels (this is also the main perf win on
 *     mobile: we shade a fraction of the pixels).
 *  2. Cheap at scale — one InstancedMesh per clothing type (4 draw calls for all
 *     laundry), instanced bubbles, instanced flame quads. No per-item meshes,
 *     no per-frame allocation.
 *  3. Juicy — osu-style camera "punch" on big sorts, flames that grow with the
 *     streak heat, gentle cozy bobbing on every item.
 */

const WORLD_SCALE = 40; // world units → three units
const MAX_ITEMS = 220;
const MAX_BUBBLES = 60;
const MAX_FLAMES = 90;

/** Lower = chunkier pixels + cheaper. Clamped per-device in resize(). */
const PIXEL_SCALE = 2.7;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _color = new THREE.Color();
const _proj = new THREE.Vector3();

function worldToSceneX(wx: number): number {
  return (wx - FIELD_WIDTH / 2) / WORLD_SCALE;
}
function worldToSceneY(wy: number): number {
  return (FIELD_HEIGHT / 2 - wy) / WORLD_SCALE;
}

/** Merge a set of boxes into a single non-indexed geometry (cheap voxel mesh). */
function mergeBoxes(boxes: { w: number; h: number; d: number; x?: number; y?: number; z?: number }[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    g.translate(b.x ?? 0, b.y ?? 0, b.z ?? 0);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

/** Blocky clothing silhouettes, sized roughly to a unit so per-item scale works. */
function clothingGeometry(type: ClothingType): THREE.BufferGeometry {
  switch (type) {
    case 'shirt':
      return mergeBoxes([
        { w: 1.0, h: 1.1, d: 0.34 }, // body
        { w: 0.34, h: 0.5, d: 0.3, x: -0.62, y: 0.25 }, // left sleeve
        { w: 0.34, h: 0.5, d: 0.3, x: 0.62, y: 0.25 }, // right sleeve
        { w: 0.4, h: 0.18, d: 0.36, y: 0.62 }, // collar
      ]);
    case 'pants':
      return mergeBoxes([
        { w: 1.0, h: 0.32, d: 0.34, y: 0.6 }, // waist
        { w: 0.44, h: 1.0, d: 0.32, x: -0.26, y: -0.05 }, // left leg
        { w: 0.44, h: 1.0, d: 0.32, x: 0.26, y: -0.05 }, // right leg
      ]);
    case 'sock':
      return mergeBoxes([
        { w: 0.5, h: 1.0, d: 0.34 },
        { w: 0.7, h: 0.34, d: 0.34, x: 0.2, y: -0.5 }, // foot
      ]);
    case 'towel':
    default:
      return mergeBoxes([{ w: 1.3, h: 0.9, d: 0.22 }]);
  }
}

export class LaundryRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private instByType = new Map<ClothingType, THREE.InstancedMesh>();
  private bins: THREE.Mesh[] = [];
  private bubbles!: THREE.InstancedMesh;
  private bubbleState: { x: number; y: number; s: number; v: number }[] = [];
  private flames!: THREE.InstancedMesh;
  private flameState: { x: number; y: number; life: number; max: number; s: number }[] = [];

  private cssW = 800;
  private cssH = 600;

  private punchAmt = 0;
  private shake = 0;
  private heat = 0;
  private time = 0;
  private baseFov = 40;
  private reducedMotion = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.reducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x141026, 1);
    canvas.style.imageRendering = 'pixelated';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1a1330, 18, 34);

    this.camera = new THREE.PerspectiveCamera(this.baseFov, this.cssW / this.cssH, 0.1, 100);
    this.camera.position.set(0, 1.4, 17.5);
    this.camera.lookAt(0, -0.6, 0);

    this.buildLights();
    this.buildBackdrop();
    this.buildBins();
    this.buildClothing();
    this.buildBubbles();
    this.buildFlames();
  }

  // ── Scene construction ──────────────────────────────────────────────────────
  private buildLights(): void {
    // Warm cozy hemisphere + a soft key light + a laundromat glow from below.
    const hemi = new THREE.HemisphereLight(0xfff1d6, 0x3a2d5c, 1.05);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe9c2, 1.15);
    key.position.set(-6, 10, 8);
    this.scene.add(key);
    const warmGlow = new THREE.PointLight(0xffa260, 0.9, 40, 1.6);
    warmGlow.position.set(0, -4, 6);
    this.scene.add(warmGlow);
    const rim = new THREE.PointLight(0x6ad0ff, 0.5, 50, 1.6);
    rim.position.set(8, 6, -6);
    this.scene.add(rim);
  }

  private buildBackdrop(): void {
    // Soft vertical gradient wall — warm dusk laundromat.
    const geo = new THREE.PlaneGeometry(60, 40);
    const mat = new THREE.ShaderMaterial({
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x2a1f47) }, bot: { value: new THREE.Color(0x4a2f52) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying vec2 vUv; uniform vec3 top; uniform vec3 bot; void main(){ gl_FragColor=vec4(mix(bot,top,vUv.y),1.0);} `,
    });
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(0, 0, -10);
    this.scene.add(wall);

    // Cozy wooden floor strip under the hampers.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 14),
      new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2.2;
    floor.position.set(0, -6.2, -2);
    this.scene.add(floor);
  }

  private buildBins(): void {
    // Built lazily in syncBins() once we know the engine's bin layout, but we
    // pre-create the shared geometry/material here.
  }

  private buildClothing(): void {
    const types: ClothingType[] = ['shirt', 'pants', 'sock', 'towel'];
    for (const t of types) {
      const geo = clothingGeometry(t);
      const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, metalness: 0.0 });
      const inst = new THREE.InstancedMesh(geo, mat, MAX_ITEMS);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.count = 0;
      inst.frustumCulled = false;
      this.scene.add(inst);
      this.instByType.set(t, inst);
    }
  }

  private buildBubbles(): void {
    const geo = new THREE.SphereGeometry(0.12, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xbfeaff,
      transparent: true,
      opacity: 0.32,
      roughness: 0.1,
      emissive: 0x224455,
    });
    this.bubbles = new THREE.InstancedMesh(geo, mat, MAX_BUBBLES);
    this.bubbles.frustumCulled = false;
    for (let i = 0; i < MAX_BUBBLES; i++) {
      this.bubbleState.push({
        x: (Math.random() - 0.5) * 18,
        y: (Math.random() - 0.5) * 12,
        s: 0.4 + Math.random() * 1.4,
        v: 0.4 + Math.random() * 0.8,
      });
    }
    this.scene.add(this.bubbles);
  }

  private buildFlames(): void {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff7a1a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.flames = new THREE.InstancedMesh(geo, mat, MAX_FLAMES);
    this.flames.frustumCulled = false;
    this.flames.count = 0;
    for (let i = 0; i < MAX_FLAMES; i++) this.flameState.push({ x: 0, y: 0, life: 0, max: 1, s: 1 });
    this.scene.add(this.flames);
  }

  private syncBins(engine: LaundryEngine): void {
    if (this.bins.length === engine.bins.length) return;
    for (const b of this.bins) {
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
      this.scene.remove(b);
    }
    this.bins = [];
    const binSceneH = BIN_HEIGHT / WORLD_SCALE;
    for (const bin of engine.bins) {
      const w = (bin.width - 8) / WORLD_SCALE;
      const geo = new THREE.BoxGeometry(w, binSceneH, 1.6);
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR_HEX[bin.color],
        roughness: 0.6,
        flatShading: true,
        emissive: COLOR_HEX[bin.color],
        emissiveIntensity: 0.18,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(worldToSceneX(bin.x), worldToSceneY(BIN_Y), 0.2);
      this.scene.add(mesh);
      this.bins.push(mesh);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  resize(cssW: number, cssH: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    // Coarser pixels (cheaper) on small / high-DPR screens.
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const scale = this.cssW < 640 ? PIXEL_SCALE + 0.5 : PIXEL_SCALE;
    this.renderer.setPixelRatio(Math.max(0.25, dpr / scale));
    this.renderer.setSize(this.cssW, this.cssH, true);
    this.canvas.style.imageRendering = 'pixelated';
    this.camera.aspect = this.cssW / this.cssH;
    // Keep the field framed on tall mobile screens by widening the FOV.
    this.baseFov = this.cssW / this.cssH < 0.9 ? 54 : 40;
    this.camera.updateProjectionMatrix();
  }

  /** osu-style hit punch — quick zoom-in + tiny shake, scaled by strength. */
  punch(strength = 1): void {
    if (this.reducedMotion) return;
    this.punchAmt = Math.min(1.6, this.punchAmt + strength);
    this.shake = Math.min(1.2, this.shake + strength * 0.4);
  }

  /** Spawn a burst of flame quads at a hot sort, intensity from heat. */
  igniteAt(wx: number, wy: number, heat: number): void {
    if (this.reducedMotion) return;
    const n = 3 + Math.floor(heat * 8);
    for (let i = 0; i < n; i++) {
      const slot = this.flameState.find((f) => f.life <= 0);
      if (!slot) break;
      slot.x = worldToSceneX(wx) + (Math.random() - 0.5) * 0.8;
      slot.y = worldToSceneY(wy) + (Math.random() - 0.5) * 0.5;
      slot.max = 0.45 + Math.random() * 0.4;
      slot.life = slot.max;
      slot.s = 0.6 + heat * 1.4 + Math.random() * 0.5;
    }
  }

  /** Inverse of the camera projection onto the z=0 play plane → world units. */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    _v.set(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = _v.sub(this.camera.position).normalize();
    const t = -this.camera.position.z / dir.z; // intersect plane z = 0
    const sceneX = this.camera.position.x + dir.x * t;
    const sceneY = this.camera.position.y + dir.y * t;
    return {
      x: sceneX * WORLD_SCALE + FIELD_WIDTH / 2,
      y: FIELD_HEIGHT / 2 - sceneY * WORLD_SCALE,
    };
  }

  /** Project a world-space point to CSS pixel coords for DOM popups. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    _proj.set(worldToSceneX(wx), worldToSceneY(wy), 0).project(this.camera);
    return {
      x: (_proj.x * 0.5 + 0.5) * this.cssW,
      y: (-_proj.y * 0.5 + 0.5) * this.cssH,
    };
  }

  render(engine: LaundryEngine, dt: number): void {
    this.time += dt;
    this.syncBins(engine);

    // Decay juice.
    this.punchAmt *= Math.pow(0.0009, dt);
    this.shake *= Math.pow(0.0001, dt);
    this.heat += (engine.heat - this.heat) * Math.min(1, dt * 6);

    // Camera punch + cozy idle drift + shake.
    const fov = this.baseFov - this.punchAmt * 4.5;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const sx = this.reducedMotion ? 0 : Math.sin(this.time * 1.3) * 0.05 + (Math.random() - 0.5) * this.shake * 0.25;
    const sy = this.reducedMotion ? 0 : Math.cos(this.time * 1.1) * 0.04 + (Math.random() - 0.5) * this.shake * 0.25;
    this.camera.position.x = sx;
    this.camera.position.y = 1.4 + sy;
    this.camera.lookAt(0, -0.6, 0);

    // Bin glow swells with heat.
    for (const b of this.bins) {
      const mat = b.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.18 + this.heat * 0.5 + Math.sin(this.time * 8) * this.heat * 0.1;
    }

    this.syncClothing(engine);
    this.updateBubbles(dt);
    this.updateFlames(dt, engine);

    this.renderer.render(this.scene, this.camera);
  }

  // ── Per-frame syncs ─────────────────────────────────────────────────────────
  private syncClothing(engine: LaundryEngine): void {
    const counts = new Map<ClothingType, number>();
    for (const inst of this.instByType.values()) inst.count = 0;

    for (const it of engine.items) {
      const inst = this.instByType.get(it.type);
      if (!inst) continue;
      const idx = counts.get(it.type) ?? 0;
      if (idx >= MAX_ITEMS) continue;

      const bob = this.reducedMotion ? 0 : Math.sin(it.wobble) * 0.06;
      const pop = it.appear * it.appear * (3 - 2 * it.appear); // smoothstep pop-in
      const s = (it.size / WORLD_SCALE) * 1.9 * pop;
      _e.set(bob, it.rotation, it.rotation * 0.3 + bob);
      _q.setFromEuler(_e);
      _v.set(worldToSceneX(it.x), worldToSceneY(it.y), 0);
      _m.compose(_v, _q, new THREE.Vector3(s, s, s));
      inst.setMatrixAt(idx, _m);
      _color.setHex(COLOR_HEX[it.color]);
      inst.setColorAt(idx, _color);
      counts.set(it.type, idx + 1);
    }

    for (const [type, inst] of this.instByType) {
      inst.count = counts.get(type) ?? 0;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  }

  private updateBubbles(dt: number): void {
    for (let i = 0; i < this.bubbleState.length; i++) {
      const b = this.bubbleState[i];
      b.y += b.v * dt;
      b.x += Math.sin((this.time + i) * 0.8) * 0.15 * dt;
      if (b.y > 7) {
        b.y = -7;
        b.x = (Math.random() - 0.5) * 18;
      }
      _v.set(b.x, b.y, -3 - (i % 4));
      _q.identity();
      _m.compose(_v, _q, new THREE.Vector3(b.s, b.s, b.s));
      this.bubbles.setMatrixAt(i, _m);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  private updateFlames(dt: number, engine: LaundryEngine): void {
    // Continuously feed gentle flames from the hottest hampers while on a streak.
    if (!this.reducedMotion && engine.heat > 0.2 && Math.random() < engine.heat) {
      const bin = engine.bins[Math.floor(Math.random() * engine.bins.length)];
      this.igniteAt(bin.x, BIN_Y - BIN_HEIGHT, engine.heat);
    }

    let count = 0;
    for (const f of this.flameState) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.y += dt * 2.2;
      const k = Math.max(0, f.life / f.max);
      const size = f.s * (0.4 + k * 0.8);
      _v.set(f.x, f.y, 0.4);
      _q.identity();
      _m.compose(_v, _q, new THREE.Vector3(size, size * 1.6, size));
      this.flames.setMatrixAt(count, _m);
      // Hot core (yellow) → cool edge (red) as it dies.
      _color.setHSL(0.05 + k * 0.08, 1, 0.45 + k * 0.2);
      this.flames.setColorAt(count, _color);
      count++;
      if (count >= MAX_FLAMES) break;
    }
    this.flames.count = count;
    this.flames.instanceMatrix.needsUpdate = true;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
  }

  dispose(): void {
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
