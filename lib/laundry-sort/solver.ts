/**
 * Laundry Sort — soft-body cloth solver (XPBD).
 *
 * Every garment is real cloth: a lattice of particles held together by
 * distance constraints, integrated with **extended position-based dynamics**
 * and solved in small substeps. There is no rigid body anywhere in this game —
 * a shirt drapes over a bin rim because the fabric actually drapes, not
 * because something faked it.
 *
 * Why XPBD rather than a spring-mass integrator: springs stiff enough to look
 * like cotton need a timestep small enough to be unaffordable in a browser, and
 * they explode when a player yanks a sleeve across the screen. XPBD's stiffness
 * is expressed as *compliance* and is timestep-independent, so the same
 * constants behave identically at any substep count, and it is unconditionally
 * stable under arbitrary user forces. Substepping (rather than iterating a
 * single large step) follows Macklin et al., "Small Steps in Physics
 * Simulation" — it buys accuracy far more cheaply than extra iterations.
 *
 * Determinism is a hard requirement, not a nicety: two players racing the same
 * seed must get the same laundry. Everything here is float arithmetic driven by
 * a fixed timestep and a seeded schedule — no `Math.random()`, no wall clock,
 * no device-dependent branch.
 */

import { ARENA } from './constants';
import { pointInBox, type ArenaLayout, type Box } from './arena';
import { PATTERNS, type GarmentKind, type PatternTopology } from './patterns';

// ─── Tuning ─────────────────────────────────────────────────────────────────

const GRAVITY = -9.81;

/**
 * XPBD compliance, in m²/N. Zero is perfectly rigid.
 *
 * Cotton is very hard to stretch and very easy to fold, and that asymmetry is
 * most of what makes fabric read as fabric. Structural constraints are
 * therefore rigid, shear is nearly rigid, and bending is three orders of
 * magnitude softer so the cloth creases instead of behaving like sheet metal.
 */
const COMPLIANCE_STRUCTURAL = 0;
const COMPLIANCE_SHEAR = 5e-6;
const COMPLIANCE_BENDING = 9e-3;

/**
 * Isotropic drag — the part that acts regardless of which way the cloth is
 * facing. Deliberately the smaller half of the air model; see
 * {@link AERO_NORMAL}.
 */
const DRAG_BASE = 1.6;

/**
 * Extra drag along the garment's own surface normal.
 *
 * This is the term that makes falling fabric look like falling fabric. Air
 * resists a sheet moving face-on far more than the same sheet moving edge-on,
 * and that asymmetry is what makes a dropped shirt slew sideways, turn over,
 * and flutter rather than sink like a stone. Modelling drag as a single
 * isotropic coefficient — which is the obvious thing to do — produces a sheet
 * that falls dead flat and looks like a decal, no matter how good the cloth
 * solver underneath it is.
 *
 * Applied per particle against the whole garment's average normal, so it damps
 * rotation about in-plane axes too, which is where the tumble comes from.
 */
const AERO_NORMAL = 2.2;
/** Amplitude of the deterministic air current that makes garments plane. */
const WIND_AMP = 0.55;
/**
 * The draft comes off the chute at the top of the room and dies out before it
 * reaches the bins. Height-limiting it is both the honest model of a laundry
 * room and a functional requirement: a constant breeze at floor level keeps
 * settled cloth permanently twitching above the at-rest threshold, so a
 * garment lying on a bin lid would never be recognised as missed.
 */
const WIND_FLOOR_Y = 1.3;
const WIND_RAMP = 1.8;

/** Half-thickness of the cloth for contacts with the arena. */
const CONTACT_RADIUS = 0.02;
/** Half-thickness for cloth-on-cloth. Smaller than the tightest weave spacing. */
const SELF_RADIUS = 0.032;

/** How close the pointer ray must pass to a particle to grab it. */
const GRAB_RAY_RADIUS = 0.17;
/** Particles within this distance of the hit point come along for the ride. */
const GRIP_RADIUS = 0.1;
/** Per-substep pull toward the grip target. Below 1 so heavy cloth lags. */
const GRIP_STRENGTH = 0.5;

/** A garment is "at rest" below this mean particle speed, in m/s. */
export const REST_SPEED = 0.35;

/** Hash table size for cloth-on-cloth broadphase. Power of two. */
const HASH_BUCKETS = 2048;
/** Preallocated particle ceiling — 12 garments can never exceed this. */
const MAX_PARTICLES = 1024;

/** Triangles sampled per garment when estimating its average normal. */
const NORMAL_SAMPLES = 8;

// ─── Types ──────────────────────────────────────────────────────────────────

export type GarmentState = 'falling' | 'sorted' | 'missed';

export interface Garment {
  readonly id: number;
  readonly kind: GarmentKind;
  /** Index into `WASH_COLORS`. */
  readonly colorIndex: number;
  readonly topology: PatternTopology;
  /** `3 * count` current positions. */
  readonly pos: Float32Array;
  /** `3 * count` positions at the start of the current substep. */
  readonly prev: Float32Array;
  /** `3 * count` velocities, refreshed at the end of every substep. */
  readonly vel: Float32Array;
  /** `3 * count` positions at the end of the previous tick — see {@link Garment.speed}. */
  readonly lastTickPos: Float32Array;
  /** `count` inverse masses. Zero pins a particle; the solver never does. */
  readonly invMass: Float32Array;

  state: GarmentState;
  /** Bin it was resolved into, if any. */
  resolvedBin: number | null;
  /** Simulated seconds since it entered the arena. */
  age: number;
  /** Consecutive simulated seconds spent below {@link REST_SPEED}. */
  restingFor: number;
  /** Simulated time at which it should be culled, or null while it lives. */
  expiresAt: number | null;

  /** Centroid, refreshed once per tick. */
  cx: number;
  cy: number;
  cz: number;
  /** Unit average surface normal, refreshed once per tick — see {@link AERO_NORMAL}. */
  nx: number;
  ny: number;
  nz: number;
  /**
   * Mean particle speed over the last tick, in m/s, measured as actual
   * displacement rather than read off the velocity array.
   *
   * The two are not the same for cloth at rest. Contact and self-collision
   * corrections move particles a hair every substep and that shows up in `vel`
   * as a permanent ~0.4 m/s hum, even though the garment is visibly still. Rest
   * detection reads this, so a garment lying in a bin is recognised as settled
   * instead of being treated as in flight forever.
   */
  speed: number;
}

export interface Ray {
  ox: number;
  oy: number;
  oz: number;
  /** Must be normalised. */
  dx: number;
  dy: number;
  dz: number;
}

interface Grip {
  garmentId: number;
  /** Particles held, and how strongly (1 at the pinch, falling off outward). */
  particles: Int32Array;
  weights: Float32Array;
  /** Each held particle's offset from the pinch point when it was grabbed. */
  offsets: Float32Array;
  /** Plane the pinch slides along — through the hit point, facing the camera. */
  planeX: number;
  planeY: number;
  planeZ: number;
  nx: number;
  ny: number;
  nz: number;
  /** Current pinch target in world space. */
  tx: number;
  ty: number;
  tz: number;
}

export interface SpawnDesc {
  kind: GarmentKind;
  colorIndex: number;
  x: number;
  z: number;
  /** Initial rotation about the view axis, radians. */
  roll: number;
  /** Initial tumble about the vertical axis, radians. */
  yaw: number;
  vx: number;
  vy: number;
  /**
   * Angular velocity about the garment's centroid, rad/s. Without it a garment
   * leaves the chute perfectly flat and stays that way: gravity and drag both
   * act uniformly on a planar sheet, so nothing makes it turn over. Real
   * laundry tumbles out of a dryer, and the tumble is most of what sells it as
   * cloth rather than a decal.
   */
  spinX: number;
  spinY: number;
  spinZ: number;
  /**
   * Out-of-plane bulge at spawn, in metres. A perfectly flat sheet is a
   * degenerate configuration for bending constraints — there is no side for it
   * to fold toward — so it can hang rigid for a suspiciously long time. A few
   * centimetres of curvature breaks the symmetry and the fabric starts folding
   * immediately.
   */
  bow: number;
}

// ─── World ──────────────────────────────────────────────────────────────────

export class ClothWorld {
  readonly garments: Garment[] = [];
  /** Simulated seconds since the world was created. Never reads a clock. */
  time = 0;
  /**
   * Bumped whenever the garment *set* changes. React renders one mesh per
   * garment and needs to know when to add or drop one; per-frame position
   * changes must never trigger a re-render, so only membership moves this.
   */
  revision = 0;

  private readonly arena: ArenaLayout;
  private nextId = 1;
  private grip: Grip | null = null;

  // Cloth-on-cloth broadphase scratch. Allocated once; the hot loop allocates
  // nothing, because a per-frame allocation at 60 Hz is a per-frame GC pause.
  private readonly hashCounts = new Int32Array(HASH_BUCKETS + 1);
  private readonly hashCursor = new Int32Array(HASH_BUCKETS);
  private readonly hashSorted = new Int32Array(MAX_PARTICLES);
  private readonly flatX = new Float32Array(MAX_PARTICLES);
  private readonly flatY = new Float32Array(MAX_PARTICLES);
  private readonly flatZ = new Float32Array(MAX_PARTICLES);
  /** Flat particle slot → garment index, and → particle index within it. */
  private readonly flatGarment = new Int32Array(MAX_PARTICLES);
  private readonly flatParticle = new Int32Array(MAX_PARTICLES);
  private flatCount = 0;
  /** Per-garment arena broadphase result — indices into `arena.colliders`. */
  private readonly boxCandidates: Int32Array;

  constructor(arena: ArenaLayout) {
    this.arena = arena;
    this.boxCandidates = new Int32Array(arena.colliders.length);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  spawn(desc: SpawnDesc): Garment {
    const topology = PATTERNS[desc.kind];
    const n = topology.count;
    const pos = new Float32Array(n * 3);
    const prev = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const invMass = new Float32Array(n).fill(1);

    // Rest pose → rolled about z, yawed about y, then dropped in. The yaw is
    // what stops every garment entering the arena flat-on to the camera.
    const cr = Math.cos(desc.roll);
    const sr = Math.sin(desc.roll);
    const cy = Math.cos(desc.yaw);
    const sy = Math.sin(desc.yaw);

    const lastCol = Math.max(1, topology.cols - 1);
    const lastRow = Math.max(1, topology.rows - 1);

    for (let i = 0; i < n; i++) {
      const rx = topology.restPositions[i * 3];
      const ry = topology.restPositions[i * 3 + 1];
      const x1 = rx * cr - ry * sr;
      const y1 = rx * sr + ry * cr;
      // A dome across the pattern, zero at every edge, so the piece leaves the
      // chute already curved instead of dead flat.
      const bow =
        desc.bow *
        Math.sin((topology.particleCol[i] / lastCol) * Math.PI) *
        Math.sin((topology.particleRow[i] / lastRow) * Math.PI);
      const x2 = x1 * cy;
      const z2 = -x1 * sy + bow;

      pos[i * 3] = desc.x + x2;
      pos[i * 3 + 1] = ARENA.spawnY + y1;
      pos[i * 3 + 2] = desc.z + z2;
      prev[i * 3] = pos[i * 3];
      prev[i * 3 + 1] = pos[i * 3 + 1];
      prev[i * 3 + 2] = pos[i * 3 + 2];

      // v = v_cm + ω × r, so the whole piece tumbles about its own centre.
      vel[i * 3] = desc.vx + (desc.spinY * z2 - desc.spinZ * y1);
      vel[i * 3 + 1] = desc.vy + (desc.spinZ * x2 - desc.spinX * z2);
      vel[i * 3 + 2] = desc.spinX * y1 - desc.spinY * x2;
    }

    const garment: Garment = {
      id: this.nextId++,
      kind: desc.kind,
      colorIndex: desc.colorIndex,
      topology,
      pos,
      prev,
      vel,
      lastTickPos: Float32Array.from(pos),
      invMass,
      state: 'falling',
      resolvedBin: null,
      age: 0,
      restingFor: 0,
      expiresAt: null,
      cx: desc.x,
      cy: ARENA.spawnY,
      cz: desc.z,
      nx: 0,
      ny: 0,
      nz: 1,
      speed: 0,
    };
    this.garments.push(garment);
    this.revision++;
    this.refreshBounds(garment);
    return garment;
  }

  remove(id: number): void {
    const index = this.garments.findIndex((g) => g.id === id);
    if (index >= 0) {
      this.garments.splice(index, 1);
      this.revision++;
    }
    if (this.grip?.garmentId === id) this.grip = null;
  }

  clear(): void {
    this.garments.length = 0;
    this.grip = null;
    this.time = 0;
    this.nextId = 1;
    this.revision++;
  }

  get(id: number): Garment | undefined {
    return this.garments.find((g) => g.id === id);
  }

  /** The garment currently held, if any — the HUD highlights it. */
  get heldGarmentId(): number | null {
    return this.grip?.garmentId ?? null;
  }

  // ── Simulation ───────────────────────────────────────────────────────────

  /** Advance one fixed tick. `dt` must be the constant the caller committed to. */
  step(dt: number, substeps: number): void {
    const h = dt / substeps;
    // The aerodynamic normal is a whole-garment property and changes slowly;
    // once a tick is plenty, and it keeps the substep loop free of cross
    // products.
    for (const g of this.garments) this.refreshNormal(g);

    for (let s = 0; s < substeps; s++) {
      this.integrate(h);
      this.solveDistance(h);
      this.solveGrip();
      // Cloth-on-cloth is the expensive one and does not need to run at
      // substep rate to look right; the arena contacts do, or a fast-moving
      // garment tunnels through a bin wall.
      if (s === 0) this.solveSelfCollision();
      this.solveArena();
      this.finalise(h);
    }

    this.time += dt;
    const heldId = this.grip?.garmentId ?? -1;
    for (const g of this.garments) {
      g.age += dt;
      this.refreshBounds(g, dt);
      // A garment the player is holding still is not "at rest" — it is being
      // aimed. Counting it as settled would let the miss timer fire on cloth
      // that is very much still in play.
      g.restingFor = g.speed < REST_SPEED && g.id !== heldId ? g.restingFor + dt : 0;
    }
  }

  /**
   * Semi-implicit integration plus the room's air.
   *
   * The draft is a deterministic function of simulated time and position —
   * never `Math.random()` — so two clients that reach the same tick compute the
   * same air and their laundry falls the same way. Two low-frequency terms give
   * a whole garment its drift; a per-particle term ripples the fabric so a
   * towel luffs on the way down.
   *
   * The trig is deliberately hoisted. A naive version calls `Math.sin` three
   * times per particle per substep — around 3,300 calls a tick with a full
   * arena, which measured as the single most expensive thing in the solver.
   * The drift terms now sample the garment's centroid (a drift that varied
   * across one garment was not visible anyway) and the ripple comes from an
   * angle-sum expansion over a precomputed per-index table, so the per-particle
   * cost is two multiplies.
   */
  private integrate(h: number): void {
    const t = this.time;
    const rippleSin = Math.sin(t * 5.3);
    const rippleCos = Math.cos(t * 5.3);

    for (const g of this.garments) {
      const n = g.topology.count;
      const sail = g.topology.drag * DRAG_BASE;
      // Implicit-ish linear drag: unconditionally stable and cheap, unlike
      // `v -= k*v*h`, which flips sign when `k*h > 1`.
      const damping = 1 / (1 + sail * h);
      const { pos, prev, vel } = g;

      const driftX = WIND_AMP * Math.sin(t * 1.7 + g.cy * 0.9);
      const driftZ = WIND_AMP * 0.5 * Math.sin(t * 1.1 + g.cx * 0.7);
      const normalDrag = AERO_NORMAL * g.topology.drag * h;
      const gnx = g.nx;
      const gny = g.ny;
      const gnz = g.nz;
      const phaseCos = g.topology.ripplePhaseCos;
      const phaseSin = g.topology.ripplePhaseSin;

      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        const y = pos[ix + 1];

        // The draft comes off the chute and dies before it reaches the bins.
        const draft = clamp((y - WIND_FLOOR_Y) / WIND_RAMP, 0, 1);
        // sin(t*5.3 + phase_i), expanded so the sin/cos are per-substep rather
        // than per-particle.
        const ripple = rippleSin * phaseCos[i] + rippleCos * phaseSin[i];
        const windX = draft * (driftX + 0.7 * ripple);
        const windZ = draft * driftZ;

        vel[ix] = (vel[ix] + windX * sail * h) * damping;
        vel[ix + 1] = (vel[ix + 1] + GRAVITY * h) * damping;
        vel[ix + 2] = (vel[ix + 2] + windZ * sail * h) * damping;

        // Anisotropic drag: resist motion along the surface normal much harder
        // than motion in the plane of the cloth.
        const vn = vel[ix] * gnx + vel[ix + 1] * gny + vel[ix + 2] * gnz;
        vel[ix] -= vn * gnx * normalDrag;
        vel[ix + 1] -= vn * gny * normalDrag;
        vel[ix + 2] -= vn * gnz * normalDrag;

        prev[ix] = pos[ix];
        prev[ix + 1] = pos[ix + 1];
        prev[ix + 2] = pos[ix + 2];

        pos[ix] += vel[ix] * h;
        pos[ix + 1] += vel[ix + 1] * h;
        pos[ix + 2] += vel[ix + 2] * h;
      }
    }
  }

  private solveDistance(h: number): void {
    const invH2 = 1 / (h * h);
    for (const g of this.garments) {
      const { topology } = g;
      this.solveConstraintSet(
        g,
        topology.structural,
        topology.structuralRest,
        COMPLIANCE_STRUCTURAL * invH2,
      );
      this.solveConstraintSet(g, topology.shear, topology.shearRest, COMPLIANCE_SHEAR * invH2);
      this.solveConstraintSet(
        g,
        topology.bending,
        topology.bendingRest,
        COMPLIANCE_BENDING * invH2,
      );
    }
  }

  /**
   * One Gauss-Seidel sweep of a distance-constraint set.
   *
   * `alphaTilde` is XPBD's compliance already divided by h², which is what
   * makes the resulting stiffness independent of the substep count. A single
   * sweep per substep is the standard small-steps trade: more substeps beat
   * more iterations for the same budget.
   */
  private solveConstraintSet(
    g: Garment,
    pairs: Int32Array,
    rest: Float32Array,
    alphaTilde: number,
  ): void {
    const { pos, invMass } = g;
    const pairCount = rest.length;

    for (let k = 0; k < pairCount; k++) {
      const a = pairs[k * 2];
      const b = pairs[k * 2 + 1];
      const wa = invMass[a];
      const wb = invMass[b];
      const wSum = wa + wb;
      if (wSum === 0) continue;

      const ax = a * 3;
      const bx = b * 3;
      let dx = pos[ax] - pos[bx];
      let dy = pos[ax + 1] - pos[bx + 1];
      let dz = pos[ax + 2] - pos[bx + 2];
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq < 1e-12) continue;
      const len = Math.sqrt(lenSq);

      const c = len - rest[k];
      const lambda = -c / (wSum + alphaTilde);
      const inv = lambda / len;
      dx *= inv;
      dy *= inv;
      dz *= inv;

      pos[ax] += dx * wa;
      pos[ax + 1] += dy * wa;
      pos[ax + 2] += dz * wa;
      pos[bx] -= dx * wb;
      pos[bx + 1] -= dy * wb;
      pos[bx + 2] -= dz * wb;
    }
  }

  /** Pull the held handful of fabric toward the pointer. */
  private solveGrip(): void {
    const grip = this.grip;
    if (!grip) return;
    const g = this.get(grip.garmentId);
    if (!g) {
      this.grip = null;
      return;
    }

    const { pos } = g;
    for (let k = 0; k < grip.particles.length; k++) {
      const p = grip.particles[k];
      const ix = p * 3;
      const pull = GRIP_STRENGTH * grip.weights[k];
      const tx = grip.tx + grip.offsets[k * 3];
      const ty = grip.ty + grip.offsets[k * 3 + 1];
      const tz = grip.tz + grip.offsets[k * 3 + 2];
      pos[ix] += (tx - pos[ix]) * pull;
      pos[ix + 1] += (ty - pos[ix + 1]) * pull;
      pos[ix + 2] += (tz - pos[ix + 2]) * pull;
    }
  }

  /**
   * Push particles out of the arena's static boxes along the shallowest axis,
   * then kill the normal velocity (fabric does not bounce) and scale the
   * tangential component by the surface's friction.
   *
   * Broadphased per garment rather than per particle: the arena has 25 boxes
   * and a garment has up to 36 particles, so testing each against each is ~900
   * point-in-box tests per garment per substep. Computing the garment's own
   * bounds once and pre-filtering the box list cuts that by roughly 5×, which
   * matters because this is the one part of the solver that runs at substep
   * rate on every particle.
   */
  private solveArena(): void {
    const boxes = this.arena.colliders;
    const r = CONTACT_RADIUS;
    const candidates = this.boxCandidates;

    for (const g of this.garments) {
      const n = g.topology.count;
      const { pos, prev } = g;

      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        const x = pos[ix];
        const y = pos[ix + 1];
        const z = pos[ix + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }

      let candidateCount = 0;
      for (let bi = 0; bi < boxes.length; bi++) {
        const b = boxes[bi];
        if (
          maxX + r < b.minX ||
          minX - r > b.maxX ||
          maxY + r < b.minY ||
          minY - r > b.maxY ||
          maxZ + r < b.minZ ||
          minZ - r > b.maxZ
        ) {
          continue;
        }
        candidates[candidateCount++] = bi;
      }
      if (candidateCount === 0) continue;

      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        const x = pos[ix];
        const y = pos[ix + 1];
        const z = pos[ix + 2];

        for (let ci = 0; ci < candidateCount; ci++) {
          const b = boxes[candidates[ci]];
          if (!pointInBox(b, x, y, z, r)) continue;

          const dxMin = x - (b.minX - r);
          const dxMax = b.maxX + r - x;
          const dyMin = y - (b.minY - r);
          const dyMax = b.maxY + r - y;
          const dzMin = z - (b.minZ - r);
          const dzMax = b.maxZ + r - z;

          let best = dxMin;
          let axis = 0;
          let sign = -1;
          if (dxMax < best) {
            best = dxMax;
            axis = 0;
            sign = 1;
          }
          if (dyMin < best) {
            best = dyMin;
            axis = 1;
            sign = -1;
          }
          if (dyMax < best) {
            best = dyMax;
            axis = 1;
            sign = 1;
          }
          if (dzMin < best) {
            best = dzMin;
            axis = 2;
            sign = -1;
          }
          if (dzMax < best) {
            best = dzMax;
            axis = 2;
            sign = 1;
          }

          pos[ix + axis] += best * sign;

          // No restitution on the contact normal, and friction on the two
          // tangents — applied by moving `prev`, which is how a position-based
          // solver expresses a velocity change.
          prev[ix + axis] = pos[ix + axis];
          const f = b.friction;
          for (let a = 0; a < 3; a++) {
            if (a === axis) continue;
            prev[ix + a] = pos[ix + a] - (pos[ix + a] - prev[ix + a]) * f;
          }
          break;
        }
      }
    }
  }

  /**
   * Cloth-on-cloth contacts through a counting-sort spatial hash.
   *
   * Without this, garments interpenetrate and a full bin looks like one
   * flickering mass instead of a pile. Particles that are grid neighbours in
   * the same garment are skipped — their separation is the weave's job, and
   * letting contacts fight the structural constraints makes the fabric buzz.
   */
  private solveSelfCollision(): void {
    const flatCount = this.flatten();
    if (flatCount < 2) return;

    const cell = SELF_RADIUS * 2;
    const invCell = 1 / cell;
    const { hashCounts, hashCursor, hashSorted, flatX, flatY, flatZ, flatGarment, flatParticle } =
      this;

    hashCounts.fill(0);
    for (let i = 0; i < flatCount; i++) {
      const h = hashCell(
        Math.floor(flatX[i] * invCell),
        Math.floor(flatY[i] * invCell),
        Math.floor(flatZ[i] * invCell),
      );
      hashCounts[h + 1]++;
    }
    for (let b = 0; b < HASH_BUCKETS; b++) hashCounts[b + 1] += hashCounts[b];
    hashCursor.set(hashCounts.subarray(0, HASH_BUCKETS));
    for (let i = 0; i < flatCount; i++) {
      const h = hashCell(
        Math.floor(flatX[i] * invCell),
        Math.floor(flatY[i] * invCell),
        Math.floor(flatZ[i] * invCell),
      );
      hashSorted[hashCursor[h]++] = i;
    }

    const minDist = SELF_RADIUS * 2;
    const minDistSq = minDist * minDist;

    for (let i = 0; i < flatCount; i++) {
      const gx = Math.floor(flatX[i] * invCell);
      const gy = Math.floor(flatY[i] * invCell);
      const gz = Math.floor(flatZ[i] * invCell);

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            const h = hashCell(gx + ox, gy + oy, gz + oz);
            const end = hashCounts[h + 1];
            for (let s = hashCounts[h]; s < end; s++) {
              const j = hashSorted[s];
              // Each pair is resolved once, by the lower-indexed particle.
              if (j <= i) continue;

              const gi = flatGarment[i];
              const gj = flatGarment[j];
              if (gi === gj) {
                const g = this.garments[gi];
                const pi = flatParticle[i];
                const pj = flatParticle[j];
                const dc = Math.abs(g.topology.particleCol[pi] - g.topology.particleCol[pj]);
                const dr = Math.abs(g.topology.particleRow[pi] - g.topology.particleRow[pj]);
                if (dc <= 1 && dr <= 1) continue;
              }

              const dx = flatX[i] - flatX[j];
              const dy = flatY[i] - flatY[j];
              const dz = flatZ[i] - flatZ[j];
              const dsq = dx * dx + dy * dy + dz * dz;
              if (dsq >= minDistSq) continue;

              const d = Math.sqrt(dsq);
              let nx: number;
              let ny: number;
              let nz: number;
              if (d < 1e-6) {
                // Exactly coincident, so there is no contact normal to
                // normalise. Skipping the pair (the obvious guard) is wrong:
                // two garments dropped into the same spot would then fall as
                // one inseparable mass forever. Pick an axis from the index
                // pair instead — arbitrary, but a pure function of the pair, so
                // every client resolves it the same way.
                const axis = (i + j) % 3;
                nx = axis === 0 ? 1 : 0;
                ny = axis === 1 ? 1 : 0;
                nz = axis === 2 ? 1 : 0;
              } else {
                nx = dx / d;
                ny = dy / d;
                nz = dz / d;
              }

              const push = (minDist - d) * 0.5;
              flatX[i] += nx * push;
              flatY[i] += ny * push;
              flatZ[i] += nz * push;
              flatX[j] -= nx * push;
              flatY[j] -= ny * push;
              flatZ[j] -= nz * push;

              this.writeBack(i);
              this.writeBack(j);
            }
          }
        }
      }
    }
  }

  /** Copy live particle positions into the flat broadphase arrays. */
  private flatten(): number {
    let k = 0;
    for (let gi = 0; gi < this.garments.length; gi++) {
      const g = this.garments[gi];
      const n = g.topology.count;
      for (let i = 0; i < n && k < MAX_PARTICLES; i++, k++) {
        this.flatX[k] = g.pos[i * 3];
        this.flatY[k] = g.pos[i * 3 + 1];
        this.flatZ[k] = g.pos[i * 3 + 2];
        this.flatGarment[k] = gi;
        this.flatParticle[k] = i;
      }
    }
    this.flatCount = k;
    return k;
  }

  private writeBack(slot: number): void {
    const g = this.garments[this.flatGarment[slot]];
    const ix = this.flatParticle[slot] * 3;
    g.pos[ix] = this.flatX[slot];
    g.pos[ix + 1] = this.flatY[slot];
    g.pos[ix + 2] = this.flatZ[slot];
  }

  /** Derive velocities from the substep's position change. */
  private finalise(h: number): void {
    const invH = 1 / h;
    for (const g of this.garments) {
      const n = g.topology.count * 3;
      const { pos, prev, vel } = g;
      for (let i = 0; i < n; i++) vel[i] = (pos[i] - prev[i]) * invH;
    }
  }

  /**
   * Average surface normal, from a sample of the garment's triangles.
   *
   * Sampled rather than summed over every face because this only feeds the
   * aerodynamic term, which cares about which way the sheet is broadly facing —
   * not about the exact geometry of each fold. A crumpled garment averages
   * toward zero length, which is correct: a ball of cloth has no preferred
   * face, and the fallback below leaves its previous normal in place rather
   * than snapping to an arbitrary axis.
   */
  private refreshNormal(g: Garment): void {
    const { indices } = g.topology;
    const triangles = indices.length / 3;
    if (triangles === 0) return;
    const stride = Math.max(1, Math.floor(triangles / NORMAL_SAMPLES));

    const { pos } = g;
    let nx = 0;
    let ny = 0;
    let nz = 0;

    for (let t = 0; t < triangles; t += stride) {
      const a = indices[t * 3] * 3;
      const b = indices[t * 3 + 1] * 3;
      const c = indices[t * 3 + 2] * 3;
      const ux = pos[b] - pos[a];
      const uy = pos[b + 1] - pos[a + 1];
      const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a];
      const vy = pos[c + 1] - pos[a + 1];
      const vz = pos[c + 2] - pos[a + 2];
      nx += uy * vz - uz * vy;
      ny += uz * vx - ux * vz;
      nz += ux * vy - uy * vx;
    }

    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length < 1e-9) return;
    g.nx = nx / length;
    g.ny = ny / length;
    g.nz = nz / length;
  }

  /** Refresh the centroid and the per-tick motion. `dt` of 0 skips the motion. */
  private refreshBounds(g: Garment, dt = 0): void {
    const n = g.topology.count;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let travelled = 0;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const x = g.pos[ix];
      const y = g.pos[ix + 1];
      const z = g.pos[ix + 2];
      sx += x;
      sy += y;
      sz += z;
      if (dt > 0) {
        travelled += Math.hypot(
          x - g.lastTickPos[ix],
          y - g.lastTickPos[ix + 1],
          z - g.lastTickPos[ix + 2],
        );
      }
    }
    g.cx = sx / n;
    g.cy = sy / n;
    g.cz = sz / n;
    if (dt > 0) {
      g.speed = travelled / n / dt;
      g.lastTickPos.set(g.pos);
    }
  }

  // ── Pointer interaction ──────────────────────────────────────────────────

  /**
   * Try to pinch the fabric under a pointer ray.
   *
   * Only ONE garment can be held at a time, on every platform. That is a
   * fairness rule, not a technical limit: a touchscreen could trivially report
   * ten pinches and a mouse can only ever report one, so allowing multi-touch
   * grabs would hand phones a permanent advantage in a shared leaderboard.
   */
  beginGrab(ray: Ray): boolean {
    const hit = this.pick(ray);
    if (!hit) return false;

    const g = this.get(hit.garmentId);
    if (!g || g.state !== 'falling') return false;

    const hx = g.pos[hit.particle * 3];
    const hy = g.pos[hit.particle * 3 + 1];
    const hz = g.pos[hit.particle * 3 + 2];

    const particles: number[] = [];
    const weights: number[] = [];
    const offsets: number[] = [];
    const n = g.topology.count;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const dx = g.pos[ix] - hx;
      const dy = g.pos[ix + 1] - hy;
      const dz = g.pos[ix + 2] - hz;
      const d = Math.hypot(dx, dy, dz);
      if (d > GRIP_RADIUS) continue;
      particles.push(i);
      // Falls off with distance, so the pinch is a handful of cloth with a
      // soft edge rather than a rigid patch.
      weights.push(1 - (d / GRIP_RADIUS) * 0.65);
      offsets.push(dx, dy, dz);
    }
    if (particles.length === 0) return false;

    this.grip = {
      garmentId: g.id,
      particles: Int32Array.from(particles),
      weights: Float32Array.from(weights),
      offsets: Float32Array.from(offsets),
      planeX: hx,
      planeY: hy,
      planeZ: hz,
      // The drag plane faces the camera, so the pinch tracks the pointer
      // exactly and never slides toward or away from the viewer.
      nx: -ray.dx,
      ny: -ray.dy,
      nz: -ray.dz,
      tx: hx,
      ty: hy,
      tz: hz,
    };
    return true;
  }

  /** Re-aim the pinch. A ray parallel to the drag plane leaves it where it was. */
  moveGrab(ray: Ray): void {
    const grip = this.grip;
    if (!grip) return;

    const denom = ray.dx * grip.nx + ray.dy * grip.ny + ray.dz * grip.nz;
    if (Math.abs(denom) < 1e-6) return;

    const px = grip.planeX - ray.ox;
    const py = grip.planeY - ray.oy;
    const pz = grip.planeZ - ray.oz;
    const t = (px * grip.nx + py * grip.ny + pz * grip.nz) / denom;
    if (t <= 0) return;

    // Clamped to the slab so a pointer dragged off-canvas cannot haul cloth
    // through the walls; the constraints would fight it and the fabric would
    // shudder against the boundary.
    const margin = 0.25;
    grip.tx = clamp(ray.ox + ray.dx * t, -ARENA.halfWidth + margin, ARENA.halfWidth - margin);
    grip.ty = Math.max(ray.oy + ray.dy * t, ARENA.floorY + margin);
    grip.tz = clamp(ray.oz + ray.dz * t, -ARENA.halfDepth + margin, ARENA.halfDepth - margin);
  }

  /**
   * Let go. Nothing else to do — the released particles keep the velocity the
   * integrator already gave them, so a flick throws the garment naturally.
   */
  endGrab(): void {
    this.grip = null;
  }

  /** Nearest particle whose distance to the ray is under {@link GRAB_RAY_RADIUS}. */
  pick(ray: Ray): { garmentId: number; particle: number; distance: number } | null {
    let bestGarment = -1;
    let bestParticle = -1;
    let bestAlong = Infinity;

    for (const g of this.garments) {
      if (g.state !== 'falling') continue;
      const n = g.topology.count;
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        const ox = g.pos[ix] - ray.ox;
        const oy = g.pos[ix + 1] - ray.oy;
        const oz = g.pos[ix + 2] - ray.oz;
        const along = ox * ray.dx + oy * ray.dy + oz * ray.dz;
        if (along <= 0 || along >= bestAlong) continue;

        const px = ox - ray.dx * along;
        const py = oy - ray.dy * along;
        const pz = oz - ray.dz * along;
        if (px * px + py * py + pz * pz > GRAB_RAY_RADIUS * GRAB_RAY_RADIUS) continue;

        bestAlong = along;
        bestGarment = g.id;
        bestParticle = i;
      }
    }

    if (bestGarment < 0) return null;
    return { garmentId: bestGarment, particle: bestParticle, distance: bestAlong };
  }

  /** Fraction of a garment's particles inside `box`. */
  fractionInside(g: Garment, b: Box): number {
    const n = g.topology.count;
    let inside = 0;
    for (let i = 0; i < n; i++) {
      if (pointInBox(b, g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2])) inside++;
    }
    return inside / n;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Teschner et al.'s spatial hash, masked to the table size. */
function hashCell(ix: number, iy: number, iz: number): number {
  return (((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0) & (HASH_BUCKETS - 1);
}
