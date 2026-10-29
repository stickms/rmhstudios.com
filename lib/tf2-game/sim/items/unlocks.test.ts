/**
 * Unlock weapon mechanics against the SDK's formulas: each test equips the real catalog item
 * (__fixtures__/unlock-catalog.ts, checked against a local catalog build when TF2_ROOT is set)
 * and drives it through the game's own commands.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_ATTACK2,
  IN_JUMP,
  TF_CLASS_DEMOMAN,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../../core/constants';
import { vec3 } from '../../core/vec';
import { buildCatalog } from '../../../tf2-loadout/catalog-build';
import { TF_COND } from '../conditions';
import type { Entity } from '../entity';
import type { Player } from '../player';
import type { GameWorld } from '../world';
import { CompoundBow, Crossbow } from '../weapons/bow';
import { ThrownCleaver, ThrownGas, ThrownJar } from '../weapons/throwables';
import { Lunchbox, LunchboxDrink } from '../weapons/lunchbox';
import { FlareGun, FlareGunRevenge } from '../weapons/flaregun';
import { DRGPomson, ParticleCannon } from '../weapons/energy';
import { BuffItem, Parachute } from '../weapons/buff-item';
import { Cannon } from '../weapons/cannon';
import { hookPlayer } from './attributes';
import { DragonsFury } from '../weapons/dragons-fury';
import { LaserPointer, MechanicalArm, ShotgunBuildingRescue } from '../weapons/engineer';
import { UNLOCK_WEAPON_FACTORIES } from '../weapons/index';
import { handleBuildCommand, ObjectSentrygun, registerBuildings } from '../buildings';
import { createDamageInfo } from '../damage';
import { UNLOCK_WEAPON_SCRIPTS } from '../../data/unlock-scripts';
import { IMPLEMENTED_OWN_CLASSES } from './support';
import { Revolver } from '../weapons/revolver';
import {
  cmd,
  damageTo,
  makeWorld,
  place,
  pitchTo,
  run,
  setRandomCritsEnabled,
  startRound,
  ticks,
} from '../weapons/__fixtures__/world';
import { setItemCatalog } from './registry';
import { resolveItem } from './resolve';
import { UNLOCK_ITEMS, unlockTestCatalog } from './__fixtures__/unlock-catalog';

beforeAll(() => setRandomCritsEnabled(false));
afterAll(() => setItemCatalog(null));
beforeEach(() => setItemCatalog(unlockTestCatalog()));

export function arena(
  specs: Array<{ team: number; cls: number; slots?: Record<string, { item: number }> }>,
): {
  world: GameWorld;
  players: Player[];
} {
  const world = makeWorld();
  const players = specs.map((s, i) => {
    const p = world.addPlayer(`p${i}`, { bot: true });
    p.requestTeam(s.team);
    if (s.slots) p.setClassLoadout(s.cls, s.slots);
    p.requestClass(s.cls);
    return p;
  });
  startRound(world);
  run(world, 5);
  world.drainEvents();
  return { world, players };
}

const entitiesOf = (world: GameWorld, classname: string): Entity[] => {
  const out: Entity[] = [];
  world.forEachEntity((e) => {
    if (e.classname === classname) out.push(e);
  });
  return out;
};

const speedOf = (e: Entity): number => Math.hypot(e.velocity.x, e.velocity.y, e.velocity.z);

/** Holds +attack for `hold` seconds on `p` (others idle), then releases for a tick. */
function drawAndRelease(world: GameWorld, p: Player, hold: number, pitch = 0, yaw = 0): void {
  run(world, ticks(hold), (q) => (q === p ? cmd(p, IN_ATTACK, pitch, yaw) : null));
  run(world, 1, (q) => (q === p ? cmd(p, 0, pitch, yaw) : null));
}

describe('Huntsman (CTFCompoundBow)', () => {
  it('draws 50 → 120 damage and 1800 → 2600 u/s over a second, slows the Sniper and blocks jumping', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SNIPER, slots: { primary: { item: 56 } } },
    ]);
    const [s] = players;
    const bow = s.weapons[0] as CompoundBow;
    expect(bow).toBeInstanceOf(CompoundBow);
    place(world, s, 0, 0, 0);
    // A quick release: the base damage and the slowest arrow.
    run(world, 1, (q) => (q === s ? cmd(s, IN_ATTACK) : null));
    expect(s.cond.has(TF_COND.AIMING)).toBe(true);
    expect((bow as unknown as { ownerCanJump(): boolean }).ownerCanJump()).toBe(false);
    run(world, 1, (q) => (q === s ? cmd(s, 0) : null));
    let arrows = entitiesOf(world, 'tf_projectile_arrow');
    expect(arrows).toHaveLength(1);
    expect((arrows[0] as unknown as { damage: number }).damage).toBeCloseTo(50 + 70 * (1 / 66), 0);
    expect(speedOf(arrows[0])).toBeLessThan(1820);
    expect(s.cond.has(TF_COND.AIMING)).toBe(false);
    // The next arrow is nocked when the 2 s refire time is up; a full draw is 120 at 2600.
    run(world, ticks(2.1));
    for (const a of arrows) world.remove(a);
    drawAndRelease(world, s, 1.2);
    arrows = entitiesOf(world, 'tf_projectile_arrow');
    expect(arrows).toHaveLength(1);
    expect((arrows[0] as unknown as { damage: number }).damage).toBeCloseTo(120, 5);
    expect(speedOf(arrows[0])).toBeCloseTo(2600, 0);
    expect(bow.lastCharge).toBeCloseTo(1, 5);
  });

  it('a fully drawn headshot crits (×3 = 360) and kills', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SNIPER, slots: { primary: { item: 56 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [s, h] = players;
    place(world, s, -400, 0, 0);
    place(world, h, 0, 0, 180);
    const eye = s.eyePosition(vec3());
    const head = h.eyePosition(vec3());
    const pitch = pitchTo(eye, head);
    drawAndRelease(world, s, 1.1, pitch, 0);
    run(world, ticks(0.5));
    const events = world.drainEvents();
    const hits = damageTo(events, h.id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].crit).toBe(2);
    expect(h.alive).toBe(false);
  });

  it('+attack2 lowers a drawn bow: no shot for a second', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SNIPER, slots: { primary: { item: 56 } } },
    ]);
    const [s] = players;
    const bow = s.weapons[0] as CompoundBow;
    run(world, ticks(0.3), (q) => (q === s ? cmd(s, IN_ATTACK) : null));
    expect(bow.chargeBeginTime).toBeGreaterThan(0);
    run(world, 1, (q) => (q === s ? cmd(s, IN_ATTACK | IN_ATTACK2) : null));
    expect(bow.chargeBeginTime).toBe(0);
    run(world, 2, (q) => (q === s ? cmd(s, 0) : null));
    expect(entitiesOf(world, 'tf_projectile_arrow')).toHaveLength(0);
  });
});

describe("Crusader's Crossbow (CTFCrossbow)", () => {
  it('fires healing bolts at 2400 u/s that heal a teammate twice the bolt damage', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_MEDIC, slots: { primary: { item: 305 } } },
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER },
    ]);
    const [m, sol] = players;
    expect(m.weapons[0]).toBeInstanceOf(Crossbow);
    place(world, m, -300, 0, 0);
    place(world, sol, 0, 0, 180);
    sol.health = 50;
    const pitch = pitchTo(m.eyePosition(vec3()), sol.worldSpaceCenter(vec3()));
    run(world, 1, (q) => (q === m ? cmd(m, IN_ATTACK, pitch, 0) : null));
    const bolts = entitiesOf(world, 'tf_projectile_healing_bolt');
    expect(bolts).toHaveLength(1);
    expect(speedOf(bolts[0])).toBeCloseTo(2400, 0);
    run(world, ticks(0.5));
    expect(sol.health).toBeGreaterThan(50 + 75);
  });
});

/** Aims `p` at the centre of `target` and returns the command pitch/yaw. */
function aimAt(p: Player, target: Player): { pitch: number; yaw: number } {
  const eye = p.eyePosition(vec3());
  const c = target.worldSpaceCenter(vec3());
  return { pitch: pitchTo(eye, c), yaw: (Math.atan2(c.y - eye.y, c.x - eye.x) * 180) / Math.PI };
}

/** Switches `p` to `slot` and lets the draw finish. */
function draw(world: GameWorld, p: Player, slot: number): void {
  run(world, 1, (q) => (q === p ? cmd(p, 0, 0, 0, slot + 1) : null));
  run(world, ticks(1.2));
}

describe('Jarate and Mad Milk (CTFJar, CTFJarMilk)', () => {
  it('Jarate: a 200-unit splash jarates enemies for 10 s (mini-crits taken), the jar is back after 20.1 s', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SNIPER, slots: { secondary: { item: 58 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [s, h] = players;
    expect(s.weapons[1]).toBeInstanceOf(ThrownJar);
    place(world, s, -300, 0, 0);
    place(world, h, 0, 0, 180);
    draw(world, s, 1);
    const { pitch, yaw } = aimAt(s, h);
    run(world, 1, (q) => (q === s ? cmd(s, IN_ATTACK, pitch, yaw) : null));
    expect(s.ammo[4]).toBe(0);
    run(world, ticks(1), (q) => (q === s ? cmd(s, 0, pitch, yaw) : null));
    expect(h.cond.has(TF_COND.URINE)).toBe(true);
    expect(h.cond.remaining[TF_COND.URINE]).toBeGreaterThan(8.5);
    // The empty jar switched away; it comes back with the bar.
    expect(s.activeWeapon()).not.toBe(s.weapons[1]);
    const bar = s.weapons[1] as ThrownJar;
    expect(bar.effectBarRegenTime).toBeGreaterThan(world.curtime + 18);
    run(world, ticks(20));
    expect(s.ammo[4]).toBe(1);
  });

  it('Mad Milk: damage dealt to a milked enemy heals the attacker 60 %', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SCOUT, slots: { secondary: { item: 222 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [sc, h] = players;
    place(world, sc, -250, 0, 0);
    place(world, h, 0, 0, 180);
    draw(world, sc, 1);
    const { pitch, yaw } = aimAt(sc, h);
    run(world, 1, (q) => (q === sc ? cmd(sc, IN_ATTACK, pitch, yaw) : null));
    run(world, ticks(0.8), (q) => (q === sc ? cmd(sc, 0, pitch, yaw) : null));
    expect(h.cond.has(TF_COND.MAD_MILK)).toBe(true);
    sc.health = 50;
    world.drainEvents();
    draw(world, sc, 0);
    run(world, 1, (q) => (q === sc ? cmd(sc, IN_ATTACK, pitch, yaw) : null));
    run(world, ticks(0.3));
    const dealt = damageTo(world.drainEvents(), h.id).reduce((a, e) => a + e.amount, 0);
    expect(dealt).toBeGreaterThan(0);
    expect(sc.health).toBeGreaterThanOrEqual(50 + Math.trunc(dealt * 0.6) - 6);
  });
});

describe('Flying Guillotine (CTFCleaver)', () => {
  it('hits for 50 (TF_DMG_CUSTOM_CLEAVER) and makes the victim bleed', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SCOUT, slots: { secondary: { item: 812 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [sc, h] = players;
    expect(sc.weapons[1]).toBeInstanceOf(ThrownCleaver);
    place(world, sc, -200, 0, 0);
    place(world, h, 0, 0, 180);
    draw(world, sc, 1);
    const { pitch, yaw } = aimAt(sc, h);
    run(world, 1, (q) => (q === sc ? cmd(sc, IN_ATTACK, pitch - 5, yaw) : null));
    run(world, ticks(0.6), (q) => (q === sc ? cmd(sc, 0, pitch, yaw) : null));
    const hits = damageTo(world.drainEvents(), h.id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].amount).toBe(50);
    expect(h.cond.has(TF_COND.BLEEDING)).toBe(true);
    // 4 a tick every 0.5 s (TF_BLEEDING_DMG / FREQUENCY).
    const before = h.health;
    run(world, ticks(1.05));
    expect(before - h.health).toBeGreaterThanOrEqual(8);
  });
});

describe('Gas Passer (CTFJarGas)', () => {
  it('needs a full meter; the cloud gasses enemies and their next hit ignites them', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_PYRO, slots: { secondary: { item: 1180 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [py, h] = players;
    expect(py.weapons[1]).toBeInstanceOf(ThrownGas);
    // It starts empty at spawn (it has been filling since: 60 s for a full can).
    expect(py.meters[3]).toBeLessThan(100);
    place(world, py, -300, 0, 0);
    place(world, h, 0, 0, 180);
    draw(world, py, 1);
    const { pitch, yaw } = aimAt(py, h);
    run(world, 2, (q) => (q === py ? cmd(py, IN_ATTACK, pitch, yaw) : null));
    expect(py.ammo[4]).toBe(1);
    py.meters[3] = 100;
    run(world, 1, (q) => (q === py ? cmd(py, 0, pitch, yaw) : null));
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, pitch, yaw) : null));
    run(world, ticks(1), (q) => (q === py ? cmd(py, 0, pitch, yaw) : null));
    expect(py.meters[3]).toBeLessThan(5);
    expect(h.cond.has(TF_COND.GAS)).toBe(true);
    draw(world, py, 2);
    place(world, py, -60, 0, 0);
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, 0, 0) : null));
    run(world, ticks(0.5));
    expect(h.cond.has(TF_COND.BURNING)).toBe(true);
    expect(h.cond.has(TF_COND.GAS)).toBe(false);
  });
});

describe('lunch boxes (CTFLunchBox, CTFLunchBox_Drink)', () => {
  it('Sandvich: 4.3 s eating, 75 a bite each second (300), drained only when hurt; recharges in 30 s', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_HEAVYWEAPONS, slots: { secondary: { item: 42 } } },
    ]);
    const [h] = players;
    expect(h.weapons[1]).toBeInstanceOf(Lunchbox);
    draw(world, h, 1);
    // Full health: eating a plain Sandvich costs nothing.
    run(world, 1, (q) => (q === h ? cmd(h, IN_ATTACK) : null));
    expect(h.cond.has(TF_COND.TAUNTING)).toBe(true);
    expect(h.ammo[4]).toBe(1);
    run(world, ticks(4.6));
    expect(h.cond.has(TF_COND.TAUNTING)).toBe(false);
    h.health = 20;
    run(world, 1, (q) => (q === h ? cmd(h, IN_ATTACK) : null));
    expect(h.ammo[4]).toBe(0);
    expect(h.meters[3]).toBeLessThan(0.1);
    // Standing still while eating.
    run(world, ticks(0.5), (q) => (q === h ? cmd(h, 0) : null));
    const x0 = h.origin.x;
    run(world, ticks(0.4), (q) => {
      if (q !== h) return null;
      const c = cmd(h, 0);
      c.forwardMove = 450;
      return c;
    });
    expect(Math.abs(h.origin.x - x0)).toBeLessThan(1);
    // First bite 1 s in.
    run(world, ticks(0.15));
    expect(h.health).toBe(20 + 75);
    run(world, ticks(3.45));
    expect(h.health).toBe(Math.min(300, 20 + 4 * 75));
    run(world, ticks(30.2));
    expect(h.ammo[4]).toBe(1);
  });

  it('Sandvich +attack2: a medium kit a hurt teammate picks up; its owner gets the sandvich back', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_HEAVYWEAPONS, slots: { secondary: { item: 42 } } },
      { team: TF_TEAM_RED, cls: TF_CLASS_SCOUT },
    ]);
    const [h, sc] = players;
    place(world, h, 0, 0, 0);
    place(world, sc, 600, 0, 180);
    draw(world, h, 1);
    run(world, 1, (q) => (q === h ? cmd(h, IN_ATTACK2) : null));
    expect(h.ammo[4]).toBe(0);
    expect(h.activeWeapon()).not.toBe(h.weapons[1]);
    const kits = entitiesOf(world, 'tf_dropped_lunchbox_medium');
    expect(kits).toHaveLength(1);
    run(world, ticks(1.5));
    sc.health = 40;
    place(world, sc, kits[0].origin.x, kits[0].origin.y, 180, kits[0].origin.z);
    run(world, 2);
    // ceil( 125 × 0.5 ).
    expect(sc.health).toBe(40 + 63);
    expect(entitiesOf(world, 'tf_dropped_lunchbox_medium')).toHaveLength(0);
  });

  it('Dalokohs Bar: +50 max health for 30 s, 25 a bite past the old max', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_HEAVYWEAPONS, slots: { secondary: { item: 159 } } },
    ]);
    const [h] = players;
    draw(world, h, 1);
    run(world, 1, (q) => (q === h ? cmd(h, IN_ATTACK) : null));
    run(world, ticks(4.6));
    expect(h.maxHealth).toBe(350);
    expect(h.health).toBe(350);
    run(world, ticks(30));
    expect(h.maxHealth).toBe(300);
  });

  it('Buffalo Steak Sandvich: 16 s of mini-crits, locked to melee', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_HEAVYWEAPONS, slots: { secondary: { item: 311 } } },
    ]);
    const [h] = players;
    draw(world, h, 1);
    run(world, 1, (q) => (q === h ? cmd(h, IN_ATTACK) : null));
    run(world, ticks(1.1));
    expect(h.cond.has(TF_COND.ENERGY_BUFF)).toBe(true);
    expect(h.cond.has(TF_COND.CANNOT_SWITCH_FROM_MELEE)).toBe(true);
  });

  it('Bonk!: 8 s of phase (no damage, no attacking), then a slow by the damage dodged', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SCOUT, slots: { secondary: { item: 46 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [sc, h] = players;
    expect(sc.weapons[1]).toBeInstanceOf(LunchboxDrink);
    place(world, sc, -400, 0, 0);
    place(world, h, 0, 0, 180);
    draw(world, sc, 1);
    run(world, 1, (q) => (q === sc ? cmd(sc, IN_ATTACK) : null));
    run(world, ticks(1.3));
    expect(sc.cond.has(TF_COND.PHASE)).toBe(true);
    const hp = sc.health;
    const yaw = aimAt(h, sc);
    run(world, ticks(2), (q) => (q === h ? cmd(h, IN_ATTACK, yaw.pitch, yaw.yaw) : null));
    expect(sc.health).toBe(hp);
    const dodged = sc.unlock.phaseDamage;
    expect(dodged).toBeGreaterThan(50);
    run(world, ticks(6.5));
    expect(sc.cond.has(TF_COND.PHASE)).toBe(false);
    expect(sc.cond.has(TF_COND.STUNNED)).toBe(true);
    // RemapValClamped( dodged, 10, 200, 0.25, 0.5 ), stored as a byte.
    expect(sc.move.stunAmount).toBeCloseTo(Math.min(0.5, 0.25 + (0.25 * (dodged - 10)) / 190), 1);
    // The drink is back with the 30 s bar.
    expect(sc.ammo[5]).toBe(0);
  });

  it('Crit-a-Cola: mini-crits for 8 s; attacking marks the drinker for death (5 s)', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SCOUT, slots: { secondary: { item: 163 } } },
    ]);
    const [sc] = players;
    draw(world, sc, 1);
    run(world, 1, (q) => (q === sc ? cmd(sc, IN_ATTACK) : null));
    run(world, ticks(1.3));
    expect(sc.cond.has(TF_COND.ENERGY_BUFF)).toBe(true);
    draw(world, sc, 0);
    run(world, 1, (q) => (q === sc ? cmd(sc, IN_ATTACK) : null));
    expect(sc.cond.has(TF_COND.MARKEDFORDEATH_SILENT)).toBe(true);
  });
});

describe('flare guns (CTFFlareGun, CTFFlareGun_Revenge)', () => {
  it('Flare Gun: a flare crits a burning player and ignites (2000 u/s, gravity 0.3)', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_PYRO, slots: { secondary: { item: 39 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [py, h] = players;
    expect(py.weapons[1]).toBeInstanceOf(FlareGun);
    place(world, py, -400, 0, 0);
    place(world, h, 0, 0, 180);
    draw(world, py, 1);
    const { pitch, yaw } = aimAt(py, h);
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, pitch, yaw) : null));
    const flares = entitiesOf(world, 'tf_projectile_flare');
    expect(flares).toHaveLength(1);
    expect(speedOf(flares[0])).toBeCloseTo(2000, -1);
    run(world, ticks(0.5));
    let hits = damageTo(world.drainEvents(), h.id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].crit).toBe(0);
    expect(h.cond.has(TF_COND.BURNING)).toBe(true);
    // The next one finds him burning: a crit (30 × 3).
    run(world, ticks(2), (q) => (q === py ? cmd(py, 0, pitch, yaw) : null));
    world.drainEvents();
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, pitch, yaw) : null));
    run(world, ticks(0.4));
    hits = damageTo(world.drainEvents(), h.id).filter((e) => e.crit === 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].amount).toBe(90);
  });

  it('Detonator: +attack2 bursts its flares in the air (110 radius, TF_DMG_CUSTOM_FLARE_EXPLOSION)', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_PYRO, slots: { secondary: { item: 351 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [py, h] = players;
    place(world, py, -800, 0, 0);
    // Beside the flare's path, inside the burst's 110 units.
    place(world, h, 0, 60, 180);
    draw(world, py, 1);
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, -2, 0) : null));
    const gun = py.weapons[1] as FlareGun;
    expect(gun.flares).toHaveLength(1);
    // Fly until it passes the Heavy, then set it off.
    for (let i = 0; i < 60 && entitiesOf(world, 'tf_projectile_flare')[0]?.origin.x < 0; i++)
      run(world, 1, (q) => (q === py ? cmd(py, 0, -2, 0) : null));
    world.drainEvents();
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK2, -2, 0) : null));
    expect(entitiesOf(world, 'tf_projectile_flare')).toHaveLength(0);
    expect(gun.flares).toHaveLength(0);
    const hits = damageTo(world.drainEvents(), h.id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].customKill).toBe(44);
  });

  it('Scorch Shot: a hit knocks the target back and up', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_PYRO, slots: { secondary: { item: 740 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_SCOUT },
    ]);
    const [py, sc] = players;
    place(world, py, -300, 0, 0);
    place(world, sc, 0, 0, 180);
    draw(world, py, 1);
    const { pitch, yaw } = aimAt(py, sc);
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, pitch, yaw) : null));
    let pushed = false;
    for (let i = 0; i < 30 && !pushed; i++) {
      run(world, 1, (q) => (q === py ? cmd(py, 0, pitch, yaw) : null));
      pushed = sc.velocity.z > 50 && sc.velocity.x > 20;
    }
    expect(pushed).toBe(true);
    expect(sc.cond.has(TF_COND.BURNING)).toBe(true);
  });

  it('Manmelter: putting out a teammate banks a crit (crit boosted while out), +20 health', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_PYRO, slots: { secondary: { item: 595 } } },
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_PYRO },
    ]);
    const [py, sol, enemy] = players;
    expect(py.weapons[1]).toBeInstanceOf(FlareGunRevenge);
    place(world, py, -150, 0, 0);
    place(world, sol, 0, 0, 180);
    place(world, enemy, 900, 900, 0);
    draw(world, py, 1);
    sol.ignite(enemy.id, 25, 10, null);
    py.health = 100;
    const { pitch, yaw } = aimAt(py, sol);
    run(world, ticks(0.6), (q) => (q === py ? cmd(py, IN_ATTACK2, pitch, yaw) : null));
    expect(sol.cond.has(TF_COND.BURNING)).toBe(false);
    expect(py.unlock.revengeCrits).toBe(1);
    expect(py.cond.has(TF_COND.CRITBOOSTED)).toBe(true);
    expect(py.health).toBe(120);
    // A shot spends it; the gun never runs dry.
    run(world, 1, (q) => (q === py ? cmd(py, 0, pitch, yaw) : null));
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, 0, 180) : null));
    expect(py.unlock.revengeCrits).toBe(0);
    expect(py.cond.has(TF_COND.CRITBOOSTED)).toBe(false);
    expect(py.weapons[1]!.clip).toBe(20);
  });
});

describe('energy weapons (CTFRaygun, CTFDRGPomson, CTFParticleCannon)', () => {
  it("Pomson: 60 a ring, drains a Medic's über by 10 % up close; 4 shots of 5 energy", () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: 9, slots: { primary: { item: 588 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_MEDIC },
    ]);
    const [eng, med] = players;
    const gun = eng.weapons[0] as DRGPomson;
    expect(gun).toBeInstanceOf(DRGPomson);
    expect(gun.clip).toBe(20);
    place(world, eng, -300, 0, 0);
    place(world, med, 0, 0, 180);
    const medigun = med.weapons[1] as unknown as { chargeLevel: number };
    medigun.chargeLevel = 0.5;
    const { pitch, yaw } = aimAt(eng, med);
    run(world, 1, (q) => (q === eng ? cmd(eng, IN_ATTACK, pitch, yaw) : null));
    expect(gun.clip).toBe(15);
    run(world, ticks(0.4), (q) => (q === eng ? cmd(eng, 0, pitch, yaw) : null));
    const hits = damageTo(world.drainEvents(), med.id);
    expect(hits.length).toBe(1);
    expect(hits[0].customKill).toBe(46);
    expect(medigun.chargeLevel).toBeCloseTo(0.4, 5);
    // The energy recharges itself.
    run(world, ticks(4));
    expect(gun.clip).toBe(20);
  });

  it('Righteous Bison: its ring passes through enemies, hurting each', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { secondary: { item: 442 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [sol, a, b] = players;
    place(world, sol, -400, 0, 0);
    place(world, a, -100, 0, 180);
    place(world, b, 200, 0, 180);
    draw(world, sol, 1);
    const { pitch } = aimAt(sol, a);
    run(world, 1, (q) => (q === sol ? cmd(sol, IN_ATTACK, pitch, 0) : null));
    run(world, ticks(1));
    const ev = world.drainEvents();
    expect(damageTo(ev, a.id).length).toBeGreaterThan(0);
    expect(damageTo(ev, b.id).length).toBeGreaterThan(0);
  });

  it('Cow Mangler: +attack2 charges 2 s and fires the whole charge as a mini-crit that ignites', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { primary: { item: 441 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [sol, h] = players;
    const gun = sol.weapons[0] as ParticleCannon;
    expect(gun).toBeInstanceOf(ParticleCannon);
    place(world, sol, -500, 0, 0);
    place(world, h, 0, 0, 180);
    const { pitch, yaw } = aimAt(sol, h);
    run(world, 1, (q) => (q === sol ? cmd(sol, IN_ATTACK2, pitch, yaw) : null));
    expect(sol.cond.has(TF_COND.AIMING)).toBe(true);
    run(world, ticks(2.1), (q) => (q === sol ? cmd(sol, 0, pitch, yaw) : null));
    expect(gun.clip).toBe(0);
    run(world, ticks(0.6));
    const hits = damageTo(world.drainEvents(), h.id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].customKill).toBe(47);
    expect(hits[0].crit).toBe(1);
    expect(h.cond.has(TF_COND.BURNING)).toBe(true);
  });
});

describe('banners and the B.A.S.E. Jumper (CTFBuffItem, CTFParachute)', () => {
  it('Buff Banner: rage fills from damage (dealt / 6); a full meter blows the horn and buffs teammates for 10 s', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { secondary: { item: 129 } } },
      { team: TF_TEAM_RED, cls: TF_CLASS_SCOUT },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [sol, mate, h] = players;
    expect(sol.weapons[1]).toBeInstanceOf(BuffItem);
    place(world, sol, -300, 0, 0);
    place(world, mate, -300, 100, 0);
    place(world, h, 0, 0, 180);
    const { pitch, yaw } = aimAt(sol, h);
    run(world, 1, (q) => (q === sol ? cmd(sol, IN_ATTACK, pitch, yaw) : null));
    run(world, ticks(0.6), (q) => (q === sol ? cmd(sol, 0, pitch, yaw) : null));
    const dealt = damageTo(world.drainEvents(), h.id).reduce((a, e) => a + e.amount, 0);
    expect(dealt).toBeGreaterThan(0);
    expect(sol.meters[1]).toBeCloseTo(Math.min(100, dealt / 6), 0);
    sol.meters[1] = 100;
    draw(world, sol, 1);
    run(world, 1, (q) => (q === sol ? cmd(sol, IN_ATTACK) : null));
    const banner = sol.weapons[1] as BuffItem;
    expect(banner.playingHorn).toBe(true);
    // The horn: no buff and no switching away yet.
    run(world, ticks(1));
    expect(mate.cond.has(TF_COND.OFFENSEBUFF)).toBe(false);
    run(world, ticks(1.8));
    expect(mate.cond.has(TF_COND.OFFENSEBUFF)).toBe(true);
    expect(sol.cond.has(TF_COND.OFFENSEBUFF)).toBe(true);
    expect(sol.activeWeapon()).toBe(sol.weapons[0]);
    run(world, ticks(5));
    expect(sol.meters[1]).toBeGreaterThan(30);
    expect(sol.meters[1]).toBeLessThan(60);
    run(world, ticks(6));
    expect(sol.meters[1]).toBe(0);
    // The last of the eleven pulses (one at once, then ten a second apart) lasts 1.2 s.
    run(world, ticks(0.5));
    expect(mate.cond.has(TF_COND.OFFENSEBUFF)).toBe(false);
  });

  it('B.A.S.E. Jumper: never drawn; +jump in the air opens it (slow fall)', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { secondary: { item: 1101 } } },
    ]);
    const [sol] = players;
    expect(sol.weapons[1]).toBeInstanceOf(Parachute);
    run(world, 1, (q) => (q === sol ? cmd(sol, 0, 0, 0, 2) : null));
    expect(sol.activeWeapon()).toBe(sol.weapons[0]);
    world.teleportEntity(sol, vec3(0, 0, 800), vec3(), vec3());
    run(world, ticks(0.3));
    run(world, 1, (q) => (q === sol ? cmd(sol, IN_JUMP) : null));
    run(world, ticks(1), (q) => (q === sol ? cmd(sol, 0) : null));
    expect(sol.cond.has(TF_COND.PARACHUTE_ACTIVE)).toBe(true);
    expect(sol.velocity.z).toBeGreaterThan(-200);
  });
});

describe('Loose Cannon (TF_WEAPON_CANNON)', () => {
  it('the fuse burns while held; a ball pushes (50 up close), and its blast within 0.5 s double-donks (mini-crit)', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_DEMOMAN, slots: { primary: { item: 996 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [d, h] = players;
    const gun = d.weapons[0] as Cannon;
    expect(gun).toBeInstanceOf(Cannon);
    place(world, d, -250, 0, 0);
    place(world, h, 0, 0, 180);
    const { pitch, yaw } = aimAt(d, h);
    run(world, ticks(0.7), (q) => (q === d ? cmd(d, IN_ATTACK, pitch - 4, yaw) : null));
    expect(gun.detonateTime).toBeGreaterThan(0);
    run(world, 1, (q) => (q === d ? cmd(d, 0, pitch - 4, yaw) : null));
    const balls = entitiesOf(world, 'tf_projectile_cannonball');
    expect(balls).toHaveLength(1);
    run(world, ticks(0.6), (q) => (q === d ? cmd(d, 0, pitch, yaw) : null));
    const hits = damageTo(world.drainEvents(), h.id);
    const push = hits.find((e) => e.customKill === 61);
    expect(push?.amount).toBe(50);
    const blast = hits.find((e) => e.customKill !== 61);
    expect(blast?.crit).toBe(1);
  });

  it('held to the end of the fuse it bursts at once', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_DEMOMAN, slots: { primary: { item: 996 } } },
    ]);
    const [d] = players;
    const hp = d.health;
    run(world, ticks(1.2), (q) => (q === d ? cmd(d, IN_ATTACK) : null));
    expect(entitiesOf(world, 'tf_projectile_cannonball')).toHaveLength(0);
    expect(d.health).toBeLessThan(hp);
  });
});

describe('shields (CTFWearableDemoShield)', () => {
  it("Chargin' Targe: +attack2 charges at 750; the swing at the end crits by how far it ran", () => {
    const { world, players } = arena([
      {
        team: TF_TEAM_RED,
        cls: TF_CLASS_DEMOMAN,
        slots: { secondary: { item: 131 }, melee: { item: 132 } },
      },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [d, h] = players;
    expect(d.weapons[1]).toBeNull();
    place(world, d, -1500, 0, 0);
    place(world, h, 300, 0, 180);
    draw(world, d, 2);
    expect(d.meters[0]).toBe(100);
    run(world, 1, (q) => (q === d ? cmd(d, IN_ATTACK2) : null));
    expect(d.cond.has(TF_COND.SHIELD_CHARGE)).toBe(true);
    run(world, ticks(0.6), (q) => (q === d ? cmd(d, 0) : null));
    expect(Math.hypot(d.velocity.x, d.velocity.y)).toBeGreaterThan(700);
    // 1.5 s drains 100: under 40 % left after 0.9 s, the swing is a full crit.
    run(world, ticks(0.4), (q) => (q === d ? cmd(d, 0) : null));
    run(world, 1, (q) => (q === d ? cmd(d, IN_ATTACK) : null));
    expect(d.cond.has(TF_COND.SHIELD_CHARGE)).toBe(false);
    expect(d.unlock.nextMeleeCrit).toBe(2);
    const sword = d.weapons[2] as unknown as { currentAttackIsCrit: boolean };
    expect(sword.currentAttackIsCrit).toBe(true);
    // The fire and blast resistances of the shield.
    expect(hookPlayer(d, 'mult_dmgtaken_from_fire', 1)).toBeCloseTo(0.5);
  });

  it('a short charge mini-crits; the charge yaw is capped per tick', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_DEMOMAN, slots: { secondary: { item: 131 } } },
    ]);
    const [d] = players;
    place(world, d, -1500, 0, 0);
    draw(world, d, 2);
    run(world, 1, (q) => (q === d ? cmd(d, IN_ATTACK2) : null));
    run(world, ticks(0.15), (q) => (q === d ? cmd(d, 0, 0, 90) : null));
    // CalculateChargeCap: 0.45° a tick (× the frame-time scaling).
    expect(Math.abs(d.eyeAngles.y)).toBeLessThan(10);
    run(world, ticks(0.35), (q) => (q === d ? cmd(d, 0) : null));
    run(world, 1, (q) => (q === d ? cmd(d, IN_ATTACK) : null));
    expect(d.unlock.nextMeleeCrit).toBe(1);
  });
});

/** An Engineer's level-`level` sentry, built through the build menu and finished at once. */
function sentryFor(world: GameWorld, eng: Player, level = 1): ObjectSentrygun {
  expect(handleBuildCommand(eng, { action: 'build', objectType: 2, objectMode: 0 })).toBe(true);
  run(world, ticks(0.4), (q) => (q === eng ? cmd(eng, 0, 0, eng.eyeAngles.y) : null));
  run(world, 1, (q) => (q === eng ? cmd(eng, IN_ATTACK, 0, eng.eyeAngles.y) : null));
  run(world, 2);
  const s = entitiesOf(world, 'obj_sentrygun')[0] as ObjectSentrygun;
  expect(s).toBeDefined();
  s.health = s.maxHealth;
  s.constructionTimeLeft = 0;
  s.finishedBuilding();
  while (s.level < level) {
    eng.ammo[3] = 200;
    s.onWrenchHit(eng, null);
    run(world, ticks(1.6));
  }
  run(world, ticks(0.5));
  return s;
}

describe('Engineer unlocks (CTFLaserPointer, CTFMechanicalArm, CTFShotgunBuildingRescue)', () => {
  beforeAll(() => registerBuildings());

  it('Wrangler: the sentry follows the dot, fires on +attack, wears a 66 % shield that lingers 3 s', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: 9, slots: { secondary: { item: 140 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [eng, h] = players;
    expect(eng.weapons[1]).toBeInstanceOf(LaserPointer);
    place(world, eng, -600, 0, 0);
    place(world, h, 600, 600, 180);
    const sentry = sentryFor(world, eng);
    // The heavy is out of the sentry's sight cone? No matter: wrangled, it only shoots where told.
    draw(world, eng, 1);
    run(world, ticks(0.6));
    const pointer = eng.weapons[1] as LaserPointer;
    expect(pointer.laserDot()).not.toBeNull();
    const { pitch, yaw } = aimAt(eng, h);
    world.drainEvents();
    run(world, ticks(1.5), (q) => (q === eng ? cmd(eng, IN_ATTACK, pitch, yaw) : null));
    expect(sentry.playerControlled).toBe(true);
    expect(sentry.shieldLevel).toBe(1);
    expect(damageTo(world.drainEvents(), h.id).length).toBeGreaterThan(0);
    // The shield: a 100-damage hit takes 33.
    const hp = sentry.health;
    const info = createDamageInfo();
    info.attacker = h.id;
    info.damage = 100;
    world.applyDamage(sentry, info);
    expect(hp - sentry.health).toBeCloseTo(33, 0);
    // Put away: no more control, the shield (and the idle gun) linger 3 s.
    draw(world, eng, 2);
    expect(sentry.playerControlled).toBe(false);
    expect(sentry.shieldLevel).toBe(1);
    run(world, ticks(2.5));
    expect(sentry.shieldLevel).toBe(0);
  });

  it('Short Circuit: +attack2 spends 65 metal on an orb that destroys an enemy rocket', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: 9, slots: { secondary: { item: 528 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_SOLDIER },
    ]);
    const [eng, sol] = players;
    expect(eng.weapons[1]).toBeInstanceOf(MechanicalArm);
    place(world, eng, -400, 0, 0);
    place(world, sol, 400, 0, 180);
    draw(world, eng, 1);
    const metal = eng.ammo[3];
    run(world, 1, (q) => (q === eng ? cmd(eng, IN_ATTACK2) : null));
    expect(eng.ammo[3]).toBe(metal - 65);
    expect(entitiesOf(world, 'tf_projectile_mechanicalarmorb')).toHaveLength(1);
    const { pitch, yaw } = aimAt(sol, eng);
    run(world, 1, (q) => (q === sol ? cmd(sol, IN_ATTACK, pitch, yaw) : null));
    expect(entitiesOf(world, 'tf_projectile_rocket')).toHaveLength(1);
    run(world, ticks(0.5));
    expect(entitiesOf(world, 'tf_projectile_rocket')).toHaveLength(0);
    expect(eng.health).toBe(eng.maxHealth);
  });

  it('Rescue Ranger: bolts repair a friendly building; buildings come back from afar for 100 metal', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: 9, slots: { primary: { item: 997 } } },
    ]);
    const [eng] = players;
    expect(eng.weapons[0]).toBeInstanceOf(ShotgunBuildingRescue);
    place(world, eng, -800, 0, 0);
    const sentry = sentryFor(world, eng);
    place(world, eng, -1400, 0, 0);
    draw(world, eng, 0);
    sentry.health = 50;
    const c = sentry.worldSpaceCenter(vec3());
    const eye = eng.eyePosition(vec3());
    const yaw = (Math.atan2(c.y - eye.y, c.x - eye.x) * 180) / Math.PI;
    run(world, 1, (q) => (q === eng ? cmd(eng, IN_ATTACK, pitchTo(eye, c) - 1, yaw) : null));
    const bolts = entitiesOf(world, 'tf_projectile_arrow');
    expect(bolts).toHaveLength(1);
    expect(speedOf(bolts[0])).toBeCloseTo(2400, 0);
    run(world, ticks(0.5), (q) => (q === eng ? cmd(eng, 0, pitchTo(eye, c), yaw) : null));
    expect(sentry.health).toBeGreaterThan(50);
    eng.ammo[3] = 200;
    run(world, ticks(1), (q) => (q === eng ? cmd(eng, 0, pitchTo(eye, c), yaw) : null));
    run(world, 1, (q) => (q === eng ? cmd(eng, IN_ATTACK2, pitchTo(eye, c), yaw) : null));
    expect(sentry.carried).toBe(true);
    expect(eng.ammo[3]).toBe(100);
    run(world, 2);
    expect(eng.cond.has(TF_COND.MARKEDFORDEATH_SILENT)).toBe(true);
  });
});

describe("Dragon's Fury (CTFWeaponFlameBall)", () => {
  it('a full needle fires a fireball (25, ×3 on a burning target it strikes); a hit repressurises 1.5× faster', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_PYRO, slots: { primary: { item: 1178 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [py, h] = players;
    const df = py.weapons[0] as DragonsFury;
    expect(df).toBeInstanceOf(DragonsFury);
    place(world, py, -300, 0, 0);
    place(world, h, 0, 0, 180);
    const { pitch, yaw } = aimAt(py, h);
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, pitch, yaw) : null));
    // Emptied, and refilling (0.8 s from empty).
    expect(df.pressure).toBeLessThan(2);
    run(world, ticks(0.2), (q) => (q === py ? cmd(py, 0, pitch, yaw) : null));
    let hits = damageTo(world.drainEvents(), h.id);
    expect(hits.length).toBe(1);
    expect(hits[0].customKill).toBe(78);
    expect(h.cond.has(TF_COND.BURNING)).toBe(true);
    expect(df.rechargeScale).toBe(1.5);
    // 0.8 s at 1.5× refills in ~0.53 s.
    run(world, ticks(0.45), (q) => (q === py ? cmd(py, 0, pitch, yaw) : null));
    expect(df.hasFullCharge()).toBe(true);
    run(world, 1, (q) => (q === py ? cmd(py, IN_ATTACK, pitch, yaw) : null));
    run(world, ticks(0.2), (q) => (q === py ? cmd(py, 0, pitch, yaw) : null));
    hits = damageTo(world.drainEvents(), h.id).filter((e) => e.customKill === 79);
    expect(hits.length).toBe(1);
  });
});

describe('partly simulated items made whole', () => {
  it('Ambassador: a rested shot headshots for a crit (with falloff kept); a hurried one cannot', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: 8, slots: { primary: { item: 61 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [spy, h] = players;
    expect(spy.weapons[0]).toBeInstanceOf(Revolver);
    place(world, spy, -300, 0, 0);
    place(world, h, 0, 0, 180);
    const eye = spy.eyePosition(vec3());
    const head = h.eyePosition(vec3());
    run(world, ticks(1.2));
    run(world, 1, (q) => (q === spy ? cmd(spy, IN_ATTACK, pitchTo(eye, head), 0) : null));
    run(world, 2);
    const hits = damageTo(world.drainEvents(), h.id);
    expect(hits.length).toBe(1);
    expect(hits[0].crit).toBe(2);
    expect(hits[0].customKill).toBe(1);
  });

  it('Equalizer: more damage the lower its owner; Escape Plan: faster, and marked for death', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { melee: { item: 128 } } },
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { melee: { item: 775 } } },
    ]);
    const [a, b] = players;
    draw(world, a, 2);
    draw(world, b, 2);
    const eq = a.weapons[2] as unknown as { meleeDamage(t: unknown, c: { value: number }): number };
    a.health = a.maxHealth;
    expect(eq.meleeDamage(null, { value: 0 })).toBeCloseTo(65 * 0.5);
    a.health = 1;
    expect(eq.meleeDamage(null, { value: 0 })).toBeCloseTo(65 * remapLerp(1 / 200));
    b.health = 30;
    expect(b.weapons[2]!.speedMod()).toBe(1.6);
    expect(b.cond.has(TF_COND.MARKEDFORDEATH_SILENT)).toBe(true);
  });

  it('Dead Ringer: armed with a full meter, a hit feigns death (cloak, 50 %, a quarter of the damage)', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: 8, slots: { pda2: { item: 59 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_SOLDIER },
    ]);
    const [spy, sol] = players;
    place(world, spy, -200, 0, 0);
    place(world, sol, 200, 0, 180);
    run(world, 1, (q) => (q === spy ? cmd(spy, IN_ATTACK2) : null));
    expect(spy.unlock.feignDeathReady).toBe(true);
    const hp = spy.health;
    const info = createDamageInfo();
    info.attacker = sol.id;
    info.damage = 100;
    info.damageType = 1 << 1;
    world.applyDamage(spy, info);
    expect(hp - spy.health).toBe(25);
    expect(spy.cond.has(TF_COND.FEIGN_DEATH)).toBe(true);
    expect(spy.cond.has(TF_COND.STEALTHED)).toBe(true);
    expect(spy.cloakMeter).toBe(50);
    expect(world.drainEvents().some((e) => e.type === 'death' && e.victim === spy.id)).toBe(true);
    expect(spy.alive).toBe(true);
  });

  it('Eyelander: a sword kill takes the head: +15 max health and +8 % speed per head', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_DEMOMAN, slots: { melee: { item: 132 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_SCOUT },
    ]);
    const [d, sc] = players;
    place(world, d, -60, 0, 0);
    place(world, sc, 0, 0, 180);
    draw(world, d, 2);
    expect(d.maxHealth).toBe(150);
    const speed0 = d.computeMaxSpeed();
    sc.health = 10;
    run(world, 1, (q) => (q === d ? cmd(d, IN_ATTACK, 10, 0) : null));
    run(world, ticks(0.5));
    expect(sc.alive).toBe(false);
    expect(d.unlock.decapitations).toBe(1);
    expect(d.maxHealth).toBe(165);
    expect(d.computeMaxSpeed()).toBeCloseTo(speed0 * 1.08, 0);
  });
});

/** RemapValClamped( ratio, 0, 1, 1.65, 0.5 ). */
const remapLerp = (r: number): number => 1.65 + (0.5 - 1.65) * r;

describe('every own-class unlock script is implemented', () => {
  it('UNLOCK_WEAPON_FACTORIES, IMPLEMENTED_OWN_CLASSES and the ownClass scripts agree', () => {
    const own = Object.entries(UNLOCK_WEAPON_SCRIPTS)
      .filter(([, s]) => s.ownClass)
      .map(([n]) => n)
      .sort();
    expect(Object.keys(UNLOCK_WEAPON_FACTORIES).sort()).toEqual(own);
    expect([...IMPLEMENTED_OWN_CLASSES].sort()).toEqual(own);
  });
});

describe('fixture against the real catalog', () => {
  it('every unlock fixture item resolves', () => {
    for (const item of UNLOCK_ITEMS) {
      const cls = [
        TF_CLASS_SCOUT,
        TF_CLASS_SOLDIER,
        TF_CLASS_PYRO,
        TF_CLASS_DEMOMAN,
        TF_CLASS_HEAVYWEAPONS,
        9,
        TF_CLASS_MEDIC,
        TF_CLASS_SNIPER,
        8,
      ].find((_c, i) => (item.c & (1 << i)) !== 0);
      expect(resolveItem(item.id, cls!), item.n).not.toBeNull();
    }
  });

  const TF2_ROOT = process.env.TF2_ROOT;
  const itemsGame = TF2_ROOT ? join(TF2_ROOT, 'tf/scripts/items/items_game.txt') : '';
  it.skipIf(!TF2_ROOT || !existsSync(itemsGame))('matches a local catalog build', () => {
    const decode = (p: string): string => {
      const b = readFileSync(p);
      return b[0] === 0xff && b[1] === 0xfe
        ? b.toString('utf16le').replace(/^\uFEFF/, '')
        : b.toString('utf8');
    };
    const catalog = buildCatalog({
      itemsGame: readFileSync(itemsGame, 'utf8'),
      english: decode(join(TF2_ROOT!, 'tf/resource/tf_english.txt')),
      label: 'local',
    });
    for (const fixture of UNLOCK_ITEMS) {
      const real = catalog.items.find((i) => i.id === fixture.id);
      expect(real?.ic, fixture.n).toBe(fixture.ic);
      expect(real?.at, fixture.n).toEqual(fixture.at);
    }
  });
});
