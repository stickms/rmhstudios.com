/** PCF simulation in Source units and Z-up world coordinates. Rendering owns the GL basis change. */
import { Quaternion, Vector3 } from 'three';
import {
  initialize,
  operate,
  systemOperator,
  applyForce,
  constrain,
  knownFunction,
} from './operators';
import {
  number as n,
  type ParticleBundle,
  type ParticleDefinition,
  type ParticleOperator,
} from './types';

export interface ControlPoint {
  position: Vector3;
  rotation: Quaternion;
  previous: Vector3;
  previousRotation: Quaternion;
}
export const controlPoint = (): ControlPoint => ({
  position: new Vector3(),
  rotation: new Quaternion(),
  previous: new Vector3(),
  previousRotation: new Quaternion(),
});

export interface ParticleEnvironment {
  points: Map<number, ControlPoint>;
  /** Source-space model query, sampled from exported, animated MDL hitboxes. */
  sampleModel?: (
    cp: number,
    random: () => number,
    target: Vector3,
    scale: number,
    local: Vector3,
  ) => number;
  modelPoint?: (hitbox: number, local: Vector3, target: Vector3) => void;
  insideModel?: (point: Vector3) => boolean;
  trace?: (
    from: Vector3,
    to: Vector3,
    radius: number,
    brushOnly: boolean,
  ) => { position: Vector3; normal: Vector3 } | null;
  player: Vector3;
}

export class SimParticle {
  id = 0;
  born = 0;
  age = 0;
  life = 1;
  radius = 5;
  alpha = 1;
  alpha2 = 1;
  roll = 0;
  yaw = 0;
  rollSpeed = 0;
  sequence = 0;
  sequence2 = 0;
  trail = 0.1;
  hitbox = -1;
  dead = false;
  pathT = 0;
  position = new Vector3();
  previous = new Vector3();
  velocity = new Vector3();
  color = new Vector3(1, 1, 1);
  hitboxLocal = new Vector3();
  initialPosition = new Vector3();
  initialColor = new Vector3(1, 1, 1);
  initialRadius = 5;
  initialAlpha = 1;
  initialRoll = 0;
  initialYaw = 0;
  /** Stable random draws per operator, independent of frame rate and particle compaction. */
  random(channel: number): number {
    let h = Math.imul(this.id + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }
}

export class SimSystem {
  readonly particles: SimParticle[] = [];
  readonly children: SimSystem[] = [];
  readonly points = new Map<number, ControlPoint>();
  readonly inheritedPoints = new Map<number, ControlPoint>();
  readonly capacity: number;
  readonly decays: boolean;
  readonly emitterState: number[];
  readonly pool: SimParticle[] = [];
  readonly scratch = Array.from({ length: 7 }, () => new Vector3());
  readonly quaternion = new Quaternion();
  time = 0;
  dt = 1 / 60;
  emitted = 0;
  started = false;
  averageVelocity = new Vector3();
  constructor(
    readonly definition: ParticleDefinition,
    readonly effect: ParticleSimulation,
    readonly parent?: SimSystem,
    readonly delay = 0,
    readonly seed = 1,
  ) {
    this.capacity = Math.max(1, Math.min(4000, n(definition.options, 'max_particles', 1000)));
    this.decays = definition.operators.some((o) =>
      /^(lifespan decay|alpha fade and decay)$/.test(o.function),
    );
    this.emitterState = definition.emitters.map(() => 0);
    for (const group of [
      'initializers',
      'operators',
      'forces',
      'constraints',
      'emitters',
      'renderers',
    ] as const) {
      for (const op of definition[group]) {
        if (!knownFunction(op.function)) effect.unsupported.add(op.function);
      }
    }
  }

  cp(index = 0): ControlPoint {
    return (
      this.points.get(index) ??
      this.inheritedPoints.get(index) ??
      this.parent?.cp(index) ??
      this.effect.environment.points.get(index) ??
      this.effect.environment.points.get(0)!
    );
  }

  setPoint(index: number, position: Vector3, rotation?: Quaternion): ControlPoint {
    let point = this.points.get(index);
    if (!point) {
      point = controlPoint();
      point.previous.copy(position);
      this.points.set(index, point);
    }
    point.position.copy(position);
    if (rotation) point.rotation.copy(rotation);
    return point;
  }

  spawn(count: number, born: number) {
    count = Math.floor(
      Math.min(count, this.capacity - this.particles.length, this.effect.remaining),
    );
    for (let i = 0; i < count; i++) {
      const p = this.pool.pop() ?? new SimParticle();
      p.id = this.seed + this.emitted++;
      p.born = born;
      p.age = 0;
      p.life = 1;
      p.dead = false;
      p.hitbox = -1;
      p.pathT = 0;
      p.position.copy(this.cp().position);
      p.previous.copy(p.position);
      p.velocity.set(0, 0, 0);
      const color = this.definition.options.color;
      const c = Array.isArray(color) ? color : [255, 255, 255, 255];
      p.color.set(c[0] / 255, c[1] / 255, c[2] / 255);
      p.alpha = (c[3] ?? 255) / 255;
      p.alpha2 = 1;
      p.radius = n(this.definition.options, 'radius', 5);
      p.roll = n(this.definition.options, 'rotation');
      p.yaw = 0;
      p.rollSpeed = n(this.definition.options, 'rotation_speed');
      p.sequence = n(this.definition.options, 'sequence_number');
      p.sequence2 = n(this.definition.options, 'sequence_number 1');
      p.trail = 0.1;
      this.definition.initializers.forEach((op, j) => {
        if (op.function !== 'lifetime from sequence') initialize(this, p, op, j * 31);
      });
      this.definition.initializers.forEach((op, j) => {
        if (op.function === 'lifetime from sequence') initialize(this, p, op, j * 31);
      });
      p.initialPosition.copy(p.position);
      p.previous.copy(p.position);
      p.initialColor.copy(p.color);
      p.initialRadius = p.radius;
      p.initialAlpha = p.alpha;
      p.initialRoll = p.roll;
      p.initialYaw = p.yaw;
      this.particles.push(p);
      this.effect.remaining--;
    }
  }

  emit(previousTime: number) {
    this.definition.emitters.forEach((op, i) => {
      const p = op.params;
      const repeat = this.effect.refireInterval;
      const cycle = repeat > 0 ? Math.floor((this.time + 1e-8) / repeat) : 0;
      const start = n(p, 'emission_start_time') + cycle * repeat;
      const end = n(p, 'emission_duration');
      if (this.time < start || (end > 0 && previousTime >= start + end)) return;
      const active = Math.max(
        0,
        Math.min(this.time, end > 0 ? start + end : this.time) - Math.max(start, previousTime),
      );
      if (op.function === 'emit_instantaneously') {
        if (this.emitterState[i] >= cycle + 1) return;
        const max = n(p, 'num_to_emit', 100);
        const min = n(p, 'num_to_emit_minimum', -1);
        const sample = (Math.sin(this.seed * 17.3 + i * 13.1) + 1) / 2;
        let count = Math.floor(min < 0 ? max : min + sample * (max - min + 1));
        const scaleCp = n(p, 'emission count scale control point', -1);
        if (scaleCp >= 0)
          count *= this.cp(scaleCp).position.getComponent(
            n(p, 'emission count scale control point field'),
          );
        this.spawn(Math.max(0, Math.floor(count)), start);
        this.emitterState[i] = cycle + 1;
      } else {
        let rate = n(p, 'emission_rate', 100);
        if (op.function === 'emit noise') {
          const t =
            (this.time + n(p, 'time coordinate offset')) * n(p, 'time noise coordinate scale', 1);
          let noise = Math.sin(t * 1.7 + Math.sin(t * 0.7));
          if (n(p, 'absolute value')) noise = Math.abs(noise);
          if (n(p, 'invert absolute value')) noise = 1 - noise;
          rate =
            n(p, 'emission minimum') +
            (noise + 1) * 0.5 * (n(p, 'emission maximum', 100) - n(p, 'emission minimum'));
        }
        if (n(p, 'use parent particles for emission scaling'))
          rate *= this.parent?.particles.length ?? 0;
        this.emitterState[i] += Math.max(0, rate) * active;
        const count = Math.floor(this.emitterState[i] + 1e-8);
        this.emitterState[i] -= count;
        this.spawn(count, this.time);
      }
    });
  }

  step(dt: number) {
    const before = this.time;
    this.time += dt;
    this.dt = dt;
    if (this.time < 0) return;
    for (const point of this.points.values()) {
      point.previous.copy(point.position);
      point.previousRotation.copy(point.rotation);
    }
    for (const op of this.definition.operators) systemOperator(this, op);
    if (!this.started) {
      this.started = true;
      this.spawn(n(this.definition.options, 'initial_particles'), 0);
    }
    this.emit(before);
    this.averageVelocity.set(0, 0, 0);
    for (const p of this.particles) this.averageVelocity.add(p.velocity);
    this.averageVelocity.divideScalar(Math.max(1, this.particles.length));
    for (const p of this.particles) {
      p.previous.copy(p.position);
      p.age = Math.max(0, this.time - p.born);
      p.radius = p.initialRadius;
      p.alpha = p.initialAlpha;
      p.alpha2 = 1;
      p.color.copy(p.initialColor);
      for (const op of this.definition.forces) applyForce(this, p, op);
      this.definition.operators.forEach((op, j) => operate(this, p, op, j * 31));
      for (const op of this.definition.constraints) constrain(this, p, op);
      if (this.decays && p.age >= p.life) p.dead = true;
    }
    // Child CP drivers run after movement, before child emission/simulation.
    for (const op of this.definition.operators) systemOperator(this, op, true);
    let live = 0;
    for (const p of this.particles) {
      if (p.dead || !Number.isFinite(p.position.lengthSq())) {
        this.pool.push(p);
        this.effect.remaining++;
      } else this.particles[live++] = p;
    }
    this.particles.length = live;
    for (const child of this.children) child.step(dt);
  }
}

export class ParticleSimulation {
  readonly systems: SimSystem[] = [];
  readonly unsupported = new Set<string>();
  readonly root: SimSystem;
  readonly refireInterval: number;
  remaining = 16000;
  accumulator = 0;
  time = 0;
  constructor(
    readonly bundle: ParticleBundle,
    readonly environment: ParticleEnvironment,
  ) {
    const refire = Number(bundle.schema.refire_time ?? 0);
    this.refireInterval = Number.isFinite(refire) ? Math.max(0, refire) : 0;
    if (!environment.points.has(0)) environment.points.set(0, controlPoint());
    const instantiate = (
      name: string,
      parent?: SimSystem,
      delay = 0,
      ancestors = new Set<string>(),
    ): SimSystem => {
      if (ancestors.has(name) || ancestors.size >= 64 || this.systems.length >= 1024)
        throw new Error('Particle graph cycle or size limit');
      const def = bundle.systems[name];
      if (!def) throw new Error(`Missing particle system: ${name}`);
      const sys = new SimSystem(def, this, parent, delay, this.systems.length * 104729 + bundle.id);
      sys.time = -delay;
      this.systems.push(sys);
      const next = new Set(ancestors).add(name);
      for (const child of def.children)
        sys.children.push(instantiate(child.system, sys, child.delay, next));
      return sys;
    };
    this.root = instantiate(bundle.system);
  }
  advance(delta: number) {
    this.accumulator += Math.max(0, Math.min(delta, 0.1));
    const steps = Math.floor((this.accumulator + 1e-9) * 60);
    if (!steps) return;
    // Interpolate moving attachments across fixed steps. Applying the whole frame's
    // CP movement at every substep would drag locked particles several times too far.
    const targets = [...this.environment.points.values()].map((cp) => ({
      cp,
      position: cp.position.clone(),
      rotation: cp.rotation.clone(),
      from: cp.previous.clone(),
      fromRotation: cp.previousRotation.clone(),
    }));
    let step = 0;
    while (this.accumulator + 1e-9 >= 1 / 60) {
      const fraction = ++step / steps;
      for (const t of targets) {
        t.cp.position.lerpVectors(t.from, t.position, fraction);
        t.cp.rotation.slerpQuaternions(t.fromRotation, t.rotation, fraction);
      }
      this.root.step(1 / 60);
      this.accumulator -= 1 / 60;
      this.time += 1 / 60;
      for (const { cp } of targets) {
        cp.previous.copy(cp.position);
        cp.previousRotation.copy(cp.rotation);
      }
    }
  }
  warmup(seconds = 1.5) {
    for (let i = 0; i < seconds * 60; i++) this.advance(1 / 60);
  }
}

export const operatorStrength = (op: ParticleOperator, time: number): number => {
  const p = op.params;
  let strength = 1;
  const start = n(p, 'operator start fadein'),
    end = n(p, 'operator end fadein');
  const outStart = n(p, 'operator start fadeout'),
    outEnd = n(p, 'operator end fadeout');
  const span = (t: number, a: number, b: number) =>
    a === b ? +(t >= b) : Math.max(0, Math.min(1, (t - a) / (b - a)));
  if (end > start) strength *= span(time, start, end);
  if (outEnd > outStart) strength *= 1 - span(time, outStart, outEnd);
  const period = n(p, 'operator fade oscillate');
  if (period > 0) strength *= (Math.cos((time * Math.PI * 2) / period) + 1) / 2;
  return strength;
};
