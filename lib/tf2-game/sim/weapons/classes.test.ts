/**
 * The class weapons against the SDK: flamethrower damage and afterburn
 * (CTFFlameManager::OnCollide, CTFPlayerShared::Burn), the medigun's heal ramp,
 * ÜberCharge build and invulnerability (CWeaponMedigun), backstabs
 * (CTFKnife::IsBehindAndFacingTarget), the 15 % melee crit roll, the Spy's
 * cloak and disguise, determinism and the weapon net round trip.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_ATTACK2,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
} from '../../core/constants';
import { AFTERBURN, CRIT } from '../../data/damage';
import { DISGUISE, FLAMETHROWER, INVIS_WATCH, MEDIGUN, WEAPON_SCRIPTS } from '../../data/weapons';
import { TF_COND } from '../conditions';
import { createDamageInfo, DMG_BULLET, TF_DMG_CUSTOM_BACKSTAB, TF_DMG_CUSTOM_BURNING } from '../damage';
import type { SimEvent } from '../events';
import type { NetRecord } from '../net-schema';
import type { Player } from '../player';
import type { GameWorld } from '../world';
import { addPlayer, cmd, damageTo, makeWorld, place, run, setRandomCritsEnabled, startRound, ticks, topUp } from './__fixtures__/world';
import { FLAMETHROWER_AMMO_PER_SECOND } from './constants';
import { Flamethrower } from './flamethrower';
import { Knife, MeleeWeapon } from './melee';
import { Medigun } from './medigun';
import { DisguiseKit, InvisWatch, requestDisguise } from './spy';
import { spyState } from './spy-state';

beforeAll(() => setRandomCritsEnabled(false));
afterAll(() => setRandomCritsEnabled(false));

function duel(attackerClass: number, victimClass: number, distance: number, victimYaw = 180): { world: GameWorld; a: Player; v: Player } {
  const world = makeWorld();
  const a = addPlayer(world, 'a', TF_TEAM_RED, attackerClass);
  const v = addPlayer(world, 'v', TF_TEAM_BLUE, victimClass);
  startRound(world);
  run(world, 5);
  place(world, a, 0, 0, 0);
  place(world, v, distance, 0, victimYaw);
  run(world, ticks(1.1));
  world.drainEvents();
  return { world, a, v };
}

describe('flamethrower', () => {
  it('close-range DPS: 13 per hit at most every 0.075 s, scaled 1 → 0.5 by flame age', () => {
    const { world, a, v } = duel(TF_CLASS_PYRO, TF_CLASS_PYRO, 80);
    expect(a.activeWeapon()).toBeInstanceOf(Flamethrower);
    v.health = 100000; // no death mid-measure
    const ammo0 = a.ammo[1];
    let dealt = 0;
    let hits = 0;
    const seconds = 2;
    for (let i = 0; i < ticks(seconds); i++) {
      run(world, 1, (p) => (p === a ? cmd(p, IN_ATTACK, 0, 0) : cmd(p, 0, 0, 180)));
      // Flame hits are TF_DMG_CUSTOM_BURNING too; a Pyro victim takes no afterburn.
      for (const e of damageTo(world.drainEvents(), v.id)) {
        dealt += e.amount;
        hits++;
      }
    }
    const maxDps = FLAMETHROWER.damagePerTick / FLAMETHROWER.burnFrequency; // ≈173
    const dps = dealt / seconds;
    expect(hits).toBeGreaterThan(seconds / (FLAMETHROWER.burnFrequency + 0.03));
    expect(dps).toBeGreaterThan(maxDps * FLAMETHROWER.minDamageScale * 0.8);
    expect(dps).toBeLessThanOrEqual(maxDps + 1);
    // Pyros take no afterburn (only the 0.25 s TF_BURNING_FLAME_LIFE_PYRO flag).
    expect(v.cond.duration(TF_COND.BURNING)).toBeLessThanOrEqual(AFTERBURN.pyroDuration);
    // Ammo: 14/s × the 0.02 s interval per point — but at 66 tick a point goes out every
    // second tick (m_flNextPrimaryAttack = curtime + 0.02), so the SDK really spends ~9.3/s.
    const perTick = Math.ceil(FLAMETHROWER.newFlameDelay / TICK_INTERVAL - 1e-9);
    const rate = (FLAMETHROWER_AMMO_PER_SECOND * FLAMETHROWER.newFlameDelay) / (perTick * TICK_INTERVAL);
    const used = ammo0 - a.ammo[1];
    expect(Math.abs(used - rate * seconds)).toBeLessThanOrEqual(1.5);
  });

  it('afterburn: 4 damage every 0.5 s, for a few seconds after the stream stops', () => {
    const { world, a, v } = duel(TF_CLASS_PYRO, TF_CLASS_HEAVYWEAPONS, 80);
    let flameHits = 0;
    for (let i = 0; i < ticks(0.5); i++) {
      run(world, 1, (p) => (p === a ? cmd(p, IN_ATTACK, 0, 0) : cmd(p, 0, 0, 180)));
      flameHits += damageTo(world.drainEvents(), v.id).filter((e) => e.amount > AFTERBURN.damage).length;
    }
    expect(flameHits).toBeGreaterThan(3);
    expect(v.cond.has(TF_COND.BURNING)).toBe(true);
    // Turn away and let the last flames die (lifetime ≤ 0.7 s): everything after is afterburn.
    const stopped = world.curtime;
    run(world, ticks(FLAMETHROWER.flameLifetime + FLAMETHROWER.flameRandomLifetimeOffset + 0.05), (p) =>
      p === a ? cmd(p, 0, 0, 90) : cmd(p, 0, 0, 180),
    );
    world.drainEvents();
    const burns: number[] = [];
    for (let i = 0; i < ticks(12) && v.cond.has(TF_COND.BURNING); i++) {
      run(world, 1, (p) => (p === a ? cmd(p, 0, 0, 90) : cmd(p, 0, 0, 180)));
      for (const e of damageTo(world.drainEvents(), v.id)) {
        expect(e.customKill).toBe(TF_DMG_CUSTOM_BURNING);
        expect(e.amount).toBe(AFTERBURN.damage);
        expect(e.attacker).toBe(a.id);
        burns.push(world.curtime);
      }
    }
    expect(burns.length).toBeGreaterThan(2);
    for (let i = 1; i < burns.length; i++) expect(burns[i] - burns[i - 1]).toBeCloseTo(AFTERBURN.interval, 1);
    const lasted = burns[burns.length - 1] - stopped;
    expect(lasted).toBeGreaterThan(2.5);
    expect(lasted).toBeLessThanOrEqual(AFTERBURN.maxDuration);
    expect(v.cond.has(TF_COND.BURNING)).toBe(false);
  });
});

describe('medigun', () => {
  function healer(): { world: GameWorld; m: Player; s: Player; gun: Medigun } {
    const world = makeWorld();
    const m = addPlayer(world, 'medic', TF_TEAM_RED, TF_CLASS_MEDIC);
    const s = addPlayer(world, 'soldier', TF_TEAM_RED, TF_CLASS_SOLDIER);
    startRound(world);
    run(world, 5);
    place(world, m, -1000, 0, 0);
    place(world, s, -900, 0, 0);
    run(world, 1, (p) => (p === m ? cmd(p, 0, 0, 0, 2) : null));
    run(world, ticks(1.1));
    const gun = m.activeWeapon() as Medigun;
    expect(gun).toBeInstanceOf(Medigun);
    return { world, m, s, gun };
  }
  const heal = (p: Player): ReturnType<typeof cmd> => (p.playerClass === TF_CLASS_MEDIC ? cmd(p, IN_ATTACK, 0, 0) : cmd(p, 0, 0, 0));

  it('heal ramp: 24/s just after damage, 72/s from 15 s after', () => {
    const { world, m, s, gun } = healer();
    s.health = 20;
    s.lastDamageTime = world.curtime;
    run(world, ticks(0.3), heal);
    expect(gun.healTarget).toBe(s.id);
    let h0 = s.health;
    run(world, ticks(1), heal);
    expect(Math.abs(s.health - h0 - MEDIGUN.baseHealRate)).toBeLessThanOrEqual(2);
    // Past the ramp.
    run(world, ticks(MEDIGUN.healRampEnd), (p) => {
      if (p === s) s.health = 20;
      return heal(p);
    });
    h0 = s.health;
    run(world, ticks(1), heal);
    expect(Math.abs(s.health - h0 - MEDIGUN.baseHealRate * MEDIGUN.healRampMaxMult)).toBeLessThanOrEqual(3);
    void m;
  });

  it('ÜberCharge builds in 40 s on a hurt patient, then 8 s of invulnerability with a 1 s linger', () => {
    const { world, m, s, gun } = healer();
    let built = -1;
    const start = world.curtime;
    for (let i = 0; i < ticks(45) && built < 0; i++) {
      s.health = 50; // never near full overheal: the full rate
      run(world, 1, heal);
      if (gun.chargeLevel >= 1) built = world.curtime - start;
    }
    expect(Math.abs(built - MEDIGUN.chargeTime)).toBeLessThan(0.5);
    run(world, 1, (p) => (p === m ? cmd(p, IN_ATTACK | IN_ATTACK2, 0, 0) : cmd(p, 0, 0, 0)));
    run(world, 2, heal);
    expect(gun.chargeRelease).toBe(true);
    expect(m.cond.invulnerable).toBe(true);
    expect(s.cond.invulnerable).toBe(true);
    // A 500-damage bullet does nothing.
    const info = createDamageInfo();
    info.attacker = m.id;
    info.inflictor = m.id;
    info.damage = info.baseDamage = 500;
    info.damageType = DMG_BULLET;
    const hp = s.health;
    world.applyDamage(s, info);
    expect(s.health).toBe(hp);
    // Drains in 8 s.
    const released = world.curtime;
    let over = -1;
    for (let i = 0; i < ticks(10) && over < 0; i++) {
      run(world, 1, heal);
      if (!gun.chargeRelease) over = world.curtime - released;
    }
    expect(Math.abs(over - MEDIGUN.releaseTime)).toBeLessThan(0.2);
    // Beam off: the patient keeps it for tf_invuln_time.
    run(world, ticks(MEDIGUN.invulnLinger - 0.3), (p) => cmd(p, 0, 0, 90));
    run(world, ticks(0.6), (p) => cmd(p, 0, 0, 90));
    expect(s.cond.invulnerable).toBe(false);
  });
});

describe('knife', () => {
  it('from behind: a crit backstab for twice the health (kills a 300 HP heavy); from the front: a 40 stab', () => {
    // Behind: the heavy looks away (+x) with the spy at his back.
    const back = duel(TF_CLASS_SPY, TF_CLASS_HEAVYWEAPONS, 60, 0);
    run(back.world, 1, (p) => (p === back.a ? cmd(p, 0, 0, 0, 3) : cmd(p, 0, 0, 0)));
    run(back.world, ticks(1), (p) => (p === back.a ? cmd(p, 0, 0, 0) : cmd(p, 0, 0, 0)));
    expect(back.a.activeWeapon()).toBeInstanceOf(Knife);
    back.world.drainEvents();
    run(back.world, 1, (p) => (p === back.a ? cmd(p, IN_ATTACK, 0, 0) : cmd(p, 0, 0, 0)));
    const stab = damageTo(back.world.drainEvents(), back.v.id)[0];
    expect(stab).toBeDefined();
    expect(stab.customKill).toBe(TF_DMG_CUSTOM_BACKSTAB);
    expect(stab.crit).toBe(2);
    expect(back.v.lifeState).not.toBe(0);

    // Front: face to face.
    const front = duel(TF_CLASS_SPY, TF_CLASS_HEAVYWEAPONS, 60, 180);
    run(front.world, 1, (p) => (p === front.a ? cmd(p, 0, 0, 0, 3) : cmd(p, 0, 0, 180)));
    run(front.world, ticks(1), (p) => (p === front.a ? cmd(p, 0, 0, 0) : cmd(p, 0, 0, 180)));
    front.world.drainEvents();
    let hit: ReturnType<typeof damageTo>[number] | undefined;
    for (let i = 0; i < ticks(0.5) && !hit; i++) {
      run(front.world, 1, (p) => (p === front.a ? cmd(p, i === 0 ? IN_ATTACK : 0, 0, 0) : cmd(p, 0, 0, 180)));
      hit = damageTo(front.world.drainEvents(), front.v.id)[0];
    }
    expect(hit).toBeDefined();
    expect(hit!.amount).toBe(WEAPON_SCRIPTS.tf_weapon_knife.primary.damage);
    expect(hit!.customKill).not.toBe(TF_DMG_CUSTOM_BACKSTAB);
  });
});

describe('melee random crits', () => {
  it('roll 15 % (× the damage-dealt multiplier, 1 when idle) through the crit bucket', () => {
    setRandomCritsEnabled(true);
    try {
      const world = makeWorld();
      const s = addPlayer(world, 'scout', TF_TEAM_RED, TF_CLASS_SCOUT);
      startRound(world);
      run(world, 5);
      const bat = s.weapons[2] as MeleeWeapon;
      expect(bat).toBeInstanceOf(MeleeWeapon);
      let crits = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        const c = cmd(s, IN_ATTACK);
        c.randomSeed = (i * 2654435761) | 0;
        if (bat.calcIsAttackCriticalHelper(c)) crits++;
      }
      const rate = crits / n;
      // Binomial σ at n = 4000 is 0.56 %; allow ±2 %.
      expect(Math.abs(rate - CRIT.chanceMelee)).toBeLessThan(0.02);
    } finally {
      setRandomCritsEnabled(false);
    }
  });
});

describe('spy', () => {
  function spy(): { world: GameWorld; s: Player } {
    const world = makeWorld();
    const s = addPlayer(world, 'spy', TF_TEAM_RED, TF_CLASS_SPY);
    startRound(world);
    run(world, 5);
    place(world, s, 0, 0, 0);
    run(world, ticks(1));
    expect(s.weapons.some((w) => w instanceof InvisWatch)).toBe(true);
    expect(s.weapons.some((w) => w instanceof DisguiseKit)).toBe(true);
    return { world, s };
  }

  it('cloak: +attack2 fades out over 1 s, drains 10/s, and blocks attacking', () => {
    const { world, s } = spy();
    run(world, 1, (p) => cmd(p, IN_ATTACK2));
    expect(s.cond.has(TF_COND.STEALTHED)).toBe(true);
    const meter0 = s.cloakMeter;
    run(world, ticks(INVIS_WATCH.fadeTime + 0.1));
    expect(spyState(s).invisibility).toBe(1);
    run(world, ticks(1));
    const drained = meter0 - s.cloakMeter;
    expect(Math.abs(drained - INVIS_WATCH.consumeRate * (INVIS_WATCH.fadeTime + 1.1))).toBeLessThan(0.5);
    world.drainEvents();
    run(world, ticks(0.5), (p) => cmd(p, IN_ATTACK));
    expect(world.drainEvents().some((e) => e.type === 'effect' && e.kind === 'muzzleflash')).toBe(false);
    // Decloak: out again after the fade.
    run(world, 1, (p) => cmd(p, IN_ATTACK2));
    run(world, ticks(INVIS_WATCH.fadeTime + 0.1));
    expect(s.cond.has(TF_COND.STEALTHED)).toBe(false);
  });

  it('disguise completes after 2 s as the requested class and team', () => {
    const { world, s } = spy();
    expect(requestDisguise(s, TF_CLASS_HEAVYWEAPONS, TF_TEAM_BLUE)).toBe(true);
    expect(s.cond.has(TF_COND.DISGUISING)).toBe(true);
    run(world, ticks(DISGUISE.time - 0.1));
    expect(s.cond.has(TF_COND.DISGUISED)).toBe(false);
    run(world, ticks(0.2));
    expect(s.cond.has(TF_COND.DISGUISED)).toBe(true);
    expect(s.disguiseClass).toBe(TF_CLASS_HEAVYWEAPONS);
    expect(s.disguiseTeam).toBe(TF_TEAM_BLUE);
  });
});

describe('determinism and net', () => {
  function scripted(): string {
    setRandomCritsEnabled(true);
    try {
      const world = makeWorld();
      const sol = addPlayer(world, 'sol', TF_TEAM_RED, TF_CLASS_SOLDIER);
      const sc = addPlayer(world, 'sc', TF_TEAM_RED, TF_CLASS_SCOUT);
      const py = addPlayer(world, 'py', TF_TEAM_BLUE, TF_CLASS_PYRO);
      const hv = addPlayer(world, 'hv', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
      startRound(world);
      run(world, 5);
      place(world, sol, -400, -100, 0);
      place(world, sc, -300, 100, 0);
      place(world, py, 200, -100, 180);
      place(world, hv, 300, 100, 180);
      const out: SimEvent[] = [];
      for (let i = 0; i < ticks(6); i++) {
        run(world, 1, (p) => {
          topUp(p);
          const yaw = p.team === TF_TEAM_RED ? (i % 40) - 20 : 180 + (i % 30) - 15;
          return cmd(p, i % 9 < 6 ? IN_ATTACK : i % 17 === 0 ? IN_ATTACK2 : 0, (i % 11) - 5, yaw);
        });
        for (const e of world.drainEvents()) if (e.type === 'damage' || e.type === 'effect') out.push(e);
      }
      for (const p of [sol, sc, py, hv]) for (const n of [p.health, p.origin.x, p.origin.y, p.origin.z]) expect(Number.isFinite(n)).toBe(true);
      return JSON.stringify([out, [sol, sc, py, hv].map((p) => [p.health, p.origin, p.velocity])]);
    } finally {
      setRandomCritsEnabled(false);
    }
  }

  it('two worlds fed the same commands produce identical damage, effects and positions', () => {
    const a = scripted();
    const b = scripted();
    expect(a.length).toBeGreaterThan(1000);
    expect(a).toBe(b);
  });

  it('every stock weapon survives a net write → read → write round trip', () => {
    const world = makeWorld();
    const classes = [TF_CLASS_SCOUT, TF_CLASS_SOLDIER, TF_CLASS_PYRO, TF_CLASS_HEAVYWEAPONS, TF_CLASS_MEDIC, TF_CLASS_SPY];
    const players = classes.map((c, i) => addPlayer(world, `p${i}`, i % 2 ? TF_TEAM_BLUE : TF_TEAM_RED, c));
    startRound(world);
    run(world, ticks(0.5), (p) => cmd(p, IN_ATTACK));
    let checked = 0;
    for (const p of players) {
      for (const w of p.weapons) {
        if (!w) continue;
        const rec: NetRecord = {};
        w.writeNet(rec);
        const copy = Object.create(Object.getPrototypeOf(w)) as typeof w;
        Object.assign(copy, w);
        // Blank the plain fields the record carries, so readNet has to restore them.
        const fields = copy as unknown as Record<string, unknown>;
        for (const k of Object.keys(rec)) if (typeof rec[k] === 'number' && Object.prototype.hasOwnProperty.call(fields, k) && typeof fields[k] === 'number') fields[k] = 0;
        copy.readNet(rec);
        const again: NetRecord = {};
        copy.writeNet(again);
        for (const k of Object.keys(rec)) {
          const x = rec[k];
          const y = again[k];
          if (typeof x === 'number' && typeof y === 'number') expect(Number.isNaN(x)).toBe(false);
          expect([w.classname, k, y]).toEqual([w.classname, k, x]);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(15);
  });
});
