/**
 * The liquid-car renderer — the navigation globe's material, worn by a car.
 *
 * One WebGL scene, one vehicle at a time. It is deliberately NOT a game: there
 * is no world, no lights, no shadow maps and no post stack. There is a lofted
 * glass hull, the wireframe cage over it, the running gear, and a wave that
 * travels across all of them when you poke it — the same four things the globe
 * has, and for the same reasons.
 *
 * ## Idle at rest
 *
 * The scene renders **only while something is moving**. {@link LiquidCarScene.frame}
 * returns `false` the moment the throw has settled, the wobble has died and the
 * last ripple has expired, and its caller stops asking for frames. A car nobody
 * is touching costs one composited texture and no GPU work at all.
 *
 * That is a departure from the globe, which drifts the whole time it is open,
 * and it is the right one here: the globe is a menu you have deliberately
 * summoned and will dismiss in a second, whereas this canvas sits inside a page
 * you might read for a minute. Something spinning in the corner of a page you
 * are reading is a distraction nobody asked for; a car that swings into its
 * pose, settles, and then waits for you is an object. Turn it and it turns.
 *
 * ## Where the wave is computed
 *
 * On the CPU, per vertex, from `lib/fluid`'s `rippleWave` — not in a vertex
 * shader. A GLSL copy of the wavelet would be a second, unverifiable definition
 * of how this site's surfaces behave, and the entire reason the ripple lives in
 * `lib/fluid` is that there should only ever be one. The cost is ~1,600 vertices
 * × the live ripples, for at most `RIPPLE.life` seconds per poke and only while
 * a ripple exists, which is cheaper than the frame it is drawn in.
 *
 * The displaced positions are written into ONE shared `BufferAttribute` that the
 * hull mesh and all three cage tiers index into, so the wave moves the glass and
 * the wireframe over it as a single surface, in a single upload.
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
import { FLEET_HEIGHT, FLEET_RADIUS, type CarBodySpec } from '@/lib/rideshare/cars';
import {
  buildHull,
  buildRotor,
  buildWheels,
  rotorHub,
  type HullGrid,
} from '@/lib/rideshare/car-hull';

/* ── Framing ─────────────────────────────────────────────────────────────── */

/** A long lens: less perspective distortion, so a 5 m body still reads as 5 m. */
const FOV = 26;
/**
 * Home pose — the front three-quarter every car has been photographed from since
 * cars were photographed. Radians of turntable rotation.
 */
const HOME_AZIMUTH = -0.98;
/** Home elevation: a little above the roofline, looking very slightly down. */
const HOME_ELEVATION = 0.2;
const ELEVATION_MIN = -0.1;
const ELEVATION_MAX = 0.75;
/** Radians of turn per CSS pixel dragged, on each axis. */
const AZIMUTH_PER_PX = 0.0075;
const ELEVATION_PER_PX = 0.005;
/**
 * How much of the stage the fleet's widest reach is allowed to fill.
 *
 * Short of 1 on purpose: the fit is solved in the plane through the turntable's
 * axis, and perspective magnifies whatever is nearer than that — a rotor tip
 * swung toward the camera is drawn larger than the number the fit was solved
 * for, and at 1.0 it clips.
 */
const FIT = 0.93;
/**
 * Where the camera aims, as a fraction of {@link FLEET_HEIGHT}. Below the middle,
 * so the family sits in the lower half of the stage the way vehicles sit on a
 * road rather than floating in the centre of a box.
 */
const AIM_HEIGHT = 0.44;

/** The throw's return — the globe's settle spring, so a flick feels the same. */
const SETTLE_SPRING = spring(0.62, 0.1);
/** Below these the throw is finished, in radians and radians/second. */
const SETTLE_REST = 0.004;
const SETTLE_VEL_REST = 0.02;

/* ── The poke ────────────────────────────────────────────────────────────── */

/** Concurrent ripples, as on the globe: a mash evicts, it does not accumulate. */
const MAX_RIPPLES = 3;
/** Scale of the rock a poke square on the flank puts into the body, in radians. */
const WOBBLE_RAD = 0.16;
/**
 * The rock's return.
 *
 * Tighter than the globe's `spring(0.78, 0.62)`, and deliberately: the globe is
 * a ball on a tether and can ring, whereas this is a heavy object on a
 * turntable. It is also what keeps the promise this component is built on — the
 * globe's rock takes 1.8 s to fall under a threshold nobody can see, and the
 * globe gets away with that because its loop dies with the menu. Here the loop
 * ends when the motion does, so motion nobody can see is a loop nobody needs.
 */
const WOBBLE_SPRING = spring(0.62, 0.36);
/**
 * Below this the rock is over, in radians and radians/second. 0.0006 rad is
 * 0.03° — about a hundredth of a pixel at the far edge of the stage.
 */
const WOBBLE_REST = 0.0006;

/**
 * The impulse that makes {@link WOBBLE_SPRING} peak at one radian — its damped
 * natural frequency, since a spring released from rest with velocity `v` swings
 * out to about `v / ωd`. Derived from the spring rather than tuned by hand, so
 * re-tuning the bounce cannot silently change how hard a poke lands. (The globe
 * derives its own the same way, for the same reason.)
 */
const WOBBLE_KICK = (() => {
  const omega = Math.sqrt(WOBBLE_SPRING.stiffness / WOBBLE_SPRING.mass);
  const zeta =
    WOBBLE_SPRING.damping / (2 * Math.sqrt(WOBBLE_SPRING.stiffness * WOBBLE_SPRING.mass));
  return omega * Math.sqrt(Math.max(0.01, 1 - zeta * zeta));
})();

/** The scene's ink. The material and its tiers live in `lib/render/glass-cage`. */
export type CarPaint = CagePaint;

export interface LiquidCarSceneOptions {
  canvas: HTMLCanvasElement;
  /** Device-pixel ceiling. Fill rate scales with the square of it. */
  maxDpr: number;
  antialias: boolean;
  /** Reduced motion: no ripple, no wobble, no entrance — the pose is immediate. */
  reducedMotion: boolean;
  /** Called once if the GPU drops the context, so the caller can fall back. */
  onContextLost?: () => void;
}

interface Ripple {
  /** Unit ray, in the body's own coordinates, to the point that was struck. */
  x: number;
  y: number;
  z: number;
  /** `performance.now()` at impact, in seconds. */
  t0: number;
}

interface Body {
  hull: HullGrid;
  /** The shared, displaced position buffer — hull and all three cage tiers. */
  position: THREE.BufferAttribute;
  /** Wave height per vertex, normalised by `RIPPLE.amplitude`. */
  wave: THREE.BufferAttribute;
  /** The rest pose, so each frame displaces from the original, not the last. */
  rest: Float32Array;
  centre: THREE.Vector3;
  /** The near-side shell, which is also what a poke is raycast against. */
  shell: THREE.Mesh;
  rotor: THREE.LineSegments | null;
  dispose: () => void;
}

export class LiquidCarScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  /** Turns about Y. Everything that belongs to the vehicle lives in here. */
  private readonly turntable = new THREE.Group();
  /** Rocks when poked. Carries the turntable and the ground ring. */
  private readonly wobbler = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly reduced: boolean;
  private readonly onLost?: () => void;

  private body: Body | null = null;
  private paint: CarPaint | null = null;
  /** Materials belonging to the current body; replaced whenever it is. */
  private bodyInk: InkTarget[] = [];
  /** Materials belonging to the stage, built once and re-inked with the theme. */
  private readonly stageInk: InkTarget[] = [];
  private readonly ring: THREE.LineSegments;

  private azimuth = HOME_AZIMUTH;
  private azimuthVel = 0;
  /** Last drawn azimuth, so the rotor can be driven by how far the body TURNED. */
  private lastAzimuth = HOME_AZIMUTH;
  private elevation = HOME_ELEVATION;
  private elevationVel = 0;
  /** Set while a throw or an entrance is settling; `null` once it has arrived. */
  private settleTo: { azimuth: number; elevation: number } | null = null;
  private dragging = false;

  private ripples: Ripple[] = [];
  private wobble: { yaw: number; vYaw: number; roll: number; vRoll: number } | null = null;
  /** True while the shared position buffer still holds a displaced pose. */
  private displaced = false;

  private lastFrame = 0;
  private lost = false;

  constructor(opts: LiquidCarSceneOptions) {
    this.reduced = opts.reducedMotion;
    this.onLost = opts.onContextLost;
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      alpha: true,
      antialias: opts.antialias,
      powerPreference: 'low-power',
    });
    // Transparent clear: the glass is meant to sit ON the page's aurora, not on
    // a rectangle of its own. That is the whole reason this is a `<canvas>` with
    // `alpha: true` rather than a scene with a background colour of its own.
    this.renderer.setClearAlpha(0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr));

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    this.scene.add(this.wobbler);
    this.wobbler.add(this.turntable);

    // The ground ring — the globe's reticle, laid flat. Its geometry is swapped
    // per body (a ring the size of the whole fleet leaves a hatchback floating
    // in the middle of an empty disc), but the OBJECT is the stage's: it must
    // not turn with the turntable, or its gaps would spin, and it should rock
    // with a poke, so it hangs off the wobbler and never off the body.
    this.ring = new THREE.LineSegments(groundRing(1), this.cageMaterial('parallel', this.stageInk));
    this.ring.renderOrder = 0;
    this.wobbler.add(this.ring);

    opts.canvas.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (event: Event) => {
    // There is nothing to restore into — the caller remounts the stage — so the
    // loop is stopped rather than left drawing into a dead context every frame.
    event.preventDefault();
    this.lost = true;
    this.onLost?.();
  };

  /* ── Sizing ─────────────────────────────────────────────────────────────── */

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.placeCamera();
  }

  /**
   * Put the camera where the whole fleet fits.
   *
   * The distance is solved against the FLEET's extents, never against the body
   * currently on screen: framing each vehicle to its own size would draw the
   * bike and the helicopter at the same apparent length, which is exactly the
   * comparison this page exists to make. Every body is shot from the same
   * distance and aimed at the same point, so the bike IS tiny.
   */
  private placeCamera(): void {
    const halfV = Math.tan((FOV * Math.PI) / 360);
    const halfH = halfV * this.camera.aspect;
    const aim = FLEET_HEIGHT * AIM_HEIGHT;
    // Vertical reach is the taller half of the frame, not half the fleet: the
    // camera aims BELOW the middle, so the rotor mast is further above the aim
    // than the ground is below it, and framing on the average would clip it.
    const reachY = Math.max(FLEET_HEIGHT - aim, aim);
    const distance = Math.max(FLEET_RADIUS / (halfH * FIT), reachY / (halfV * FIT));
    this.camera.position.set(
      0,
      aim + distance * Math.sin(this.elevation),
      distance * Math.cos(this.elevation),
    );
    this.camera.lookAt(0, aim, 0);
    this.camera.updateProjectionMatrix();
  }

  /* ── The body ───────────────────────────────────────────────────────────── */

  /**
   * Swap in a vehicle. The previous one's buffers are released immediately —
   * seven bodies' worth of retained geometry is exactly the leak a picker like
   * this one invites.
   */
  setBody(spec: CarBodySpec): void {
    this.body?.dispose();
    this.turntable.clear();
    this.bodyInk = [];
    this.ripples = [];
    this.wobble = null;
    this.wobbler.rotation.set(0, 0, 0);
    this.displaced = false;

    const hull = buildHull(spec);
    const rest = hull.positions.slice();
    const position = new THREE.BufferAttribute(hull.positions, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    const wave = new THREE.BufferAttribute(new Float32Array(hull.radii.length), 1);
    wave.setUsage(THREE.DynamicDrawUsage);

    const shellGeometry = new THREE.BufferGeometry();
    shellGeometry.setAttribute('position', position);
    shellGeometry.setAttribute('normal', new THREE.BufferAttribute(hull.normals, 3));
    shellGeometry.setAttribute('aWave', wave);
    shellGeometry.setIndex(new THREE.BufferAttribute(hull.indices, 1));
    shellGeometry.computeBoundingSphere();
    // The ripple swells the surface past its rest bounds, and a poke that lands
    // outside the cached sphere is a poke the raycaster never reports. The
    // headroom is the wave's own peak plus a little.
    if (shellGeometry.boundingSphere) {
      shellGeometry.boundingSphere.radius *= 1 + RIPPLE.amplitude * 2;
    }

    // Two passes over one geometry: the far side of the glass, then the near
    // side over it. A single double-sided pass with depth writing off composites
    // the two faces in submission order rather than in depth order, and the hull
    // stops looking like something with an inside.
    const backMaterial = this.glassMaterial(spec.accent, THREE.BackSide, 0.55);
    const frontMaterial = this.glassMaterial(spec.accent, THREE.FrontSide, 1);
    const back = new THREE.Mesh(shellGeometry, backMaterial);
    back.renderOrder = 1;
    const shell = new THREE.Mesh(shellGeometry, frontMaterial);
    shell.renderOrder = 2;
    this.turntable.add(back, shell);

    const cages: THREE.LineSegments[] = [];
    const tiers: [Uint32Array, CageTier][] = [
      [hull.cage.minor, 'minor'],
      [hull.cage.parallel, 'parallel'],
      [hull.cage.major, 'major'],
    ];
    for (const [indices, tier] of tiers) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', position);
      geometry.setAttribute('aWave', wave);
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      const lines = new THREE.LineSegments(geometry, this.cageMaterial(tier, this.bodyInk));
      lines.renderOrder = 3;
      cages.push(lines);
      this.turntable.add(lines);
    }

    // The running gear does not ripple: a wave travelling over a wheel would say
    // the wheel is part of the same skin, and it is the one part of the vehicle
    // that visibly is not.
    const wheelPositions = buildWheels(spec).positions;
    const wheelGeometry = staticLineGeometry(wheelPositions);
    const wheels = new THREE.LineSegments(wheelGeometry, this.cageMaterial('major', this.bodyInk));
    wheels.renderOrder = 4;
    this.turntable.add(wheels);

    let rotor: THREE.LineSegments | null = null;
    if (spec.rotor) {
      const hub = rotorHub(spec.rotor, spec);
      rotor = new THREE.LineSegments(
        staticLineGeometry(buildRotor(spec.rotor, hub.mast).positions),
        this.cageMaterial('parallel', this.bodyInk),
      );
      rotor.position.set(hub.x, hub.y, 0);
      rotor.renderOrder = 4;
      this.turntable.add(rotor);
    }

    this.body = {
      hull,
      position,
      wave,
      rest,
      centre: new THREE.Vector3(...hull.centre),
      shell,
      rotor,
      dispose: () => {
        shellGeometry.dispose();
        wheelGeometry.dispose();
        backMaterial.dispose();
        frontMaterial.dispose();
        (wheels.material as THREE.Material).dispose();
        for (const cage of cages) {
          cage.geometry.dispose();
          (cage.material as THREE.Material).dispose();
        }
        if (rotor) {
          rotor.geometry.dispose();
          (rotor.material as THREE.Material).dispose();
        }
      },
    };

    this.ring.geometry.dispose();
    // Sized to the vehicle standing on it, but never past what the camera frames
    // — a ring the fleet's own size runs off the edge of the stage.
    this.ring.geometry = groundRing(Math.min(spec.length * 0.62, FLEET_RADIUS * 0.78));

    if (this.paint) this.setPaint(this.paint);
    this.placeCamera();

    // The entrance: a quarter-turn settling into the home pose, so choosing a
    // car reads as a car arriving rather than a picture being swapped. Reduced
    // motion gets the pose without the arrival.
    this.azimuthVel = 0;
    if (this.reduced) {
      this.azimuth = HOME_AZIMUTH;
      this.settleTo = null;
    } else {
      this.azimuth = HOME_AZIMUTH - 0.85;
      this.settleTo = { azimuth: HOME_AZIMUTH, elevation: this.elevation };
    }
    // The pose is SET here, not turned to, so the rotor must not read the jump
    // as a spin — the entrance that follows is a turn and will drive it.
    this.lastAzimuth = this.azimuth;
  }

  /* ── Materials ──────────────────────────────────────────────────────────── */

  private glassMaterial(accentMix: number, side: THREE.Side, strength: number) {
    const material = glassMaterial(accentMix, side, strength);
    this.bodyInk.push({ material, tier: 'glass' });
    return material;
  }

  private cageMaterial(tier: CageTier, into: InkTarget[]) {
    const material = cageMaterial();
    into.push({ material, tier });
    return material;
  }

  /** Re-ink the scene from the page's tokens. Cheap enough to call on a theme flip. */
  setPaint(paint: CarPaint): void {
    this.paint = paint;
    applyPaint([...this.bodyInk, ...this.stageInk], paint);
  }

  /* ── Gestures ───────────────────────────────────────────────────────────── */

  grab(): void {
    this.dragging = true;
    this.settleTo = null;
    this.azimuthVel = 0;
    this.elevationVel = 0;
  }

  /** Turn the body. `dx`/`dy` are CSS pixels since the last move. */
  drag(dx: number, dy: number): void {
    // The surface follows the finger: drag right and the face you are looking
    // at travels right, as it would on a real turntable. `rotation.y` maps a
    // body-local +z to world `(sin a, 0, cos a)`, so screen-right is INCREASING
    // azimuth — this read `-=` and mirrored every horizontal drag, which is the
    // one thing a direct-manipulation gesture can get wrong and still look
    // plausible in a still screenshot. Measured, not reasoned: dragging +120px
    // moved the nose 0.69 NDC to the LEFT before this.
    this.azimuth += dx * AZIMUTH_PER_PX;
    // Past the elevation limits the drag rubber-bands rather than stopping dead,
    // so the stage never changes behaviour under the finger — it just gradually
    // stops keeping up, and springs back on release.
    this.elevation = rubberBandClamp(
      this.elevation + dy * ELEVATION_PER_PX,
      ELEVATION_MIN,
      ELEVATION_MAX,
      0.6,
    );
    this.placeCamera();
  }

  /**
   * Let go. `vx`/`vy` are CSS pixels per second at the moment of release.
   *
   * The throw becomes a TARGET that the settle spring carries the release
   * velocity into, rather than a decay curve — the globe's rule, and the reason
   * a coast here can be caught, redirected and thrown again without a seam.
   */
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

  /** Bring the body back to the pose it arrived in. */
  home(): void {
    this.dragging = false;
    this.azimuthVel = 0;
    this.elevationVel = 0;
    // Turn the short way round, so "reset" is never a 350° lap of the stage.
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

  /** Turn by a fixed step — what the keyboard drives, since a key is not a drag. */
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

  /**
   * Poke the body at a point on the canvas, in normalised device coordinates.
   *
   * @returns whether the body was actually hit — a press on empty stage still
   *   turns the vehicle (that is the caller's drag), but it does not ring it.
   */
  poke(ndcX: number, ndcY: number): boolean {
    // Reduced motion means no travelling wave, exactly as on the globe: a ripple
    // is ornament, and an unrequested full-surface animation is precisely what
    // the preference is asking not to be shown. The press still turns the body.
    if (this.reduced || this.lost || !this.body) return false;
    // A poke arrives on a pointer event, not on a frame, so the turntable may
    // have been turned since the last render — and a raycast reads `matrixWorld`,
    // which only `render()` refreshes. Without this a tap during a fast drag is
    // tested against where the body was a frame ago.
    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = this.raycaster.intersectObject(this.body.shell, false)[0];
    if (!hit) return false;

    const ray = this.body.shell.worldToLocal(hit.point.clone()).sub(this.body.centre).normalize();
    if (this.ripples.length >= MAX_RIPPLES) this.ripples.shift();
    this.ripples.push({ x: ray.x, y: ray.y, z: ray.z, t0: seconds() });

    // The rock. A poke square on the flank shoves the body round; one straight
    // down the viewing axis only rings it — so the impulse scales with how far
    // off-axis the hit was, which is what the ray's own components already say.
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

  /**
   * Advance and draw one frame.
   *
   * @param now `performance.now()`, in milliseconds.
   * @returns `true` while anything is still in motion. The caller stops asking
   *   for frames the moment this says `false` — that is the idle-at-rest rule
   *   this whole component is built around.
   */
  frame(now: number): boolean {
    if (this.lost || !this.body) return false;
    const dt = this.lastFrame ? Math.min(0.064, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;

    let moving = this.dragging;
    if (this.stepSettle(dt)) moving = true;
    if (this.stepWobble(dt)) moving = true;

    this.turntable.rotation.y = this.azimuth;
    if (this.body.rotor) {
      // The disc turns as the model turns — driven by how far the body actually
      // moved this frame, not by `azimuthVel`, which is zero for the whole of a
      // drag (only a throw carries a velocity) and would have left the rotor
      // still while the thing it is bolted to was being turned by hand. It is
      // not a running engine, it is the one part of the body that shows which
      // way the rest of it is going, so by construction it stops when the turn
      // does — like everything else here.
      this.body.rotor.rotation.y += (this.azimuth - this.lastAzimuth) * 7;
    }
    this.lastAzimuth = this.azimuth;

    if (this.stepRipples(now / 1000)) moving = true;

    this.renderer.render(this.scene, this.camera);
    // A stopped loop restarts with no idea how long it was away, so the clock is
    // dropped here rather than handing the first frame back a two-second `dt`.
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
    // Arrived when BOTH axes have: a spring passing through its target at speed
    // is at zero displacement and is not finished.
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
   * Displace the shared position buffer by every live ripple, and write the wave
   * height into `aWave` so the cage can carry the crest.
   *
   * @param now the FRAME's timestamp in seconds, not a fresh clock read. A
   *   ripple's age is the difference between this and the `performance.now()`
   *   the poke was recorded at, and rAF timestamps come off that same clock —
   *   reading the clock again here instead would age ripples against wall time
   *   while everything else advances against the frame, which is only invisible
   *   for as long as the two happen to agree.
   * @returns whether any ripple is still alive.
   */
  private stepRipples(now: number): boolean {
    const body = this.body;
    if (!body) return false;
    if (this.ripples.length > 0) {
      this.ripples = this.ripples.filter((r) => now - r.t0 < RIPPLE.life);
    }

    if (this.ripples.length === 0) {
      if (!this.displaced) return false;
      // One last write to put the surface back exactly where it started. Easing
      // out of the displacement is the wavelet's own job — its envelope lands on
      // zero — so this is only here so rounding cannot accumulate a permanent
      // dent in a body somebody poked forty times.
      (body.position.array as Float32Array).set(body.rest);
      (body.wave.array as Float32Array).fill(0);
      body.position.needsUpdate = true;
      body.wave.needsUpdate = true;
      this.displaced = false;
      return false;
    }

    const { rays, radii, normals } = body.hull;
    const positions = body.position.array as Float32Array;
    const waves = body.wave.array as Float32Array;
    const rest = body.rest;
    const live = this.ripples;
    const count = radii.length;

    for (let v = 0; v < count; v++) {
      const i = v * 3;
      const rx = rays[i];
      const ry = rays[i + 1];
      const rz = rays[i + 2];
      let sum = 0;
      for (let k = 0; k < live.length; k++) {
        const s = live[k];
        const dot = rx * s.x + ry * s.y + rz * s.z;
        // The angle between two rays IS the arc distance on the surface they
        // both belong to — the globe's metric, unchanged, on a body that is not
        // a sphere. Clamped because two unit vectors only dot to within [−1, 1]
        // up to rounding, and `acos(1.0000001)` is NaN, which would silently
        // erase the whole vehicle.
        sum += rippleWave({
          age: now - s.t0,
          distance: Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot),
        });
      }
      const push = sum * radii[v];
      positions[i] = rest[i] + normals[i] * push;
      positions[i + 1] = rest[i + 1] + normals[i + 1] * push;
      positions[i + 2] = rest[i + 2] + normals[i + 2] * push;
      waves[v] = sum / RIPPLE.amplitude;
    }

    body.position.needsUpdate = true;
    body.wave.needsUpdate = true;
    this.displaced = true;
    return true;
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.body?.dispose();
    this.body = null;
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}

function seconds(): number {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

/**
 * A line buffer that never ripples — the running gear and the ground ring.
 *
 * They still carry an `aWave` attribute, because they are drawn by the cage
 * program and a missing attribute is an undefined value in a shader rather than
 * an error you find out about. It is all zeroes and never written to.
 */
function staticLineGeometry(positions: Float32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute(
    'aWave',
    new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1),
  );
  return geometry;
}

/** A flat ring on the ground, dashed by omission so it reads as a mark, not a plate. */
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
  return staticLineGeometry(Float32Array.from(pts));
}
