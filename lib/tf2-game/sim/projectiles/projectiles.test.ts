/**
 * The stock projectiles against the SDK: rocket speed and the rocket jump
 * (RadiusDamage with TF_ROCKET_RADIUS_FOR_RJS + ApplyPushFromDamage), pipe
 * arcs, the fuse and the full-damage direct hit, sticky charge speeds, the
 * eight-sticky limit, arming, syringe gravity and the airblast reflect.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_ATTACK2,
  SV_GRAVITY,
  TF_CLASS_DEMOMAN,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
} from '../../core/constants';
import { remapClamped, vec3 } from '../../core/vec';
import { RADIUS_DAMAGE } from '../../data/damage';
import { FLAMETHROWER, GRENADE_LAUNCHER, ROCKET, STICKYBOMB, SYRINGE, WEAPON_SCRIPTS } from '../../data/weapons';
import { damageForce, TF_DAMAGEFORCESCALE_SELF_SOLDIER_BADRJ } from '../damage';
import { TF_COND } from '../conditions';
import type { Entity } from '../entity';
import type { EffectEvent } from '../events';
import type { GameWorld } from '../world';
import { addPlayer, cmd, damageTo, makeWorld, place, run, setRandomCritsEnabled, startRound, ticks } from '../weapons/__fixtures__/world';
import { StickybombLauncher } from '../weapons/launchers';
import { TFGrenadePipebomb } from './pipebomb';
import { TFProjectileRocket } from './rocket';
import { TFProjectileSyringe } from './syringe';

beforeAll(() => setRandomCritsEnabled(false));

function findAll<T extends Entity>(world: GameWorld, ctor: abstract new (...args: never[]) => T): T[] {
  const out: T[] = [];
  world.forEachEntity((e) => {
    if (e instanceof ctor) out.push(e as T);
  });
  return out;
}

describe('rockets', () => {
  it('fly at 1100 u/s in a straight line', () => {
    const world = makeWorld();
    const s = addPlayer(world, 's', TF_TEAM_RED, TF_CLASS_SOLDIER);
    startRound(world);
    run(world, 5);
    place(world, s, -1500, 0, 0);
    run(world, ticks(1));
    run(world, 1, (p) => cmd(p, IN_ATTACK, 0, 0));
    const [r] = findAll(world, TFProjectileRocket);
    expect(r).toBeDefined();
    expect(Math.hypot(r.velocity.x, r.velocity.y, r.velocity.z)).toBeCloseTo(ROCKET.speed, 6);
    const x0 = r.origin.x;
    run(world, ticks(1));
    expect(Math.abs(r.origin.x - x0 - ROCKET.speed * ticks(1) * TICK_INTERVAL)).toBeLessThan(0.1);
  });

  it('a standing soldier shooting his feet: the SDK rocket-jump impulse and height', () => {
    const world = makeWorld();
    const s = addPlayer(world, 's', TF_TEAM_RED, TF_CLASS_SOLDIER);
    startRound(world);
    run(world, 5);
    place(world, s, 0, 0, 0);
    run(world, ticks(1));
    world.drainEvents();
    const h0 = s.health;
    // Look straight down and fire; the rocket hits the floor at the soldier's feet.
    let explosion: EffectEvent | undefined;
    let vz = 0;
    for (let i = 0; i < 20 && !explosion; i++) {
      run(world, 1, (p) => cmd(p, i === 0 ? IN_ATTACK : 0, 89, 0));
      explosion = world.drainEvents().find((e): e is EffectEvent => e.type === 'effect' && e.kind === 'explosion');
      if (explosion) vz = s.velocity.z;
    }
    expect(explosion).toBeDefined();
    const src = explosion!.pos;
    // The world's view of the SDK formula: damage from the RJ radius with the base damage...
    const center = s.worldSpaceCenter(vec3());
    const dist = Math.min(Math.hypot(src.x - center.x, src.y - center.y, src.z - center.z), Math.hypot(src.x - s.origin.x, src.y - s.origin.y, src.z - s.origin.z));
    const base = WEAPON_SCRIPTS.tf_weapon_rocketlauncher.primary.damage;
    const raw = remapClamped(dist, 0, RADIUS_DAMAGE.rocketSelfRadius, base, base * RADIUS_DAMAGE.halfFalloff);
    expect(h0 - s.health).toBe(Math.trunc(raw + 0.5));
    // ...and the push: DamageForce(hull, damage, tf_damageforcescale_self_soldier_badrj) away from the blast.
    const dz = src.z - 10 - center.z;
    const len = Math.hypot(src.x - center.x, src.y - center.y, dz);
    const expectedVz = -damageForce({ x: 48, y: 48, z: 82 }, raw, TF_DAMAGEFORCESCALE_SELF_SOLDIER_BADRJ) * (dz / len);
    expect(vz).toBeGreaterThan(0);
    expect(Math.abs(vz - expectedVz)).toBeLessThan(expectedVz * 0.02 + 1);
    // Apex: v²/2g above the start (movement integrates gravity per tick).
    const z0 = s.origin.z;
    let top = z0;
    for (let i = 0; i < ticks(2); i++) {
      run(world, 1);
      top = Math.max(top, s.origin.z);
    }
    const apex = (vz * vz) / (2 * SV_GRAVITY);
    expect(Math.abs(top - z0 - apex)).toBeLessThan(apex * 0.08 + 4);
  });
});

describe('grenade launcher pipes', () => {
  function demo(world: GameWorld, x = -1800): ReturnType<typeof addPlayer> {
    const d = addPlayer(world, 'demo', TF_TEAM_RED, TF_CLASS_DEMOMAN);
    startRound(world);
    run(world, 5);
    place(world, d, x, 0, 0);
    run(world, ticks(1));
    return d;
  }

  it('arc: lands where the launch velocity under 0.4 × sv_gravity takes it; explodes on the 2 s fuse for 60 %', () => {
    const world = makeWorld();
    demo(world);
    run(world, 1, (p) => cmd(p, IN_ATTACK, 0, 0));
    const [pipe] = findAll(world, TFGrenadePipebomb);
    expect(pipe).toBeDefined();
    expect(pipe.sticky).toBe(false);
    const spawn = world.curtime;
    const p0 = { ...pipe.origin };
    const v0 = { ...pipe.velocity };
    expect(v0.x).toBeCloseTo(GRENADE_LAUNCHER.speed, 0);
    expect(Math.abs(v0.z - GRENADE_LAUNCHER.upSpeed)).toBeLessThanOrEqual(GRENADE_LAUNCHER.randomSpeed + 1e-6);
    const g = GRENADE_LAUNCHER.gravity * SV_GRAVITY;
    // Solve z0 + vz t − ½ g t² = halfExtent (its box touches the floor).
    const h = p0.z - GRENADE_LAUNCHER.halfExtent;
    const tLand = (v0.z + Math.sqrt(v0.z * v0.z + 2 * g * h)) / g;
    const xLand = p0.x + v0.x * tLand;
    let landX = NaN;
    let exploded = -1;
    for (let i = 0; i < ticks(3) && exploded < 0; i++) {
      run(world, 1);
      if (Number.isNaN(landX) && pipe.touched) landX = pipe.origin.x;
      if (world.drainEvents().some((e) => e.type === 'effect' && e.kind === 'explosion')) exploded = world.curtime;
    }
    expect(Math.abs(landX - xLand)).toBeLessThan(v0.x * TICK_INTERVAL * 2);
    expect(xLand - p0.x).toBeGreaterThan(1500);
    expect(exploded - spawn).toBeGreaterThanOrEqual(GRENADE_LAUNCHER.fuse);
    expect(exploded - spawn).toBeLessThanOrEqual(GRENADE_LAUNCHER.fuse + 0.2 + TICK_INTERVAL);
    expect(pipe.damage).toBeCloseTo(WEAPON_SCRIPTS.tf_weapon_grenadelauncher.primary.damage * GRENADE_LAUNCHER.fuseDamageScale, 6);
  });

  it('a pipe that meets an enemy before the ground explodes at once with full damage', () => {
    const world = makeWorld();
    const d = addPlayer(world, 'demo', TF_TEAM_RED, TF_CLASS_DEMOMAN);
    const h = addPlayer(world, 'heavy', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    run(world, 5);
    place(world, d, 0, 0, 0);
    place(world, h, 300, 0, 180);
    run(world, ticks(1));
    world.drainEvents();
    // Aim a little down so the arc meets his chest rather than clearing his head.
    run(world, 1, (p) => (p === d ? cmd(p, IN_ATTACK, 15, 0) : null));
    let hit = 0;
    for (let i = 0; i < ticks(1) && !hit; i++) {
      run(world, 1);
      const ev = damageTo(world.drainEvents(), h.id);
      if (ev.length) hit = ev[0].amount;
    }
    // A direct hit: GetEnemy → distance 0 (no radius fall-off); pipes have no distance modifier.
    expect(hit).toBe(WEAPON_SCRIPTS.tf_weapon_grenadelauncher.primary.damage);
  });
});

describe('stickybomb launcher', () => {
  function setup(): { world: GameWorld; d: ReturnType<typeof addPlayer>; launcher: StickybombLauncher } {
    const world = makeWorld();
    const d = addPlayer(world, 'demo', TF_TEAM_RED, TF_CLASS_DEMOMAN);
    startRound(world);
    run(world, 5);
    place(world, d, -1500, 0, 0);
    run(world, 1, (p) => cmd(p, 0, 0, 0, 2));
    run(world, ticks(1));
    const launcher = d.weapons[1] as StickybombLauncher;
    expect(launcher).toBeInstanceOf(StickybombLauncher);
    return { world, d, launcher };
  }

  it('charge speed remaps 900 → 2400 over 4 s, and holding 4 s releases by itself', () => {
    for (const hold of [0, 2, 4.5]) {
      const { world, launcher } = setup();
      let begin = -1;
      let launchedAt = -1;
      let sticky: TFGrenadePipebomb | undefined;
      const holdTicks = Math.max(1, ticks(hold));
      for (let i = 0; i < holdTicks + 2 && !sticky; i++) {
        const press = i < holdTicks;
        run(world, 1, (p) => cmd(p, press ? IN_ATTACK : 0, 0, 0));
        if (begin < 0 && launcher.chargeBeginTime > 0) begin = launcher.chargeBeginTime;
        sticky = findAll(world, TFGrenadePipebomb)[0];
        if (sticky) launchedAt = world.curtime;
      }
      expect(sticky).toBeDefined();
      const expected = remapClamped(launchedAt - begin, 0, STICKYBOMB.maxChargeTime, STICKYBOMB.minChargeSpeed, STICKYBOMB.maxChargeSpeed);
      expect(sticky!.velocity.x).toBeCloseTo(expected, 3);
      if (hold > STICKYBOMB.maxChargeTime) expect(launchedAt - begin).toBeCloseTo(STICKYBOMB.maxChargeTime, 1);
    }
  });

  it('at most 8 out; unarmed stickies refuse to detonate; armed ones explode', () => {
    const { world, d, launcher } = setup();
    // A tap is a few ticks: a one-tick press during a reload only aborts it (ItemBusyFrame).
    const shoot = (yaw: number): void => {
      d.ammo[2] = 24;
      run(world, 3, (p) => cmd(p, IN_ATTACK, 30, yaw));
      run(world, 1, (p) => cmd(p, 0, 30, yaw));
    };
    for (let i = 0; i < STICKYBOMB.maxActive; i++) {
      shoot((i - 4) * 4);
      run(world, ticks(0.7));
    }
    expect(findAll(world, TFGrenadePipebomb).length).toBe(STICKYBOMB.maxActive);
    expect(launcher.pipebombCount).toBe(STICKYBOMB.maxActive);
    expect(launcher.clip).toBe(0);
    // Reload a shell, then a ninth: the oldest is set to blow, the count stays at 8.
    run(world, ticks(1.5));
    const oldest = launcher.pipebombs[0];
    shoot(20);
    // SetTimer(now): it goes on its next 0.2 s detonate check.
    run(world, ticks(0.25), (p) => cmd(p, 0, 30, 20));
    expect(oldest.removed).toBe(true);
    expect(launcher.pipebombCount).toBe(STICKYBOMB.maxActive);
    world.drainEvents();
    // Detonate at once: the newest isn't armed, so it stays (and the deny sounds); the armed ones go.
    run(world, 1, (p) => cmd(p, IN_ATTACK2, 30, 0));
    const blasts = world.drainEvents().filter((e) => e.type === 'effect' && e.kind === 'explosion').length;
    expect(blasts).toBe(STICKYBOMB.maxActive - 1);
    const left = findAll(world, TFGrenadePipebomb);
    expect(left.length).toBe(1);
    expect(left[0].isArmed()).toBe(false);
    run(world, ticks(STICKYBOMB.armTime), (p) => cmd(p, 0, 30, 0));
    run(world, 1, (p) => cmd(p, IN_ATTACK2, 30, 0));
    expect(findAll(world, TFGrenadePipebomb).length).toBe(0);
    expect(launcher.pipebombCount).toBe(0);
  });
});

describe('syringes', () => {
  it('fly at 1000 u/s and fall at 0.3 × sv_gravity', () => {
    const world = makeWorld();
    const m = addPlayer(world, 'medic', TF_TEAM_RED, TF_CLASS_MEDIC);
    startRound(world);
    run(world, 5);
    place(world, m, -1500, 0, 0);
    run(world, ticks(1));
    run(world, 1, (p) => cmd(p, IN_ATTACK, 0, 0));
    const [s] = findAll(world, TFProjectileSyringe);
    expect(s).toBeDefined();
    const v0 = s.velocity.z;
    // One tick of gravity has already acted on the ±1.5° nail.
    expect(Math.abs(Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z) - SYRINGE.speed)).toBeLessThan(0.2);
    run(world, 10);
    expect(s.velocity.z - v0).toBeCloseTo(-SYRINGE.gravity * SV_GRAVITY * 10 * TICK_INTERVAL, 3);
  });
});

describe('airblast', () => {
  it('reflects a rocket back at the soldier, credited to the pyro, as a mini-crit', () => {
    const world = makeWorld();
    const s = addPlayer(world, 'soldier', TF_TEAM_RED, TF_CLASS_SOLDIER);
    const pyro = addPlayer(world, 'pyro', TF_TEAM_BLUE, TF_CLASS_PYRO);
    startRound(world);
    run(world, 5);
    place(world, s, -700, 0, 0);
    place(world, pyro, 0, 0, 180);
    run(world, ticks(1));
    world.drainEvents();
    run(world, 1, (p) => (p === s ? cmd(p, IN_ATTACK, 0, 0) : null));
    const [rocket] = findAll(world, TFProjectileRocket);
    expect(rocket).toBeDefined();
    let blasted = false;
    let hit: ReturnType<typeof damageTo>[number] | undefined;
    for (let i = 0; i < ticks(3) && !hit; i++) {
      const airblast = !blasted && !rocket.removed && rocket.origin.x > -160;
      if (airblast) blasted = true;
      run(world, 1, (p) => (p === pyro ? cmd(p, airblast ? IN_ATTACK2 : 0, 0, 180) : cmd(p, 0, 0, 0)));
      hit = damageTo(world.drainEvents(), s.id)[0];
    }
    expect(blasted).toBe(true);
    expect(rocket.deflected).toBeGreaterThan(0);
    expect(hit).toBeDefined();
    expect(hit!.attacker).toBe(pyro.id);
    expect(hit!.crit).toBe(1);
    expect(pyro.health).toBe(pyro.maxHealth);
  });

  it('pushes an enemy player away and up (tf_airblast_cray)', () => {
    const world = makeWorld();
    const pyro = addPlayer(world, 'pyro', TF_TEAM_RED, TF_CLASS_PYRO);
    const h = addPlayer(world, 'heavy', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    run(world, 5);
    place(world, pyro, 0, 0, 0);
    place(world, h, 100, 0, 180);
    run(world, ticks(1.1));
    const ammo0 = pyro.ammo[1];
    run(world, 1, (p) => (p === pyro ? cmd(p, IN_ATTACK2, 0, 0) : null));
    run(world, 1);
    // 600 u/s along the push, 100 u/s of it turned upward (ground_minz), then a tick of
    // airborne movement: lost footing means no ground clamp to the heavy's 230.
    expect(h.velocity.x).toBeGreaterThan(560);
    expect(h.velocity.z).toBeGreaterThan(FLAMETHROWER.airblastGroundMinZ - 3 * SV_GRAVITY * TICK_INTERVAL);
    expect(h.cond.has(TF_COND.KNOCKED_INTO_AIR)).toBe(true);
    for (let i = 0; i < ticks(2) && h.cond.has(TF_COND.KNOCKED_INTO_AIR); i++) run(world, 1);
    expect(h.cond.has(TF_COND.KNOCKED_INTO_AIR)).toBe(false);
    expect(ammo0 - pyro.ammo[1]).toBe(20);
  });
});
