/** Interpreter for the Source 1 operators used by TF2's cosmetic and taunt PCFs.
 * Parameters keep their original DMX names. All vectors here are Source Z-up.
 */
import { Vector3 } from 'three';
import { operatorStrength, type SimParticle, type SimSystem } from './simulation';
import { number as n, vector, type Params, type ParticleOperator } from './types';

const TAU = Math.PI * 2,
  DEG = Math.PI / 180;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ramp = (v: number, a: number, b: number) => (a === b ? +(v >= b) : clamp((v - a) / (b - a)));
const smooth = (v: number) => v * v * (3 - 2 * v);
const bias = (v: number, b: number) => (b <= 0 ? 0 : b >= 1 ? 1 : v / ((1 / b - 2) * (1 - v) + 1));
const rand = (p: SimParticle, channel: number, a: number, b: number, exp = 1) =>
  lerp(a, b, Math.pow(p.random(channel), exp));
const vec = (target: Vector3, params: Params, key: string, fallback?: number[]) =>
  target.fromArray(vector(params, key, fallback));
const randomVec = (target: Vector3, p: SimParticle, c: number, min: number[], max: number[]) =>
  target.set(
    rand(p, c, min[0], max[0]),
    rand(p, c + 1, min[1], max[1]),
    rand(p, c + 2, min[2], max[2]),
  );
const direction = (target: Vector3, p: SimParticle, c: number) => {
  const z = p.random(c) * 2 - 1,
    a = p.random(c + 1) * TAU,
    r = Math.sqrt(Math.max(0, 1 - z * z));
  return target.set(r * Math.cos(a), r * Math.sin(a), z);
};

/** Continuous gradient noise, rather than a new random velocity every frame. */
export function noise(x: number, y = 0, z = 0): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  const fade = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);
  const grad = (a: number, b: number, c: number, dx: number, dy: number, dz: number) => {
    let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791);
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
    const u = h & 8 ? dx : dy,
      v = h & 4 ? dy : dz;
    return (h & 1 ? -u : u) + (h & 2 ? -v : v);
  };
  const plane = (k: number) =>
    lerp(
      lerp(
        grad(ix, iy, iz + k, fx, fy, fz - k),
        grad(ix + 1, iy, iz + k, fx - 1, fy, fz - k),
        fade(fx),
      ),
      lerp(
        grad(ix, iy + 1, iz + k, fx, fy - 1, fz - k),
        grad(ix + 1, iy + 1, iz + k, fx - 1, fy - 1, fz - k),
        fade(fx),
      ),
      fade(fy),
    );
  return clamp(lerp(plane(0), plane(1), fade(fz)), -1, 1);
}

function getScalar(p: SimParticle, field: number, initial = false): number {
  switch (field) {
    case 1:
      return p.life;
    case 3:
      return initial ? p.initialRadius : p.radius;
    case 4:
      return initial ? p.initialRoll : p.roll;
    case 5:
      return p.rollSpeed;
    case 7:
      return initial ? p.initialAlpha : p.alpha;
    case 8:
      return p.born;
    case 9:
      return p.sequence;
    case 10:
      return p.trail;
    case 12:
      return p.yaw;
    case 13:
      return p.sequence2;
    case 14:
      return p.hitbox;
    case 16:
      return p.alpha2;
    default:
      return 0;
  }
}
function setScalar(p: SimParticle, field: number, value: number) {
  if (!Number.isFinite(value)) return;
  switch (field) {
    case 1:
      p.life = Math.max(0.001, value);
      break;
    case 3:
      p.radius = Math.max(0, value);
      break;
    case 4:
      p.roll = value;
      break;
    case 5:
      p.rollSpeed = value;
      break;
    case 7:
      p.alpha = clamp(value);
      break;
    case 9:
      p.sequence = Math.floor(value);
      break;
    case 10:
      p.trail = Math.max(0, value);
      break;
    case 12:
      p.yaw = value;
      break;
    case 13:
      p.sequence2 = Math.floor(value);
      break;
    case 16:
      p.alpha2 = clamp(value);
      break;
  }
}
function vectorField(p: SimParticle, field: number) {
  return field === 0 ? p.position : field === 2 ? p.previous : field === 6 ? p.color : null;
}
function cpIndex(o: Params) {
  return n(o, 'control_point_number', n(o, 'control point number', n(o, 'control point')));
}
function pathPosition(s: SimSystem, o: Params, t: number, out: Vector3) {
  const start = s.cp(n(o, 'start control point number')).position;
  const end = s.cp(n(o, 'end control point number', 1)).position;
  out.lerpVectors(start, end, t);
  const bulge = n(o, 'bulge', n(o, 'random bulge'));
  if (bulge) out.z += 4 * t * (1 - t) * bulge;
  return out;
}

export function initialize(s: SimSystem, p: SimParticle, op: ParticleOperator, c: number) {
  const o = op.params,
    f = op.function,
    a = s.scratch[0],
    b = s.scratch[1];
  const cp = s.cp(cpIndex(o));
  switch (f) {
    case 'lifetime random':
      p.life = Math.max(
        0.001,
        rand(
          p,
          c,
          n(o, 'lifetime_min', 1),
          n(o, 'lifetime_max', 1),
          n(o, 'lifetime_random_exponent', 1),
        ),
      );
      break;
    case 'radius random':
      p.radius = rand(
        p,
        c,
        n(o, 'radius_min', 1),
        n(o, 'radius_max', 1),
        n(o, 'radius_random_exponent', 1),
      );
      break;
    case 'alpha random':
      p.alpha =
        rand(
          p,
          c,
          n(o, 'alpha_min', 255),
          n(o, 'alpha_max', 255),
          n(o, 'alpha_random_exponent', 1),
        ) / 255;
      break;
    case 'color random': {
      const min = vector(o, 'color1', [255, 255, 255]),
        max = vector(o, 'color2', min),
        t = p.random(c);
      p.color
        .set(lerp(min[0], max[0], t), lerp(min[1], max[1], t), lerp(min[2], max[2], t))
        .divideScalar(255);
      if (n(o, 'tint_perc')) {
        vec(a, o, 'tint clamp min').divideScalar(255);
        vec(b, o, 'tint clamp max', [255, 255, 255]).divideScalar(255);
        s.scratch[2]
          .copy(s.cp(n(o, 'tint control point')).position)
          .divideScalar(255)
          .clamp(a, b);
        p.color.lerp(s.scratch[2], n(o, 'tint_perc'));
      }
      break;
    }
    case 'rotation random':
      p.roll =
        (n(o, 'rotation_initial') +
          rand(
            p,
            c,
            n(o, 'rotation_offset_min'),
            n(o, 'rotation_offset_max', 360),
            n(o, 'rotation_random_exponent', 1),
          )) *
        DEG;
      break;
    case 'rotation yaw random':
      p.yaw =
        (n(o, 'yaw_initial') +
          rand(
            p,
            c,
            n(o, 'yaw_offset_min'),
            n(o, 'yaw_offset_max', 360),
            n(o, 'yaw_random_exponent', 1),
          )) *
        DEG;
      break;
    case 'rotation yaw flip random': {
      const v = n(o, 'flip percentage', 0.5);
      if (p.random(c) < (v > 1 ? v / 100 : v)) p.yaw += Math.PI;
      break;
    }
    case 'rotation speed random': {
      p.rollSpeed =
        (n(o, 'rotation_speed_constant') +
          rand(
            p,
            c,
            n(o, 'rotation_speed_random_min'),
            n(o, 'rotation_speed_random_max'),
            n(o, 'rotation_speed_random_exponent', 1),
          )) *
        DEG;
      if (n(o, 'randomly_flip_direction') && p.random(c + 1) < 0.5) p.rollSpeed *= -1;
      break;
    }
    case 'sequence random':
      p.sequence = Math.floor(rand(p, c, n(o, 'sequence_min'), n(o, 'sequence_max') + 1));
      break;
    case 'trail length random':
      p.trail = rand(
        p,
        c,
        n(o, 'length_min', 0.1),
        n(o, 'length_max', 0.1),
        n(o, 'length_random_exponent', 1),
      );
      break;
    case 'position within sphere random': {
      direction(a, p, c);
      const radius = rand(p, c + 2, n(o, 'distance_min'), n(o, 'distance_max'));
      const abs = vector(o, 'distance_bias_absolute_value'),
        scale = vector(o, 'distance_bias', [1, 1, 1]);
      for (let j = 0; j < 3; j++)
        a.setComponent(
          j,
          (abs[j] ? Math.abs(a.getComponent(j)) * Math.sign(abs[j]) : a.getComponent(j)) * scale[j],
        );
      if (n(o, 'bias in local system')) a.applyQuaternion(cp.rotation);
      p.position.copy(cp.position).addScaledVector(a, radius);
      p.velocity.addScaledVector(
        a.normalize(),
        rand(p, c + 3, n(o, 'speed_min'), n(o, 'speed_max'), n(o, 'speed_random_exponent', 1)),
      );
      randomVec(
        b,
        p,
        c + 4,
        vector(o, 'speed_in_local_coordinate_system_min'),
        vector(o, 'speed_in_local_coordinate_system_max'),
      ).applyQuaternion(cp.rotation);
      p.velocity.add(b);
      break;
    }
    case 'position within box random': {
      randomVec(a, p, c, vector(o, 'min'), vector(o, 'max')).applyQuaternion(cp.rotation);
      p.position.copy(cp.position).add(a);
      break;
    }
    case 'position modify offset random': {
      randomVec(a, p, c, vector(o, 'offset min'), vector(o, 'offset max'));
      if (n(o, 'offset proportional to radius 0/1')) a.multiplyScalar(p.radius);
      if (n(o, 'offset in local space 0/1')) a.applyQuaternion(cp.rotation);
      p.position.add(a);
      break;
    }
    case 'position modify warp random': {
      randomVec(a, p, c, vector(o, 'warp min', [1, 1, 1]), vector(o, 'warp max', [1, 1, 1]));
      p.position.sub(cp.position).multiply(a).add(cp.position);
      break;
    }
    case 'velocity random': {
      randomVec(
        a,
        p,
        c,
        vector(o, 'speed_in_local_coordinate_system_min'),
        vector(o, 'speed_in_local_coordinate_system_max'),
      ).applyQuaternion(cp.rotation);
      direction(b, p, c + 4).multiplyScalar(
        rand(p, c + 6, n(o, 'random_speed_min'), n(o, 'random_speed_max')),
      );
      p.velocity.add(a).add(b);
      break;
    }
    case 'velocity noise': {
      const min = vector(o, 'output minimum'),
        max = vector(o, 'output maximum');
      const offset = vector(o, 'spatial coordinate offset'),
        spatial = n(o, 'spatial noise coordinate scale', 1);
      const time =
        (s.time + n(o, 'time coordinate offset')) * n(o, 'time noise coordinate scale', 1);
      const abs = vector(o, 'absolute value'),
        invert = vector(o, 'invert abs value');
      for (let j = 0; j < 3; j++) {
        let v = noise(
          p.position.x * spatial + offset[0] + time + j * 19.1,
          p.position.y * spatial + offset[1],
          p.position.z * spatial + offset[2],
        );
        if (abs[j]) v = Math.abs(v);
        if (invert[j]) v = 1 - v;
        a.setComponent(j, lerp(min[j], max[j], (v + 1) / 2));
      }
      if (n(o, 'apply velocity in local space (0/1)')) a.applyQuaternion(cp.rotation);
      p.velocity.add(a);
      break;
    }
    case 'velocity inherit from control point':
      p.velocity.addScaledVector(
        a.subVectors(cp.position, cp.previous),
        n(o, 'velocity scale', 1) / s.dt,
      );
      break;
    case 'position from parent particles': {
      const parents = s.parent?.particles;
      if (parents?.length) {
        const i = n(o, 'random parent particle distribution')
          ? Math.floor(p.random(c) * parents.length)
          : (s.emitted - 1) % parents.length;
        p.position.copy(parents[i].position);
        p.velocity.copy(parents[i].velocity).multiplyScalar(n(o, 'inherited velocity scale', 1));
      }
      break;
    }
    case 'position on model random': {
      let draw = 0;
      p.hitbox =
        s.effect.environment.sampleModel?.(
          cpIndex(o),
          () => p.random(c + draw++),
          p.position,
          n(o, 'hitbox scale', 1),
          p.hitboxLocal,
        ) ?? -1;
      break;
    }
    case 'position along path random':
    case 'position along path sequential': {
      let t = p.random(c);
      if (f.endsWith('sequential')) {
        const count = Math.max(1, n(o, 'particles to map from start to end', 100));
        const value = (s.emitted - 1) / Math.max(1, count - 1);
        t = n(o, 'restart behavior (0 = bounce, 1 = loop )')
          ? value % 1
          : 1 - Math.abs((value % 2) - 1);
      }
      p.pathT = t;
      pathPosition(s, o, t, p.position);
      p.position.addScaledVector(
        direction(a, p, c + 3),
        p.random(c + 5) * n(o, 'maximum distance'),
      );
      break;
    }
    case 'lifetime from sequence': {
      const material = s.effect.bundle.materials[s.definition.material ?? ''];
      const seq = material?.textures.$basetexture?.sequences[String(p.sequence)];
      if (seq) p.life = seq.frames.length / Math.max(0.001, n(o, 'frames per second', 30));
      break;
    }
    case 'remap scalar to vector':
    case 'remap control point to scalar':
    case 'remap control point to vector':
    case 'remap initial scalar':
    case 'remap initial distance to control point to scalar':
    case 'remap noise to scalar':
      remap(s, p, op, true);
      break;
  }
}

function remap(s: SimSystem, p: SimParticle, op: ParticleOperator, initial = false) {
  const o = op.params,
    f = op.function,
    a = s.scratch[3];
  const start = n(o, 'emitter lifetime start time (seconds)', -1),
    end = n(o, 'emitter lifetime end time (seconds)', -1);
  if ((start >= 0 && s.time < start) || (end >= 0 && s.time > end)) return;
  const field = n(o, 'output field', 3);
  let input: number;
  let lo = n(o, 'input minimum'),
    hi = n(o, 'input maximum', 1);
  if (f.includes('distance')) {
    if (f.includes('between two'))
      input = s
        .cp(n(o, 'starting control point'))
        .position.distanceTo(s.cp(n(o, 'ending control point', 1)).position);
    else input = p.position.distanceTo(s.cp(n(o, 'control point')).position);
    lo = n(o, 'distance minimum');
    hi = n(o, 'distance maximum', 1);
    if (
      n(o, 'only active within specified distance') &&
      (input < Math.min(lo, hi) || input > Math.max(lo, hi))
    )
      return;
  } else if (f.includes('control point')) {
    a.copy(s.cp(n(o, 'input control point number')).position);
    if (f.endsWith('vector')) {
      const min = vector(o, 'input minimum'),
        max = vector(o, 'input maximum', [1, 1, 1]);
      const outMin = vector(o, 'output minimum'),
        outMax = vector(o, 'output maximum', [1, 1, 1]);
      for (let j = 0; j < 3; j++)
        a.setComponent(j, lerp(outMin[j], outMax[j], ramp(a.getComponent(j), min[j], max[j])));
      const target = vectorField(p, field);
      if (target) {
        if (n(o, 'output is scalar of initial random range')) target.multiply(a);
        else target.copy(a);
      }
      return;
    }
    input = a.getComponent(n(o, 'input field 0-2 x/y/z'));
  } else if (f.includes('noise')) {
    const t =
      (s.time + n(o, 'time coordinate offset')) *
      n(o, 'time noise coordinate scale', n(o, 'noise coordinate scale', 1));
    const spatial = n(o, 'spatial noise coordinate scale');
    input = noise(p.position.x * spatial + t, p.position.y * spatial, p.position.z * spatial);
    if (n(o, 'absolute value')) input = Math.abs(input);
    if (n(o, 'invert absolute value')) input = 1 - input;
    lo = -1;
    hi = 1;
  } else input = getScalar(p, n(o, 'input field', 8));
  if (
    n(o, 'only active within specified input range') &&
    (input < Math.min(lo, hi) || input > Math.max(lo, hi))
  )
    return;
  const t = ramp(input, lo, hi);
  if (f.endsWith('vector')) {
    const min = vector(o, 'output minimum'),
      max = vector(o, 'output maximum');
    a.set(lerp(min[0], max[0], t), lerp(min[1], max[1], t), lerp(min[2], max[2], t));
    const target = vectorField(p, field);
    if (target) {
      if (n(o, 'use local system')) a.applyQuaternion(s.cp(cpIndex(o)).rotation);
      if (field === 0 && n(o, 'use local system')) a.add(s.cp(cpIndex(o)).position);
      target.copy(a);
    }
  } else {
    let result = lerp(n(o, 'output minimum'), n(o, 'output maximum', 1), t);
    if (n(o, 'output is scalar of initial random range')) result *= getScalar(p, field, !initial);
    setScalar(p, field, result);
  }
}

export function operate(s: SimSystem, p: SimParticle, op: ParticleOperator, c: number) {
  const o = op.params,
    f = op.function,
    a = s.scratch[0],
    b = s.scratch[1];
  const age = p.age,
    life = Math.max(0.001, p.life),
    t = age / life;
  const strength = operatorStrength(op, s.time),
    dt = s.dt * strength;
  if (dt <= 0) return;
  switch (f) {
    case 'movement basic': {
      vec(a, o, 'gravity');
      p.velocity.addScaledVector(a, dt).multiplyScalar(Math.pow(clamp(1 - n(o, 'drag')), 30 * dt));
      p.position.addScaledVector(p.velocity, dt);
      break;
    }
    case 'movement lock to control point': {
      const cp = s.cp(cpIndex(o));
      const start = rand(
        p,
        c,
        n(o, 'start_fadeout_min', 1),
        n(o, 'start_fadeout_max', 1),
        n(o, 'start_fadeout_exponent', 1),
      );
      const end = rand(
        p,
        c + 1,
        n(o, 'end_fadeout_min', 1),
        n(o, 'end_fadeout_max', 1),
        n(o, 'end_fadeout_exponent', 1),
      );
      const weight = t <= start ? 1 : 1 - ramp(t, start, end);
      if (n(o, 'lock rotation')) {
        s.quaternion.copy(cp.previousRotation).invert().premultiply(cp.rotation);
        a.copy(p.position).sub(cp.previous).applyQuaternion(s.quaternion).add(cp.position);
        p.position.lerp(a, weight * strength);
      } else p.position.addScaledVector(a.subVectors(cp.position, cp.previous), weight * strength);
      break;
    }
    case 'movement lock to bone': {
      const w = 1 - ramp(t, n(o, 'lifetime fade start'), n(o, 'lifetime fade end', 1));
      if (p.hitbox >= 0 && s.effect.environment.modelPoint) {
        s.effect.environment.modelPoint(p.hitbox, p.hitboxLocal, a);
        p.position.lerp(a, w * strength);
      }
      break;
    }
    case 'movement rotate particle around axis': {
      const cp = s.cp(n(o, 'control point'));
      vec(a, o, 'rotation axis', [0, 0, 1]).normalize();
      if (n(o, 'use local space')) a.applyQuaternion(cp.rotation);
      p.position
        .sub(cp.position)
        .applyAxisAngle(a, n(o, 'rotation rate') * DEG * dt)
        .add(cp.position);
      break;
    }
    case 'movement max velocity':
      p.velocity.clampLength(0, Math.max(0, n(o, 'maximum velocity', 100)));
      break;
    case 'movement dampen relative to control point': {
      const cp = s.cp(cpIndex(o));
      const weight = 1 - ramp(p.position.distanceTo(cp.position), 0, n(o, 'falloff range', 100));
      p.velocity.multiplyScalar(Math.max(0, 1 - weight * n(o, 'dampen scale', 1) * dt));
      break;
    }
    case 'movement match particle velocities': {
      const avg = s.averageVelocity;
      p.velocity.lerp(avg, clamp(n(o, 'direction matching strength', 1) * dt));
      const length = p.velocity.length();
      if (length)
        p.velocity.multiplyScalar(
          lerp(length, avg.length(), clamp(n(o, 'speed matching strength', 1) * dt)) / length,
        );
      break;
    }
    case 'radius scale': {
      let weight = ramp(t, n(o, 'start_time'), n(o, 'end_time', 1));
      if (n(o, 'ease_in_and_out')) weight = smooth(weight);
      weight = bias(weight, n(o, 'scale_bias', 0.5));
      p.radius =
        p.initialRadius * lerp(n(o, 'radius_start_scale', 1), n(o, 'radius_end_scale', 1), weight);
      break;
    }
    case 'color fade': {
      let weight = ramp(t, n(o, 'fade_start_time'), n(o, 'fade_end_time', 1));
      if (n(o, 'ease_in_and_out')) weight = smooth(weight);
      vec(a, o, 'color_fade', [255, 255, 255]).divideScalar(255);
      p.color.lerpVectors(p.initialColor, a, weight * strength);
      break;
    }
    case 'alpha fade in random':
    case 'alpha fade out random': {
      const fadeIn = f === 'alpha fade in random',
        key = fadeIn ? 'fade in time ' : 'fade out time ';
      let duration = rand(
        p,
        c,
        n(o, key + 'min', 0.25),
        n(o, key + 'max', 0.25),
        n(o, key + 'exponent', 1),
      );
      if (n(o, 'proportional 0/1', 1)) duration *= life;
      let weight = duration <= 0 ? 1 : clamp((fadeIn ? age : life - age) / duration);
      if (n(o, 'ease in and out')) weight = smooth(weight);
      if (!fadeIn) weight = bias(weight, n(o, 'fade bias', 0.5));
      const exp = n(o, 'fade in curve exponent');
      if (fadeIn && exp > 0) weight = Math.pow(weight, exp);
      p.alpha *= lerp(1, weight, strength);
      break;
    }
    case 'alpha fade and decay': {
      const inStart = n(o, 'start_fade_in_time'),
        inEnd = n(o, 'end_fade_in_time', 0.25);
      const outStart = n(o, 'start_fade_out_time', 0.75),
        outEnd = n(o, 'end_fade_out_time', 1);
      if (t < inEnd) p.alpha = lerp(n(o, 'start_alpha'), p.initialAlpha, ramp(t, inStart, inEnd));
      if (t >= outStart)
        p.alpha = lerp(p.initialAlpha, n(o, 'end_alpha'), ramp(t, outStart, outEnd));
      if (t >= outEnd) p.dead = true;
      break;
    }
    case 'rotation basic':
      p.roll += p.rollSpeed * dt;
      break;
    case 'rotation spin roll':
    case 'rotation spin yaw': {
      const yaw = f.endsWith('yaw'),
        prefix = yaw ? 'yaw_' : 'spin_';
      const stop = n(o, prefix + 'stop_time');
      const speed = n(o, prefix + 'rate_degrees') * DEG;
      const minimum = n(o, prefix + 'rate_min') * DEG;
      const angle = (stop > 0 ? lerp(speed, minimum, ramp(t, 0, stop)) : speed) * dt;
      if (yaw) p.yaw += angle;
      else p.roll += angle;
      break;
    }
    case 'rotation orient to 2d direction':
      p.roll = Math.atan2(p.velocity.z, p.velocity.x) + n(o, 'rotation offset') * DEG;
      break;
    case 'rotation orient relative to cp': {
      a.set(1, 0, 0).applyQuaternion(s.cp(n(o, 'control point')).rotation);
      p.roll = Math.atan2(a.z, a.x) + n(o, 'rotation offset') * DEG;
      break;
    }
    case 'oscillate scalar':
    case 'oscillate vector': {
      const scalar = f.endsWith('scalar'),
        field = n(o, 'oscillation field', scalar ? 3 : 0);
      const proportion = n(o, 'proportional 0/1', 1) ? life : 1;
      const start =
        rand(p, c + 10, n(o, 'start time min'), n(o, 'start time max')) *
        (n(o, 'start/end proportional', 1) ? life : 1);
      const end =
        rand(p, c + 11, n(o, 'end time min', 1), n(o, 'end time max', 1)) *
        (n(o, 'start/end proportional', 1) ? life : 1);
      if (age < start || age > end) break;
      const ratesMin = scalar ? [n(o, 'oscillation rate min')] : vector(o, 'oscillation rate min');
      const ratesMax = scalar ? [n(o, 'oscillation rate max')] : vector(o, 'oscillation rate max');
      const freqMin = scalar
        ? [n(o, 'oscillation frequency min', 1)]
        : vector(o, 'oscillation frequency min', [1, 1, 1]);
      const freqMax = scalar
        ? [n(o, 'oscillation frequency max', 1)]
        : vector(o, 'oscillation frequency max', [1, 1, 1]);
      for (let j = 0; j < (scalar ? 1 : 3); j++) {
        const rate = rand(p, c + j, ratesMin[j], ratesMax[j]);
        const omega =
          (rand(p, c + 4 + j, freqMin[j], freqMax[j]) *
            Math.PI *
            n(o, 'oscillation multiplier', 2)) /
          proportion;
        const phase = n(o, 'oscillation start phase', 0.5) * Math.PI;
        const since = Math.max(0, age - start);
        const integral =
          Math.abs(omega) > 1e-9
            ? (rate * (Math.cos(phase) - Math.cos(since * omega + phase))) / omega
            : rate * Math.sin(phase) * since;
        const delta = rate * Math.sin(age * omega + phase) * dt;
        if (scalar) {
          const persisted = ![3, 7, 16].includes(field);
          setScalar(p, field, getScalar(p, field) + (persisted ? delta : integral));
        } else {
          const target = vectorField(p, field);
          if (target)
            target.setComponent(j, target.getComponent(j) + (field === 6 ? integral : delta));
        }
      }
      break;
    }
    case 'movement lock to saved position along path':
    case 'movement maintain position along path':
      pathPosition(s, o, p.pathT, p.position);
      break;
    case 'cull when crossing plane': {
      vec(a, o, 'plane normal', [0, 0, 1]).normalize();
      b.copy(p.position).sub(s.cp(n(o, 'control point for point on plane')).position);
      if (b.dot(a) > n(o, 'cull plane offset')) p.dead = true;
      break;
    }
    case 'cull relative to model': {
      const inside = s.effect.environment.insideModel?.(p.position);
      if (inside !== undefined && (n(o, 'cull outside instead of inside') ? !inside : inside))
        p.dead = true;
      break;
    }
    case 'remap distance to control point to scalar':
    case 'remap distance to control point to vector':
    case 'remap distance between two control points to scalar':
    case 'remap scalar':
    case 'noise scalar':
      remap(s, p, op);
      break;
  }
}

export function systemOperator(s: SimSystem, op: ParticleOperator, afterMovement = false) {
  const o = op.params,
    a = s.scratch[4];
  if (op.function === 'set child control points from particle positions') {
    if (!afterMovement) return;
    const first = n(o, 'first control point to set', 1),
      count = n(o, '# of control points to set', 1);
    const offset = n(o, 'first particle to copy'),
      group = n(o, 'group id to affect');
    for (const child of s.children) {
      if (n(child.definition.options, 'group id') !== group) continue;
      for (let j = 0; j < count && j + offset < s.particles.length; j++) {
        const p = s.particles[j + offset];
        let cp = child.inheritedPoints.get(first + j);
        if (!cp) {
          const base = s.cp();
          cp = {
            position: p.position.clone(),
            rotation: base.rotation.clone(),
            previous: p.position.clone(),
            previousRotation: base.rotation.clone(),
          };
          child.inheritedPoints.set(first + j, cp);
        } else {
          cp.previous.copy(cp.position);
          cp.previousRotation.copy(cp.rotation);
          cp.position.copy(p.position);
        }
        if (n(o, 'set cp orientation for particles') && p.velocity.lengthSq() > 0)
          cp.rotation.setFromUnitVectors(a.set(1, 0, 0), s.scratch[5].copy(p.velocity).normalize());
      }
    }
    return;
  }
  if (afterMovement) return;
  switch (op.function) {
    case 'set control point positions': {
      const offset = s.cp(n(o, 'control point to offset positions from')).position;
      for (const prefix of ['first', 'second', 'third', 'fourth']) {
        const id = n(o, prefix + ' control point number', -1);
        if (id < 0) continue;
        vec(a, o, prefix + ' control point location');
        if (!n(o, 'set positions in world space')) a.applyQuaternion(s.cp().rotation).add(offset);
        s.setPoint(id, a);
      }
      break;
    }
    case 'set control point to player':
      vec(a, o, 'control point offset').add(s.effect.environment.player);
      s.setPoint(n(o, 'control point number', 1), a);
      break;
    case "set control point to particles' center":
      a.set(0, 0, 0);
      for (const p of s.particles) a.add(p.position);
      a.divideScalar(Math.max(1, s.particles.length)).add(
        s.scratch[5].fromArray(vector(o, 'center offset')),
      );
      s.setPoint(n(o, 'control point number to set', 1), a);
      break;
    case 'remap cp speed to cp': {
      const cp = s.cp(n(o, 'input control point'));
      const t = ramp(
        cp.position.distanceTo(cp.previous) / s.dt,
        n(o, 'input minimum'),
        n(o, 'input maximum', 1),
      );
      const id = n(o, 'output control point', 1);
      a.copy(s.cp(id).position).setComponent(
        n(o, 'output field 0-2 x/y/z'),
        lerp(n(o, 'output minimum'), n(o, 'output maximum', 1), t),
      );
      s.setPoint(id, a);
      break;
    }
  }
}

export function applyForce(s: SimSystem, p: SimParticle, op: ParticleOperator) {
  const o = op.params,
    a = s.scratch[0],
    b = s.scratch[1];
  const dt = s.dt * operatorStrength(op, s.time);
  switch (op.function) {
    case 'random force':
      randomVec(
        a,
        p,
        Math.floor(s.time * 60) + 500,
        vector(o, 'min force'),
        vector(o, 'max force'),
      );
      p.velocity.addScaledVector(a, dt);
      break;
    case 'pull towards control point': {
      a.subVectors(s.cp(cpIndex(o)).position, p.position);
      const dist = Math.max(0.001, a.length());
      const force = n(o, 'amount of force') / Math.pow(dist, n(o, 'falloff power'));
      p.velocity.addScaledVector(a, (force * dt) / dist);
      break;
    }
    case 'twist around axis': {
      vec(a, o, 'twist axis', [0, 0, 1]).normalize();
      if (n(o, 'object local space axis 0/1')) a.applyQuaternion(s.cp().rotation);
      b.subVectors(p.position, s.cp().position).cross(a).normalize();
      p.velocity.addScaledVector(b, n(o, 'amount of force') * dt);
      break;
    }
  }
}

export function constrain(s: SimSystem, p: SimParticle, op: ParticleOperator) {
  const o = op.params,
    a = s.scratch[0],
    b = s.scratch[1];
  switch (op.function) {
    case 'constrain distance to control point': {
      const cp = s.cp(cpIndex(o));
      vec(b, o, 'offset of center').applyQuaternion(cp.rotation).add(cp.position);
      a.subVectors(p.position, b);
      const len = a.length();
      if (len > 1e-9)
        p.position
          .copy(b)
          .addScaledVector(
            a,
            clamp(len, n(o, 'minimum distance'), n(o, 'maximum distance', 100)) / len,
          );
      break;
    }
    case 'constrain distance to path between two control points': {
      const start = s.cp(n(o, 'start control point number')).position,
        end = s.cp(n(o, 'end control point number', 1)).position;
      a.subVectors(end, start);
      const t = clamp(b.subVectors(p.position, start).dot(a) / Math.max(1e-9, a.lengthSq()));
      a.multiplyScalar(t).add(start);
      b.subVectors(p.position, a);
      const len = b.length();
      if (len > 1e-9)
        p.position
          .copy(a)
          .addScaledVector(b, clamp(len, n(o, 'minimum distance'), n(o, 'maximum distance')) / len);
      break;
    }
    case 'prevent passing through a plane': {
      const cp = s.cp(cpIndex(o));
      vec(a, o, 'plane normal', [0, 0, 1]).normalize();
      if (!n(o, 'global normal')) a.applyQuaternion(cp.rotation);
      vec(b, o, 'plane point');
      if (!n(o, 'global origin')) b.add(cp.position);
      const d = s.scratch[2].subVectors(p.position, b).dot(a);
      if (d < 0) p.position.addScaledVector(a, -d);
      break;
    }
    case 'collision via traces': {
      const hit = s.effect.environment.trace?.(
        p.previous,
        p.position,
        p.radius * n(o, 'radius scale', 1),
        !!n(o, 'brush only', 1),
      );
      if (!hit) break;
      if (n(o, 'kill particle on collision')) {
        p.dead = true;
        break;
      }
      p.position.copy(hit.position);
      const normalSpeed = p.velocity.dot(hit.normal);
      if (normalSpeed < 0)
        p.velocity.addScaledVector(hit.normal, -normalSpeed * (1 + n(o, 'amount of bounce')));
      p.velocity.multiplyScalar(1 - clamp(n(o, 'amount of slide')) * s.dt);
      break;
    }
  }
}

const FUNCTIONS = new Set([
  'lifetime random',
  'radius random',
  'alpha random',
  'color random',
  'rotation random',
  'rotation yaw random',
  'rotation yaw flip random',
  'rotation speed random',
  'sequence random',
  'trail length random',
  'position within sphere random',
  'position within box random',
  'position modify offset random',
  'position modify warp random',
  'velocity random',
  'velocity noise',
  'velocity inherit from control point',
  'position from parent particles',
  'position on model random',
  'position along path random',
  'position along path sequential',
  'lifetime from sequence',
  'remap scalar to vector',
  'remap control point to scalar',
  'remap control point to vector',
  'remap initial scalar',
  'remap initial distance to control point to scalar',
  'remap noise to scalar',
  'movement basic',
  'movement lock to control point',
  'movement lock to bone',
  'movement rotate particle around axis',
  'movement max velocity',
  'movement dampen relative to control point',
  'movement match particle velocities',
  'radius scale',
  'color fade',
  'alpha fade in random',
  'alpha fade out random',
  'alpha fade and decay',
  'rotation basic',
  'rotation spin roll',
  'rotation spin yaw',
  'rotation orient to 2d direction',
  'rotation orient relative to cp',
  'oscillate scalar',
  'oscillate vector',
  'movement lock to saved position along path',
  'movement maintain position along path',
  'cull when crossing plane',
  'cull relative to model',
  'remap distance to control point to scalar',
  'remap distance to control point to vector',
  'remap distance between two control points to scalar',
  'remap scalar',
  'noise scalar',
  'set child control points from particle positions',
  'set control point positions',
  'set control point to player',
  "set control point to particles' center",
  'remap cp speed to cp',
  'random force',
  'pull towards control point',
  'twist around axis',
  'constrain distance to control point',
  'constrain distance to path between two control points',
  'prevent passing through a plane',
  'collision via traces',
  'lifespan decay',
  'emit_continuously',
  'emit_instantaneously',
  'emit noise',
  'render_animated_sprites',
  'render_sprite_trail',
  'render_rope',
  'render_screen_velocity_rotate',
]);
export const knownFunction = (name: string) => FUNCTIONS.has(name);
