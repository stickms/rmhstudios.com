/**
 * Hitscan weapons against the SDK: Scattergun pellet damage along the
 * distance curve (ApplyOnDamageModifyRules on the accumulated pellets), fire
 * rates (tick-quantized TimeFireDelay), the clip and single-shell reload
 * state machines with the scripts' timings, the minigun's wind-up and
 * first-second damage ramp, and the Sniper Rifle's charge and headshots.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_ATTACK2,
  IN_RELOAD,
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
} from '../../core/constants';
import { vec3 } from '../../core/vec';
import { MINIGUN, SNIPER_RIFLE, WEAPON_SCRIPTS } from '../../data/weapons';
import { TF_COND } from '../conditions';
import { applyDistanceAndCrit, CRIT_NONE, TF_DMG_CUSTOM_HEADSHOT, TF_WEAPON } from '../damage';
import { TF_RELOAD_FINISH, TF_RELOAD_START } from '../weapon-api';
import { addPlayer, cmd, damageTo, makeWorld, place, run, setRandomCritsEnabled, startRound, ticks, topUp, totalDamage } from './__fixtures__/world';
import { HitscanGun } from './gun';
import { Minigun } from './minigun';
import { SniperRifle } from './sniper-rifle';
import { AC_STATE_FIRING } from './constants';

beforeAll(() => setRandomCritsEnabled(false));

/** ceil(delay / tick) ticks — how often a held trigger fires (m_flNextPrimaryAttack = curtime + delay). */
const quantized = (delay: number): number => Math.ceil(delay / TICK_INTERVAL - 1e-9) * TICK_INTERVAL;

describe('Scattergun damage along the distance curve', () => {
  function shootAt(distance: number): { dealt: number; perPelletCurve: (n: number) => number } {
    const world = makeWorld();
    const scout = addPlayer(world, 'scout', TF_TEAM_RED, TF_CLASS_SCOUT);
    const heavy = addPlayer(world, 'heavy', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    run(world, 5);
    place(world, scout, 0, 0, 0);
    place(world, heavy, distance, 0, 180);
    run(world, ticks(1)); // draw time, and > 0.25 s idle: the first pellet is dead centre
    world.drainEvents();
    const h0 = heavy.health;
    run(world, 1, (p) => (p === scout ? cmd(p, IN_ATTACK, 0, 0) : null));
    const events = world.drainEvents();
    expect(damageTo(events, heavy.id).length).toBe(1); // all pellets land as one hit (ApplyMultiDamage)
    const dealt = h0 - heavy.health;
    const script = WEAPON_SCRIPTS.tf_weapon_scattergun;
    return {
      dealt,
      perPelletCurve: (n: number) =>
        Math.trunc(
          applyDistanceAndCrit({ damage: n * script.primary.damage, distance, damageType: script.damageType, weaponId: TF_WEAPON.SCATTERGUN, critType: CRIT_NONE }).damage + 0.5,
        ),
    };
  }

  it('point blank: all 10 pellets × 6 with the scattergun ramp-up (≈175 %)', () => {
    const { dealt, perPelletCurve } = shootAt(64);
    expect(dealt).toBe(perPelletCurve(10));
    expect(dealt).toBeGreaterThan(100);
  });

  it('512 units: base damage per pellet (100 %), and 1024: the fall-off', () => {
    for (const d of [512, 1024]) {
      const { dealt, perPelletCurve } = shootAt(d);
      const matches = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => perPelletCurve(n) === dealt);
      expect(matches.length).toBeGreaterThan(0);
      if (d === 512) expect(dealt % 6).toBe(0);
      if (d === 1024) expect(dealt).toBeLessThanOrEqual(perPelletCurve(10));
    }
  });
});

describe('fire rates and reloads', () => {
  const cases: Array<[number, string]> = [
    [TF_CLASS_SCOUT, 'tf_weapon_scattergun'],
    [TF_CLASS_SCOUT, 'tf_weapon_pistol_scout'],
    [TF_CLASS_SOLDIER, 'tf_weapon_shotgun_soldier'],
    [TF_CLASS_SNIPER, 'tf_weapon_smg'],
    [TF_CLASS_SPY, 'tf_weapon_revolver'],
    [TF_CLASS_ENGINEER, 'tf_weapon_pistol'],
  ];
  for (const [cls, classname] of cases) {
    it(`${classname}: shots per 10 s = 10 / quantized TimeFireDelay`, () => {
      const world = makeWorld();
      const p = addPlayer(world, 'p', TF_TEAM_RED, cls);
      startRound(world);
      run(world, 5);
      const slot = p.weapons.findIndex((w) => w?.classname === classname);
      expect(slot).toBeGreaterThanOrEqual(0);
      run(world, 1, (q) => cmd(q, 0, 0, 0, slot + 1));
      run(world, ticks(1));
      const w = p.weapons[slot]!;
      expect(w).toBeInstanceOf(HitscanGun);
      let shots = 0;
      let last = w.lastFireTime;
      for (let i = 0; i < ticks(10); i++) {
        topUp(p);
        run(world, 1, (q) => cmd(q, IN_ATTACK, 0, 90));
        if (w.lastFireTime !== last) {
          shots++;
          last = w.lastFireTime;
        }
      }
      const delay = WEAPON_SCRIPTS[classname as keyof typeof WEAPON_SCRIPTS].primary.timeFireDelay;
      // The same float arithmetic the weapon does: next = curtime + delay, fire when curtime ≥ next.
      let expected = 0;
      let next = 0;
      for (let k = 1; k <= ticks(10); k++) {
        const t = k * TICK_INTERVAL;
        if (t >= next) {
          expected++;
          next = t + delay;
        }
      }
      expect(Math.abs(shots - expected)).toBeLessThanOrEqual(1);
      expect(Math.abs(expected - 10 / quantized(delay))).toBeLessThanOrEqual(10 / quantized(delay) * 0.05);
    });
  }

  it('pistol clip reload takes the script TimeReload and moves reserve into the clip', () => {
    const world = makeWorld();
    const p = addPlayer(world, 'eng', TF_TEAM_RED, TF_CLASS_ENGINEER);
    startRound(world);
    run(world, 5);
    run(world, 1, (q) => cmd(q, 0, 0, 0, 2));
    run(world, ticks(1));
    const w = p.weapons[1]!;
    p.autoReload = false;
    w.clip = 0;
    const reserve0 = p.ammo[w.ammoType];
    const t0 = world.curtime;
    run(world, 1, (q) => cmd(q, IN_RELOAD));
    let done = -1;
    for (let i = 0; i < ticks(3) && done < 0; i++) {
      run(world, 1);
      if (w.clip === w.maxClip) done = world.curtime;
    }
    const script = WEAPON_SCRIPTS.tf_weapon_pistol;
    expect(done - t0).toBeGreaterThanOrEqual(script.primary.timeReload);
    expect(done - t0).toBeLessThanOrEqual(script.primary.timeReload + 3 * TICK_INTERVAL);
    expect(p.ammo[w.ammoType]).toBe(reserve0 - w.maxClip);
  });

  it('shotgun reloads one shell at a time: TimeReloadStart, then TimeReload per shell', () => {
    const world = makeWorld();
    const p = addPlayer(world, 'sol', TF_TEAM_RED, TF_CLASS_SOLDIER);
    startRound(world);
    run(world, 5);
    run(world, 1, (q) => cmd(q, 0, 0, 0, 2));
    run(world, ticks(1));
    const w = p.weapons[1] as HitscanGun;
    w.clip = 0;
    const times: number[] = [];
    let clip = 0;
    const t0 = world.curtime;
    for (let i = 0; i < ticks(8) && w.clip < w.maxClip; i++) {
      run(world, 1);
      if (w.clip !== clip) {
        clip = w.clip;
        times.push(world.curtime - t0);
      }
    }
    expect(w.clip).toBe(w.maxClip);
    const s = WEAPON_SCRIPTS.tf_weapon_shotgun_soldier.primary;
    // First shell: start + one shell (+ a state-machine tick per transition).
    expect(times[0]).toBeGreaterThanOrEqual(s.timeReloadStart + s.timeReload);
    expect(times[0]).toBeLessThanOrEqual(s.timeReloadStart + s.timeReload + 4 * TICK_INTERVAL);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(s.timeReload);
      expect(times[i] - times[i - 1]).toBeLessThanOrEqual(s.timeReload + 2 * TICK_INTERVAL);
    }
    expect(w.reloadMode === TF_RELOAD_START || w.reloadMode === TF_RELOAD_FINISH).toBe(true);
  });

  it('firing interrupts a single-shell reload', () => {
    const world = makeWorld();
    const p = addPlayer(world, 'scout', TF_TEAM_RED, TF_CLASS_SCOUT);
    startRound(world);
    run(world, ticks(1));
    const w = p.weapons[0]!;
    w.clip = 2;
    run(world, ticks(1.2)); // auto reload adds shells
    expect(w.clip).toBeGreaterThan(2);
    const before = w.clip;
    run(world, 2, (q) => cmd(q, IN_ATTACK));
    run(world, 1);
    expect(w.clip).toBe(before - 1);
  });
});

describe('Minigun', () => {
  it('winds up 0.75 s (TF_COND_AIMING) before the first bullet, with 50 % damage at first', () => {
    const world = makeWorld();
    const heavy = addPlayer(world, 'heavy', TF_TEAM_RED, TF_CLASS_HEAVYWEAPONS);
    const target = addPlayer(world, 'target', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    run(world, 5);
    place(world, heavy, 0, 0, 0);
    place(world, target, 512, 0, 180);
    run(world, ticks(1));
    world.drainEvents();
    const mg = heavy.weapons[0] as Minigun;
    expect(mg).toBeInstanceOf(Minigun);
    const t0 = world.curtime + TICK_INTERVAL;
    let first = -1;
    let firstDamage = 0;
    for (let i = 0; i < ticks(2) && first < 0; i++) {
      run(world, 1, (q) => (q === heavy ? cmd(q, IN_ATTACK, 0, 0) : null));
      expect(heavy.cond.has(TF_COND.AIMING)).toBe(true);
      const ev = damageTo(world.drainEvents(), target.id);
      if (ev.length) {
        first = world.curtime;
        firstDamage = ev[0].amount;
      }
    }
    expect(first - t0).toBeGreaterThanOrEqual(MINIGUN.spinUpTime);
    expect(first - t0).toBeLessThan(MINIGUN.spinUpTime + 0.2);
    expect(mg.weaponState).toBe(AC_STATE_FIRING);
    // 4 bullets × 9 at 512 units (100 %) × the 50 % wind-up penalty → at most 18.
    expect(firstDamage).toBeLessThanOrEqual(Math.trunc(4 * 9 * MINIGUN.minDamageScale + 0.5));
    // Fully spun up a second later: up to the full 36 per shot.
    run(world, ticks(1.2), (q) => (q === heavy ? cmd(q, IN_ATTACK, 0, 0) : null));
    const late = damageTo(world.drainEvents(), target.id);
    expect(Math.max(...late.map((e) => e.amount))).toBeGreaterThan(firstDamage);
    // Releasing winds down and lets him run again.
    run(world, ticks(0.5));
    expect(heavy.cond.has(TF_COND.AIMING)).toBe(false);
  });

  it('fires every quantized 0.1 s and uses one ammo per shot', () => {
    const world = makeWorld();
    const heavy = addPlayer(world, 'heavy', TF_TEAM_RED, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    run(world, ticks(1));
    const a0 = heavy.ammo[1];
    run(world, ticks(0.75 + 0.1 + 5), (q) => cmd(q, IN_ATTACK, 0, 90));
    const used = a0 - heavy.ammo[1];
    const delay = WEAPON_SCRIPTS.tf_weapon_minigun.primary.timeFireDelay;
    expect(Math.abs(used - 5 / quantized(delay))).toBeLessThanOrEqual(2);
  });
});

describe('Sniper Rifle', () => {
  function setup(): { world: ReturnType<typeof makeWorld>; sniper: ReturnType<typeof addPlayer>; heavy: ReturnType<typeof addPlayer> } {
    const world = makeWorld();
    const sniper = addPlayer(world, 'sniper', TF_TEAM_RED, TF_CLASS_SNIPER);
    const heavy = addPlayer(world, 'heavy', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    run(world, 5);
    place(world, sniper, -1000, 0, 0);
    place(world, heavy, 0, 0, 180);
    run(world, ticks(1));
    world.drainEvents();
    return { world, sniper, heavy };
  }

  it('a full-charge zoomed headshot is a 150 × 3 = 450 crit with no fall-off', () => {
    const { world, sniper, heavy } = setup();
    const rifle = sniper.weapons[0] as SniperRifle;
    expect(rifle).toBeInstanceOf(SniperRifle);
    run(world, 1, (q) => (q === sniper ? cmd(q, IN_ATTACK2, 0, 0) : null));
    expect(sniper.cond.has(TF_COND.ZOOMED)).toBe(true);
    // Charge: 50/s after the 0.3 s zoom lockout → 150 after 3.3 s.
    run(world, ticks(SNIPER_RIFLE.zoomTime + 3.1));
    expect(rifle.chargedDamage).toBe(SNIPER_RIFLE.maxDamage);
    const eye = sniper.eyePosition(vec3());
    // The head box centre: eye height + 3 above the heavy's origin, 1 unit forward of it.
    const headZ = heavy.origin.z + 75 + 3;
    const pitch = (-Math.atan2(headZ - eye.z, heavy.origin.x - 1 - eye.x) * 180) / Math.PI;
    run(world, 1, (q) => (q === sniper ? cmd(q, IN_ATTACK, pitch, 0) : null));
    const hits = damageTo(world.drainEvents(), heavy.id);
    expect(hits.length).toBe(1);
    expect(hits[0].amount).toBe(SNIPER_RIFLE.maxDamage * 3);
    expect(hits[0].crit).toBe(2);
    expect(hits[0].customKill).toBe(TF_DMG_CUSTOM_HEADSHOT);
    expect(heavy.alive).toBe(false);
  });

  it('an unscoped body shot does the 50 minimum, no crit, no distance modifier', () => {
    const { world, sniper, heavy } = setup();
    const h0 = heavy.health;
    run(world, 1, (q) => (q === sniper ? cmd(q, IN_ATTACK, 0, 0) : null));
    expect(h0 - heavy.health).toBe(SNIPER_RIFLE.minDamage);
  });

  it('a headshot within 0.2 s of zooming is not a crit; zooming slows to 80', () => {
    const { world, sniper, heavy } = setup();
    run(world, 1, (q) => (q === sniper ? cmd(q, IN_ATTACK2, 0, 0) : null));
    expect(sniper.computeMaxSpeed()).toBe(SNIPER_RIFLE.aimingMaxSpeed);
    const eye = sniper.eyePosition(vec3());
    const pitch = (-Math.atan2(heavy.origin.z + 78 - eye.z, heavy.origin.x - 1 - eye.x) * 180) / Math.PI;
    run(world, ticks(0.12)); // past the 0.1 s fire lockout, inside the 0.2 s no-crit window
    run(world, 1, (q) => (q === sniper ? cmd(q, IN_ATTACK, pitch, 0) : null));
    const hits = damageTo(world.drainEvents(), heavy.id);
    expect(hits.length).toBe(1);
    expect(hits[0].crit).toBe(0);
  });
});

describe('random crits off → none; totals sane', () => {
  it('no NaN anywhere after a firefight', () => {
    const world = makeWorld();
    const a = addPlayer(world, 'a', TF_TEAM_RED, TF_CLASS_SCOUT);
    const b = addPlayer(world, 'b', TF_TEAM_BLUE, TF_CLASS_SOLDIER);
    startRound(world);
    run(world, 5);
    place(world, a, -300, 0, 0);
    place(world, b, 300, 0, 180);
    run(world, ticks(4), (q) => cmd(q, IN_ATTACK, 0, q === a ? 0 : 180));
    world.forEachEntity((e) => {
      for (const v of [e.origin.x, e.origin.y, e.origin.z, e.velocity.x, e.velocity.y, e.velocity.z, e.health]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    });
    expect(totalDamage(world.drainEvents(), a.id) >= 0).toBe(true);
  });
});
