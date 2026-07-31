/**
 * renderer3d.ts — the three.js renderer for Neon Driftway.
 *
 * Draws the simulation from the driver's seat. The engine is rendering
 * agnostic: it tracks a car at the world origin with obstacles streaming
 * toward it down +Z, all in metres, and this file turns that into a cockpit
 * view.
 *
 * Scene layout:
 *
 *   scene
 *    ├─ sky / stars / sun        never move; fog blends them into the horizon
 *    ├─ road + shoulders         static mesh, textures scroll by `worldZ`
 *    ├─ guardrails, posts, props streamed by slot index so nothing pops
 *    ├─ obstacles                one InstancedMesh per visual kind
 *    ├─ particles, rain, streaks
 *    ├─ ghosts                   other players in multiplayer
 *    └─ carRig                   follows the car's lateral position + attitude
 *        ├─ cockpit              hood, dash, wheel, pillars, doors, roof
 *        ├─ headlights
 *        └─ camera               head look applied here, inside the car
 *
 * Framing is resolution independent. The projection keeps a constant vertical
 * FOV on landscape displays and widens it on portrait ones so a phone held
 * upright still sees the road either side of the bonnet, and render scale
 * adapts to whatever frame budget the device actually has.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import type { NeonDriftwayEngine } from './game';
import type { GyroSample } from './gyro';
import { LookController, yawOf } from './camera';
import type { LevelConfig } from './types';
import {
  CAR_LENGTH, CAR_WIDTH, EYE_HEIGHT, EYE_X, EYE_Z,
  LANE_WIDTH, SHOULDER_WIDTH, GUARDRAIL_HEIGHT,
  MAX_OBSTACLES, MAX_PARTICLES, METRES_PER_DISTANCE,
  MPS_PER_UNIT, V_MAX_BOOST, V_MAX_NORMAL, BOOST_MAX,
  STEER_MAX_LATERAL, roadHalf,
} from './constants';

// ── Framing ─────────────────────────────────────────────────────────────────

/** Vertical FOV held constant on landscape displays. */
const BASE_VFOV = 62;
/** Slightly wider per eye in a viewer, where each eye only sees half the panel. */
const STEREO_VFOV = 74;
/** Portrait displays widen the vertical FOV until this much road is visible. */
const MIN_HFOV = 70;
const VFOV_LIMITS = { min: 38, max: 104 };
const NEAR = 0.06;
const FAR = 4200;
/** Interpupillary distance in metres — the world is at 1:1 scale. */
const IPD = 0.064;
/** Spot intensity in candela; `decay: 1.4` over ~100m of useful throw. */
const HEADLIGHT_INTENSITY = 420;

// ── World dressing ──────────────────────────────────────────────────────────

/** Length of the road mesh. Fog hides the far end well before this. */
const ROAD_LENGTH = 1440;
/** How much road is kept behind the driver (for mirrors and looking back). */
const ROAD_BEHIND = 220;
/** One tile of the road texture, in metres. Must divide ROAD_LENGTH. */
const ROAD_TILE = 24;

const POST_SPACING = 12;
const LAMP_SPACING = 44;
const BUILDING_SPACING = 34;
const ARCH_SPACING = 95;
/** How far ahead streamed props are placed; beyond this the fog has them. */
const PROP_DISTANCE = 620;
const PROP_BEHIND = 80;

const RAIN_COUNT = 900;
const STREAK_COUNT = 110;
const STAR_COUNT = 900;
const MAX_GHOSTS = 8;

// ── Adaptive quality ────────────────────────────────────────────────────────

const RENDER_SCALES = [0.55, 0.7, 0.85, 1];
/** Frame time above this for a sustained run means we are over budget. */
const SLOW_FRAME_MS = 23;
const FAST_FRAME_MS = 13.5;

const dummy = new THREE.Object3D();
const scratchColor = new THREE.Color();
const camWorldPos = new THREE.Vector3();
const camWorldQuat = new THREE.Quaternion();
const eyeRight = new THREE.Vector3();

/** Deterministic 0…1 hash so a road slot always dresses itself the same way. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export interface RendererOptions {
  /** Bloom is the single biggest cost; off by default on weak devices. */
  bloom?: boolean;
  reducedMotion?: boolean;
  /** Upper bound on device pixel ratio. */
  maxPixelRatio?: number;
}

export class NeonDriftwayRenderer3D {
  /** Head look — the component feeds it gyro samples through {@link draw}. */
  readonly look = new LookController();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  /** Free-standing camera used for each eye in stereo; never in the graph. */
  private readonly eyeCamera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private readonly carRig = new THREE.Group();
  private readonly cockpit = new THREE.Group();
  private readonly world = new THREE.Group();
  private readonly ghostGroup = new THREE.Group();

  // Environment
  private sky!: THREE.Mesh;
  private skyUniforms!: {
    topColor: { value: THREE.Color };
    horizonColor: { value: THREE.Color };
    bottomColor: { value: THREE.Color };
  };
  private sun!: THREE.Mesh;
  private stars!: THREE.Points;
  private ground!: THREE.Mesh;
  private road!: THREE.Mesh;
  private roadTexture!: THREE.CanvasTexture;
  /** Markings only, on black — drives the road's emissive channel. */
  private roadGlowTexture!: THREE.CanvasTexture;
  private rails: THREE.Mesh[] = [];
  /** Continuous neon strips down both road edges — the main light of the road. */
  private neonRails: THREE.Mesh[] = [];
  private posts!: THREE.InstancedMesh;
  private lampPoles!: THREE.InstancedMesh;
  private lampHeads!: THREE.InstancedMesh;
  private lampGlows!: THREE.InstancedMesh;
  private buildings!: THREE.InstancedMesh;
  /** Neon arches straddling the road, streamed like the rest of the dressing. */
  private arches!: THREE.InstancedMesh;
  private archesAlt!: THREE.InstancedMesh;

  // Lighting
  private pmrem!: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private hemi!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private headlights: THREE.SpotLight[] = [];
  private impactLight!: THREE.PointLight;

  // Obstacles
  private cones!: THREE.InstancedMesh;
  private barriers!: THREE.InstancedMesh;
  private debris!: THREE.InstancedMesh;
  private vehicleBodies!: THREE.InstancedMesh;
  private vehicleCabins!: THREE.InstancedMesh;
  private vehicleTails!: THREE.InstancedMesh;
  private vehicleSignals!: THREE.InstancedMesh;
  /** Emissive strip under each vehicle, so traffic reads at distance. */
  private vehicleGlows!: THREE.InstancedMesh;
  private slicks!: THREE.InstancedMesh;
  private boostPads!: THREE.InstancedMesh;
  private boostBeams!: THREE.InstancedMesh;
  private orbs!: THREE.InstancedMesh;

  // Effects
  private sparks!: THREE.Points;
  private sparkPositions!: Float32Array;
  private sparkColors!: Float32Array;
  private rain!: THREE.LineSegments;
  private rainPositions!: Float32Array;
  private rainSeeds!: Float32Array;
  private streaks!: THREE.LineSegments;
  private streakPositions!: Float32Array;
  private streakSeeds!: Float32Array;
  private windshield!: THREE.Mesh;

  // Cockpit parts that animate
  private steeringWheel = new THREE.Group();
  private hood!: THREE.Mesh;

  // Ghost cars
  private ghosts: { group: THREE.Group; label: THREE.Sprite; body: THREE.Mesh }[] = [];
  private ghostLabelCache = new Map<string, THREE.Texture>();

  // State
  private level: LevelConfig | null = null;
  private lanes = 5;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private maxPixelRatio: number;
  private stereo = false;
  private reducedMotion: boolean;
  private wantsBloom: boolean;
  private time = 0;
  private lightning = 0;
  private lightningTimer = 6;
  private headBob = 0;
  private disposed = false;
  /** Latest gyro sample handed in by {@link draw}. */
  private pendingGyro: GyroSample | null = null;

  // Adaptive quality
  private scaleIndex = RENDER_SCALES.length - 1;
  private frameAvg = 16;
  private sustained = 0;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.maxPixelRatio = options.maxPixelRatio ?? 2;
    this.reducedMotion = options.reducedMotion ?? false;
    this.wantsBloom = options.bloom ?? true;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x05050c, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.PerspectiveCamera(BASE_VFOV, 1, NEAR, FAR);
    this.camera.position.set(EYE_X, EYE_HEIGHT, EYE_Z);
    this.eyeCamera = new THREE.PerspectiveCamera(BASE_VFOV, 1, NEAR, FAR);

    this.scene.add(this.world);
    this.scene.add(this.ghostGroup);
    this.scene.add(this.carRig);
    this.carRig.add(this.cockpit);
    this.carRig.add(this.camera);

    this.buildLights();
    this.buildEnvironment();
    this.buildObstacles();
    this.buildEffects();
    this.buildCockpit();
    this.buildGhosts();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Re-dress the scene for a level. Cheap enough to call on every run. */
  setLevel(level: LevelConfig): void {
    this.level = level;
    this.lanes = level.lanes;
    const v = level.visuals;

    this.skyUniforms.topColor.value.set(v.skyTop);
    this.skyUniforms.horizonColor.value.set(v.horizon);
    this.skyUniforms.bottomColor.value.set(v.fogColor);

    this.scene.fog = new THREE.Fog(new THREE.Color(v.fogColor).getHex(), v.fogNear, v.fogFar);
    this.renderer.setClearColor(new THREE.Color(v.fogColor).getHex(), 1);

    this.hemi.intensity = v.ambient;
    this.hemi.color.set(v.skyTop);
    this.hemi.groundColor.set(v.roadColor);
    this.keyLight.intensity = v.keyLight;
    this.keyLight.color.set(v.keyColor);

    this.sun.visible = v.sun !== null;
    if (v.sun) {
      (this.sun.material as THREE.MeshBasicMaterial).color.set(v.sun.color);
      this.sun.scale.setScalar(v.sun.size);
      this.sun.position.set(0, v.sun.height * 2600, -2600);
    }
    this.stars.visible = v.stars;

    // Headlights carry levels 2 and 3; level 1 is bright enough without them.
    const wantHeadlights = level.headlightsEnabled || v.rain > 0 || v.ambient < 0.6;
    for (const light of this.headlights) light.visible = wantHeadlights;

    this.rebuildEnvironmentMap();
    this.rebuildRoadTexture();
    this.applyRoadWidth();

    const railMat = this.rails[0].material as THREE.MeshStandardMaterial;
    railMat.color.set(v.guardrailColor);
    (this.posts.material as THREE.MeshStandardMaterial).color.set(v.guardrailColor);
    (this.ground.material as THREE.MeshStandardMaterial).color.set(v.shoulderColor);

    // Neon set: primary down the left edge, secondary down the right, so the
    // two sides of the road are always distinguishable at a glance.
    const neonMul = v.neon;
    (this.neonRails[0].material as THREE.MeshBasicMaterial).color.set(v.accent).multiplyScalar(neonMul);
    (this.neonRails[1].material as THREE.MeshBasicMaterial).color.set(v.accent2).multiplyScalar(neonMul);
    (this.arches.material as THREE.MeshBasicMaterial).color.set(v.accent).multiplyScalar(neonMul);
    (this.archesAlt.material as THREE.MeshBasicMaterial).color.set(v.accent2).multiplyScalar(neonMul);
    (this.lampHeads.material as THREE.MeshBasicMaterial).color.set(v.accent2).multiplyScalar(neonMul * 0.8);
    (this.lampGlows.material as THREE.MeshBasicMaterial).color.set(v.accent2);
    (this.vehicleGlows.material as THREE.MeshBasicMaterial).color.set(v.accent).multiplyScalar(neonMul * 0.7);

    const buildingMat = this.buildings.material as THREE.MeshStandardMaterial;
    buildingMat.color.set(v.roadside === 'neon' ? '#1a1533' : '#33283f');
    buildingMat.emissiveIntensity = 0.9 + neonMul * 0.6;

    this.rain.visible = v.rain > 0;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.3 + v.rain * 0.35;
    this.windshield.visible = v.rain > 0;

    const roadMat = this.road.material as THREE.MeshStandardMaterial;
    roadMat.roughness = 1 - v.wetness * 0.85;
    roadMat.metalness = 0.05 + v.wetness * 0.65;

    this.look.reset();
  }

  /**
   * Resize to a CSS pixel box. Safe to call every frame — it early-outs when
   * nothing changed, so a ResizeObserver can drive it directly.
   */
  setSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const w = Math.max(1, Math.floor(cssWidth));
    const h = Math.max(1, Math.floor(cssHeight));
    const dpr = clamp(devicePixelRatio, 1, this.maxPixelRatio);
    if (w === this.width && h === this.height && dpr === this.pixelRatio) return;

    this.width = w;
    this.height = h;
    this.pixelRatio = dpr;
    this.applyResolution();
  }

  /** Side-by-side stereo for phone viewers (Cardboard and friends). */
  setStereo(on: boolean): void {
    if (this.stereo === on) return;
    this.stereo = on;
    // Stereo doubles the geometry cost, so it renders straight to the canvas.
    this.applyResolution();
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  /** Point "forward" at wherever the device is aimed right now. */
  recenterView(): void {
    this.look.recenter();
  }

  /** Whether head look is being driven by real sensor data. */
  get headLookLive(): boolean {
    return this.look.isLive;
  }

  /**
   * Where the driver is looking, in radians off the recentred forward.
   * Positive is a look to the left. Zero whenever head look is not live.
   */
  get headYaw(): number {
    return this.look.isLive ? yawOf(this.look.quaternion) : 0;
  }

  draw(game: NeonDriftwayEngine, dt: number, gyro: GyroSample | null): void {
    if (this.disposed || !this.level) return;
    const started = performance.now();

    this.pendingGyro = gyro;
    this.time += dt;
    const car = game.car;
    const speedNorm = clamp(car.speed / V_MAX_NORMAL, 0, 1.4);

    this.updateLook(dt, game);
    this.updateCarRig(dt, game);
    this.updateRoad(game);
    this.updateStreamedProps(game);
    this.updateObstacles(game);
    this.updateGhosts(game);
    this.updateSparks(game);
    this.updateWeather(dt, game, speedNorm);
    this.updateLighting(dt, game);

    this.renderFrame();
    this.adaptQuality(performance.now() - started);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
    for (const texture of this.ghostLabelCache.values()) texture.dispose();
    this.ghostLabelCache.clear();
    this.roadTexture?.dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }

  // ── Resolution + projection ───────────────────────────────────────────────

  private applyResolution(): void {
    const scale = RENDER_SCALES[this.scaleIndex];
    this.renderer.setPixelRatio(this.pixelRatio * scale);
    this.renderer.setSize(this.width, this.height, false);
    this.updateProjection();

    // Stereo renders straight to the canvas, so it never needs the composer.
    if (!this.stereo) this.ensureComposer();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio * scale);
      this.composer.setSize(this.width, this.height);
    }
  }

  /**
   * Pick a vertical FOV for the current viewport.
   *
   * Landscape keeps a fixed vertical FOV and gains horizontally (so ultrawide
   * displays see more road, never a stretched one). Portrait would otherwise
   * be looking down a straw, so the vertical FOV opens up until at least
   * {@link MIN_HFOV} of horizontal view is back.
   */
  private updateProjection(): void {
    const aspect = this.stereo
      ? Math.max(this.width / 2, 1) / this.height
      : this.width / this.height;
    const base = this.stereo ? STEREO_VFOV : BASE_VFOV;

    const toRad = Math.PI / 180;
    let vfov = base;
    const hfov = 2 * Math.atan(Math.tan((vfov * toRad) / 2) * aspect) / toRad;
    if (hfov < MIN_HFOV) {
      vfov = (2 * Math.atan(Math.tan((MIN_HFOV * toRad) / 2) / aspect)) / toRad;
    }
    vfov = clamp(vfov, VFOV_LIMITS.min, VFOV_LIMITS.max);

    this.camera.fov = vfov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.eyeCamera.fov = vfov;
    this.eyeCamera.aspect = aspect;
    this.eyeCamera.updateProjectionMatrix();
  }

  /**
   * Nudge render scale toward whatever this device can actually sustain.
   *
   * Phones running a stereo viewer and laptops on integrated graphics land in
   * very different places, and neither should have to be detected by name.
   */
  private adaptQuality(frameMs: number): void {
    this.frameAvg += (frameMs - this.frameAvg) * 0.1;

    if (this.frameAvg > SLOW_FRAME_MS && this.scaleIndex > 0) {
      this.sustained += 1;
      if (this.sustained > 45) {
        this.scaleIndex--;
        this.sustained = 0;
        this.applyResolution();
      }
    } else if (this.frameAvg < FAST_FRAME_MS && this.scaleIndex < RENDER_SCALES.length - 1) {
      this.sustained -= 1;
      if (this.sustained < -240) {
        this.scaleIndex++;
        this.sustained = 0;
        this.applyResolution();
      }
    } else {
      this.sustained = 0;
    }
  }

  // ── Per-frame updates ─────────────────────────────────────────────────────

  private updateLook(dt: number, game: NeonDriftwayEngine): void {
    const steerNorm = clamp(game.car.vx / STEER_MAX_LATERAL, -1, 1);
    this.look.update(dt, this.pendingGyro, steerNorm);
    this.camera.quaternion.copy(this.look.quaternion);
  }

  private updateCarRig(dt: number, game: NeonDriftwayEngine): void {
    const car = game.car;
    const shake = this.reducedMotion ? 0.25 : 1;

    // Speed-scaled bob keeps the cabin alive without inducing motion sickness.
    const bobAmount = this.reducedMotion ? 0 : 0.006 + (car.speed / V_MAX_BOOST) * 0.012;
    this.headBob += dt * (6 + (car.speed / V_MAX_BOOST) * 10);

    this.carRig.position.set(car.x + game.shakeX * shake, game.shakeY * shake, 0);
    this.carRig.rotation.set(car.pitch, car.yaw, car.roll);

    this.camera.position.set(
      EYE_X,
      EYE_HEIGHT + Math.sin(this.headBob) * bobAmount,
      EYE_Z,
    );

    // Wheel turns much further than the car leans — it reads as driver input.
    const steerNorm = clamp(car.vx / STEER_MAX_LATERAL, -1, 1);
    this.steeringWheel.rotation.z = -steerNorm * 2.2;
    (this.hood.material as THREE.MeshStandardMaterial).color.set(car.bodyColor);
  }

  private updateRoad(game: NeonDriftwayEngine): void {
    // The road never moves; its markings scroll so world features stay put.
    this.roadTexture.offset.y = -(game.worldZ / ROAD_TILE) % 1;
  }

  private updateStreamedProps(game: NeonDriftwayEngine): void {
    const worldZ = game.worldZ;
    const half = roadHalf(this.lanes) + SHOULDER_WIDTH;
    const visuals = this.level!.visuals;

    // Guardrail posts, both sides.
    let index = 0;
    const postCapacity = this.postCapacity;
    const postCount = Math.floor((PROP_DISTANCE * 0.55 + PROP_BEHIND) / POST_SPACING);
    const firstPost = Math.ceil((worldZ - PROP_BEHIND) / POST_SPACING);
    for (let i = 0; i < postCount && index < postCapacity; i++) {
      const z = (firstPost + i) * POST_SPACING - worldZ;
      for (const side of [-1, 1]) {
        if (index >= postCapacity) break;
        dummy.position.set(side * half, 0, -z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.12, GUARDRAIL_HEIGHT, 0.12);
        dummy.updateMatrix();
        this.posts.setMatrixAt(index++, dummy.matrix);
      }
    }
    this.posts.count = index;
    this.posts.instanceMatrix.needsUpdate = true;

    // Lamp posts — poles plus an emissive head.
    index = 0;
    const lampCapacity = this.lampCapacity;
    const lampCount = Math.floor((PROP_DISTANCE + PROP_BEHIND) / LAMP_SPACING);
    const firstLamp = Math.ceil((worldZ - PROP_BEHIND) / LAMP_SPACING);
    for (let i = 0; i < lampCount; i++) {
      const slot = firstLamp + i;
      const z = slot * LAMP_SPACING - worldZ;
      const side = slot % 2 === 0 ? -1 : 1;
      if (index >= lampCapacity) break;
      dummy.position.set(side * (half + 1.6), 0, -z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.16, 8.5, 0.16);
      dummy.updateMatrix();
      this.lampPoles.setMatrixAt(index, dummy.matrix);

      dummy.position.set(side * (half + 0.7), 8.2, -z);
      dummy.scale.set(1.7, 0.22, 0.5);
      dummy.updateMatrix();
      this.lampHeads.setMatrixAt(index, dummy.matrix);

      // Halo billboard, turned to face down the road (good enough at this size).
      dummy.position.set(side * (half + 0.7), 8.2, -z - 0.4);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(6, 6, 1);
      dummy.updateMatrix();
      this.lampGlows.setMatrixAt(index, dummy.matrix);
      index++;
    }
    this.lampPoles.count = index;
    this.lampHeads.count = index;
    this.lampGlows.count = index;
    this.lampPoles.instanceMatrix.needsUpdate = true;
    this.lampHeads.instanceMatrix.needsUpdate = true;
    this.lampGlows.instanceMatrix.needsUpdate = true;

    // Neon arches straddling the road, alternating colour by slot.
    let archPrimary = 0;
    let archAlt = 0;
    const archRadius = half + 1.5;
    const archCapacity = this.archCapacity;
    const archCount = Math.floor((PROP_DISTANCE + PROP_BEHIND) / ARCH_SPACING);
    const firstArch = Math.ceil((worldZ - PROP_BEHIND) / ARCH_SPACING);
    for (let i = 0; i < archCount; i++) {
      const slot = firstArch + i;
      const z = slot * ARCH_SPACING - worldZ;
      dummy.position.set(0, 0, -z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(archRadius, archRadius * 0.55, archRadius);
      dummy.updateMatrix();
      if (slot % 2 === 0) {
        if (archPrimary < archCapacity) this.arches.setMatrixAt(archPrimary++, dummy.matrix);
      } else if (archAlt < archCapacity) {
        this.archesAlt.setMatrixAt(archAlt++, dummy.matrix);
      }
    }
    this.arches.count = archPrimary;
    this.archesAlt.count = archAlt;
    this.arches.instanceMatrix.needsUpdate = true;
    this.archesAlt.instanceMatrix.needsUpdate = true;

    // Skyline. Height comes from the slot index, so the same stretch of road
    // always looks the same and nothing pops as it streams.
    index = 0;
    const buildingCapacity = this.buildingCapacity;
    const buildCount = Math.floor((PROP_DISTANCE + PROP_BEHIND) / BUILDING_SPACING);
    const firstBuild = Math.ceil((worldZ - PROP_BEHIND) / BUILDING_SPACING);
    const tall = visuals.roadside === 'neon' ? 40 : visuals.roadside === 'storm' ? 24 : 15;
    for (let i = 0; i < buildCount; i++) {
      const slot = firstBuild + i;
      const z = slot * BUILDING_SPACING - worldZ;
      for (const side of [-1, 1]) {
        if (index >= buildingCapacity) break;
        const seed = hash01(slot * 2 + (side > 0 ? 1 : 0));
        const height = 6 + seed * tall;
        const offset = 24 + hash01(slot * 7 + side) * 46;
        dummy.position.set(side * (half + offset), 0, -z);
        dummy.rotation.set(0, seed * 0.4, 0);
        dummy.scale.set(8 + seed * 12, height, 8 + hash01(slot + side * 3) * 14);
        dummy.updateMatrix();
        this.buildings.setMatrixAt(index++, dummy.matrix);
      }
    }
    this.buildings.count = index;
    this.buildings.instanceMatrix.needsUpdate = true;
  }

  private updateObstacles(game: NeonDriftwayEngine): void {
    let cones = 0;
    let barriers = 0;
    let debris = 0;
    let vehicles = 0;
    let signals = 0;
    let slicks = 0;
    let boosts = 0;
    let orbs = 0;

    const blink = Math.sin(this.time * 12) > 0;

    for (const o of game.obstacles) {
      if (!o.active) continue;
      // The simulation measures distance ahead as +Z; the camera looks down -Z.
      const oz = -o.z;

      switch (o.type) {
        case 'cone':
          dummy.position.set(o.x, 0, oz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(o.width, o.height, o.width);
          dummy.updateMatrix();
          this.cones.setMatrixAt(cones++, dummy.matrix);
          break;

        case 'barrier':
          dummy.position.set(o.x, 0, oz);
          dummy.rotation.set(0, o.yaw, 0);
          dummy.scale.set(o.width, o.height, o.length);
          dummy.updateMatrix();
          this.barriers.setMatrixAt(barriers++, dummy.matrix);
          break;

        case 'debris':
          dummy.position.set(o.x, o.height * 0.45, oz);
          dummy.rotation.set(o.yaw * 0.7, o.yaw, o.yaw * 0.4);
          dummy.scale.set(o.width, o.height, o.length);
          dummy.updateMatrix();
          this.debris.setMatrixAt(debris++, dummy.matrix);
          break;

        case 'puddle':
        case 'hydro_strip':
          dummy.position.set(o.x, 0.015, oz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(o.width, 1, o.length);
          dummy.updateMatrix();
          this.slicks.setMatrixAt(slicks++, dummy.matrix);
          break;

        case 'boost_pad':
          dummy.position.set(o.x, 0.02, oz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(o.width, 1, o.length);
          dummy.updateMatrix();
          this.boostPads.setMatrixAt(boosts, dummy.matrix);
          dummy.position.set(o.x, 1.6, oz);
          dummy.scale.set(o.width * 0.8, 3.2, o.width * 0.8);
          dummy.updateMatrix();
          this.boostBeams.setMatrixAt(boosts++, dummy.matrix);
          break;

        case 'ability_slowdown':
          dummy.position.set(o.x, 1.1 + Math.sin(this.time * 3 + o.id) * 0.18, oz);
          dummy.rotation.set(this.time * 0.8, this.time * 1.3, 0);
          dummy.scale.setScalar(o.width);
          dummy.updateMatrix();
          this.orbs.setMatrixAt(orbs++, dummy.matrix);
          break;

        default: {
          // Traffic: body, glasshouse, tail bar, and an indicator when signalling.
          const isTruck = o.type === 'traffic_truck';
          const bodyHeight = isTruck ? o.height * 0.78 : o.height * 0.62;

          dummy.position.set(o.x, 0, oz);
          dummy.rotation.set(0, o.yaw, 0);
          dummy.scale.set(o.width, bodyHeight, o.length);
          dummy.updateMatrix();
          this.vehicleBodies.setMatrixAt(vehicles, dummy.matrix);
          this.vehicleBodies.setColorAt(vehicles, scratchColor.set(o.color));

          if (isTruck) {
            // Cab sits ahead of the trailer rather than on top of it.
            dummy.position.set(o.x, 0, oz - o.length * 0.42);
            dummy.scale.set(o.width * 0.96, o.height, o.length * 0.22);
          } else {
            dummy.position.set(o.x, bodyHeight, oz + o.length * 0.05);
            dummy.scale.set(o.width * 0.88, o.height - bodyHeight, o.length * 0.46);
          }
          dummy.updateMatrix();
          this.vehicleCabins.setMatrixAt(vehicles, dummy.matrix);

          // Tail lights face the player: traffic drives away from us.
          dummy.position.set(o.x, bodyHeight * 0.6, oz + o.length / 2 + 0.02);
          dummy.rotation.set(0, o.yaw, 0);
          dummy.scale.set(o.width * 0.82, 0.16, 0.06);
          dummy.updateMatrix();
          this.vehicleTails.setMatrixAt(vehicles, dummy.matrix);

          // Underglow pool on the tarmac — the cue that reads furthest away.
          dummy.position.set(o.x, 0.03, oz);
          dummy.rotation.set(0, o.yaw, 0);
          dummy.scale.set(o.width * 1.5, 1, o.length * 1.2);
          dummy.updateMatrix();
          this.vehicleGlows.setMatrixAt(vehicles, dummy.matrix);
          vehicles++;

          if (o.signaling && blink) {
            const side = o.targetLane > o.lane ? 1 : -1;
            dummy.position.set(o.x + side * o.width * 0.5, bodyHeight * 0.62, oz + o.length * 0.3);
            dummy.rotation.set(0, o.yaw, 0);
            dummy.scale.set(0.1, 0.16, 0.5);
            dummy.updateMatrix();
            this.vehicleSignals.setMatrixAt(signals++, dummy.matrix);
          }
          break;
        }
      }
    }

    this.commitInstances(this.cones, cones);
    this.commitInstances(this.barriers, barriers);
    this.commitInstances(this.debris, debris);
    this.commitInstances(this.vehicleBodies, vehicles);
    this.commitInstances(this.vehicleCabins, vehicles);
    this.commitInstances(this.vehicleTails, vehicles);
    this.commitInstances(this.vehicleGlows, vehicles);
    this.commitInstances(this.vehicleSignals, signals);
    this.commitInstances(this.slicks, slicks);
    this.commitInstances(this.boostPads, boosts);
    this.commitInstances(this.boostBeams, boosts);
    this.commitInstances(this.orbs, orbs);
    if (this.vehicleBodies.instanceColor) this.vehicleBodies.instanceColor.needsUpdate = true;
  }

  private commitInstances(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateGhosts(game: NeonDriftwayEngine): void {
    if (!game.isMultiplayer) {
      for (const ghost of this.ghosts) ghost.group.visible = false;
      return;
    }

    const now = Date.now();
    let index = 0;
    for (const [, remote] of game.remotePlayers) {
      if (index >= MAX_GHOSTS) break;
      const ghost = this.ghosts[index++];

      // 100ms interpolation window, matching the 10Hz position broadcast.
      const t = clamp((now - remote.lastUpdate) / 100, 0, 1);
      const x = remote.prevX + (remote.targetX - remote.prevX) * t;
      const distance = remote.prevDistance + (remote.targetDistance - remote.prevDistance) * t;
      const rawZ = (distance - game.distance) * METRES_PER_DISTANCE;
      // Runs diverge fast; park runaway ghosts at the edge of vision instead of
      // culling them, so you can still see who is ahead.
      const z = -clamp(rawZ, -90, 260);

      ghost.group.visible = true;
      ghost.group.position.set(x, 0, z);
      const fade = 1 - clamp((Math.abs(rawZ) - Math.abs(z)) / 400, 0, 0.75);
      (ghost.body.material as THREE.MeshStandardMaterial).opacity = 0.45 * fade;
      ghost.label.material.opacity = fade;

      const texture = this.ghostLabel(remote.name);
      if (ghost.label.material.map !== texture) {
        ghost.label.material.map = texture;
        ghost.label.material.needsUpdate = true;
      }
    }
    for (let i = index; i < this.ghosts.length; i++) this.ghosts[i].group.visible = false;
  }

  private updateSparks(game: NeonDriftwayEngine): void {
    let n = 0;
    for (const p of game.particles) {
      if (!p.active) continue;
      const i3 = n * 3;
      this.sparkPositions[i3] = p.x;
      this.sparkPositions[i3 + 1] = p.y;
      this.sparkPositions[i3 + 2] = -p.z;
      scratchColor.set(p.color);
      const fade = p.maxLife > 0 ? p.life / p.maxLife : 0;
      this.sparkColors[i3] = scratchColor.r * fade;
      this.sparkColors[i3 + 1] = scratchColor.g * fade;
      this.sparkColors[i3 + 2] = scratchColor.b * fade;
      n++;
    }
    const geometry = this.sparks.geometry;
    geometry.setDrawRange(0, n);
    (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.sparks.visible = n > 0;
  }

  private updateWeather(dt: number, game: NeonDriftwayEngine, speedNorm: number): void {
    const visuals = this.level!.visuals;
    const carX = game.car.x;

    if (visuals.rain > 0) {
      const fall = 26 + speedNorm * 20;
      const drift = game.car.speed * MPS_PER_UNIT * 0.35;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const i6 = i * 6;
        let y = this.rainPositions[i6 + 1] - fall * dt;
        let z = this.rainPositions[i6 + 2] + drift * dt;
        if (y < -1 || z > 12) {
          y = 11 + this.rainSeeds[i] * 8;
          z = -(4 + this.rainSeeds[i] * 46);
          this.rainPositions[i6] = carX + (this.rainSeeds[i] - 0.5) * 32;
          this.rainPositions[i6 + 3] = this.rainPositions[i6];
        }
        const length = 0.9 + speedNorm * 2.2;
        this.rainPositions[i6 + 1] = y;
        this.rainPositions[i6 + 2] = z;
        this.rainPositions[i6 + 4] = y - length;
        this.rainPositions[i6 + 5] = z + length * 0.55;
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    // Speed streaks only show up once the car is genuinely quick.
    const streakStrength = clamp((game.car.speed - V_MAX_NORMAL * 0.62) / (V_MAX_BOOST - V_MAX_NORMAL * 0.62), 0, 1);
    this.streaks.visible = streakStrength > 0.02 && !this.reducedMotion;
    if (this.streaks.visible) {
      (this.streaks.material as THREE.LineBasicMaterial).opacity = streakStrength * 0.5;
      const rush = 60 + streakStrength * 190;
      for (let i = 0; i < STREAK_COUNT; i++) {
        const i6 = i * 6;
        let z = this.streakPositions[i6 + 2] + rush * dt;
        if (z > 6) {
          z = -(40 + this.streakSeeds[i * 2] * 60);
          const angle = this.streakSeeds[i * 2 + 1] * Math.PI * 2;
          const radius = 2.5 + this.streakSeeds[i * 2] * 9;
          this.streakPositions[i6] = carX + Math.cos(angle) * radius;
          this.streakPositions[i6 + 1] = 1.2 + Math.sin(angle) * radius * 0.5;
          this.streakPositions[i6 + 3] = this.streakPositions[i6];
          this.streakPositions[i6 + 4] = this.streakPositions[i6 + 1];
        }
        this.streakPositions[i6 + 2] = z;
        this.streakPositions[i6 + 5] = z + 4 + streakStrength * 10;
      }
      (this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    // Distant lightning on the storm level — skipped under reduced motion,
    // where a full-scene flash is exactly the wrong thing to do.
    if (visuals.rain > 0 && !this.reducedMotion) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 5 + Math.random() * 11;
        this.lightning = 1;
      }
      this.lightning = Math.max(0, this.lightning - dt * 4.5);
    } else {
      this.lightning = 0;
    }
  }

  private updateLighting(dt: number, game: NeonDriftwayEngine): void {
    const visuals = this.level!.visuals;

    if (this.level!.headlightsEnabled) {
      const dim = game.headlightFlickerDim ? 0.45 : 1;
      for (const light of this.headlights) light.intensity = HEADLIGHT_INTENSITY * dim;
    } else {
      for (const light of this.headlights) light.intensity = HEADLIGHT_INTENSITY * 0.7;
    }

    this.hemi.intensity = visuals.ambient + this.lightning * 1.6;
    this.keyLight.intensity = visuals.keyLight + this.lightning * 0.8;

    // Crash flash: bright for a moment right after a hit, then gone.
    const sinceHit = game.car.invincibleUntil - game.elapsedMs;
    const flash = clamp(sinceHit / 600, 0, 1);
    this.impactLight.intensity = flash * 260;
    this.impactLight.position.set(game.car.x, 1.4, -2.5);

    if (this.bloomPass) {
      const boosting = game.car.speed > V_MAX_NORMAL;
      const target = (visuals.roadside === 'neon' ? 0.75 : 0.45) + (boosting ? 0.35 : 0) + game.car.boostMeter / BOOST_MAX * 0.1;
      this.bloomPass.strength += (target - this.bloomPass.strength) * Math.min(1, dt * 4);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private renderFrame(): void {
    if (this.stereo) {
      this.renderStereo();
      return;
    }
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.width, this.height);
    if (this.composer && !this.stereo) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /**
   * Side-by-side stereo.
   *
   * Both eyes share the scene graph and differ only by an IPD offset along the
   * camera's own right axis, so head look, cockpit and shake all stay
   * consistent between them. Post-processing is skipped here — a phone driving
   * a viewer has no budget for it, and bloom bleeding across the eye seam
   * looks wrong anyway.
   */
  private renderStereo(): void {
    this.camera.updateWorldMatrix(true, false);
    camWorldPos.setFromMatrixPosition(this.camera.matrixWorld);
    camWorldQuat.setFromRotationMatrix(this.camera.matrixWorld);
    eyeRight.set(1, 0, 0).applyQuaternion(camWorldQuat);

    const half = Math.floor(this.width / 2);
    this.eyeCamera.quaternion.copy(camWorldQuat);
    this.renderer.setScissorTest(true);

    for (let eye = 0; eye < 2; eye++) {
      const sign = eye === 0 ? -1 : 1;
      this.eyeCamera.position.copy(camWorldPos).addScaledVector(eyeRight, (sign * IPD) / 2);
      this.eyeCamera.updateMatrixWorld(true);

      const x = eye === 0 ? 0 : half;
      this.renderer.setViewport(x, 0, half, this.height);
      this.renderer.setScissor(x, 0, half, this.height);
      this.renderer.render(this.scene, this.eyeCamera);
    }

    this.renderer.setScissorTest(false);
  }

  // ── Construction ──────────────────────────────────────────────────────────

  private buildLights(): void {
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.8);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1);
    this.keyLight.position.set(-0.4, 1, 0.6);
    this.scene.add(this.keyLight);

    // Physically-scaled lights: intensity is candela and falls off by `decay`,
    // so these numbers are tuned for the 1:1 metre world rather than guessed.
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const light = new THREE.SpotLight(0xfff2d0, HEADLIGHT_INTENSITY, 240, 0.44, 0.6, 1.4);
      light.position.set(side * 0.68, 0.62, -CAR_LENGTH / 2);
      light.target.position.set(side * 2.2, 0, -95);
      this.carRig.add(light);
      this.carRig.add(light.target);
      this.headlights.push(light);
    }

    this.impactLight = new THREE.PointLight(0xff9a3c, 0, 45, 2);
    this.scene.add(this.impactLight);
  }

  private buildEnvironment(): void {
    // Sky dome — a vertical gradient that meets the fog colour at the horizon.
    this.skyUniforms = {
      topColor: { value: new THREE.Color('#2d1b4e') },
      horizonColor: { value: new THREE.Color('#ffb45c') },
      bottomColor: { value: new THREE.Color('#ff9d4d') },
    };
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      // The tonemap + colorspace includes are not optional: a raw ShaderMaterial
      // gets neither injected for it, so without them the sky is the one
      // surface in the scene on a different curve — and it blows out.
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        varying vec3 vDirection;
        void main() {
          float h = vDirection.y;
          vec3 sky = mix(horizonColor, topColor, smoothstep(0.0, 0.9, h));
          vec3 col = mix(bottomColor, sky, smoothstep(-0.12, 0.06, h));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 16), skyMaterial);
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);

    this.sun = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xfff0b0, fog: false, transparent: true, opacity: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    this.sun.renderOrder = -1;
    this.sun.visible = false;
    this.scene.add(this.sun);

    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85 + 0.05);
      const r = 2600;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0xdde6ff, size: 9, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85 }),
    );
    this.stars.visible = false;
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);

    // Terrain either side of the road.
    const groundGeometry = new THREE.PlaneGeometry(2400, ROAD_LENGTH);
    groundGeometry.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(
      groundGeometry,
      new THREE.MeshStandardMaterial({ color: 0x3a3038, roughness: 1, metalness: 0 }),
    );
    this.ground.position.set(0, -0.06, ROAD_BEHIND - ROAD_LENGTH / 2);
    this.world.add(this.ground);

    // Road surface. Width is set per level by applyRoadWidth().
    this.roadTexture = new THREE.CanvasTexture(document.createElement('canvas'));
    this.roadGlowTexture = new THREE.CanvasTexture(document.createElement('canvas'));
    const roadGeometry = new THREE.PlaneGeometry(1, ROAD_LENGTH);
    roadGeometry.rotateX(-Math.PI / 2);
    this.road = new THREE.Mesh(
      roadGeometry,
      new THREE.MeshStandardMaterial({
        map: this.roadTexture,
        emissiveMap: this.roadGlowTexture,
        emissive: 0xffffff,
        emissiveIntensity: 0,
        roughness: 0.9,
        metalness: 0.1,
      }),
    );
    this.road.position.set(0, 0, ROAD_BEHIND - ROAD_LENGTH / 2);
    this.world.add(this.road);

    // Guardrails: one long box a side, plus streamed posts.
    const railGeometry = new THREE.BoxGeometry(0.14, 0.34, ROAD_LENGTH);
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9aa5, roughness: 0.5, metalness: 0.65 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeometry, railMaterial);
      rail.position.set(side, GUARDRAIL_HEIGHT, ROAD_BEHIND - ROAD_LENGTH / 2);
      this.world.add(rail);
      this.rails.push(rail);
    }

    // Neon strips running the full length of both road edges. These are the
    // single biggest readability win at night: they draw the road's shape all
    // the way to the horizon without depending on any light source.
    const neonGeometry = new THREE.BoxGeometry(0.22, 0.12, ROAD_LENGTH);
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        neonGeometry,
        new THREE.MeshBasicMaterial({ color: 0xff9ecb, toneMapped: false }),
      );
      strip.position.set(side, 0.16, ROAD_BEHIND - ROAD_LENGTH / 2);
      this.world.add(strip);
      this.neonRails.push(strip);
    }

    // Arches over the carriageway, alternating the two accent colours.
    const archGeometry = new THREE.TorusGeometry(1, 0.018, 6, 28, Math.PI);
    this.arches = new THREE.InstancedMesh(
      archGeometry,
      new THREE.MeshBasicMaterial({ color: 0xff9ecb, toneMapped: false }),
      this.archCapacity,
    );
    this.archesAlt = new THREE.InstancedMesh(
      archGeometry.clone(),
      new THREE.MeshBasicMaterial({ color: 0x8fe3ff, toneMapped: false }),
      this.archCapacity,
    );
    for (const mesh of [this.arches, this.archesAlt]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.world.add(mesh);
    }

    const postGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.posts = new THREE.InstancedMesh(
      postGeometry,
      new THREE.MeshStandardMaterial({ color: 0x9a9aa5, roughness: 0.6, metalness: 0.4 }),
      this.postCapacity,
    );
    this.posts.frustumCulled = false;
    this.world.add(this.posts);

    this.lampPoles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x30303c, roughness: 0.8, metalness: 0.3 }),
      this.lampCapacity,
    );
    this.lampPoles.frustumCulled = false;
    this.world.add(this.lampPoles);

    this.lampHeads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true, toneMapped: false }),
      this.lampCapacity,
    );
    this.lampHeads.frustumCulled = false;
    this.world.add(this.lampHeads);

    // A soft additive halo around each lamp — cheap bloom that survives on
    // devices where the real bloom pass is switched off.
    this.lampGlows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.haloTexture(),
        color: 0xffd9a0,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      this.lampCapacity,
    );
    this.lampGlows.frustumCulled = false;
    this.world.add(this.lampGlows);

    this.buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({
        color: 0x241c2b,
        roughness: 0.85,
        metalness: 0.1,
        // Lit windows, so the skyline is a city rather than a black cutout.
        emissiveMap: this.windowTexture(),
        emissive: 0xffffff,
        emissiveIntensity: 1.4,
      }),
      this.buildingCapacity,
    );
    this.buildings.frustumCulled = false;
    this.world.add(this.buildings);
  }

  /** Radial falloff sprite used for lamp halos. */
  private haloTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /** Randomly lit windows in soft pinks and blues, for the skyline emissive. */
  private windowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 64, 64);
    const palette = ['#ff9ecb', '#8fe3ff', '#ffd6a0', '#c9a8ff', '#a8ffe8'];
    for (let y = 2; y < 64; y += 6) {
      for (let x = 2; x < 64; x += 6) {
        if (Math.random() > 0.55) continue;
        ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillRect(x, y, 3, 4);
      }
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 6);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private get postCapacity(): number {
    return Math.ceil(((PROP_DISTANCE * 0.55 + PROP_BEHIND) / POST_SPACING) * 2) + 4;
  }
  private get lampCapacity(): number {
    return Math.ceil((PROP_DISTANCE + PROP_BEHIND) / LAMP_SPACING) + 4;
  }
  private get buildingCapacity(): number {
    return Math.ceil(((PROP_DISTANCE + PROP_BEHIND) / BUILDING_SPACING) * 2) + 4;
  }
  private get archCapacity(): number {
    return Math.ceil((PROP_DISTANCE + PROP_BEHIND) / ARCH_SPACING) + 3;
  }

  /**
   * Image-based lighting from the level's own sky.
   *
   * Without this every metal in the scene — the bonnet, traffic paint, wet
   * asphalt — renders black, because a metallic surface has no diffuse
   * response and there would be nothing for it to reflect. A two-stop
   * gradient through PMREM is enough to make them read as painted metal, and
   * it costs one small render at level load.
   */
  private rebuildEnvironmentMap(): void {
    const visuals = this.level!.visuals;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, visuals.skyTop);
    gradient.addColorStop(0.42, visuals.horizon);
    gradient.addColorStop(0.52, visuals.fogColor);
    gradient.addColorStop(1, visuals.roadColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 64);

    // A bright spot where the sun is, so highlights have somewhere to come from.
    if (visuals.sun) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = visuals.sun.color;
      ctx.beginPath();
      ctx.arc(64, 30, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const equirect = new THREE.CanvasTexture(canvas);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    equirect.colorSpace = THREE.SRGBColorSpace;

    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromEquirectangular(equirect);
    this.scene.environment = this.envTarget.texture;
    equirect.dispose();
  }

  /** Road width follows the lane count, so a level could widen the highway. */
  private applyRoadWidth(): void {
    const half = roadHalf(this.lanes) + SHOULDER_WIDTH;
    this.road.scale.x = half * 2;
    this.rails[0].position.x = -half;
    this.rails[1].position.x = half;
    this.neonRails[0].position.x = -half + 0.16;
    this.neonRails[1].position.x = half - 0.16;
  }

  /**
   * Paint one tile of road: shoulders, edge lines and dashed lane dividers.
   * Regenerated per level because the palette and lane count both live there.
   */
  private rebuildRoadTexture(): void {
    const visuals = this.level!.visuals;
    const lanes = this.lanes;
    const size = 512;

    const totalWidth = roadHalf(lanes) * 2 + SHOULDER_WIDTH * 2;
    const pxPerMetre = size / totalWidth;
    const shoulderPx = SHOULDER_WIDTH * pxPerMetre;
    const edge = Math.max(2, 0.16 * pxPerMetre);
    const laneWidthPx = LANE_WIDTH * pxPerMetre;
    // 3m dash, 5m gap — the tile holds exactly three.
    const dash = 3 * (size / ROAD_TILE);
    const period = 8 * (size / ROAD_TILE);

    /** Paints every marking; used for both the albedo and the glow map. */
    const paintMarkings = (ctx: CanvasRenderingContext2D, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(shoulderPx, 0, edge, size);
      ctx.fillRect(size - shoulderPx - edge, 0, edge, size);
      for (let i = 1; i < lanes; i++) {
        const x = shoulderPx + laneWidthPx * i - edge / 2;
        for (let y = 0; y < size; y += period) {
          ctx.fillRect(x, y, edge, dash);
        }
      }
    };

    // ── Albedo ──
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = visuals.shoulderColor;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = visuals.roadColor;
    ctx.fillRect(shoulderPx, 0, size - shoulderPx * 2, size);

    // Subtle asphalt grain so the surface is not a flat colour at speed.
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#000000';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    ctx.globalAlpha = 1;
    paintMarkings(ctx, visuals.laneColor);

    // ── Glow (markings only, on black) ──
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = size;
    glowCanvas.height = size;
    const glowCtx = glowCanvas.getContext('2d')!;
    glowCtx.fillStyle = '#000000';
    glowCtx.fillRect(0, 0, size, size);
    paintMarkings(glowCtx, visuals.laneColor);

    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    for (const [texture, image] of [
      [this.roadTexture, canvas],
      [this.roadGlowTexture, glowCanvas],
    ] as const) {
      texture.image = image;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, ROAD_LENGTH / ROAD_TILE);
      texture.anisotropy = anisotropy;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    }

    (this.road.material as THREE.MeshStandardMaterial).emissiveIntensity = visuals.laneGlow;
  }

  private buildObstacles(): void {
    const boxBase = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    this.cones = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.5, 1, 10).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff5a1a, emissiveIntensity: 1.6, roughness: 0.7 }),
      MAX_OBSTACLES,
    );

    this.barriers = new THREE.InstancedMesh(
      boxBase(),
      new THREE.MeshStandardMaterial({
        map: this.stripeTexture(),
        emissive: 0xff4466,
        emissiveIntensity: 0.9,
        roughness: 0.75,
      }),
      MAX_OBSTACLES,
    );

    this.debris = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({
        color: 0x8a8a99, emissive: 0x442255, emissiveIntensity: 0.8,
        roughness: 0.95, flatShading: true,
      }),
      MAX_OBSTACLES,
    );

    this.vehicleBodies = new THREE.InstancedMesh(
      boxBase(),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }),
      MAX_OBSTACLES,
    );
    this.vehicleCabins = new THREE.InstancedMesh(
      boxBase(),
      new THREE.MeshStandardMaterial({ color: 0x0b1420, roughness: 0.12, metalness: 0.85 }),
      MAX_OBSTACLES,
    );
    this.vehicleTails = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff5566, toneMapped: false }),
      MAX_OBSTACLES,
    );
    this.vehicleSignals = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd166, toneMapped: false }),
      MAX_OBSTACLES,
    );

    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.vehicleGlows = new THREE.InstancedMesh(
      flat.clone(),
      new THREE.MeshBasicMaterial({
        map: this.haloTexture(),
        color: 0xff9ecb,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      MAX_OBSTACLES,
    );
    this.slicks = new THREE.InstancedMesh(
      flat,
      new THREE.MeshStandardMaterial({
        color: 0x4a8fd6, transparent: true, opacity: 0.55,
        roughness: 0.05, metalness: 0.95,
      }),
      MAX_OBSTACLES,
    );
    this.boostPads = new THREE.InstancedMesh(
      flat.clone(),
      new THREE.MeshBasicMaterial({ color: 0xff8fd0, toneMapped: false }),
      MAX_OBSTACLES,
    );
    this.boostBeams = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff5cf0, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      }),
      MAX_OBSTACLES,
    );
    this.orbs = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshBasicMaterial({ color: 0xd08cff, toneMapped: false }),
      MAX_OBSTACLES,
    );

    for (const mesh of [
      this.cones, this.barriers, this.debris,
      this.vehicleBodies, this.vehicleCabins, this.vehicleTails, this.vehicleSignals,
      this.vehicleGlows, this.slicks, this.boostPads, this.boostBeams, this.orbs,
    ]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.world.add(mesh);
    }
  }

  private stripeTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(0, 0, 64, 16);
    ctx.fillStyle = '#f4f4f4';
    for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 16);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildEffects(): void {
    // Sparks and splashes, fed straight from the engine's particle pool.
    this.sparkPositions = new Float32Array(MAX_PARTICLES * 3);
    this.sparkColors = new Float32Array(MAX_PARTICLES * 3);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3));
    sparkGeometry.setDrawRange(0, 0);
    this.sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false }),
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    // Rain as short falling segments — cheaper and far more legible than points.
    this.rainPositions = new Float32Array(RAIN_COUNT * 6);
    this.rainSeeds = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const seed = Math.random();
      this.rainSeeds[i] = seed;
      const x = (Math.random() - 0.5) * 32;
      const y = Math.random() * 14;
      const z = -(Math.random() * 52 - 6);
      const i6 = i * 6;
      this.rainPositions[i6] = x;
      this.rainPositions[i6 + 1] = y;
      this.rainPositions[i6 + 2] = z;
      this.rainPositions[i6 + 3] = x;
      this.rainPositions[i6 + 4] = y - 1;
      this.rainPositions[i6 + 5] = z + 0.5;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rain = new THREE.LineSegments(
      rainGeometry,
      new THREE.LineBasicMaterial({ color: 0xdce9ff, transparent: true, opacity: 0.55, toneMapped: false }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);

    this.streakPositions = new Float32Array(STREAK_COUNT * 6);
    this.streakSeeds = new Float32Array(STREAK_COUNT * 2);
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streakSeeds[i * 2] = Math.random();
      this.streakSeeds[i * 2 + 1] = Math.random();
      const angle = this.streakSeeds[i * 2 + 1] * Math.PI * 2;
      const radius = 2.5 + this.streakSeeds[i * 2] * 9;
      const i6 = i * 6;
      this.streakPositions[i6] = Math.cos(angle) * radius;
      this.streakPositions[i6 + 1] = 1.2 + Math.sin(angle) * radius * 0.5;
      this.streakPositions[i6 + 2] = -Math.random() * 90;
      this.streakPositions[i6 + 3] = this.streakPositions[i6];
      this.streakPositions[i6 + 4] = this.streakPositions[i6 + 1];
      this.streakPositions[i6 + 5] = this.streakPositions[i6 + 2] + 6;
    }
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(this.streakPositions, 3));
    this.streaks = new THREE.LineSegments(
      streakGeometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    this.scene.add(this.streaks);
  }

  /**
   * The cabin around the driver.
   *
   * Proportioned from the eye point rather than from a car blueprint: the
   * glasshouse has to leave a genuinely wide opening or the cockpit eats the
   * screen, and head look needs something to see out of at the sides and
   * behind. Roughly: bonnet just below the horizon, roof edge ~18° up, door
   * tops below eye level so glancing sideways shows road, and no rear glass so
   * looking over your shoulder works.
   */
  private buildCockpit(): void {
    // A little emissive keeps the cabin readable on the unlit night level
    // instead of collapsing to a black void around the player.
    const shell = new THREE.MeshStandardMaterial({
      color: 0x4b4b5c, roughness: 0.9, metalness: 0.05,
      emissive: 0x14141d, emissiveIntensity: 1, side: THREE.DoubleSide,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0x5a5a6b, roughness: 0.55, metalness: 0.3,
      emissive: 0x17171f, emissiveIntensity: 1,
    });

    const panel = (w: number, h: number, material: THREE.Material) =>
      new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);

    const ROOF_Y = 1.62;
    const SILL_Y = 0.94;

    // Roof — front edge at z = 0.6, which puts it ~25° above the eye line and
    // leaves the road, not the headlining, filling the screen.
    const roof = panel(2.25, 3.1, shell);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, ROOF_Y, 0.95);
    this.cockpit.add(roof);

    // Door cards stop at the window sill, so the side windows are open.
    for (const side of [-1, 1]) {
      const door = panel(3.2, SILL_Y - 0.12, shell);
      door.rotation.y = (side * Math.PI) / 2;
      door.position.set(side * 1.08, (SILL_Y + 0.18) / 2, 0.6);
      this.cockpit.add(door);

      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 3.2), trim);
      sill.position.set(side * 1.08, SILL_Y, 0.6);
      this.cockpit.add(sill);

      // Door mirror on a stalk — visible when you glance sideways.
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), trim);
      stalk.position.set(side * 1.18, SILL_Y + 0.12, -1.0);
      this.cockpit.add(stalk);
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.15, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x8fa6c0, roughness: 0.15, metalness: 0.9 }),
      );
      mirror.position.set(side * 1.3, SILL_Y + 0.14, -1.0);
      this.cockpit.add(mirror);

      // A-pillar, raked back from the sill to the roof edge.
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.95, 0.09), trim);
      pillar.position.set(side * 1.02, (SILL_Y + ROOF_Y) / 2 + 0.02, -1.05);
      pillar.rotation.x = 0.24;
      this.cockpit.add(pillar);

      // Rear pillar, so the roof is not floating when you look back.
      const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.7, 0.12), trim);
      cPillar.position.set(side * 1.02, (SILL_Y + ROOF_Y) / 2, 2.2);
      cPillar.rotation.x = -0.35;
      this.cockpit.add(cPillar);
    }

    // Rear bulkhead + parcel shelf — low enough to see over when looking back.
    const rear = panel(2.2, 0.85, shell);
    rear.position.set(0, 0.55, 2.35);
    this.cockpit.add(rear);
    const shelf = panel(2.2, 0.8, shell);
    shelf.rotation.x = -Math.PI / 2;
    shelf.position.set(0, 0.97, 1.95);
    this.cockpit.add(shelf);

    const floor = panel(2.2, 4.6, shell);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.18, -0.15);
    this.cockpit.add(floor);

    // Windscreen header.
    const header = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.18), trim);
    header.position.set(0, ROOF_Y - 0.04, -0.78);
    this.cockpit.add(header);

    // Rear-view mirror, offset so it does not sit in the middle of the road.
    const rearView = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.1, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x2a3542, roughness: 0.2, metalness: 0.8 }),
    );
    rearView.position.set(EYE_X + 0.12, ROOF_Y - 0.14, -0.72);
    this.cockpit.add(rearView);

    // Dashboard, sitting below the sight line, with a lit strip along its edge.
    const dash = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.74, 0.78), trim);
    dash.position.set(0, 0.53, -1.05);
    this.cockpit.add(dash);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.02, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x8fe3ff, toneMapped: false }),
    );
    glow.position.set(0, 0.875, -0.68);
    this.cockpit.add(glow);

    // Bonnet — the single biggest cue that you are inside a car. Its far edge
    // lands just under the horizon, where a real one does.
    this.hood = new THREE.Mesh(
      new THREE.BoxGeometry(1.94, 0.07, 1.15),
      new THREE.MeshStandardMaterial({ color: 0x00c8ff, roughness: 0.32, metalness: 0.55 }),
    );
    this.hood.position.set(0, 0.9, -1.78);
    this.hood.rotation.x = -0.05;
    this.cockpit.add(this.hood);

    // Steering wheel, in its own group so it can spin about its own axis.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 8, 24), trim);
    this.steeringWheel.add(rim);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.024, 0.02), trim);
      spoke.rotation.z = (i * Math.PI * 2) / 3;
      spoke.position.set(Math.cos(spoke.rotation.z) * 0.095, Math.sin(spoke.rotation.z) * 0.095, 0);
      this.steeringWheel.add(spoke);
    }
    const boss = new THREE.Mesh(
      new THREE.CircleGeometry(0.052, 16),
      new THREE.MeshBasicMaterial({ color: 0x00d5ff }),
    );
    boss.position.z = -0.014;
    this.steeringWheel.add(boss);
    this.steeringWheel.position.set(EYE_X, 0.72, -0.72);
    this.steeringWheel.rotation.x = 1.1;
    this.cockpit.add(this.steeringWheel);

    // Rain on the glass, on the car rather than on the head.
    this.windshield = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.1),
      new THREE.MeshBasicMaterial({
        map: this.dropletTexture(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    this.windshield.position.set(0, 1.22, -0.98);
    this.windshield.rotation.x = 0.4;
    this.windshield.visible = false;
    this.cockpit.add(this.windshield);
  }

  private dropletTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 1 + Math.random() * 3.5;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(200,225,255,0.55)');
      gradient.addColorStop(1, 'rgba(200,225,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildGhosts(): void {
    const bodyGeometry = new THREE.BoxGeometry(CAR_WIDTH, 1.35, CAR_LENGTH).translate(0, 0.675, 0);
    for (let i = 0; i < MAX_GHOSTS; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        bodyGeometry,
        new THREE.MeshStandardMaterial({
          color: 0x64b4ff, transparent: true, opacity: 0.45,
          emissive: 0x1a4a80, emissiveIntensity: 0.6, depthWrite: false,
        }),
      );
      group.add(body);

      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false }),
      );
      label.position.set(0, 2.3, 0);
      label.scale.set(3.4, 0.85, 1);
      group.add(label);

      group.visible = false;
      this.ghostGroup.add(group);
      this.ghosts.push({ group, label, body });
    }
  }

  private ghostLabel(name: string): THREE.Texture {
    const cached = this.ghostLabelCache.get(name);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#e8f6ff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 12), 128, 34);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.ghostLabelCache.set(name, texture);
    return texture;
  }

  /** Built lazily: a device that cannot afford bloom never allocates for it. */
  private ensureComposer(): void {
    if (this.composer || !this.wantsBloom) return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.5, 0.7, 0.85,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.setPixelRatio(this.pixelRatio * RENDER_SCALES[this.scaleIndex]);
    this.composer.setSize(this.width, this.height);
  }
}
