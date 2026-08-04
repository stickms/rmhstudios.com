/**
 * renderer3d.ts — the three.js renderer for Nightrail.
 *
 * The simulation has no world space at all: it tracks a train as
 * `(s, lateral, height)` along a one-dimensional curve (see `types.ts`). This
 * file is the only place that turns that triple into XYZ, and it does it
 * exclusively through `railPosition()` from `track.ts` — the same function the
 * sim's own helpers use — so the deck, the hazards, the consist and the sparks
 * can never disagree about where the track is.
 *
 * Scene layout:
 *
 *   scene
 *    ├─ skyGroup            sky dome + stars; glued to the camera, so the
 *    │                      horizon never approaches however far you travel
 *    ├─ groundPlane         water / asphalt / cloud deck, also camera-glued
 *    ├─ trackGroup          per-level chunks (deck · skirt · rails · edge neon),
 *    │                      built ONCE in setLevel and toggled by fog range
 *    ├─ sceneryGroup        four InstancedMeshes recycled by arc-length slot
 *    ├─ featureGroup        one InstancedMesh per hazard kind, refilled each
 *    │                      frame from the features inside the fog
 *    ├─ trainGroup          lead locomotive (a real Group, so tricks can spin
 *    │                      it) + instanced cargo cars, bogies and crates
 *    ├─ sparks / rainGroup  the sim's particle pool and the weather
 *    └─ camera              chase rig, plus its own children (speed streaks,
 *                           boost vignette) which is why it is in the graph
 *
 * Framing is resolution independent: a constant vertical FOV on landscape
 * displays, widened on portrait ones so a phone held upright still sees the
 * bend it is about to enter. Render scale adapts to the frame budget the device
 * actually has rather than to any guess about what it is.
 *
 * This file schedules no animation frames of its own — the React shell owns the
 * only loop and calls {@link NightrailRenderer3D.draw} from it. That is a hard
 * rule, not a preference: §17.3's allowlist gate matches the raw source text,
 * so even naming the API in a comment would put this file on the list.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { MAX_PARTICLES, RAIL_SPACING, TRAIN_HEIGHT, TRAIN_LENGTH } from './constants';
import type { RunState } from './game';
import { bakeLevel, railOffset, railPosition, samplePoint } from './track';
import type { TrackPoint } from './track';
import type { LevelConfig, TrackFeature } from './types';

// ── Framing ─────────────────────────────────────────────────────────────────

/** Vertical FOV held constant on landscape displays. */
const BASE_VFOV = 58;
/** Portrait displays widen the vertical FOV until this much track is visible. */
const MIN_HFOV = 68;
const VFOV_LIMITS = { min: 40, max: 100 };
const NEAR = 0.12;
const FAR = 4200;

/** Extra vertical FOV at the level's top speed. Sells velocity on its own. */
const FOV_PUNCH = 9;
/** Extra on top of that while a boost is burning. */
const FOV_BOOST = 5;

/** Chase camera at rest: metres behind the lead car, metres above the rail. */
const CAM_BACK = 13.5;
const CAM_HEIGHT = 5.4;
/** How much further back the camera sits at full speed. */
const CAM_BACK_SPEED = 6.5;
/**
 * How far down the curve the camera looks.
 *
 * At ~60 m/s this is a little under a second of travel, which is the whole
 * point: the bend has to be on screen while there is still time to set up a
 * drift for it, not when the train is already in it.
 */
const LOOK_AHEAD = 40;
/** Exponential damping rates, per second. Position is snappier than aim. */
const CAM_POS_DAMP = 7.5;
const CAM_LOOK_DAMP = 5;
const CAM_ROLL_DAMP = 4.5;
const CAM_FOV_DAMP = 3.5;
/**
 * Fraction of a trick's roll the camera copies, and the hard cap on the result.
 *
 * A trick spin can pass through a full inversion; a camera that followed it
 * would take the horizon with it and the player would lose the track. Copying a
 * sliver keeps the roll *felt* without ever costing the frame of reference.
 */
const CAM_ROLL_FOLLOW = 0.16;
const CAM_ROLL_MAX = 0.42;
/** Fraction of the train's lateral offset the camera tracks across the rails. */
const CAM_LATERAL_FOLLOW = 0.62;
/** Crash shake: seconds of decay and peak amplitude in metres. */
const SHAKE_DECAY = 3.2;
const SHAKE_AMPLITUDE = 0.75;

/** Headlight in candela; `decay: 1.5` gives it ~90 m of useful throw. */
const HEADLIGHT_INTENSITY = 900;

// ── Track construction ──────────────────────────────────────────────────────

/**
 * Length of one static track chunk, metres.
 *
 * The whole railbed is thousands of metres and is built exactly once, but a
 * single mesh that long can never be culled. Chunking it at roughly the fog
 * distance means only the four or five the player can actually see are
 * submitted, and the rest cost one `visible = false` each.
 */
const CHUNK_LENGTH = 320;
/** Spacing of generated deck rows. Matches `track.ts`'s own bake step. */
const DECK_STEP = 4;
/** How much track is kept alive behind the player (the chase camera sees it). */
const TRACK_BEHIND = 90;

/** Deck overhang outside the outermost rail, metres. */
const DECK_MARGIN = 1.7;
/** Sleeper top, relative to the railhead at height 0. */
const DECK_Y = -0.2;
/** How far the structural skirt hangs below the deck. */
const SKIRT_DEPTH = 1.8;
const RAIL_WIDTH = 0.26;
const RAIL_TOP = 0.02;
/** Metres of track per repeat of the sleeper texture. */
const SLEEPER_TILE = 3.2;

// ── The consist ─────────────────────────────────────────────────────────────

/** Cargo cars trailing the locomotive. */
const CAR_COUNT = 3;
/** Centre-to-centre spacing of the consist along the curve, metres. */
const CAR_SPACING = TRAIN_LENGTH + 1.8;
const CAR_LENGTH = TRAIN_LENGTH * 0.82;
const CAR_WIDTH = RAIL_SPACING * 0.72;

/**
 * Ring buffer of where the lead car has been, sampled every half metre.
 *
 * Cargo cars read their lateral offset and height out of this rather than
 * copying the locomotive's current values, which is what makes a rail switch
 * ripple down the consist and a jump lift the cars one after another instead of
 * teleporting the whole train sideways at once.
 */
const HISTORY_SLOTS = 160;
const HISTORY_STEP = 0.5;

/** Crates the renderer can show. Levels author fewer; this is the ceiling. */
const CRATE_CAPACITY = 12;

// ── Instanced capacities ────────────────────────────────────────────────────

const FEATURE_CAP = 128;
const FEATURE_CAP_SMALL = 48;
const PROP_BLOCK_CAP = 220;
const PROP_TALL_CAP = 160;
const PROP_GLOW_CAP = 160;
const PROP_ARCH_CAP = 96;

/** How far ahead scenery is streamed; beyond this the fog has it anyway. */
const SCENERY_RANGE = 420;
const SCENERY_BEHIND = 90;

/**
 * Longest instance a curved feature is drawn with, metres.
 *
 * A 90 m grind rail drawn as one stretched box would cut the corner off every
 * bend it crosses. Chopping long features into short segments, each oriented at
 * its own arc length, makes them follow the curve for free.
 */
const FEATURE_SEGMENT = 9;

// ── Effects ─────────────────────────────────────────────────────────────────

const RAIN_COUNT = 700;
const RAIN_RADIUS = 22;
const RAIN_TOP = 18;
const STREAK_COUNT = 96;
const STAR_COUNT = 700;

// ── Adaptive quality ────────────────────────────────────────────────────────

const RENDER_SCALES = [0.55, 0.7, 0.85, 1];
/** Frame time above this for a sustained run means we are over budget. */
const SLOW_FRAME_MS = 23;
const FAST_FRAME_MS = 13.5;

// ── Scratch ─────────────────────────────────────────────────────────────────

const dummy = new THREE.Object3D();
// Yaw last, then pitch, then roll — the aircraft order. With local +Z as the
// direction of travel this makes `rotation.set(pitch, heading, bank)` mean
// exactly what it reads as, for the train and for every track-aligned instance.
dummy.rotation.order = 'YXZ';

const scratchColor = new THREE.Color();
const vecTarget = new THREE.Vector3();
const vecLook = new THREE.Vector3();
const vecForward = new THREE.Vector3();
const vecUp = new THREE.Vector3();
const vecDelta = new THREE.Vector3();
const quatRoll = new THREE.Quaternion();

/** Deterministic 0…1 hash so a scenery slot always dresses itself the same. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Frame-rate independent approach factor for an exponential ease. */
function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

interface TrackChunk {
  group: THREE.Group;
  sStart: number;
  sEnd: number;
}

export interface RendererOptions {
  /** Bloom is the single biggest cost; off by default on weak devices. */
  bloom?: boolean;
  reducedMotion?: boolean;
  /** Upper bound on device pixel ratio. */
  maxPixelRatio?: number;
}

export class NightrailRenderer3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private readonly skyGroup = new THREE.Group();
  private readonly trackGroup = new THREE.Group();
  private readonly sceneryGroup = new THREE.Group();
  private readonly featureGroup = new THREE.Group();
  private readonly trainGroup = new THREE.Group();
  private readonly leadCar = new THREE.Group();
  private readonly rainGroup = new THREE.Group();

  // Environment
  private sky!: THREE.Mesh;
  private skyUniforms!: {
    topColor: { value: THREE.Color };
    horizonColor: { value: THREE.Color };
    bottomColor: { value: THREE.Color };
  };
  private stars!: THREE.Points;
  private groundPlane!: THREE.Mesh;
  private cloudTexture!: THREE.CanvasTexture;
  private pmrem!: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;

  // Lighting
  private hemi!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private headlight!: THREE.SpotLight;
  private crashLight!: THREE.PointLight;
  private headlightCone!: THREE.Mesh;

  // Track (rebuilt per level)
  private chunks: TrackChunk[] = [];
  private sleeperTexture!: THREE.CanvasTexture;
  private deckMaterial!: THREE.MeshStandardMaterial;
  private skirtMaterial!: THREE.MeshStandardMaterial;
  private railMaterial!: THREE.MeshStandardMaterial;
  private edgeMaterial!: THREE.MeshBasicMaterial;

  // Scenery
  private propBlock!: THREE.InstancedMesh;
  private propTall!: THREE.InstancedMesh;
  private propGlow!: THREE.InstancedMesh;
  private propArch!: THREE.InstancedMesh;

  // Features
  private fxBarrier!: THREE.InstancedMesh;
  private fxCeiling!: THREE.InstancedMesh;
  private fxGrind!: THREE.InstancedMesh;
  private fxKicker!: THREE.InstancedMesh;
  private fxCharm!: THREE.InstancedMesh;
  private fxBoostpad!: THREE.InstancedMesh;
  private fxCheckpoint!: THREE.InstancedMesh;
  private fxFreight!: THREE.InstancedMesh;
  private fxFreightLamp!: THREE.InstancedMesh;

  // Train
  private carDecks!: THREE.InstancedMesh;
  private carFrames!: THREE.InstancedMesh;
  private bogies!: THREE.InstancedMesh;
  private crates!: THREE.InstancedMesh;

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
  private boostVignette!: THREE.Mesh;
  private haloTexture!: THREE.CanvasTexture;
  private stripeTexture!: THREE.CanvasTexture;
  private vignetteTexture!: THREE.CanvasTexture;

  // Level state
  private level: LevelConfig | null = null;
  private points: TrackPoint[] = [];
  private trackTotal = 0;
  private railCount = 3;
  private halfWidth = RAIL_SPACING;

  // Consist history
  private history = new Float32Array(HISTORY_SLOTS * 3);
  private historyCount = 0;
  private historyHead = 0;
  /** Arc length the scenery stream is centred on. Set once per frame. */
  private streamAnchor = 0;

  // Camera state
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private prevCamPos = new THREE.Vector3();
  private camRoll = 0;
  private baseFov = BASE_VFOV;
  private fov = BASE_VFOV;
  private shake = 0;
  private prevImmune = 0;
  private cameraPlaced = false;

  // Viewport
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private maxPixelRatio: number;
  private reducedMotion: boolean;
  private wantsBloom: boolean;
  private time = 0;
  private disposed = false;

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
    this.renderer.setClearColor(0x05060f, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.camera = new THREE.PerspectiveCamera(BASE_VFOV, 1, NEAR, FAR);
    this.camera.position.set(0, CAM_HEIGHT, -CAM_BACK);

    this.scene.add(this.skyGroup);
    this.scene.add(this.trackGroup);
    this.scene.add(this.sceneryGroup);
    this.scene.add(this.featureGroup);
    this.scene.add(this.trainGroup);
    this.scene.add(this.rainGroup);
    // The camera carries the screen-space effects (speed streaks, boost
    // vignette) as children, so it has to be in the graph to be traversed.
    this.scene.add(this.camera);

    this.leadCar.rotation.order = 'YXZ';
    this.trainGroup.add(this.leadCar);

    this.buildTextures();
    this.buildLights();
    this.buildEnvironment();
    this.buildTrackMaterials();
    this.buildScenery();
    this.buildFeatures();
    this.buildTrain();
    this.buildEffects();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Re-dress the scene for a level and rebuild its railbed.
   *
   * The polyline is re-baked here rather than taken from {@link RunState}
   * because `bakeTrack` is a pure function of the segment list: the renderer's
   * copy and the sim's are the same numbers, and baking locally means the
   * renderer can build its geometry before the first frame exists.
   */
  setLevel(level: LevelConfig): void {
    this.level = level;
    this.railCount = Math.max(1, level.rails);
    this.halfWidth = railOffset(this.railCount - 1, this.railCount, RAIL_SPACING) + DECK_MARGIN;
    this.points = bakeLevel(level);
    this.trackTotal = this.points.length > 0 ? this.points[this.points.length - 1].s : 0;

    const v = level.visuals;
    this.skyUniforms.topColor.value.set(v.skyTop);
    this.skyUniforms.horizonColor.value.set(v.horizon);
    this.skyUniforms.bottomColor.value.set(v.skyBottom);

    // Linear fog, not FogExp2: the level authors a near *and* a far plane, and
    // exponential fog has no near plane — it would haze the locomotive itself,
    // which is the one object that must stay crisp.
    scratchColor.set(v.fogColor);
    this.scene.fog = new THREE.Fog(scratchColor.getHex(), v.fogNear, v.fogFar);
    this.renderer.setClearColor(scratchColor.getHex(), 1);

    this.hemi.intensity = v.ambient;
    this.hemi.color.set(v.skyTop);
    this.hemi.groundColor.set(v.structureColor);
    this.keyLight.intensity = v.keyLight;
    this.keyLight.color.set(v.keyColor);
    this.stars.visible = v.stars;

    this.applyPalette(v);
    this.applyScenery(v.scenery);
    this.rebuildEnvironmentMap();
    this.rebuildTrack();

    this.historyCount = 0;
    this.historyHead = 0;
    this.cameraPlaced = false;
    this.shake = 0;
    this.prevImmune = 0;
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

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  /** One frame. Called by the React shell's loop — never by this file. */
  draw(state: RunState, dt: number): void {
    if (this.disposed) return;
    // Safety net: a shell that forgot setLevel still gets a correct picture
    // instead of an empty one, and the identity compare costs nothing.
    if (state.level !== this.level) this.setLevel(state.level);
    if (!this.level) return;

    const started = performance.now();
    this.time += dt;

    this.pushHistory(state);
    this.updateCamera(state, dt);
    this.updateTrackVisibility(state.train.s);
    this.updateScenery(state.train.s);
    this.updateFeatures(state);
    this.updateTrain(state);
    this.updateSparks(state);
    this.updateWeather(state, dt);
    this.updateLighting(state, dt);

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
    this.sleeperTexture?.dispose();
    this.haloTexture?.dispose();
    this.stripeTexture?.dispose();
    this.vignetteTexture?.dispose();
    this.cloudTexture?.dispose();
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

    this.ensureComposer();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio * scale);
      this.composer.setSize(this.width, this.height);
    }
  }

  /**
   * Pick a vertical FOV for the current viewport.
   *
   * Landscape keeps a fixed vertical FOV and gains horizontally, so an
   * ultrawide display sees more of the bend rather than a stretched one.
   * Portrait would otherwise be looking down a straw, so its vertical FOV opens
   * up until at least {@link MIN_HFOV} of horizontal view is back. Nothing is
   * ever letterboxed: every device gets the full canvas.
   */
  private updateProjection(): void {
    const aspect = this.width / this.height;
    const toRad = Math.PI / 180;
    let vfov = BASE_VFOV;
    const hfov = (2 * Math.atan(Math.tan((vfov * toRad) / 2) * aspect)) / toRad;
    if (hfov < MIN_HFOV) {
      vfov = (2 * Math.atan(Math.tan((MIN_HFOV * toRad) / 2) / aspect)) / toRad;
    }
    this.baseFov = clamp(vfov, VFOV_LIMITS.min, VFOV_LIMITS.max);
    // Before the first frame there is nothing to ease from, so adopt the new
    // base outright rather than letting the run open on a zoom.
    if (!this.cameraPlaced) this.fov = this.baseFov;

    this.camera.aspect = aspect;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Nudge render scale toward whatever this device can actually sustain.
   *
   * A phone and a desktop land in very different places and neither should have
   * to be detected by name. Dropping is fast (45 slow frames) and climbing back
   * is slow (240 fast ones) so the scale cannot oscillate on a marginal device.
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

  private ensureComposer(): void {
    if (this.composer || !this.wantsBloom) return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.6,
      0.75,
      0.82,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.setPixelRatio(this.pixelRatio * RENDER_SCALES[this.scaleIndex]);
    this.composer.setSize(this.width, this.height);
  }

  private renderFrame(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  /**
   * Chase rig.
   *
   * Everything here is a damped approach toward a target rather than a hard
   * assignment, which is what lets the camera lag on a rail switch and swing
   * back out of a bend — the lag *is* the sense of weight. Under reduced motion
   * every effect that moves the frame independently of the train (shake, FOV
   * punch, roll) is scaled to near nothing, but the chase itself stays.
   */
  private updateCamera(state: RunState, dt: number): void {
    const level = this.level!;
    const train = state.train;
    const firstFrame = !this.cameraPlaced;
    const motion = this.reducedMotion ? 0.12 : 1;
    const speedNorm = clamp(train.speed / Math.max(1, level.maxSpeed), 0, 1.25);

    const back = CAM_BACK + speedNorm * CAM_BACK_SPEED * motion;
    const lateral = train.lateral * CAM_LATERAL_FOLLOW;

    const seat = railPosition(
      this.points,
      train.s - back,
      lateral,
      CAM_HEIGHT + train.height * 0.5,
    );
    const ahead = railPosition(
      this.points,
      Math.min(train.s + LOOK_AHEAD, this.trackTotal),
      train.lateral * 0.4,
      1.6 + train.height * 0.7,
    );

    vecTarget.set(seat.x, seat.y, seat.z);
    vecLook.set(ahead.x, ahead.y, ahead.z);

    if (firstFrame) {
      this.camPos.copy(vecTarget);
      this.camLook.copy(vecLook);
      this.cameraPlaced = true;
    } else {
      this.camPos.lerp(vecTarget, damp(CAM_POS_DAMP, dt));
      this.camLook.lerp(vecLook, damp(CAM_LOOK_DAMP, dt));
    }

    // Crash shake, triggered off the immunity timer's rising edge — the sim
    // hands out immunity exactly when it wrecks you, and unlike `events` it is
    // still true on the frame after, so a dropped event can't lose the shake.
    if (train.immuneFor > this.prevImmune + 0.01) this.shake = 1;
    this.prevImmune = train.immuneFor;
    this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);

    // Held for the weather, which needs how far the camera moved this frame to
    // keep world-static raindrops inside a camera-glued group.
    this.prevCamPos.copy(this.camera.position);
    this.camera.position.copy(this.camPos);
    if (firstFrame) this.prevCamPos.copy(this.camera.position);
    if (this.shake > 0) {
      const amp = this.shake * this.shake * SHAKE_AMPLITUDE * motion;
      this.camera.position.x += Math.sin(this.time * 61) * amp;
      this.camera.position.y += Math.sin(this.time * 47 + 1.7) * amp;
      this.camera.position.z += Math.sin(this.time * 53 + 3.1) * amp * 0.5;
    }

    // Roll: the railbed's own banking, plus a sliver of whatever the body is
    // doing. Clamped so a full trick rotation can never take the horizon.
    const bankRoll = seat.bank * 0.8 + train.roll * CAM_ROLL_FOLLOW;
    const rollTarget = clamp(bankRoll, -CAM_ROLL_MAX, CAM_ROLL_MAX) * motion;
    this.camRoll += (rollTarget - this.camRoll) * damp(CAM_ROLL_DAMP, dt);

    vecForward.copy(this.camLook).sub(this.camera.position);
    if (vecForward.lengthSq() > 1e-6) {
      vecForward.normalize();
      vecUp.set(0, 1, 0);
      quatRoll.setFromAxisAngle(vecForward, this.camRoll);
      vecUp.applyQuaternion(quatRoll);
      this.camera.up.copy(vecUp);
      this.camera.lookAt(this.camLook);
    }

    const boosting = train.boostTime > 0 ? 1 : 0;
    const fovTarget = this.baseFov + (speedNorm * FOV_PUNCH + boosting * FOV_BOOST) * motion;
    if (firstFrame) this.fov = fovTarget;
    else this.fov += (fovTarget - this.fov) * damp(CAM_FOV_DAMP, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // The sky and the ground plane are infinite backdrops: gluing them to the
    // camera means the horizon never gets closer no matter how far you travel.
    this.skyGroup.position.copy(this.camera.position);
    this.groundPlane.position.x = this.camera.position.x;
    this.groundPlane.position.z = this.camera.position.z;
    this.rainGroup.position.copy(this.camera.position);

    // Keep the screen-space vignette covering the frustum as the FOV punches.
    const h = 2 * Math.tan((this.fov * Math.PI) / 360) * 1.05;
    this.boostVignette.scale.set(h * this.camera.aspect, h, 1);
  }

  // ── Consist history ───────────────────────────────────────────────────────

  /** Record where the lead car was, so the cars behind can arrive there later. */
  private pushHistory(state: RunState): void {
    const train = state.train;
    if (this.historyCount > 0) {
      const last = ((this.historyHead - 1 + HISTORY_SLOTS) % HISTORY_SLOTS) * 3;
      if (train.s - this.history[last] < HISTORY_STEP) {
        // Still inside the current sample: refresh it rather than adding one,
        // so a stalled or reversing frame cannot corrupt the buffer's ordering.
        this.history[last + 1] = train.lateral;
        this.history[last + 2] = train.height;
        return;
      }
    }
    const i = this.historyHead * 3;
    this.history[i] = train.s;
    this.history[i + 1] = train.lateral;
    this.history[i + 2] = train.height;
    this.historyHead = (this.historyHead + 1) % HISTORY_SLOTS;
    if (this.historyCount < HISTORY_SLOTS) this.historyCount++;
  }

  /** Lateral offset the lead car had at arc length `s`. Falls back to now. */
  private historyLateral(s: number, fallback: number): number {
    return this.historySample(s, fallback, 1);
  }

  /** Height the lead car had at arc length `s`. */
  private historyHeight(s: number, fallback: number): number {
    return this.historySample(s, fallback, 2);
  }

  private historySample(s: number, fallback: number, field: 1 | 2): number {
    let best = fallback;
    let bestDelta = Infinity;
    for (let n = 0; n < this.historyCount; n++) {
      const i = ((this.historyHead - 1 - n + HISTORY_SLOTS * 2) % HISTORY_SLOTS) * 3;
      const delta = Math.abs(this.history[i] - s);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = this.history[i + field];
      } else if (this.history[i] < s) {
        // The buffer is ordered, so once we are walking away from the target
        // there is nothing better further back.
        break;
      }
    }
    return best;
  }

  // ── Track ─────────────────────────────────────────────────────────────────

  private updateTrackVisibility(s: number): void {
    const far = this.level!.visuals.fogFar + CHUNK_LENGTH;
    for (const chunk of this.chunks) {
      chunk.group.visible = chunk.sEnd > s - TRACK_BEHIND && chunk.sStart < s + far;
    }
  }

  /**
   * Build the whole railbed, once.
   *
   * Four merged meshes per chunk — deck, structural skirt, rails, edge neon —
   * rather than a mesh per sleeper, which for a five kilometre track would be
   * five figures of draw calls. Quads that fall inside a `gap` feature are
   * simply never emitted, so a gap is a real hole in the deck you can see
   * through rather than a decal you have to trust.
   */
  private rebuildTrack(): void {
    this.clearTrack();
    const level = this.level!;
    const points = this.points;
    if (points.length < 2) return;

    const gaps = level.features.filter((f) => f.kind === 'gap');
    const rails = this.railCount;
    const half = this.halfWidth;

    // Lateral boundaries of the deck columns: one column per rail, so a gap on
    // a single rail removes only that strip of decking.
    const bounds: number[] = [-half];
    for (let r = 1; r < rails; r++) {
      bounds.push(railOffset(r - 1, rails, RAIL_SPACING) + RAIL_SPACING / 2);
    }
    bounds.push(half);

    const chunkCount = Math.max(1, Math.ceil(this.trackTotal / CHUNK_LENGTH));
    for (let c = 0; c < chunkCount; c++) {
      const sStart = c * CHUNK_LENGTH;
      const sEnd = Math.min(this.trackTotal, sStart + CHUNK_LENGTH);
      if (sEnd - sStart < DECK_STEP) continue;
      const rows = Math.max(2, Math.round((sEnd - sStart) / DECK_STEP) + 1);

      const group = new THREE.Group();
      group.add(
        new THREE.Mesh(this.buildDeck(sStart, sEnd, rows, bounds, gaps), this.deckMaterial),
      );
      group.add(new THREE.Mesh(this.buildSkirt(sStart, sEnd, rows, gaps), this.skirtMaterial));
      group.add(new THREE.Mesh(this.buildRails(sStart, sEnd, rows, gaps), this.railMaterial));
      group.add(new THREE.Mesh(this.buildEdges(sStart, sEnd, rows, gaps), this.edgeMaterial));
      this.trackGroup.add(group);
      this.chunks.push({ group, sStart, sEnd });
    }
  }

  private clearTrack(): void {
    for (const chunk of this.chunks) {
      chunk.group.traverse((object) => {
        (object as THREE.Mesh).geometry?.dispose?.();
      });
      this.trackGroup.remove(chunk.group);
    }
    this.chunks.length = 0;
  }

  /** True when a `gap` feature swallows the deck for `rail` at arc length `s`. */
  private gapAt(gaps: TrackFeature[], s: number, rail: number): boolean {
    for (const g of gaps) {
      if (s < g.s || s > g.s + g.length) continue;
      if (g.rails.length === 0 || g.rails.includes(rail)) return true;
    }
    return false;
  }

  private buildDeck(
    sStart: number,
    sEnd: number,
    rows: number,
    bounds: number[],
    gaps: TrackFeature[],
  ): THREE.BufferGeometry {
    const cols = bounds.length;
    const position: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];

    for (let r = 0; r < rows; r++) {
      const s = sStart + ((sEnd - sStart) * r) / (rows - 1);
      for (let k = 0; k < cols; k++) {
        const w = railPosition(this.points, s, bounds[k], DECK_Y);
        position.push(w.x, w.y, w.z);
        uv.push(k / (cols - 1), s / SLEEPER_TILE);
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      const sMid = sStart + ((sEnd - sStart) * (r + 0.5)) / (rows - 1);
      for (let k = 0; k < cols - 1; k++) {
        if (this.gapAt(gaps, sMid, k)) continue;
        const a = r * cols + k;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }

    return this.finishGeometry(position, index, uv);
  }

  private buildSkirt(
    sStart: number,
    sEnd: number,
    rows: number,
    gaps: TrackFeature[],
  ): THREE.BufferGeometry {
    const position: number[] = [];
    const index: number[] = [];
    const outer = this.railCount - 1;

    for (let r = 0; r < rows; r++) {
      const s = sStart + ((sEnd - sStart) * r) / (rows - 1);
      for (let side = 0; side < 2; side++) {
        const lat = side === 0 ? -this.halfWidth : this.halfWidth;
        const top = railPosition(this.points, s, lat, DECK_Y);
        const bottom = railPosition(this.points, s, lat, DECK_Y - SKIRT_DEPTH);
        position.push(top.x, top.y, top.z, bottom.x, bottom.y, bottom.z);
      }
    }

    // Four vertices per row: left-top, left-bottom, right-top, right-bottom.
    for (let r = 0; r < rows - 1; r++) {
      const sMid = sStart + ((sEnd - sStart) * (r + 0.5)) / (rows - 1);
      const base = r * 4;
      if (!this.gapAt(gaps, sMid, 0)) {
        index.push(base, base + 1, base + 4, base + 1, base + 5, base + 4);
      }
      if (!this.gapAt(gaps, sMid, outer)) {
        index.push(base + 2, base + 6, base + 3, base + 3, base + 6, base + 7);
      }
    }

    return this.finishGeometry(position, index);
  }

  /**
   * The running rails themselves.
   *
   * Each rail is a three-quad "U" per row — left face, head, right face — which
   * is enough thickness to catch the key light and read as metal from the chase
   * camera without paying for a swept box.
   */
  private buildRails(
    sStart: number,
    sEnd: number,
    rows: number,
    gaps: TrackFeature[],
  ): THREE.BufferGeometry {
    const position: number[] = [];
    const index: number[] = [];
    const rails = this.railCount;
    const perRow = rails * 4;

    for (let r = 0; r < rows; r++) {
      const s = sStart + ((sEnd - sStart) * r) / (rows - 1);
      for (let rail = 0; rail < rails; rail++) {
        const lat = railOffset(rail, rails, RAIL_SPACING);
        const l0 = railPosition(this.points, s, lat - RAIL_WIDTH / 2, DECK_Y);
        const l1 = railPosition(this.points, s, lat - RAIL_WIDTH / 2, RAIL_TOP);
        const r1 = railPosition(this.points, s, lat + RAIL_WIDTH / 2, RAIL_TOP);
        const r0 = railPosition(this.points, s, lat + RAIL_WIDTH / 2, DECK_Y);
        position.push(l0.x, l0.y, l0.z, l1.x, l1.y, l1.z, r1.x, r1.y, r1.z, r0.x, r0.y, r0.z);
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      const sMid = sStart + ((sEnd - sStart) * (r + 0.5)) / (rows - 1);
      for (let rail = 0; rail < rails; rail++) {
        if (this.gapAt(gaps, sMid, rail)) continue;
        const a = r * perRow + rail * 4;
        const b = a + perRow;
        for (let q = 0; q < 3; q++) {
          index.push(a + q, b + q, a + q + 1, a + q + 1, b + q, b + q + 1);
        }
      }
    }

    return this.finishGeometry(position, index);
  }

  /**
   * Emissive strips down both deck edges.
   *
   * This is the single biggest readability win at night: the strips draw the
   * track's shape all the way out to the fog without depending on any light
   * source, so a bend is legible long before the headlight reaches it.
   */
  private buildEdges(
    sStart: number,
    sEnd: number,
    rows: number,
    gaps: TrackFeature[],
  ): THREE.BufferGeometry {
    const position: number[] = [];
    const index: number[] = [];
    const outer = this.railCount - 1;
    const inset = 0.22;

    for (let r = 0; r < rows; r++) {
      const s = sStart + ((sEnd - sStart) * r) / (rows - 1);
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const a = railPosition(this.points, s, sign * this.halfWidth, DECK_Y + 0.04);
        const b = railPosition(this.points, s, sign * (this.halfWidth - inset), DECK_Y + 0.04);
        position.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    for (let r = 0; r < rows - 1; r++) {
      const sMid = sStart + ((sEnd - sStart) * (r + 0.5)) / (rows - 1);
      const base = r * 4;
      if (!this.gapAt(gaps, sMid, 0)) {
        index.push(base, base + 4, base + 1, base + 1, base + 4, base + 5);
      }
      if (!this.gapAt(gaps, sMid, outer)) {
        index.push(base + 2, base + 3, base + 6, base + 3, base + 7, base + 6);
      }
    }

    return this.finishGeometry(position, index);
  }

  private finishGeometry(position: number[], index: number[], uv?: number[]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3));
    if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geometry.setIndex(
      position.length / 3 > 65535
        ? new THREE.BufferAttribute(new Uint32Array(index), 1)
        : new THREE.BufferAttribute(new Uint16Array(index), 1),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  // ── Features ──────────────────────────────────────────────────────────────

  /**
   * Lay out every hazard inside the fog.
   *
   * One InstancedMesh per visual kind, refilled from scratch each frame, so
   * nothing is ever allocated and freight — the only feature whose `s` moves —
   * needs no special handling at all: its instance simply lands somewhere new.
   */
  private updateFeatures(state: RunState): void {
    const level = this.level!;
    const s0 = state.train.s;
    const far = level.visuals.fogFar;
    const rails = this.railCount;

    let nBarrier = 0;
    let nCeiling = 0;
    let nGrind = 0;
    let nKicker = 0;
    let nCharm = 0;
    let nBoost = 0;
    let nCheck = 0;
    let nFreight = 0;
    let nLamp = 0;

    for (const f of state.features) {
      if (f.s + f.length < s0 - TRACK_BEHIND) continue;
      if (f.s > s0 + far) continue;

      switch (f.kind) {
        case 'gap':
          // Already a hole in the deck geometry — nothing to draw.
          break;

        case 'barrier':
          for (let rail = 0; rail < rails; rail++) {
            if (!coversRail(f, rail)) continue;
            nBarrier = this.stripe(
              this.fxBarrier,
              nBarrier,
              FEATURE_CAP,
              f.s,
              f.s + f.length,
              railOffset(rail, rails, RAIL_SPACING),
              0,
              RAIL_SPACING * 0.78,
              Math.max(0.6, f.clearance),
            );
          }
          break;

        case 'freight':
          for (let rail = 0; rail < rails; rail++) {
            if (!coversRail(f, rail)) continue;
            const lat = railOffset(rail, rails, RAIL_SPACING);
            nFreight = this.stripe(
              this.fxFreight,
              nFreight,
              FEATURE_CAP,
              f.s,
              f.s + f.length,
              lat,
              0,
              RAIL_SPACING * 0.82,
              Math.max(1.2, f.clearance),
            );
            // A lamp on the leading face: freight closes on the player, so its
            // front is the low-`s` end and that is the part you have to read.
            nLamp = this.point(
              this.fxFreightLamp,
              nLamp,
              FEATURE_CAP_SMALL,
              f.s,
              lat,
              Math.max(1.2, f.clearance) * 0.6,
              RAIL_SPACING * 0.7,
              RAIL_SPACING * 0.7,
              1,
            );
          }
          break;

        case 'ceiling':
          nCeiling = this.stripe(
            this.fxCeiling,
            nCeiling,
            FEATURE_CAP,
            f.s,
            f.s + f.length,
            0,
            Math.max(1.5, f.clearance),
            this.halfWidth * 2,
            0.6,
          );
          break;

        case 'grindrail':
          for (let rail = 0; rail < rails; rail++) {
            if (!coversRail(f, rail)) continue;
            nGrind = this.stripe(
              this.fxGrind,
              nGrind,
              FEATURE_CAP,
              f.s,
              f.s + f.length,
              railOffset(rail, rails, RAIL_SPACING),
              0.18,
              0.24,
              0.5,
            );
          }
          break;

        case 'kicker':
          for (let rail = 0; rail < rails; rail++) {
            if (!coversRail(f, rail)) continue;
            nKicker = this.point(
              this.fxKicker,
              nKicker,
              FEATURE_CAP_SMALL,
              f.s + f.length / 2,
              railOffset(rail, rails, RAIL_SPACING),
              0,
              RAIL_SPACING * 0.82,
              1.15,
              Math.max(3, f.length),
            );
          }
          break;

        case 'charm':
          if (f.consumed) break;
          for (let rail = 0; rail < rails; rail++) {
            if (!coversRail(f, rail)) continue;
            if (nCharm >= FEATURE_CAP_SMALL) break;
            const lat = railOffset(rail, rails, RAIL_SPACING);
            const bob = Math.sin(this.time * 2.4 + f.id) * 0.22;
            const w = railPosition(this.points, f.s + f.length / 2, lat, 1.7 + bob);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading + this.time * 2.1, w.bank);
            dummy.scale.setScalar(0.85);
            dummy.updateMatrix();
            this.fxCharm.setMatrixAt(nCharm++, dummy.matrix);
          }
          break;

        case 'boostpad':
          if (f.consumed) break;
          for (let rail = 0; rail < rails; rail++) {
            if (!coversRail(f, rail)) continue;
            nBoost = this.stripe(
              this.fxBoostpad,
              nBoost,
              FEATURE_CAP,
              f.s,
              f.s + Math.max(3, f.length),
              railOffset(rail, rails, RAIL_SPACING),
              0.05,
              RAIL_SPACING * 0.82,
              1,
            );
          }
          break;

        case 'checkpoint': {
          // A single arch straddling the whole track, whatever rails it lists —
          // a gate you pass under has to read as one object.
          const r = this.halfWidth + 1.1;
          nCheck = this.point(
            this.fxCheckpoint,
            nCheck,
            FEATURE_CAP_SMALL,
            f.s,
            0,
            DECK_Y,
            r,
            r,
            r * 0.35,
          );
          break;
        }
      }
    }

    commit(this.fxBarrier, nBarrier);
    commit(this.fxCeiling, nCeiling);
    commit(this.fxGrind, nGrind);
    commit(this.fxKicker, nKicker);
    commit(this.fxCharm, nCharm);
    commit(this.fxBoostpad, nBoost);
    commit(this.fxCheckpoint, nCheck);
    commit(this.fxFreight, nFreight);
    commit(this.fxFreightLamp, nLamp);
  }

  /**
   * Lay a feature along the curve as a run of short instances.
   *
   * `width`/`height` scale the instance across and up; the length comes from
   * the segment, capped at {@link FEATURE_SEGMENT} so the run bends with the
   * track instead of chording across it. Returns the new instance count.
   */
  private stripe(
    mesh: THREE.InstancedMesh,
    count: number,
    cap: number,
    sStart: number,
    sEnd: number,
    lateral: number,
    y: number,
    width: number,
    height: number,
  ): number {
    const total = Math.max(0.6, sEnd - sStart);
    const segments = Math.max(1, Math.ceil(total / FEATURE_SEGMENT));
    const segLen = total / segments;
    let n = count;
    for (let i = 0; i < segments && n < cap; i++) {
      const s = sStart + segLen * (i + 0.5);
      const w = railPosition(this.points, s, lateral, y);
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(0, w.heading, w.bank);
      // A hair of overlap hides the seam between consecutive segments.
      dummy.scale.set(width, height, segLen * 1.04);
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    return n;
  }

  /** One track-aligned instance at a single arc length. */
  private point(
    mesh: THREE.InstancedMesh,
    count: number,
    cap: number,
    s: number,
    lateral: number,
    y: number,
    sx: number,
    sy: number,
    sz: number,
  ): number {
    if (count >= cap) return count;
    const w = railPosition(this.points, s, lateral, y);
    dummy.position.set(w.x, w.y, w.z);
    dummy.rotation.set(0, w.heading, w.bank);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(count, dummy.matrix);
    return count + 1;
  }

  /**
   * `railPosition`, extended behind the start of the track.
   *
   * The polyline clamps at `s = 0`, so without this the whole consist would
   * pile up on top of the locomotive on the start line. Extrapolating along the
   * opening heading costs two trig calls and lets the train start as a train.
   */
  private sampleWorld(s: number, lateral: number, height: number) {
    const w = railPosition(this.points, s < 0 ? 0 : s, lateral, height);
    if (s < 0) {
      w.x += Math.sin(w.heading) * s;
      w.z += Math.cos(w.heading) * s;
    }
    return w;
  }

  // ── Train ─────────────────────────────────────────────────────────────────

  /**
   * Place the consist.
   *
   * Each car samples the curve at its *own* arc length and reads its lateral
   * offset and height out of the lead car's history, so the train articulates
   * through a bend, whips across on a rail switch and lifts one car at a time
   * off a kicker. This is the detail that makes it read as a train rather than
   * as a sprite sliding down a line.
   */
  private updateTrain(state: RunState): void {
    const train = state.train;
    const grade = samplePoint(this.points, train.s).grade;
    const trackPitch = -Math.atan(grade);

    const lead = railPosition(this.points, train.s, train.lateral, train.height);
    this.leadCar.position.set(lead.x, lead.y, lead.z);
    this.leadCar.rotation.set(
      trackPitch + train.pitch,
      lead.heading + train.yaw,
      lead.bank + train.roll,
    );

    // Cargo cars, bogies and crates all ride the same instanced meshes: one
    // draw call each however long the consist gets.
    let nDeck = 0;
    let nFrame = 0;
    let nBogie = 0;
    let nCrate = 0;

    // Two bogies under the locomotive, each sampling the curve at its own end
    // of the frame so they sit on the rails through a bend.
    for (let b = 0; b < 2; b++) {
      const bs = train.s + (b === 0 ? -TRAIN_LENGTH * 0.3 : TRAIN_LENGTH * 0.3);
      const w = this.sampleWorld(bs, train.lateral, train.height);
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(trackPitch + train.pitch, w.heading + train.yaw, w.bank + train.roll);
      dummy.scale.set(RAIL_SPACING * 0.7, 0.45, 1.7);
      dummy.updateMatrix();
      this.bogies.setMatrixAt(nBogie++, dummy.matrix);
    }

    const maxCargo = Math.max(1, train.maxCargo);
    const perCar = Math.ceil(Math.min(maxCargo, CRATE_CAPACITY) / CAR_COUNT);

    for (let i = 0; i < CAR_COUNT; i++) {
      const s = train.s - TRAIN_LENGTH * 0.6 - CAR_SPACING * (i + 0.5);
      const lat = this.historyLateral(s, train.lateral);
      const h = this.historyHeight(s, 0);
      const w = this.sampleWorld(s, lat, h);
      // Trailing cars copy a decaying share of the body attitude: enough that a
      // spin visibly travels down the consist, never enough to invert a wagon.
      const decay = Math.pow(0.45, i + 1);
      const pitch = trackPitch + train.pitch * decay;
      const roll = w.bank + train.roll * decay;

      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(pitch, w.heading + train.yaw * decay, roll);
      dummy.scale.set(CAR_WIDTH, 1.15, CAR_LENGTH);
      dummy.updateMatrix();
      if (nDeck < CAR_COUNT) this.carDecks.setMatrixAt(nDeck++, dummy.matrix);

      dummy.scale.set(CAR_WIDTH * 0.86, 0.5, CAR_LENGTH * 0.94);
      dummy.position.set(w.x, w.y, w.z);
      dummy.updateMatrix();
      if (nFrame < CAR_COUNT) this.carFrames.setMatrixAt(nFrame++, dummy.matrix);

      for (let b = 0; b < 2; b++) {
        const bs = s + (b === 0 ? -CAR_LENGTH * 0.32 : CAR_LENGTH * 0.32);
        const bw = this.sampleWorld(bs, lat, h);
        dummy.position.set(bw.x, bw.y, bw.z);
        dummy.rotation.set(pitch, bw.heading, bw.bank);
        dummy.scale.set(CAR_WIDTH * 0.92, 0.42, 1.5);
        dummy.updateMatrix();
        if (nBogie < CAR_COUNT * 2 + 2) this.bogies.setMatrixAt(nBogie++, dummy.matrix);
      }

      // Crates: the health bar wearing a hat. Cars visibly empty from the back
      // of the consist forward as crashes shed them.
      for (let j = 0; j < perCar; j++) {
        const slot = i * perCar + j;
        if (slot >= train.cargo || nCrate >= CRATE_CAPACITY) break;
        const offset = (j % 2 === 0 ? -1 : 1) * CAR_WIDTH * 0.24;
        const along = s + (Math.floor(j / 2) - (perCar - 1) / 4) * 1.9;
        const cw = this.sampleWorld(along, lat + offset, h + 1.15);
        dummy.position.set(cw.x, cw.y, cw.z);
        dummy.rotation.set(pitch, cw.heading + train.yaw * decay, roll);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.crates.setMatrixAt(nCrate++, dummy.matrix);
      }
    }

    commit(this.carDecks, nDeck);
    commit(this.carFrames, nFrame);
    commit(this.bogies, nBogie);
    commit(this.crates, nCrate);

    // The wreck reads as the headlight dying rather than as a HUD message.
    const wrecked = train.mode === 'wrecked';
    this.headlightCone.visible = !wrecked;
    this.headlight.intensity = wrecked ? 0 : HEADLIGHT_INTENSITY;

    // Blink the locomotive through its post-crash immunity so the player can
    // see, without reading the HUD, that a hit right now costs nothing. Kept
    // at 2.5 Hz and suppressed entirely under reduced motion — a full-body
    // flash is exactly the effect that setting exists to turn off.
    const blink = !this.reducedMotion && train.immuneFor > 0 && Math.sin(this.time * 16) > 0;
    this.leadCar.visible = !blink;
  }

  // ── Scenery ───────────────────────────────────────────────────────────────

  /**
   * Dress the sides of the track for this level's setting.
   *
   * Props are never allocated: four InstancedMeshes are refilled every frame
   * from the arc-length slots inside the streaming window, so a prop that falls
   * behind the camera is reused ahead of it. Each slot hashes its own jitter, so
   * the same crane is in the same place every attempt.
   */
  private updateScenery(s0: number): void {
    let nBlock = 0;
    let nTall = 0;
    let nGlow = 0;
    let nArch = 0;
    const half = this.halfWidth;
    this.streamAnchor = s0;

    switch (this.level!.visuals.scenery) {
      case 'harbor': {
        // Stacked containers along the quay, plus gantry cranes over them.
        nBlock = this.streamProp(
          nBlock,
          PROP_BLOCK_CAP,
          13,
          (slot, s) => {
            const h = hash01(slot);
            const side = slot % 2 === 0 ? -1 : 1;
            const stack = 1 + Math.floor(h * 3);
            const dist = half + 4.5 + h * 8;
            const w = railPosition(this.points, s, side * dist, DECK_Y - 1.2);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading + (h - 0.5) * 0.3, 0);
            dummy.scale.set(2.6, 2.5 * stack, 6.2);
            return hash01(slot * 3.7) * 3;
          },
          this.propBlock,
        );

        nTall = this.streamProp(
          nTall,
          PROP_TALL_CAP,
          96,
          (slot, s) => {
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 13), DECK_Y - 1.2);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, 0);
            dummy.scale.set(1.3, 24, 1.3);
            return -1;
          },
          this.propTall,
        );

        nBlock = this.streamProp(
          nBlock,
          PROP_BLOCK_CAP,
          96,
          (slot, s) => {
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 5), 22);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, 0);
            dummy.scale.set(19, 1.1, 1.6);
            return 0.08;
          },
          this.propBlock,
        );

        nGlow = this.streamProp(
          nGlow,
          PROP_GLOW_CAP,
          48,
          (slot, s) => {
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 12.6), 23.5);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, 0);
            dummy.scale.set(1.6, 1.6, 1);
            return slot % 4 === 0 ? 1 : 0;
          },
          this.propGlow,
        );
        break;
      }

      case 'city': {
        nTall = this.streamProp(
          nTall,
          PROP_TALL_CAP,
          14,
          (slot, s) => {
            const h = hash01(slot);
            const h2 = hash01(slot * 5.1);
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 11 + h * 26), DECK_Y - 26);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading + (h2 - 0.5) * 0.5, 0);
            dummy.scale.set(6 + h2 * 7, 30 + h * 62, 6 + h * 6);
            return -1;
          },
          this.propTall,
        );

        // Signage on the tower faces, alternating the two accent colours so the
        // corridor reads as a street rather than a wall.
        nGlow = this.streamProp(
          nGlow,
          PROP_GLOW_CAP,
          14,
          (slot, s) => {
            const h = hash01(slot);
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 10.4 + h * 26), 6 + h * 26);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading + (side < 0 ? Math.PI / 2 : -Math.PI / 2), 0);
            dummy.scale.set(3 + h * 4, 7 + h * 9, 1);
            return slot % 2;
          },
          this.propGlow,
        );
        break;
      }

      case 'viaduct': {
        // Piers marching down into the water, plus a cross brace on each.
        nTall = this.streamProp(
          nTall,
          PROP_TALL_CAP,
          26,
          (_slot, s) => {
            const w = railPosition(this.points, s, 0, DECK_Y - SKIRT_DEPTH - 44);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, 0);
            dummy.scale.set(3.4, 44, 3.4);
            return -1;
          },
          this.propTall,
        );

        nBlock = this.streamProp(
          nBlock,
          PROP_BLOCK_CAP,
          26,
          (_slot, s) => {
            const w = railPosition(this.points, s, 0, DECK_Y - SKIRT_DEPTH - 5);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, 0);
            dummy.scale.set(this.halfWidth * 1.9, 1.1, 1.4);
            return 0.05;
          },
          this.propBlock,
        );

        nGlow = this.streamProp(
          nGlow,
          PROP_GLOW_CAP,
          26,
          (slot, s) => {
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 0.25), 1.5);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, 0);
            dummy.scale.set(0.6, 0.6, 1);
            return slot % 2;
          },
          this.propGlow,
        );
        break;
      }

      case 'tunnel': {
        nArch = this.streamProp(
          nArch,
          PROP_ARCH_CAP,
          8,
          (_slot, s) => {
            const r = half + 1.4;
            const w = railPosition(this.points, s, 0, DECK_Y);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, w.bank);
            dummy.scale.set(r, r * 0.85, r * 0.28);
            return -1;
          },
          this.propArch,
        );

        // Spacing is half the segment length and the side alternates, so each
        // wall gets a continuous run of overlapping panels from one stream.
        nBlock = this.streamProp(
          nBlock,
          PROP_BLOCK_CAP,
          4,
          (slot, s) => {
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 1.1), DECK_Y);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, w.bank);
            dummy.scale.set(0.8, 6, 8.3);
            return 0.02;
          },
          this.propBlock,
        );

        nGlow = this.streamProp(
          nGlow,
          PROP_GLOW_CAP,
          16,
          (slot, s) => {
            const w = railPosition(this.points, s, 0, 5.4);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(Math.PI / 2, w.heading, 0);
            dummy.scale.set(2.6, 0.5, 1);
            return slot % 3 === 0 ? 1 : 0;
          },
          this.propGlow,
        );
        break;
      }

      case 'skybridge': {
        nTall = this.streamProp(
          nTall,
          PROP_TALL_CAP,
          29,
          (slot, s) => {
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 2.6), 0);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, w.bank);
            dummy.scale.set(1.2, 28, 1.2);
            return -1;
          },
          this.propTall,
        );

        nBlock = this.streamProp(
          nBlock,
          PROP_BLOCK_CAP,
          58,
          (_slot, s) => {
            const w = railPosition(this.points, s, 0, DECK_Y - SKIRT_DEPTH - 30);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, 0);
            dummy.scale.set(2.6, 30, 2.6);
            return 0.04;
          },
          this.propBlock,
        );

        nGlow = this.streamProp(
          nGlow,
          PROP_GLOW_CAP,
          29,
          (slot, s) => {
            const side = slot % 2 === 0 ? -1 : 1;
            const w = railPosition(this.points, s, side * (half + 2.6), 27);
            dummy.position.set(w.x, w.y, w.z);
            dummy.rotation.set(0, w.heading, 0);
            dummy.scale.set(1.1, 1.1, 1);
            return slot % 2;
          },
          this.propGlow,
        );
        break;
      }
    }

    commit(this.propBlock, nBlock);
    commit(this.propTall, nTall);
    commit(this.propGlow, nGlow);
    commit(this.propArch, nArch);

    // The ground plane rides with the camera, so its texture has to scroll the
    // other way or the cloud deck looks welded to the train.
    this.cloudTexture.offset.set(this.camera.position.x / 260, this.camera.position.z / 260);
    const anchor = railPosition(this.points, s0, 0, 0);
    this.groundPlane.position.y = anchor.y + this.groundOffset();
  }

  /**
   * Walk the arc-length slots inside the streaming window.
   *
   * `place` fills the shared `dummy` and returns a palette index for the
   * instance colour, or a negative number to leave the colour alone.
   */
  private streamProp(
    count: number,
    cap: number,
    spacing: number,
    place: (slot: number, s: number) => number,
    mesh: THREE.InstancedMesh,
  ): number {
    const first = Math.ceil((this.streamAnchor - SCENERY_BEHIND) / spacing);
    const slots = Math.floor((SCENERY_RANGE + SCENERY_BEHIND) / spacing);
    let n = count;
    for (let i = 0; i < slots && n < cap; i++) {
      const slot = first + i;
      const s = slot * spacing;
      if (s < 0 || s > this.trackTotal) continue;
      const tint = place(slot, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      if (tint >= 0 && mesh.instanceColor) {
        this.paletteColor(tint);
        mesh.setColorAt(n, scratchColor);
      }
      n++;
    }
    return n;
  }

  private groundOffset(): number {
    switch (this.level!.visuals.scenery) {
      case 'viaduct':
        return -28;
      case 'skybridge':
        return -74;
      case 'harbor':
        return -8;
      default:
        return -6;
    }
  }

  /** Palette lookup used for instance tints: 0 = accent, 1 = accent2, else structure. */
  private paletteColor(index: number): void {
    const v = this.level!.visuals;
    if (index < 0.5) scratchColor.set(v.accent);
    else if (index < 1.5) scratchColor.set(v.accent2);
    else scratchColor.set(v.structureColor);
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  private updateSparks(state: RunState): void {
    let n = 0;
    for (const p of state.particles) {
      if (!p.active || n >= MAX_PARTICLES) continue;
      const w = railPosition(this.points, p.s, p.lateral, p.height);
      const i3 = n * 3;
      this.sparkPositions[i3] = w.x;
      this.sparkPositions[i3 + 1] = w.y;
      this.sparkPositions[i3 + 2] = w.z;
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

  /**
   * Rain and speed lines.
   *
   * The rain group is glued to the camera but the drops are *not*: each frame
   * they are pushed back by however far the camera moved, so they hang in world
   * space and streak past correctly however fast the train is going, without a
   * per-drop world position that would drift out of float precision over a five
   * kilometre run.
   */
  private updateWeather(state: RunState, dt: number): void {
    const v = this.level!.visuals;
    const train = state.train;
    const speedNorm = clamp(train.speed / Math.max(1, this.level!.maxSpeed), 0, 1.3);

    if (v.rain > 0) {
      vecDelta.copy(this.camera.position).sub(this.prevCamPos);
      const fall = (24 + speedNorm * 16) * dt;
      const len = 0.9 + speedNorm * 2.6;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const i6 = i * 6;
        let x = this.rainPositions[i6] - vecDelta.x;
        let y = this.rainPositions[i6 + 1] - vecDelta.y - fall;
        let z = this.rainPositions[i6 + 2] - vecDelta.z;
        if (y < -10 || x * x + z * z > RAIN_RADIUS * RAIN_RADIUS) {
          const seed = this.rainSeeds[i];
          const angle = seed * Math.PI * 2 + this.time * 0.7;
          const radius = 2 + hash01(i + Math.floor(this.time)) * RAIN_RADIUS;
          x = Math.cos(angle) * radius;
          z = Math.sin(angle) * radius;
          y = RAIN_TOP * (0.4 + seed * 0.6);
        }
        this.rainPositions[i6] = x;
        this.rainPositions[i6 + 1] = y;
        this.rainPositions[i6 + 2] = z;
        this.rainPositions[i6 + 3] = x;
        this.rainPositions[i6 + 4] = y - len;
        this.rainPositions[i6 + 5] = z;
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    // Speed lines live in camera space, so they always rush the viewer.
    const boosting = train.boostTime > 0;
    const strength = clamp(speedNorm * 0.8 + (boosting ? 0.45 : 0) - 0.35, 0, 1);
    this.streaks.visible = strength > 0.02 && !this.reducedMotion;
    if (this.streaks.visible) {
      const material = this.streaks.material as THREE.LineBasicMaterial;
      material.opacity = strength * 0.45;
      material.color.set(boosting ? v.accent : '#ffffff');
      const rush = (55 + strength * 210) * dt;
      for (let i = 0; i < STREAK_COUNT; i++) {
        const i6 = i * 6;
        let z = this.streakPositions[i6 + 2] + rush;
        if (z > 2) {
          const angle = this.streakSeeds[i * 2 + 1] * Math.PI * 2;
          const radius = 2.2 + this.streakSeeds[i * 2] * 10;
          z = -(30 + this.streakSeeds[i * 2] * 70);
          this.streakPositions[i6] = Math.cos(angle) * radius;
          this.streakPositions[i6 + 1] = Math.sin(angle) * radius * 0.6;
          this.streakPositions[i6 + 3] = this.streakPositions[i6];
          this.streakPositions[i6 + 4] = this.streakPositions[i6 + 1];
        }
        this.streakPositions[i6 + 2] = z;
        this.streakPositions[i6 + 5] = z + 3 + strength * 12;
      }
      (this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    const tint = this.boostVignette.material as THREE.MeshBasicMaterial;
    const wanted = this.reducedMotion ? 0 : clamp(train.boostTime * 1.6, 0, 1) * 0.55;
    tint.opacity += (wanted - tint.opacity) * damp(6, dt);
    this.boostVignette.visible = tint.opacity > 0.01;
    if (this.boostVignette.visible) tint.color.set(v.accent);
  }

  private updateLighting(state: RunState, dt: number): void {
    const v = this.level!.visuals;
    const train = state.train;

    // Crash flash: a short, bright point light right where the wreck happened.
    this.crashLight.intensity = this.shake * this.shake * 900;
    this.crashLight.position.copy(this.leadCar.position);
    this.crashLight.position.y += 1.5;

    if (this.bloomPass) {
      const target =
        0.32 + v.neon * 0.45 + (train.boostTime > 0 ? 0.3 : 0) + train.driftCharge * 0.2;
      this.bloomPass.strength += (target - this.bloomPass.strength) * damp(4, dt);
    }
  }

  // ── Construction ──────────────────────────────────────────────────────────

  private buildTextures(): void {
    this.sleeperTexture = this.makeSleeperTexture();
    this.haloTexture = this.makeHaloTexture();
    this.stripeTexture = this.makeStripeTexture();
    this.vignetteTexture = this.makeVignetteTexture();
    this.cloudTexture = this.makeCloudTexture();
  }

  private buildLights(): void {
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a26, 0.7);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1);
    this.keyLight.position.set(-0.5, 1, 0.4);
    this.scene.add(this.keyLight);

    // Physically-scaled: intensity is candela with a `decay` falloff, tuned for
    // the 1:1 metre world rather than guessed.
    this.headlight = new THREE.SpotLight(0xfff3d6, HEADLIGHT_INTENSITY, 190, 0.4, 0.65, 1.5);
    this.headlight.position.set(0, 1.6, TRAIN_LENGTH * 0.45);
    this.headlight.target.position.set(0, -0.4, 90);
    this.leadCar.add(this.headlight);
    this.leadCar.add(this.headlight.target);

    this.crashLight = new THREE.PointLight(0xff8a3c, 0, 60, 2);
    this.scene.add(this.crashLight);
  }

  private buildEnvironment(): void {
    // Sky dome — a vertical gradient meeting the fog colour at the horizon.
    this.skyUniforms = {
      topColor: { value: new THREE.Color('#0a0f2a') },
      horizonColor: { value: new THREE.Color('#2b3d66') },
      bottomColor: { value: new THREE.Color('#05060f') },
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
      // gets neither injected for it, so without them the sky is the one surface
      // in the scene on a different curve — and it blows out.
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        varying vec3 vDirection;
        void main() {
          float h = vDirection.y;
          vec3 sky = mix(horizonColor, topColor, smoothstep(0.0, 0.85, h));
          vec3 col = mix(bottomColor, sky, smoothstep(-0.16, 0.05, h));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 16), skyMaterial);
    this.sky.renderOrder = -2;
    this.skyGroup.add(this.sky);

    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = hash01(i * 1.3) * Math.PI * 2;
      const phi = Math.acos(hash01(i * 2.7) * 0.9 + 0.05);
      const r = 2400;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xdfe8ff,
        size: 8,
        sizeAttenuation: true,
        fog: false,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.stars.renderOrder = -1;
    this.stars.visible = false;
    this.skyGroup.add(this.stars);

    // One plane standing in for water, ground or the cloud deck. It follows the
    // camera, so it is effectively infinite for the price of two triangles.
    const groundGeometry = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    groundGeometry.rotateX(-Math.PI / 2);
    this.groundPlane = new THREE.Mesh(
      groundGeometry,
      new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.4, metalness: 0.5 }),
    );
    this.scene.add(this.groundPlane);
  }

  private buildTrackMaterials(): void {
    this.deckMaterial = new THREE.MeshStandardMaterial({
      map: this.sleeperTexture,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.08,
    });
    this.skirtMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2f42,
      roughness: 0.9,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    this.railMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9c0cf,
      roughness: 0.32,
      metalness: 0.85,
    });
    this.edgeMaterial = new THREE.MeshBasicMaterial({
      color: 0x8fd7ff,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  }

  private buildScenery(): void {
    const box = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    this.propBlock = new THREE.InstancedMesh(
      box(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.12 }),
      PROP_BLOCK_CAP,
    );
    this.propTall = new THREE.InstancedMesh(
      box(),
      new THREE.MeshStandardMaterial({ color: 0x232839, roughness: 0.9, metalness: 0.1 }),
      PROP_TALL_CAP,
    );
    this.propGlow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.haloTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      PROP_GLOW_CAP,
    );
    this.propArch = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.08, 6, 22, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x2b3145, roughness: 0.85, metalness: 0.2 }),
      PROP_ARCH_CAP,
    );

    for (const mesh of [this.propBlock, this.propTall, this.propGlow, this.propArch]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.sceneryGroup.add(mesh);
    }
    // Pre-allocate the instance colour buffers so nothing is allocated on the
    // first frame that happens to tint a prop.
    scratchColor.set('#ffffff');
    this.propBlock.setColorAt(PROP_BLOCK_CAP - 1, scratchColor);
    this.propGlow.setColorAt(PROP_GLOW_CAP - 1, scratchColor);
  }

  private buildFeatures(): void {
    const box = () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    this.fxBarrier = new THREE.InstancedMesh(
      box(),
      new THREE.MeshStandardMaterial({
        map: this.stripeTexture,
        emissive: 0xff3355,
        emissiveIntensity: 0.7,
        roughness: 0.7,
      }),
      FEATURE_CAP,
    );
    this.fxCeiling = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x30364c, roughness: 0.9, metalness: 0.2 }),
      FEATURE_CAP,
    );
    this.fxGrind = new THREE.InstancedMesh(
      box(),
      new THREE.MeshBasicMaterial({ color: 0x7cf6d0, toneMapped: false }),
      FEATURE_CAP,
    );
    this.fxKicker = new THREE.InstancedMesh(
      wedgeGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0x39405c,
        emissive: 0x2b6cff,
        emissiveIntensity: 0.5,
        roughness: 0.6,
        flatShading: true,
      }),
      FEATURE_CAP_SMALL,
    );
    this.fxCharm = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd35c, toneMapped: false }),
      FEATURE_CAP_SMALL,
    );
    this.fxBoostpad = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x4fe6a8,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
        depthWrite: false,
      }),
      FEATURE_CAP,
    );
    this.fxCheckpoint = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.07, 6, 26, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x6ff0e0, toneMapped: false }),
      FEATURE_CAP_SMALL,
    );
    this.fxFreight = new THREE.InstancedMesh(
      box(),
      new THREE.MeshStandardMaterial({
        color: 0x4a3350,
        emissive: 0x220a1a,
        emissiveIntensity: 1,
        roughness: 0.65,
        metalness: 0.35,
      }),
      FEATURE_CAP,
    );
    this.fxFreightLamp = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.haloTexture,
        color: 0xfff0c0,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      FEATURE_CAP_SMALL,
    );

    for (const mesh of [
      this.fxBarrier,
      this.fxCeiling,
      this.fxGrind,
      this.fxKicker,
      this.fxCharm,
      this.fxBoostpad,
      this.fxCheckpoint,
      this.fxFreight,
      this.fxFreightLamp,
    ]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.featureGroup.add(mesh);
    }
  }

  /**
   * The consist.
   *
   * The locomotive is a real Group because it has to spin through tricks; every
   * other part of the train — cargo decks, underframes, bogies, crates — is an
   * InstancedMesh so the whole train costs four draw calls no matter how many
   * cars or crates are aboard.
   */
  private buildTrain(): void {
    const shell = new THREE.MeshStandardMaterial({
      color: 0x2f3550,
      roughness: 0.5,
      metalness: 0.45,
      emissive: 0x0e1120,
      emissiveIntensity: 1,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x0d1524,
      roughness: 0.1,
      metalness: 0.9,
      emissive: 0x1b3a55,
      emissiveIntensity: 0.8,
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(RAIL_SPACING * 0.78, TRAIN_HEIGHT * 0.7, TRAIN_LENGTH * 0.94),
      shell,
    );
    body.position.y = TRAIN_HEIGHT * 0.35 + 0.35;
    this.leadCar.add(body);

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(RAIL_SPACING * 0.66, TRAIN_HEIGHT * 0.42, TRAIN_LENGTH * 0.3),
      glass,
    );
    cab.position.set(0, TRAIN_HEIGHT * 0.86, -TRAIN_LENGTH * 0.18);
    this.leadCar.add(cab);

    // A blunt nose so the direction of travel reads even in silhouette.
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(RAIL_SPACING * 0.6, TRAIN_HEIGHT * 0.42, TRAIN_LENGTH * 0.18),
      shell,
    );
    nose.position.set(0, TRAIN_HEIGHT * 0.3, TRAIN_LENGTH * 0.5);
    this.leadCar.add(nose);

    // The visible beam. In fog and rain this does more for the sense of speed
    // than the spot light it sits inside.
    this.headlightCone = new THREE.Mesh(
      // Apex at the lamp, mouth 1 unit ahead: the beam opens away from the cab.
      new THREE.ConeGeometry(1, 1, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c8,
        transparent: true,
        opacity: 0.09,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.headlightCone.scale.set(4.5, 3.4, 46);
    this.headlightCone.position.set(0, 1.5, TRAIN_LENGTH * 0.5);
    this.leadCar.add(this.headlightCone);

    this.carDecks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x272c40, roughness: 0.7, metalness: 0.35 }),
      CAR_COUNT,
    );
    this.carFrames = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x1a1e2c, roughness: 0.85, metalness: 0.2 }),
      CAR_COUNT,
    );
    this.bogies = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, -0.2, 0),
      new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.9, metalness: 0.3 }),
      CAR_COUNT * 2 + 2,
    );
    this.crates = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.15, 1.05, 1.5).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({
        color: 0xb08a52,
        roughness: 0.85,
        metalness: 0.05,
        emissive: 0x261a0c,
        emissiveIntensity: 1,
      }),
      CRATE_CAPACITY,
    );

    for (const mesh of [this.carDecks, this.carFrames, this.bogies, this.crates]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.trainGroup.add(mesh);
    }
  }

  private buildEffects(): void {
    this.sparkPositions = new Float32Array(MAX_PARTICLES * 3);
    this.sparkColors = new Float32Array(MAX_PARTICLES * 3);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3));
    sparkGeometry.setDrawRange(0, 0);
    this.sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({
        size: 0.28,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

    // Rain as short segments: cheaper and far more legible than points.
    this.rainPositions = new Float32Array(RAIN_COUNT * 6);
    this.rainSeeds = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const seed = hash01(i * 0.61);
      this.rainSeeds[i] = seed;
      const angle = hash01(i * 1.87) * Math.PI * 2;
      const radius = hash01(i * 3.11) * RAIN_RADIUS;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = hash01(i * 5.23) * RAIN_TOP;
      const i6 = i * 6;
      this.rainPositions[i6] = x;
      this.rainPositions[i6 + 1] = y;
      this.rainPositions[i6 + 2] = z;
      this.rainPositions[i6 + 3] = x;
      this.rainPositions[i6 + 4] = y - 1;
      this.rainPositions[i6 + 5] = z;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rain = new THREE.LineSegments(
      rainGeometry,
      new THREE.LineBasicMaterial({
        color: 0xd7e6ff,
        transparent: true,
        opacity: 0.5,
        toneMapped: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rainGroup.add(this.rain);

    this.streakPositions = new Float32Array(STREAK_COUNT * 6);
    this.streakSeeds = new Float32Array(STREAK_COUNT * 2);
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.streakSeeds[i * 2] = hash01(i * 7.3);
      this.streakSeeds[i * 2 + 1] = hash01(i * 11.9);
      const angle = this.streakSeeds[i * 2 + 1] * Math.PI * 2;
      const radius = 2.2 + this.streakSeeds[i * 2] * 10;
      const i6 = i * 6;
      this.streakPositions[i6] = Math.cos(angle) * radius;
      this.streakPositions[i6 + 1] = Math.sin(angle) * radius * 0.6;
      this.streakPositions[i6 + 2] = -hash01(i * 13.7) * 90;
      this.streakPositions[i6 + 3] = this.streakPositions[i6];
      this.streakPositions[i6 + 4] = this.streakPositions[i6 + 1];
      this.streakPositions[i6 + 5] = this.streakPositions[i6 + 2] + 5;
    }
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(this.streakPositions, 3));
    this.streaks = new THREE.LineSegments(
      streakGeometry,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    this.camera.add(this.streaks);

    // Boost tint: a screen-edge wash parented to the camera, so it costs one
    // quad instead of a post-processing pass.
    this.boostVignette = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.vignetteTexture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
      }),
    );
    this.boostVignette.position.z = -1;
    this.boostVignette.renderOrder = 10;
    this.boostVignette.frustumCulled = false;
    this.boostVignette.visible = false;
    this.camera.add(this.boostVignette);
  }

  // ── Per-level dressing ────────────────────────────────────────────────────

  private applyPalette(v: LevelConfig['visuals']): void {
    const neon = v.neon;

    this.deckMaterial.color.set(v.sleeperColor);
    this.deckMaterial.roughness = 1 - v.wetness * 0.82;
    this.deckMaterial.metalness = 0.06 + v.wetness * 0.6;
    this.skirtMaterial.color.set(v.structureColor);
    this.railMaterial.color.set(v.railColor);
    this.railMaterial.roughness = 0.34 - v.wetness * 0.22;
    this.edgeMaterial.color.set(v.accent).multiplyScalar(neon);

    (this.propTall.material as THREE.MeshStandardMaterial).color.set(v.structureColor);
    (this.propArch.material as THREE.MeshStandardMaterial).color.set(v.structureColor);
    (this.fxCeiling.material as THREE.MeshStandardMaterial).color.set(v.structureColor);
    (this.fxGrind.material as THREE.MeshBasicMaterial).color.set(v.accent2).multiplyScalar(neon);
    (this.fxCheckpoint.material as THREE.MeshBasicMaterial).color
      .set(v.accent2)
      .multiplyScalar(neon);
    (this.fxBoostpad.material as THREE.MeshBasicMaterial).color
      .set(v.accent)
      .multiplyScalar(neon * 0.9);
    (this.propGlow.material as THREE.MeshBasicMaterial).opacity = clamp(0.35 + neon * 0.4, 0.2, 1);

    const ground = this.groundPlane.material as THREE.MeshStandardMaterial;
    ground.color.set(v.fogColor);
    // Water and cloud take a mirror finish; solid ground stays matte, so the
    // level's own setting decides how much of the neon comes back at you.
    const wet = v.scenery === 'viaduct' || v.scenery === 'harbor';
    ground.roughness = wet ? 0.08 + (1 - v.wetness) * 0.2 : 0.9;
    ground.metalness = wet ? 0.9 : 0.05;

    this.rain.visible = v.rain > 0;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.25 + v.rain * 0.4;
  }

  private applyScenery(style: LevelConfig['visuals']['scenery']): void {
    const ground = this.groundPlane.material as THREE.MeshStandardMaterial;
    ground.map = style === 'skybridge' ? this.cloudTexture : null;
    ground.needsUpdate = true;
    // A tunnel is sealed: its own walls are the horizon, so the sky, the stars
    // and the ground plane are all wasted draw calls in there.
    const enclosed = style === 'tunnel';
    this.sky.visible = !enclosed;
    this.groundPlane.visible = !enclosed;
    if (enclosed) this.stars.visible = false;
  }

  /**
   * A tiny equirectangular env map baked from the level's own sky.
   *
   * Metalness without an environment is just black, and wetness is expressed as
   * metalness — so this two-hundred-pixel gradient is what makes a rain-slicked
   * railbed reflect anything at all.
   */
  private rebuildEnvironmentMap(): void {
    const v = this.level!.visuals;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, v.skyTop);
    gradient.addColorStop(0.44, v.horizon);
    gradient.addColorStop(0.54, v.fogColor);
    gradient.addColorStop(1, v.structureColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 64);

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = v.accent;
    ctx.fillRect(0, 30, 128, 3);
    ctx.globalAlpha = 1;

    const equirect = new THREE.CanvasTexture(canvas);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    equirect.colorSpace = THREE.SRGBColorSpace;

    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromEquirectangular(equirect);
    this.scene.environment = this.envTarget.texture;
    equirect.dispose();
  }

  // ── Canvas textures ───────────────────────────────────────────────────────

  /** Ballast and sleepers, tiled along the track by the deck's own UVs. */
  private makeSleeperTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    if (ctx) {
      ctx.fillStyle = '#2a2b36';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#3b3d4d';
      for (let y = 0; y < 64; y += 32) ctx.fillRect(0, y, 64, 13);
      ctx.fillStyle = '#1e1f28';
      for (let y = 0; y < 64; y += 32) ctx.fillRect(0, y + 13, 64, 2);
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private makeStripeTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#c62b4a';
      ctx.fillRect(0, 0, 64, 16);
      ctx.fillStyle = '#f2f2f2';
      for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 16);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private makeHaloTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /** Bright at the frame's edges, clear in the middle — a speed wash. */
  private makeVignetteTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.62, 'rgba(255,255,255,0.06)');
      gradient.addColorStop(1, 'rgba(255,255,255,0.85)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private makeCloudTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b1226';
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 90; i++) {
        const x = hash01(i * 1.7) * 128;
        const y = hash01(i * 3.3) * 128;
        const r = 6 + hash01(i * 5.9) * 18;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, 'rgba(120,150,220,0.32)');
        gradient.addColorStop(1, 'rgba(120,150,220,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(24, 24);
    return texture;
  }
}

// ── Module helpers ──────────────────────────────────────────────────────────

/** True when a feature occupies `rail`. An empty list means every rail. */
function coversRail(feature: TrackFeature, rail: number): boolean {
  return feature.rails.length === 0 || feature.rails.includes(rail);
}

/** Publish however many instances were written this frame. */
function commit(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * A unit ramp: flat at -Z, one metre high at +Z.
 *
 * Non-indexed so the faces stay flat-shaded — a kicker has to read as a hard
 * edge you launch off, not as a smooth bump.
 */
function wedgeGeometry(): THREE.BufferGeometry {
  const a = [-0.5, 0, -0.5];
  const b = [0.5, 0, -0.5];
  const e = [-0.5, 0, 0.5];
  const f = [0.5, 0, 0.5];
  const d = [-0.5, 1, 0.5];
  const c = [0.5, 1, 0.5];

  const tris = [
    a,
    b,
    c,
    a,
    c,
    d, // ramp face
    f,
    e,
    d,
    f,
    d,
    c, // back face
    a,
    e,
    f,
    a,
    f,
    b, // underside
    a,
    d,
    e, // left flank
    b,
    c,
    f, // right flank
  ];

  const position = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    position[i * 3] = tris[i][0];
    position[i * 3 + 1] = tris[i][1];
    position[i * 3 + 2] = tris[i][2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return geometry;
}
