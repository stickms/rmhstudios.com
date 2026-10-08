/**
 * The RMH Fashion renderer — a person, and what they are wearing, in the same
 * glass the navigation globe is made of.
 *
 * Structurally this is the car turntable with a different subject, and
 * deliberately so: the material (`lib/render/glass-cage`), the loft
 * (`lib/loft/grid`), the ripple (`lib/fluid`) and the gestures are shared, so
 * the two services are one language rather than two that resemble each other.
 *
 * What is new here is **layering**, and it is a physical fact rather than a
 * render-order list: a garment's `offset` is how far off the skin it sits, and
 * `wardrobe.layered()` sorts by it, so a shirt cannot be drawn over the coat it
 * is underneath. And **one wave**: the body and every garment are lofted with
 * the same ripple origin, so a poke crosses the whole outfit as a single wave
 * instead of ringing each layer separately.
 *
 * Idle at rest, exactly as the cars are: `frame()` returns false the moment the
 * throw has settled, the wobble has died and the last ripple has expired, and
 * its caller stops asking for frames.
 */

import * as THREE from 'three';
import {
  DECELERATION,
  RIPPLE,
  projectDistance,
  rippleWave,
  rubberBandClamp,
  spring,
  springStep,
} from '@/lib/fluid';
import {
  applyPaint,
  cageMaterial,
  glassMaterial,
  type CagePaint,
  type CageTier,
  type InkTarget,
} from '@/lib/render/glass-cage';
import { mergeGrids, type LoftGrid } from '@/lib/loft/grid';
import { buildFigure, figureBounds } from '@/lib/fashion/figure';
import { buildBody, buildGarment, buildTrinket, rippleOrigin } from '@/lib/fashion/garment-hull';
import { layered, type Outfit } from '@/lib/fashion/wardrobe';
import type { SwatchId } from '@/lib/fashion/palette';

/* ── Framing ─────────────────────────────────────────────────────────────── */

const FOV = 26;
/** A front three-quarter, the angle a lookbook is shot from. */
const HOME_AZIMUTH = -0.62;
const HOME_ELEVATION = 0.06;
const ELEVATION_MIN = -0.24;
const ELEVATION_MAX = 0.62;
const AZIMUTH_PER_PX = 0.0075;
const ELEVATION_PER_PX = 0.005;
/** How much of the stage the figure fills. */
const FIT = 0.86;
/** The tallest a figure can be, so the camera does not jump when height changes. */
const FRAME_HEIGHT = 2.1;

const SETTLE_SPRING = spring(0.62, 0.1);
const SETTLE_REST = 0.004;
const SETTLE_VEL_REST = 0.02;

const MAX_RIPPLES = 3;
/** The rock a poke puts into the figure. Smaller than a car's: a person sways. */
const WOBBLE_RAD = 0.09;
const WOBBLE_SPRING = spring(0.62, 0.36);
const WOBBLE_REST = 0.0006;
const WOBBLE_KICK = (() => {
  const omega = Math.sqrt(WOBBLE_SPRING.stiffness / WOBBLE_SPRING.mass);
  const zeta =
    WOBBLE_SPRING.damping / (2 * Math.sqrt(WOBBLE_SPRING.stiffness * WOBBLE_SPRING.mass));
  return omega * Math.sqrt(Math.max(0.01, 1 - zeta * zeta));
})();

/** The scene's ink, plus the wardrobe's own swatches. */
export interface FashionPaint extends CagePaint {
  /** Resolved colour per swatch id, from the `--rmhfash-swatch-*` group. */
  swatches: Record<SwatchId, string>;
}

export interface FashionSceneOptions {
  canvas: HTMLCanvasElement;
  maxDpr: number;
  antialias: boolean;
  reducedMotion: boolean;
  onContextLost?: () => void;
}

interface Ripple {
  x: number;
  y: number;
  z: number;
  t0: number;
}

/** One drawn surface: a merged grid with its own colour and layer. */
interface Layer {
  /** `null` for the body itself. */
  garment: string | null;
  swatch: SwatchId;
  grid: LoftGrid;
  position: THREE.BufferAttribute;
  wave: THREE.BufferAttribute;
  rest: Float32Array;
  objects: THREE.Object3D[];
  dispose: () => void;
}

export class FashionScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly turntable = new THREE.Group();
  private readonly wobbler = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly reduced: boolean;
  private readonly onLost?: () => void;

  private layers: Layer[] = [];
  private paint: FashionPaint | null = null;
  private outfitInk: { target: InkTarget; swatch: SwatchId }[] = [];
  private readonly stageInk: InkTarget[] = [];
  private readonly ring: THREE.LineSegments;
  /** The body's own shell, which a poke is raycast against. */
  private pickTargets: THREE.Mesh[] = [];
  private origin: [number, number, number] = [0, 1, 0];

  private azimuth = HOME_AZIMUTH;
  private azimuthVel = 0;
  private lastAzimuth = HOME_AZIMUTH;
  private elevation = HOME_ELEVATION;
  private elevationVel = 0;
  private settleTo: { azimuth: number; elevation: number } | null = null;
  private dragging = false;

  private ripples: Ripple[] = [];
  private wobble: { yaw: number; vYaw: number; roll: number; vRoll: number } | null = null;
  private displaced = false;

  private lastFrame = 0;
  private lost = false;

  constructor(opts: FashionSceneOptions) {
    this.reduced = opts.reducedMotion;
    this.onLost = opts.onContextLost;
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      alpha: true,
      antialias: opts.antialias,
      powerPreference: 'low-power',
    });
    this.renderer.setClearAlpha(0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr));

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    this.scene.add(this.wobbler);
    this.wobbler.add(this.turntable);

    this.ring = new THREE.LineSegments(groundRing(0.62), this.cage('parallel', this.stageInk));
    this.ring.renderOrder = 0;
    this.wobbler.add(this.ring);

    opts.canvas.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.onLost?.();
  };

  private cage(tier: CageTier, into: InkTarget[], colour?: THREE.Color) {
    const material = cageMaterial();
    into.push({ material, tier, colour });
    return material;
  }

  /** A cage tier that belongs to a worn layer, and therefore to a swatch. */
  private wornCage(tier: CageTier, swatch: SwatchId) {
    const material = cageMaterial();
    const target: InkTarget = { material, tier, colour: this.swatchColour(swatch) };
    this.outfitInk.push({ target, swatch });
    return material;
  }

  /* ── Sizing ─────────────────────────────────────────────────────────────── */

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.placeCamera();
  }

  /**
   * Frame on {@link FRAME_HEIGHT} rather than on the current figure.
   *
   * If the camera tracked the figure's own height, the height slider would do
   * nothing visible — a taller person framed to fill the stage looks exactly
   * like a shorter one. Framing on the tallest a figure can be means the slider
   * moves the person against a fixed frame, which is the whole point of it.
   */
  private placeCamera(): void {
    const halfV = Math.tan((FOV * Math.PI) / 360);
    const halfH = halfV * this.camera.aspect;
    const aim = FRAME_HEIGHT * 0.48;
    const reachY = FRAME_HEIGHT * 0.52;
    const distance = Math.max(reachY / (halfV * FIT), (FRAME_HEIGHT * 0.3) / (halfH * FIT));
    this.camera.position.set(
      0,
      aim + distance * Math.sin(this.elevation),
      distance * Math.cos(this.elevation),
    );
    this.camera.lookAt(0, aim, 0);
    this.camera.updateProjectionMatrix();
  }

  /* ── The outfit ─────────────────────────────────────────────────────────── */

  /**
   * Rebuild the figure and everything on it.
   *
   * Cheap enough to call on every change — a full outfit is a few thousand
   * vertices of pure arithmetic — which is what lets the height slider be a
   * slider rather than a thing you commit to.
   */
  setOutfit(outfit: Outfit): void {
    for (const layer of this.layers) layer.dispose();
    this.layers = [];
    this.turntable.clear();
    this.outfitInk = [];
    this.pickTargets = [];
    this.ripples = [];
    this.wobble = null;
    this.wobbler.rotation.set(0, 0, 0);
    this.displaced = false;

    const segments = buildFigure(outfit.figure);
    this.origin = rippleOrigin(segments);

    // The body first, then each garment outward — `layered` sorts by how far off
    // the skin each one sits, so the draw order is the physical order.
    const body = mergeGrids(buildBody(segments, this.origin).map((p) => p.grid));
    if (body) this.addLayer(null, outfit.tone, body, true);

    for (const { item, garment } of layered(outfit)) {
      if (garment.trinket) {
        const wire = buildTrinket(garment.trinket, segments);
        if (wire.positions.length > 0) this.addWire(item.swatch, wire.positions);
        continue;
      }
      const grid = mergeGrids(buildGarment(garment, segments, this.origin).map((p) => p.grid));
      if (grid) this.addLayer(garment.id, item.swatch, grid, false);
    }

    const bounds = figureBounds(segments);
    this.ring.geometry.dispose();
    this.ring.geometry = groundRing(Math.max(0.34, (bounds.max[0] - bounds.min[0]) * 0.78));

    if (this.paint) this.setPaint(this.paint);
    this.placeCamera();
  }

  private swatchColour(id: SwatchId): THREE.Color | undefined {
    const value = this.paint?.swatches[id];
    return value ? new THREE.Color().setStyle(value) : undefined;
  }

  private addLayer(
    garment: string | null,
    swatch: SwatchId,
    grid: LoftGrid,
    pickable: boolean,
  ): void {
    const rest = grid.positions.slice();
    const position = new THREE.BufferAttribute(grid.positions, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    const wave = new THREE.BufferAttribute(new Float32Array(grid.radii.length), 1);
    wave.setUsage(THREE.DynamicDrawUsage);

    const shell = new THREE.BufferGeometry();
    shell.setAttribute('position', position);
    shell.setAttribute('normal', new THREE.BufferAttribute(grid.normals, 3));
    shell.setAttribute('aWave', wave);
    shell.setIndex(new THREE.BufferAttribute(grid.indices, 1));
    shell.computeBoundingSphere();
    if (shell.boundingSphere) shell.boundingSphere.radius *= 1 + RIPPLE.amplitude * 2;

    const colour = this.swatchColour(swatch);
    // The body takes less accent than a garment: skin is not dyed.
    const accentMix = garment === null ? 0.1 : 0.24;
    const back = glassMaterial(accentMix, THREE.BackSide, 0.5);
    const front = glassMaterial(accentMix, THREE.FrontSide, garment === null ? 0.85 : 1);
    this.outfitInk.push(
      { target: { material: back, tier: 'glass', colour }, swatch },
      { target: { material: front, tier: 'glass', colour }, swatch },
    );

    const objects: THREE.Object3D[] = [];
    const backMesh = new THREE.Mesh(shell, back);
    backMesh.renderOrder = 1;
    const frontMesh = new THREE.Mesh(shell, front);
    frontMesh.renderOrder = 2;
    objects.push(backMesh, frontMesh);
    if (pickable) this.pickTargets.push(frontMesh);

    const cages: THREE.LineSegments[] = [];
    for (const tier of ['minor', 'parallel', 'major'] as const) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', position);
      geometry.setAttribute('aWave', wave);
      geometry.setIndex(new THREE.BufferAttribute(grid.cage[tier], 1));
      const lines = new THREE.LineSegments(geometry, this.wornCage(tier, swatch));
      lines.renderOrder = 3;
      cages.push(lines);
      objects.push(lines);
    }

    for (const o of objects) this.turntable.add(o);

    this.layers.push({
      garment,
      swatch,
      grid,
      position,
      wave,
      rest,
      objects,
      dispose: () => {
        shell.dispose();
        back.dispose();
        front.dispose();
        for (const cage of cages) {
          cage.geometry.dispose();
          (cage.material as THREE.Material).dispose();
        }
      },
    });
  }

  /** A wire accessory: glasses, a chain, a ring. No glass, no ripple. */
  private addWire(swatch: SwatchId, positions: Float32Array): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute(
      'aWave',
      new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1),
    );
    const material = this.wornCage('major', swatch);
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 4;
    this.turntable.add(lines);
    this.layers.push({
      garment: null,
      swatch,
      grid: null as unknown as LoftGrid,
      position: null as unknown as THREE.BufferAttribute,
      wave: null as unknown as THREE.BufferAttribute,
      rest: new Float32Array(0),
      objects: [lines],
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    });
  }

  setPaint(paint: FashionPaint): void {
    this.paint = paint;
    // A layer's colour is its swatch, re-resolved now — so a theme change that
    // moves `accent` re-dyes anything wearing it, and nothing else.
    for (const { target, swatch } of this.outfitInk) target.colour = this.swatchColour(swatch);
    applyPaint([...this.outfitInk.map((o) => o.target), ...this.stageInk], paint);
  }

  /* ── Gestures ───────────────────────────────────────────────────────────── */

  grab(): void {
    this.dragging = true;
    this.settleTo = null;
    this.azimuthVel = 0;
    this.elevationVel = 0;
  }

  /** Turn the figure. The surface follows the finger. */
  drag(dx: number, dy: number): void {
    this.azimuth += dx * AZIMUTH_PER_PX;
    this.elevation = rubberBandClamp(
      this.elevation + dy * ELEVATION_PER_PX,
      ELEVATION_MIN,
      ELEVATION_MAX,
      0.6,
    );
    this.placeCamera();
  }

  release(vx: number, vy: number): void {
    this.dragging = false;
    this.azimuthVel = vx * AZIMUTH_PER_PX;
    this.elevationVel = vy * ELEVATION_PER_PX;
    this.settleTo = {
      azimuth: this.reduced
        ? this.azimuth
        : this.azimuth + projectDistance(vx * AZIMUTH_PER_PX, DECELERATION.fast),
      elevation: Math.min(ELEVATION_MAX, Math.max(ELEVATION_MIN, this.elevation)),
    };
  }

  home(): void {
    this.dragging = false;
    this.azimuthVel = 0;
    this.elevationVel = 0;
    const laps = Math.round((this.azimuth - HOME_AZIMUTH) / (Math.PI * 2));
    const target = { azimuth: HOME_AZIMUTH + laps * Math.PI * 2, elevation: HOME_ELEVATION };
    if (this.reduced) {
      this.azimuth = target.azimuth;
      this.elevation = target.elevation;
      this.settleTo = null;
      this.placeCamera();
    } else {
      this.settleTo = target;
    }
  }

  nudge(azimuth: number, elevation: number): void {
    this.dragging = false;
    this.azimuthVel = 0;
    this.elevationVel = 0;
    const from = this.settleTo ?? { azimuth: this.azimuth, elevation: this.elevation };
    const target = {
      azimuth: from.azimuth + azimuth,
      elevation: Math.min(ELEVATION_MAX, Math.max(ELEVATION_MIN, from.elevation + elevation)),
    };
    if (this.reduced) {
      this.azimuth = target.azimuth;
      this.elevation = target.elevation;
      this.settleTo = null;
      this.placeCamera();
    } else {
      this.settleTo = target;
    }
  }

  /** Poke the figure. The wave crosses the body and everything worn on it. */
  poke(ndcX: number, ndcY: number): boolean {
    if (this.reduced || this.lost || this.pickTargets.length === 0) return false;
    // A poke arrives on a pointer event, not a frame, and a raycast reads
    // `matrixWorld` — which only `render()` refreshes.
    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
    if (!hit) return false;

    const local = this.turntable.worldToLocal(hit.point.clone());
    const ray = local.sub(new THREE.Vector3(...this.origin)).normalize();
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
    this.ripples.push({ x: ray.x, y: ray.y, z: ray.z, t0: seconds() });

    const off = WOBBLE_KICK * WOBBLE_RAD;
    const previous = this.wobble;
    this.wobble = {
      yaw: previous?.yaw ?? 0,
      vYaw: (previous?.vYaw ?? 0) - off * ray.x,
      roll: previous?.roll ?? 0,
      vRoll: (previous?.vRoll ?? 0) + off * ray.y,
    };
    return true;
  }

  /* ── The frame ──────────────────────────────────────────────────────────── */

  frame(now: number): boolean {
    if (this.lost) return false;
    const dt = this.lastFrame ? Math.min(0.064, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;

    let moving = this.dragging;
    if (this.stepSettle(dt)) moving = true;
    if (this.stepWobble(dt)) moving = true;

    this.turntable.rotation.y = this.azimuth;
    this.lastAzimuth = this.azimuth;

    if (this.stepRipples(now / 1000)) moving = true;

    this.renderer.render(this.scene, this.camera);
    if (!moving) this.lastFrame = 0;
    return moving;
  }

  private stepSettle(dt: number): boolean {
    if (!this.settleTo || this.dragging) return false;
    const a = springStep(
      { value: this.azimuth, velocity: this.azimuthVel },
      this.settleTo.azimuth,
      SETTLE_SPRING,
      dt,
    );
    const e = springStep(
      { value: this.elevation, velocity: this.elevationVel },
      this.settleTo.elevation,
      SETTLE_SPRING,
      dt,
    );
    this.azimuth = a.value;
    this.azimuthVel = a.velocity;
    this.elevation = e.value;
    this.elevationVel = e.velocity;
    if (
      Math.abs(a.value - this.settleTo.azimuth) < SETTLE_REST &&
      Math.abs(e.value - this.settleTo.elevation) < SETTLE_REST &&
      Math.abs(a.velocity) < SETTLE_VEL_REST &&
      Math.abs(e.velocity) < SETTLE_VEL_REST
    ) {
      this.azimuth = this.settleTo.azimuth;
      this.elevation = this.settleTo.elevation;
      this.azimuthVel = 0;
      this.elevationVel = 0;
      this.settleTo = null;
    }
    this.placeCamera();
    return true;
  }

  private stepWobble(dt: number): boolean {
    if (!this.wobble) return false;
    const y = springStep(
      { value: this.wobble.yaw, velocity: this.wobble.vYaw },
      0,
      WOBBLE_SPRING,
      dt,
    );
    const r = springStep(
      { value: this.wobble.roll, velocity: this.wobble.vRoll },
      0,
      WOBBLE_SPRING,
      dt,
    );
    if (
      Math.abs(y.value) < WOBBLE_REST &&
      Math.abs(r.value) < WOBBLE_REST &&
      Math.abs(y.velocity) < WOBBLE_REST &&
      Math.abs(r.velocity) < WOBBLE_REST
    ) {
      this.wobble = null;
      this.wobbler.rotation.set(0, 0, 0);
      return false;
    }
    this.wobble = { yaw: y.value, vYaw: y.velocity, roll: r.value, vRoll: r.velocity };
    this.wobbler.rotation.set(0, y.value, r.value);
    return true;
  }

  /**
   * Displace every layer by every live ripple.
   *
   * One loop over the whole outfit, because the body and its clothes share a ray
   * origin — so this is one wave crossing one subject, not a wave per layer.
   */
  private stepRipples(now: number): boolean {
    if (this.ripples.length > 0) {
      this.ripples = this.ripples.filter((r) => now - r.t0 < RIPPLE.life);
    }

    if (this.ripples.length === 0) {
      if (!this.displaced) return false;
      for (const layer of this.layers) {
        if (!layer.position) continue;
        (layer.position.array as Float32Array).set(layer.rest);
        (layer.wave.array as Float32Array).fill(0);
        layer.position.needsUpdate = true;
        layer.wave.needsUpdate = true;
      }
      this.displaced = false;
      return false;
    }

    const live = this.ripples;
    const ages = live.map((r) => now - r.t0);
    for (const layer of this.layers) {
      if (!layer.position) continue;
      const { rays, radii, normals } = layer.grid;
      const positions = layer.position.array as Float32Array;
      const waves = layer.wave.array as Float32Array;
      const rest = layer.rest;
      for (let v = 0; v < radii.length; v++) {
        const i = v * 3;
        const rx = rays[i];
        const ry = rays[i + 1];
        const rz = rays[i + 2];
        let sum = 0;
        for (let k = 0; k < live.length; k++) {
          const s = live[k];
          const dot = rx * s.x + ry * s.y + rz * s.z;
          sum += rippleWave({
            age: ages[k],
            distance: Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot),
          });
        }
        const push = sum * radii[v];
        positions[i] = rest[i] + normals[i] * push;
        positions[i + 1] = rest[i + 1] + normals[i + 1] * push;
        positions[i + 2] = rest[i + 2] + normals[i + 2] * push;
        waves[v] = sum / RIPPLE.amplitude;
      }
      layer.position.needsUpdate = true;
      layer.wave.needsUpdate = true;
    }
    this.displaced = true;
    return true;
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    for (const layer of this.layers) layer.dispose();
    this.layers = [];
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}

function seconds(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

/** A flat ring on the ground, dashed by omission so it reads as a mark. */
function groundRing(radius: number): THREE.BufferGeometry {
  const samples = 96;
  const pts: number[] = [];
  for (let i = 0; i < samples; i++) {
    if (i % 3 === 2) continue;
    const a0 = (i / samples) * Math.PI * 2;
    const a1 = ((i + 1) / samples) * Math.PI * 2;
    pts.push(Math.cos(a0) * radius, 0, Math.sin(a0) * radius);
    pts.push(Math.cos(a1) * radius, 0, Math.sin(a1) * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pts), 3));
  geometry.setAttribute('aWave', new THREE.BufferAttribute(new Float32Array(pts.length / 3), 1));
  return geometry;
}
