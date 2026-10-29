/**
 * The simulation core against the SDK's numbers and rules, on synthetic
 * worlds (the box-world fixture): damage ramp-up/fall-off and crits
 * (ApplyOnDamageModifyRules), knockback (DamageForce / ApplyPushFromDamage)
 * and a rocket jump through RadiusDamage, conditions, entity I/O ordering,
 * trigger touch bookkeeping, pickups, respawn waves and the round flow.
 * Expected values are computed here from the SDK formulas.
 */
import { describe, expect, it } from 'vitest';
import {
  IN_DUCK,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_SCOUT,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
} from '../core/constants';
import { emptyTrace, emptyUserCmd, type TraceResult, type UserCmd } from '../core/types';
import { remapClamped, simpleSpline, vec3 } from '../core/vec';
import { BspEntity } from '../formats/keyvalues';
import { DMG as DATA_DMG, TF_DMG_CUSTOM as DATA_TF_DMG_CUSTOM } from '../data/damage';
import { BoxWorld, boxBrush, roomBrushes } from './__fixtures__/box-world';
import {
  applyDistanceAndCrit,
  createDamageInfo,
  createRadiusDamageInfo,
  CRIT_FULL,
  CRIT_MINI,
  CRIT_NONE,
  damageForce,
  DMG_BLAST,
  DMG_BULLET,
  DMG_BUCKSHOT,
  DMG_CLUB,
  DMG_CRITICAL,
  DMG_HALF_FALLOFF,
  DMG_USEDISTANCEMOD,
  radiusDamage,
  TF_DAMAGEFORCESCALE_OTHER,
  TF_DAMAGEFORCESCALE_SELF_SOLDIER_BADRJ,
  TF_DAMAGEFORCESCALE_SELF_SOLDIER_RJ,
  TF_DMG_CUSTOM_BACKSTAB,
  TF_DMG_CUSTOM_BURNING,
  TF_DMG_CUSTOM_HEADSHOT,
  TF_WEAPON,
} from './damage';
import { Conditions, PERMANENT_CONDITION, TF_COND } from './conditions';
import { Entity, MOVECOLLIDE_FLY_BOUNCE } from './entity';
import { BaseProjectile } from './physics';
import { MOVETYPE_FLYGRAVITY } from '../core/constants';
import { registerEntityClass } from './entity-registry';
import { parseOutputAction } from './io';
import { GameWorld } from './world';
import type { Player } from './player';
import { TF_BOOST_DRAIN_TIME, TF_BURNING_DMG } from './player';
import { GR_STATE_PREROUND, GR_STATE_RND_RUNNING, GR_STATE_TEAM_WIN, WINREASON_ALL_POINTS_CAPTURED } from './rules';
import { PACK_RATIOS } from './pickups';
import { traceHitboxes, createHitboxTraceResult } from './hitboxes';
import { HITGROUP_HEAD, HITGROUP_CHEST } from '../core/types';
import { NET_PLAYER, createNetRecord } from './net-schema';
import { readMoveState } from './player';
import { createMoveState } from './movement-types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Counts inputs it receives, in order (for I/O tests). */
class TestRecorder extends Entity {
  static log: string[] = [];
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    TestRecorder.log.push(`${this.targetname}:${input}:${value}@${this.world.tickCount}`);
    return super.acceptInput(input, value, activator, caller) || true;
  }
}
registerEntityClass('test_recorder', TestRecorder);

const kv = (pairs: Record<string, string>, outputs: Array<[string, string]> = []): BspEntity =>
  new BspEntity([...Object.entries(pairs), ...outputs]);

/** A 2048-wide room with a red and a blue spawn and the given extra entities. */
function roomWorld(extra: BspEntity[] = [], rules: Record<string, number | boolean> = {}): GameWorld {
  const collision = new BoxWorld(roomBrushes(1024, 512));
  const entities = [
    kv({ classname: 'worldspawn' }),
    kv({ classname: 'info_player_teamspawn', origin: '-600 0 8', TeamNum: '2', angles: '0 0 0' }),
    kv({ classname: 'info_player_teamspawn', origin: '-600 200 8', TeamNum: '2', angles: '0 0 0' }),
    kv({ classname: 'info_player_teamspawn', origin: '600 0 8', TeamNum: '3', angles: '0 180 0' }),
    kv({ classname: 'info_player_teamspawn', origin: '600 200 8', TeamNum: '3', angles: '0 180 0' }),
    ...extra,
  ];
  return new GameWorld({ collision, entities, options: { seed: 7, lagCompensation: false, rules: { ...rules } } });
}

function addPlayer(world: GameWorld, name: string, team: number, cls: number): Player {
  const p = world.addPlayer(name, { bot: true });
  p.requestTeam(team);
  p.requestClass(cls);
  return p;
}

const idle = (): UserCmd => emptyUserCmd();

function runTicks(world: GameWorld, n: number, cmd?: (p: Player) => UserCmd): void {
  for (let i = 0; i < n; i++) {
    if (cmd) world.forEachPlayer((p) => world.queueCommand(p.id, cmd(p)));
    world.step();
  }
}

/** Runs until the round is live. */
function startRound(world: GameWorld): void {
  for (let i = 0; i < 2000 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
  expect(world.rules.state).toBe(GR_STATE_RND_RUNNING);
}

// ─── Damage formulas ────────────────────────────────────────────────────────

describe('ApplyOnDamageModifyRules distance curve (spread disabled)', () => {
  /**
   * The SDK's curve recomputed: with spread disabled the value used is
   * flMin + spread, where flMin = max(0, centre − 0.1) — so the far end sits
   * at 0.1 on the spline (52.8 %), not 0.
   */
  function sdkCurve(base: number, dist: number, weaponMul: (v: number) => number, longRange = true): number {
    const center = remapClamped(Math.max(1, dist) / 512, 0, 2, 1, 0);
    const val = Math.max(0, center - 0.1) + 0.1;
    const r = base * 0.5 * weaponMul(val);
    const variance = -r + 2 * r * simpleSpline(Math.min(1, Math.max(0, val)));
    return variance > 0 || longRange ? base + variance : base;
  }
  const FAR = 1 - 2 * simpleSpline(0.1); // the fall-off end as a fraction of the half range

  it('bullets ramp 150 % → 100 % at 512 → 52.8 % at 1024 and beyond', () => {
    const at = (d: number) =>
      applyDistanceAndCrit({ damage: 6, distance: d, damageType: DMG_BULLET | DMG_USEDISTANCEMOD | DMG_BUCKSHOT, weaponId: TF_WEAPON.SHOTGUN_SOLDIER, critType: CRIT_NONE }).damage;
    expect(at(1)).toBeCloseTo(sdkCurve(6, 1, () => 1), 6);
    expect(at(1)).toBeCloseTo(9, 1);
    expect(at(512)).toBeCloseTo(6, 6);
    expect(at(1024)).toBeCloseTo(6 - 3 * FAR, 6);
    expect(at(1024) / 6).toBeCloseTo(0.528, 3);
    expect(at(4000)).toBeCloseTo(6 - 3 * FAR, 6);
    expect(at(256)).toBeCloseTo(sdkCurve(6, 256, () => 1), 6);
    expect(at(768)).toBeCloseTo(sdkCurve(6, 768, () => 1), 6);
  });

  it('rockets get only half the ramp-up (125 %) and the full fall-off (90 → 47.5 at 1024)', () => {
    const at = (d: number) =>
      applyDistanceAndCrit({ damage: 90, distance: d, damageType: DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD, weaponId: TF_WEAPON.ROCKETLAUNCHER, critType: CRIT_NONE }).damage;
    expect(at(1)).toBeCloseTo(sdkCurve(90, 1, (c) => (c > 0.5 ? 0.5 : 1)), 6);
    expect(at(1)).toBeCloseTo(112.5, 0);
    expect(at(512)).toBeCloseTo(90, 6);
    expect(at(1024)).toBeCloseTo(sdkCurve(90, 1024, (c) => (c > 0.5 ? 0.5 : 1)), 6);
    expect(at(1024)).toBeCloseTo(47.52, 2);
  });

  it('the scattergun ramps to 175 %', () => {
    const at = (d: number) =>
      applyDistanceAndCrit({ damage: 6, distance: d, damageType: DMG_BULLET | DMG_USEDISTANCEMOD | DMG_BUCKSHOT, weaponId: TF_WEAPON.SCATTERGUN, critType: CRIT_NONE }).damage;
    expect(at(1)).toBeCloseTo(10.5, 1);
    expect(at(1024)).toBeCloseTo(6 - 3 * FAR, 6);
  });

  it('stickies/pipes ramp only 10 % (×0.2 variance)', () => {
    const at = (d: number) =>
      applyDistanceAndCrit({ damage: 120, distance: d, damageType: DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD, weaponId: TF_WEAPON.PIPEBOMBLAUNCHER, critType: CRIT_NONE }).damage;
    expect(at(1)).toBeCloseTo(132, 0);
    expect(at(1024)).toBeCloseTo(120 - 12 * FAR, 6);
  });

  it('no distance mod without DMG_USEDISTANCEMOD (melee, sniper rifle)', () => {
    for (const d of [1, 512, 2000]) {
      expect(applyDistanceAndCrit({ damage: 65, distance: d, damageType: DMG_CLUB, weaponId: TF_WEAPON.SHOVEL, critType: CRIT_NONE }).damage).toBe(65);
    }
  });

  it('crits triple and ignore distance; mini-crits ×1.35 keep ramp-up but not fall-off', () => {
    const crit = (d: number) =>
      applyDistanceAndCrit({ damage: 90, distance: d, damageType: DMG_BLAST | DMG_USEDISTANCEMOD | DMG_CRITICAL, weaponId: TF_WEAPON.ROCKETLAUNCHER, critType: CRIT_FULL }).damage;
    expect(crit(1)).toBeCloseTo(270, 6);
    expect(crit(2000)).toBeCloseTo(270, 6);
    const mini = (d: number) =>
      applyDistanceAndCrit({ damage: 90, distance: d, damageType: DMG_BLAST | DMG_USEDISTANCEMOD, weaponId: TF_WEAPON.ROCKETLAUNCHER, critType: CRIT_MINI }).damage;
    expect(mini(2000)).toBeCloseTo(90 * 1.35, 6);
    expect(mini(1)).toBeCloseTo(112.5 * 1.35, 0);
  });

  it('DamageForce: 48×48×82 hull reference, capped at 1000', () => {
    expect(damageForce({ x: 48, y: 48, z: 82 }, 90, TF_DAMAGEFORCESCALE_OTHER)).toBeCloseTo(540, 6);
    expect(damageForce({ x: 48, y: 48, z: 62 }, 90, 5)).toBeCloseTo((90 * 82) / 62 * 5, 6);
    expect(damageForce({ x: 48, y: 48, z: 82 }, 500, 10)).toBe(1000);
  });

  it('local damage bits and custom kills match the data tables', () => {
    expect(DMG_BLAST).toBe(DATA_DMG.DMG_BLAST);
    expect(DMG_BULLET).toBe(DATA_DMG.DMG_BULLET);
    expect(DMG_BUCKSHOT).toBe(DATA_DMG.DMG_BUCKSHOT);
    expect(TF_DMG_CUSTOM_HEADSHOT).toBe(DATA_TF_DMG_CUSTOM.TF_DMG_CUSTOM_HEADSHOT);
    expect(TF_DMG_CUSTOM_BACKSTAB).toBe(DATA_TF_DMG_CUSTOM.TF_DMG_CUSTOM_BACKSTAB);
    expect(TF_DMG_CUSTOM_BURNING).toBe(DATA_TF_DMG_CUSTOM.TF_DMG_CUSTOM_BURNING);
  });
});

// ─── Rocket jump through RadiusDamage ───────────────────────────────────────

describe('RadiusDamage + ApplyPushFromDamage', () => {
  function soldierAt(world: GameWorld): Player {
    const p = addPlayer(world, 'soldier', TF_TEAM_RED, TF_CLASS_SOLDIER);
    startRound(world);
    expect(p.alive).toBe(true);
    // Settle onto the floor.
    runTicks(world, 30, idle);
    return p;
  }

  function explodeAtFeet(world: GameWorld, p: Player, z = 1): ReturnType<typeof createDamageInfo> {
    const rocket = world.spawnEntity('info_target', (e) => {
      e.origin.x = p.origin.x;
      e.origin.y = p.origin.y;
      e.origin.z = p.origin.z + z;
      e.owner = p.id;
    });
    const info = createDamageInfo();
    info.attacker = p.id;
    info.inflictor = rocket.id;
    info.damage = 90;
    info.damageType = DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD;
    info.weaponId = TF_WEAPON.ROCKETLAUNCHER;
    const r = createRadiusDamageInfo(info, rocket.origin, 146);
    radiusDamage(world, r);
    return info;
  }

  it('a standing soldier shooting his feet: health and upward speed follow the SDK formulas', () => {
    const world = roomWorld();
    const p = soldierAt(world);
    expect(p.move.flags & 1).toBe(1); // on ground
    const h0 = p.health;
    explodeAtFeet(world, p, 1);
    // Distance = min(to origin 1, to centre 40) → falloff RemapValClamped(1, 0, 146, 90, 45); no self distance mod.
    const dmg = remapClamped(1, 0, 146, 90, 45);
    expect(h0 - p.health).toBe(Math.trunc(dmg + 0.5));
    // On the ground: tf_damageforcescale_self_soldier_badrj, standing hull, straight up.
    const expected = damageForce({ x: 48, y: 48, z: 82 }, dmg, TF_DAMAGEFORCESCALE_SELF_SOLDIER_BADRJ);
    expect(p.velocity.z).toBeCloseTo(expected, 4);
    expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeLessThan(1e-6);
    expect(p.cond.has(TF_COND.BLASTJUMPING)).toBe(true);
  });

  it('a crouched airborne soldier takes 60 % and the 55-unit hull with the RJ scale', () => {
    const world = roomWorld();
    const p = soldierAt(world);
    // Jump, then crouch in the air.
    const jumpDuck = (): UserCmd => ({ ...emptyUserCmd(), buttons: IN_DUCK | 2 });
    runTicks(world, 1, jumpDuck);
    runTicks(world, 20, () => ({ ...emptyUserCmd(), buttons: IN_DUCK }));
    expect(p.move.flags & 1).toBe(0);
    expect(p.move.ducked).toBe(true);
    const h0 = p.health;
    const vz0 = p.velocity.z;
    // Explode at the feet (crouched hull: centre 31 up).
    explodeAtFeet(world, p, 1);
    const dmg = remapClamped(1, 0, 146, 90, 45) * 0.6;
    expect(h0 - p.health).toBe(Math.trunc(dmg + 0.5));
    const expected = damageForce({ x: 48, y: 48, z: 55 }, dmg, TF_DAMAGEFORCESCALE_SELF_SOLDIER_RJ);
    expect(p.velocity.z - vz0).toBeCloseTo(expected, 3);
  });

  it('teammates take no damage; enemies take falloff damage and the "other" knockback', () => {
    const world = roomWorld();
    const s = addPlayer(world, 's', TF_TEAM_RED, TF_CLASS_SOLDIER);
    const mate = addPlayer(world, 'm', TF_TEAM_RED, TF_CLASS_SCOUT);
    const enemy = addPlayer(world, 'e', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    runTicks(world, 30, idle);
    // Put everyone near a blast point well away from the soldier.
    world.teleportEntity(mate, vec3(0, 60, 0), null, vec3());
    world.teleportEntity(enemy, vec3(0, -60, 0), null, vec3());
    runTicks(world, 5, idle);
    const hm = mate.health;
    const he = enemy.health;
    const blast = world.spawnEntity('info_target', (e) => {
      e.origin.z = 10;
      e.owner = s.id;
    });
    const info = createDamageInfo();
    info.attacker = s.id;
    info.inflictor = blast.id;
    info.damage = 90;
    info.damageType = DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD;
    info.weaponId = TF_WEAPON.ROCKETLAUNCHER;
    radiusDamage(world, createRadiusDamageInfo(info, blast.origin, 146));
    expect(mate.health).toBe(hm);
    expect(enemy.health).toBeLessThan(he);
    // Heavies take half knockback from non-sentry damage.
    expect(enemy.velocity.y).toBeLessThan(0);
  });
});

// ─── Conditions ─────────────────────────────────────────────────────────────

describe('Conditions', () => {
  it('adds, expires and reports providers', () => {
    const c = new Conditions();
    const added: number[] = [];
    const removed: number[] = [];
    c.onAdded = (cond) => added.push(cond);
    c.onRemoved = (cond) => removed.push(cond);
    c.add(TF_COND.INVULNERABLE, 1.0, 5);
    c.add(TF_COND.BURNING, PERMANENT_CONDITION, 9);
    c.add(TF_COND.LAST - 1, 0.5);
    expect(c.invulnerable).toBe(true);
    expect(c.getProvider(TF_COND.BURNING)).toBe(9);
    for (let t = 0; t < 0.6; t += TICK_INTERVAL) c.think(TICK_INTERVAL);
    expect(c.has(TF_COND.LAST - 1)).toBe(false);
    expect(c.has(TF_COND.INVULNERABLE)).toBe(true);
    for (let t = 0; t < 0.6; t += TICK_INTERVAL) c.think(TICK_INTERVAL);
    expect(c.has(TF_COND.INVULNERABLE)).toBe(false);
    expect(c.has(TF_COND.BURNING)).toBe(true);
    c.clear();
    expect(c.bits.every((w) => w === 0)).toBe(true);
    expect(added).toEqual([TF_COND.INVULNERABLE, TF_COND.BURNING, TF_COND.LAST - 1]);
    expect(removed).toContain(TF_COND.BURNING);
  });
});

// ─── Entity I/O ─────────────────────────────────────────────────────────────

describe('entity I/O', () => {
  it('parses comma and ESC separated outputs', () => {
    const a = parseOutputAction('door,Open,,1.5,-1');
    expect(a).toMatchObject({ target: 'door', input: 'Open', parameter: '', delay: 1.5, timesToFire: -1 });
    const b = parseOutputAction('relay\x1bTrigger\x1bx\x1b0\x1b1');
    expect(b).toMatchObject({ target: 'relay', input: 'Trigger', parameter: 'x', delay: 0, timesToFire: 1 });
  });

  it('a logic_relay chain with delays fires in order, FIFO within a tick, and times-to-fire counts down', () => {
    TestRecorder.log = [];
    const world = roomWorld([
      kv({ classname: 'logic_relay', targetname: 'r1' }, [
        ['OnTrigger', 'rec,Step,a,0,-1'],
        ['OnTrigger', 'r2,Trigger,,0.5,-1'],
        ['OnTrigger', 'rec,Step,b,0,-1'],
        ['OnTrigger', 'rec,Once,x,0,1'],
      ]),
      kv({ classname: 'logic_relay', targetname: 'r2', spawnflags: '2' }, [
        ['OnTrigger', 'rec,Step,c,1.0,-1'],
        ['OnTrigger', 'rec*,Step,d,0,-1'],
      ]),
      kv({ classname: 'test_recorder', targetname: 'rec' }),
    ]);
    const r1 = world.findByName('r1')!;
    world.step();
    const t0 = world.tickCount;
    r1.acceptInput('Trigger', '', null, null);
    runTicks(world, 120);
    // An event due at time T fires on the first tick whose curtime reaches T.
    const due = (t: number) => Math.ceil(t / TICK_INTERVAL - 1e-9);
    const tD = due(t0 * TICK_INTERVAL + 0.5);
    const tC = due(tD * TICK_INTERVAL + 1.0);
    expect(TestRecorder.log).toEqual([
      `rec:Step:a@${t0 + 1}`,
      `rec:Step:b@${t0 + 1}`,
      `rec:Once:x@${t0 + 1}`,
      `rec:Step:d@${tD}`,
      `rec:Step:c@${tC}`,
    ]);
    // r1 is waiting for refire until its last output (0.5 s) is out; afterwards it fires again,
    // but the "Once" connection is spent.
    TestRecorder.log = [];
    r1.acceptInput('Trigger', '', null, null);
    runTicks(world, 2);
    expect(TestRecorder.log.some((l) => l.startsWith('rec:Once'))).toBe(false);
    expect(TestRecorder.log.filter((l) => l.startsWith('rec:Step')).length).toBe(2);
  });

  it('AddOutput, FireUser and Kill', () => {
    TestRecorder.log = [];
    const world = roomWorld([
      kv({ classname: 'info_target', targetname: 'thing' }),
      kv({ classname: 'test_recorder', targetname: 'rec' }),
    ]);
    const thing = world.findByName('thing')!;
    thing.acceptInput('AddOutput', 'OnUser1 rec:Ping:hello:0:-1', null, null);
    thing.acceptInput('FireUser1', '', null, null);
    runTicks(world, 2);
    expect(TestRecorder.log.map((l) => l.split('@')[0])).toEqual(['rec:Ping:hello']);
    thing.acceptInput('Kill', '', null, null);
    expect(world.findByName('thing')).toBeNull();
  });
});

// ─── Triggers ───────────────────────────────────────────────────────────────

describe('triggers', () => {
  it('start/end touch fire once per entry and exit; OnTrigger respects wait', () => {
    TestRecorder.log = [];
    const world = roomWorld([kv({ classname: 'test_recorder', targetname: 'rec' })]);
    const trig = world.spawnEntity('trigger_multiple', (e) => {
      e.spawnflags = 1;
      e.setSize(vec3(-64, -64, 0), vec3(64, 64, 128));
      e.output('OnStartTouch').add(parseOutputAction('rec,Start,,0,-1'));
      e.output('OnEndTouch').add(parseOutputAction('rec,End,,0,-1'));
      e.output('OnTrigger').add(parseOutputAction('rec,Trig,,0,-1'));
      e.output('OnEndTouchAll').add(parseOutputAction('rec,EndAll,,0,-1'));
    });
    const p = addPlayer(world, 'p', TF_TEAM_RED, TF_CLASS_SCOUT);
    startRound(world);
    runTicks(world, 10, idle);
    const tag = (s: string) => TestRecorder.log.filter((l) => l.startsWith(`rec:${s}:`)).length;
    expect(tag('Start')).toBe(0);
    world.teleportEntity(p, vec3(0, 0, 1), null, vec3());
    runTicks(world, 40, idle);
    expect(tag('Start')).toBe(1);
    expect(tag('End')).toBe(0);
    // wait 0.2 s default: ~3 triggers over 40 ticks (0.6 s) of standing inside.
    expect(tag('Trig')).toBeGreaterThanOrEqual(2);
    expect(tag('Trig')).toBeLessThanOrEqual(4);
    world.teleportEntity(p, vec3(400, 0, 1), null, vec3());
    runTicks(world, 10, idle);
    expect(tag('Start')).toBe(1);
    expect(tag('End')).toBe(1);
    expect(tag('EndAll')).toBe(1);
    // Disabled: no touches.
    trig.acceptInput('Disable', '', null, null);
    world.teleportEntity(p, vec3(0, 0, 1), null, vec3());
    runTicks(world, 10, idle);
    expect(tag('Start')).toBe(1);
  });

  it('trigger_hurt hurts every half second; func_regenerate resupplies with a cooldown', () => {
    const world = roomWorld();
    world.spawnEntity('trigger_hurt', (e) => {
      e.spawnflags = 1;
      e.origin.x = -300;
      e.setSize(vec3(-64, -64, 0), vec3(64, 64, 128));
    });
    const regen = world.spawnEntity('func_regenerate', (e) => {
      e.origin.x = 300;
      e.setSize(vec3(-64, -64, 0), vec3(64, 64, 128));
    });
    regen.team = 0;
    const p = addPlayer(world, 'p', TF_TEAM_RED, TF_CLASS_SOLDIER);
    startRound(world);
    runTicks(world, 5, idle);
    const h0 = p.health;
    world.teleportEntity(p, vec3(-300, 0, 1), null, vec3());
    runTicks(world, Math.round(1.0 / TICK_INTERVAL), idle);
    // Default damage 10/s: 5 at once on touch, then every 0.5 s.
    const taken = h0 - p.health;
    expect(taken).toBeGreaterThanOrEqual(10);
    expect(taken).toBeLessThanOrEqual(15);
    p.ammo[1] = 0;
    world.teleportEntity(p, vec3(300, 0, 1), null, vec3());
    runTicks(world, 3, idle);
    expect(p.health).toBe(p.maxHealth);
    expect(p.ammo[1]).toBe(p.maxAmmo[1]);
    expect(p.nextRegenTime).toBeGreaterThan(world.curtime);
  });
});

// ─── Pickups ───────────────────────────────────────────────────────────────

describe('pickups', () => {
  it('a medium health kit gives 50 % of max, hides, and respawns after 10 s', () => {
    const world = roomWorld([kv({ classname: 'item_healthkit_medium', origin: '0 300 0' })]);
    const kit = world.findAllByClassname('item_healthkit_medium')[0]!;
    const p = addPlayer(world, 'p', TF_TEAM_RED, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    runTicks(world, 5, idle);
    p.health = 100;
    world.teleportEntity(p, vec3(0, 300, 1), null, vec3());
    runTicks(world, 2, idle);
    expect(p.health).toBe(100 + Math.ceil(300 * PACK_RATIOS[1]));
    expect(kit.effects & 0x20).toBe(0x20);
    p.health = 100;
    runTicks(world, Math.round(9 / TICK_INTERVAL), idle);
    expect(p.health).toBe(100);
    runTicks(world, Math.round(1.2 / TICK_INTERVAL), idle);
    expect(p.health).toBe(100 + 150);
  });

  it('a dead player drops an ammo pack another player can take', () => {
    const world = roomWorld();
    const a = addPlayer(world, 'a', TF_TEAM_RED, TF_CLASS_SOLDIER);
    const b = addPlayer(world, 'b', TF_TEAM_BLUE, TF_CLASS_SCOUT);
    startRound(world);
    runTicks(world, 10, idle);
    world.teleportEntity(a, vec3(0, 0, 1), null, vec3());
    runTicks(world, 5, idle);
    a.commitSuicide();
    const packs = world.findAllByClassname('tf_ammo_pack');
    expect(packs.length).toBe(1);
    runTicks(world, 60, idle);
    b.ammo[1] = 0;
    world.teleportEntity(b, vec3(packs[0].origin.x, packs[0].origin.y, 1), null, vec3());
    runTicks(world, 2, idle);
    expect(b.ammo[1]).toBe(Math.ceil(b.maxAmmo[1] * 0.5));
    expect(packs[0].removed).toBe(true);
  });
});

// ─── Players, rules, respawn ────────────────────────────────────────────────

describe('players and rules', () => {
  it('runs the round flow: pregame → preround (frozen) → running → team win (humiliation) → next round', () => {
    const world = roomWorld([], { bonusRoundTime: 5 });
    const red = addPlayer(world, 'r', TF_TEAM_RED, TF_CLASS_SCOUT);
    addPlayer(world, 'b', TF_TEAM_BLUE, TF_CLASS_SCOUT);
    for (let i = 0; i < 20 && world.rules.state !== GR_STATE_PREROUND; i++) world.step();
    expect(world.rules.state).toBe(GR_STATE_PREROUND);
    expect(red.alive).toBe(true);
    const start = { ...red.origin };
    runTicks(world, 30, () => ({ ...emptyUserCmd(), forwardMove: 450, buttons: 8 }));
    expect(Math.hypot(red.origin.x - start.x, red.origin.y - start.y)).toBeLessThan(1);
    startRound(world);
    runTicks(world, 30, () => ({ ...emptyUserCmd(), forwardMove: 450, buttons: 8 }));
    expect(Math.hypot(red.origin.x - start.x, red.origin.y - start.y)).toBeGreaterThan(50);
    world.rules.setWinningTeam(TF_TEAM_BLUE, WINREASON_ALL_POINTS_CAPTURED);
    expect(world.rules.state).toBe(GR_STATE_TEAM_WIN);
    expect(world.rules.isHumiliated(red)).toBe(true);
    expect(world.rules.teamScores[TF_TEAM_BLUE]).toBe(1);
    runTicks(world, Math.round(5.2 / TICK_INTERVAL), idle);
    expect(world.rules.state).toBe(GR_STATE_PREROUND);
  });

  it('respawn waves: a dead player waits the minimum (death + 6.4 s + one wave) then spawns on a wave', () => {
    const world = roomWorld([], { respawnWaveTime: 10 });
    const p = addPlayer(world, 'p', TF_TEAM_RED, TF_CLASS_MEDIC);
    addPlayer(world, 'q', TF_TEAM_BLUE, TF_CLASS_MEDIC);
    startRound(world);
    runTicks(world, 10, idle);
    p.commitSuicide();
    const died = world.curtime;
    expect(p.alive).toBe(false);
    let spawnedAt = -1;
    for (let i = 0; i < Math.round(30 / TICK_INTERVAL); i++) {
      world.step();
      if (p.alive) {
        spawnedAt = world.curtime;
        break;
      }
    }
    expect(spawnedAt).toBeGreaterThan(0);
    // One player per team: wave length scales to max(5, 10 × 0.25) = 5; the minimum uses the unscaled 10.
    expect(spawnedAt - died).toBeGreaterThanOrEqual(6.4 + 10 - 1e-6);
    expect(spawnedAt - died).toBeLessThanOrEqual(6.4 + 10 + 5 + TICK_INTERVAL * 2);
    expect(p.health).toBe(p.maxHealth);
  });

  it('class change: instant inside the own respawn room, deferred outside', () => {
    const world = roomWorld();
    const room = world.spawnEntity('func_respawnroom', (e) => {
      e.origin.x = -600;
      e.setSize(vec3(-200, -300, 0), vec3(200, 400, 200));
    });
    room.changeTeam(TF_TEAM_RED);
    const p = addPlayer(world, 'p', TF_TEAM_RED, TF_CLASS_SCOUT);
    startRound(world);
    runTicks(world, 5, idle);
    expect(p.inRespawnRoom()).toBe(true);
    p.requestClass(TF_CLASS_HEAVYWEAPONS);
    expect(p.playerClass).toBe(TF_CLASS_HEAVYWEAPONS);
    expect(p.health).toBe(300);
    world.teleportEntity(p, vec3(0, 0, 1), null, vec3());
    runTicks(world, 5, idle);
    expect(p.inRespawnRoom()).toBe(false);
    p.requestClass(TF_CLASS_SCOUT);
    expect(p.playerClass).toBe(TF_CLASS_HEAVYWEAPONS);
    expect(p.desiredClass).toBe(TF_CLASS_SCOUT);
  });

  it('kills credit the killer, an assist to the second-most-recent damager, and dominations after 4', () => {
    const world = roomWorld();
    const a = addPlayer(world, 'a', TF_TEAM_RED, TF_CLASS_SOLDIER);
    const b = addPlayer(world, 'b', TF_TEAM_RED, TF_CLASS_SCOUT);
    const v = addPlayer(world, 'v', TF_TEAM_BLUE, TF_CLASS_SCOUT);
    startRound(world);
    let deathFlags = 0;
    for (let k = 0; k < 4; k++) {
      world.rules.respawnNow(v);
      runTicks(world, 2, idle);
      const hit = (attacker: Player, dmg: number) => {
        const info = createDamageInfo();
        info.attacker = attacker.id;
        info.inflictor = attacker.id;
        info.damage = dmg;
        info.damageType = DMG_BULLET;
        world.applyDamage(v, info);
      };
      hit(b, 20);
      hit(a, 500);
      const death = world.drainEvents().find((e) => e.type === 'death');
      expect(death).toBeDefined();
      if (death && death.type === 'death') {
        expect(death.attacker).toBe(a.id);
        expect(death.assister).toBe(b.id);
        deathFlags = death.deathFlags;
      }
    }
    expect(a.stats.kills).toBe(4);
    expect(b.stats.assists).toBe(4);
    expect(deathFlags & 1).toBe(1); // TF_DEATH_DOMINATION
    expect(a.dominating.has(v.id)).toBe(true);
  });

  it('medic regen 3 hp/s rising to 6 after 10 s; overheal drains over tf_boost_drain_time', () => {
    const world = roomWorld();
    const m = addPlayer(world, 'm', TF_TEAM_RED, TF_CLASS_MEDIC);
    addPlayer(world, 'x', TF_TEAM_BLUE, TF_CLASS_MEDIC);
    startRound(world);
    m.health = 50;
    m.lastDamageTime = world.curtime;
    runTicks(world, Math.round(3 / TICK_INTERVAL), idle);
    expect(m.health).toBeGreaterThanOrEqual(50 + 6);
    expect(m.health).toBeLessThanOrEqual(50 + 12);
    m.health = 50;
    m.lastDamageTime = world.curtime - 20;
    runTicks(world, Math.round(2 / TICK_INTERVAL), idle);
    expect(m.health).toBeGreaterThanOrEqual(50 + 6);
    // Overheal: 225 → 150 over 15 s (75 hp / 15 s = 5 hp/s).
    m.health = m.maxBuffedHealth();
    expect(m.health).toBe(225);
    runTicks(world, Math.round(3 / TICK_INTERVAL), idle);
    const drained = 225 - m.health;
    expect(drained).toBeGreaterThanOrEqual(Math.floor((75 / TF_BOOST_DRAIN_TIME) * 3) - 1);
    expect(drained).toBeLessThanOrEqual(Math.ceil((75 / TF_BOOST_DRAIN_TIME) * 3) + 1);
  });

  it('afterburn ticks 4 damage every 0.5 s and water puts it out', () => {
    const world = roomWorld();
    const pyro = addPlayer(world, 'p', TF_TEAM_RED, 7);
    const v = addPlayer(world, 'v', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    runTicks(world, 5, idle);
    const h0 = v.health;
    v.ignite(pyro.id, TF_WEAPON.FLAMETHROWER, 2);
    // Ticks every TF_BURNING_FREQUENCY from the ignition, rescheduled from the tick it ran on.
    runTicks(world, Math.round(1.1 / TICK_INTERVAL), idle);
    expect(h0 - v.health).toBe(2 * TF_BURNING_DMG);
    runTicks(world, Math.round(2 / TICK_INTERVAL), idle);
    expect(v.cond.has(TF_COND.BURNING)).toBe(false);
    expect(h0 - v.health).toBe(4 * TF_BURNING_DMG);
  });

  it('net records carry the MoveState for prediction and round-trip it', () => {
    const world = roomWorld();
    const p = addPlayer(world, 'p', TF_TEAM_RED, TF_CLASS_SCOUT);
    startRound(world);
    runTicks(world, 20, () => ({ ...emptyUserCmd(), forwardMove: 450, buttons: 8 }));
    const rec = createNetRecord(NET_PLAYER);
    p.writeNet(rec);
    for (const f of NET_PLAYER.fields) expect(rec[f.name], f.name).not.toBeUndefined();
    const m = createMoveState();
    readMoveState(rec, m);
    expect(m.origin).toEqual(p.move.origin);
    expect(m.velocity).toEqual(p.move.velocity);
    expect(m.flags).toBe(p.move.flags);
    expect(m.maxSpeed).toBe(p.move.maxSpeed);
  });
});

// ─── Hitboxes ───────────────────────────────────────────────────────────────

describe('hitboxes', () => {
  it('a level shot at head height hits the head; at chest height the chest; rotation follows yaw', () => {
    const out = createHitboxTraceResult();
    const o = vec3(0, 0, 0);
    expect(traceHitboxes(o, 0, TF_CLASS_SOLDIER, false, vec3(-500, 0, 71), vec3(500, 0, 71), out)).toBe(true);
    expect(out.group).toBe(HITGROUP_HEAD);
    expect(traceHitboxes(o, 90, TF_CLASS_SOLDIER, false, vec3(0, -500, 50), vec3(0, 500, 50), out)).toBe(true);
    expect(out.group).toBe(HITGROUP_CHEST);
    expect(out.normal.y).toBeCloseTo(-1, 6);
    expect(traceHitboxes(o, 0, TF_CLASS_SOLDIER, false, vec3(-500, 0, 100), vec3(500, 0, 100), out)).toBe(false);
  });

  it('hitscan through the world trace hits enemies, not teammates', () => {
    const world = roomWorld();
    const s = addPlayer(world, 's', TF_TEAM_RED, TF_CLASS_SOLDIER);
    const mate = addPlayer(world, 'm', TF_TEAM_RED, TF_CLASS_SCOUT);
    const e = addPlayer(world, 'e', TF_TEAM_BLUE, TF_CLASS_SCOUT);
    startRound(world);
    runTicks(world, 20, idle);
    world.teleportEntity(s, vec3(-300, 0, 1), null, vec3());
    world.teleportEntity(mate, vec3(-100, 0, 1), null, vec3());
    world.teleportEntity(e, vec3(100, 0, 1), null, vec3());
    runTicks(world, 3, idle);
    const tr = emptyTrace();
    world.traceAttack(s, vec3(-300, 0, 50), vec3(500, 0, 50), tr);
    expect(tr.entity).toBe(e.id);
    expect(tr.hitGroup).not.toBe(0);
  });
});

// ─── Weapons through the core API, lag compensation ────────────────────────

describe('weapon API and lag compensation', () => {
  it('a stock loadout gets stub weapons in their buckets; the scattergun stub fires pellets that land as one hit', () => {
    const world = roomWorld();
    const scout = addPlayer(world, 's', TF_TEAM_RED, TF_CLASS_SCOUT);
    const heavy = addPlayer(world, 'h', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    runTicks(world, 10, idle);
    expect(scout.weapons[0]?.classname).toBe('tf_weapon_scattergun');
    expect(scout.weapons[1]?.classname).toBe('tf_weapon_pistol_scout');
    expect(scout.weapons[2]?.classname).toBe('tf_weapon_bat');
    expect(scout.activeSlot).toBe(0);
    world.teleportEntity(scout, vec3(-100, 0, 1), vec3(0, 0, 0), vec3());
    world.teleportEntity(heavy, vec3(100, 0, 1), null, vec3());
    runTicks(world, Math.round(0.6 / TICK_INTERVAL), idle); // draw time
    world.drainEvents();
    const h0 = heavy.health;
    const fire: UserCmd = { ...emptyUserCmd(), buttons: 1, viewAngles: { x: 0, y: 0, z: 0 }, randomSeed: 99 };
    runTicks(world, 1, () => fire);
    const hits = world.drainEvents().filter((e) => e.type === 'damage' && e.victim === heavy.id);
    expect(hits.length).toBe(1);
    expect(h0 - heavy.health).toBeGreaterThan(20);
    expect(scout.weapons[0]!.clip).toBe(5);
  });

  it('withRewind moves enemies back to where the shooter saw them, then restores them', () => {
    const world = new GameWorld({
      collision: new BoxWorld(roomBrushes(1024, 512)),
      entities: [
        kv({ classname: 'info_player_teamspawn', origin: '-600 0 8', TeamNum: '2' }),
        kv({ classname: 'info_player_teamspawn', origin: '600 0 8', TeamNum: '3' }),
      ],
      options: { lagCompensation: true },
    });
    const shooter = world.addPlayer('human');
    shooter.requestTeam(TF_TEAM_RED);
    shooter.requestClass(TF_CLASS_SOLDIER);
    const target = addPlayer(world, 'bot', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    runTicks(world, 10, idle);
    world.teleportEntity(shooter, vec3(-400, 0, 1), null, vec3());
    world.teleportEntity(target, vec3(0, 0, 1), null, vec3());
    runTicks(world, 10, idle);
    const seenTick = world.tickCount;
    // The target walks 40 units sideways over the next 20 ticks (no teleport).
    for (let i = 0; i < 20; i++) {
      target.origin.y += 2;
      world.step();
    }
    // The shooter's latency matches the age of the command (StartLagCompensation
    // rejects a command tick more than 200 ms off the measured latency).
    shooter.latency = 20 * TICK_INTERVAL;
    const tr = emptyTrace();
    // Aim at where it was: miss now, hit with the rewind.
    world.traceAttack(shooter, vec3(-400, 0, 50), vec3(400, 0, 50), tr);
    expect(tr.entity).not.toBe(target.id);
    world.traceAttack(shooter, vec3(-400, 0, 50), vec3(400, 0, 50), tr, seenTick);
    expect(tr.entity).toBe(target.id);
    expect(target.origin.y).toBeCloseTo(40, 6);
  });
});

// ─── Projectile physics ────────────────────────────────────────────────────

class TestRocket extends BaseProjectile {
  static hits: string[] = [];
  override onImpact(other: Entity, tr: TraceResult): void {
    TestRocket.hits.push(other.isPlayer() ? `player:${other.id}` : other.classname);
    const info = createDamageInfo();
    info.attacker = this.owner;
    info.inflictor = this.id;
    info.damage = this.damage;
    info.damageType = DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD;
    info.weaponId = TF_WEAPON.ROCKETLAUNCHER;
    info.directHitEntity = other.isPlayer() ? other.id : -1;
    const src = vec3(tr.endPos.x + tr.plane.normal.x, tr.endPos.y + tr.plane.normal.y, tr.endPos.z + tr.plane.normal.z);
    this.world.radiusDamage(createRadiusDamageInfo(info, src, 146));
    this.world.remove(this);
  }
}
registerEntityClass('test_rocket', TestRocket);

class TestGrenade extends BaseProjectile {
  constructor(cn: string) {
    super(cn);
    this.moveType = MOVETYPE_FLYGRAVITY;
    this.moveCollide = MOVECOLLIDE_FLY_BOUNCE;
    this.elasticity = 0.45;
    this.setSize(vec3(-2, -2, -2), vec3(2, 2, 2));
  }
  override onImpact(): void {}
}
registerEntityClass('test_grenade', TestGrenade);

describe('projectiles (PhysicsToss)', () => {
  it('a rocket flies through a teammate and explodes on the enemy', () => {
    TestRocket.hits = [];
    const world = roomWorld();
    const s = addPlayer(world, 's', TF_TEAM_RED, TF_CLASS_SOLDIER);
    const mate = addPlayer(world, 'm', TF_TEAM_RED, TF_CLASS_SCOUT);
    const enemy = addPlayer(world, 'e', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    startRound(world);
    runTicks(world, 10, idle);
    world.teleportEntity(s, vec3(-400, 0, 1), null, vec3());
    world.teleportEntity(mate, vec3(-100, 0, 1), null, vec3());
    world.teleportEntity(enemy, vec3(300, 0, 1), null, vec3());
    runTicks(world, 3, idle);
    const hm = mate.health;
    const he = enemy.health;
    const rocket = world.spawnProjectile('test_rocket', {
      origin: vec3(-370, 0, 40),
      angles: vec3(0, 0, 0),
      velocity: vec3(1100, 0, 0),
      owner: s,
      weapon: null,
      damage: 90,
      critType: 0,
    })!;
    expect(rocket.team).toBe(TF_TEAM_RED);
    runTicks(world, 60, idle);
    expect(TestRocket.hits).toEqual([`player:${enemy.id}`]);
    expect(mate.health).toBe(hm);
    // Direct hit: no radius falloff (GetEnemy), then the attacker→victim distance curve (700 units).
    const curve = applyDistanceAndCrit({
      damage: 90,
      distance: 700,
      damageType: DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD,
      weaponId: TF_WEAPON.ROCKETLAUNCHER,
      critType: CRIT_NONE,
    }).damage;
    expect(he - enemy.health).toBe(Math.trunc(curve + 0.5));
    expect(rocket.removed).toBe(true);
  });

  it('a rocket hitting a wall explodes there', () => {
    TestRocket.hits = [];
    const world = roomWorld();
    const s = addPlayer(world, 's', TF_TEAM_RED, TF_CLASS_SOLDIER);
    startRound(world);
    world.spawnProjectile('test_rocket', {
      origin: vec3(0, 0, 100),
      angles: vec3(0, 0, 0),
      velocity: vec3(0, 1100, 0),
      owner: s,
      weapon: null,
      damage: 90,
      critType: 0,
    });
    runTicks(world, 80, idle);
    expect(TestRocket.hits).toEqual(['worldspawn']);
  });

  it('a bouncing grenade falls under sv_gravity, bounces and comes to rest on the floor', () => {
    const world = roomWorld();
    const s = addPlayer(world, 's', TF_TEAM_RED, TF_CLASS_SOLDIER);
    startRound(world);
    const g = world.spawnProjectile('test_grenade', {
      origin: vec3(0, 0, 200),
      angles: vec3(0, 0, 0),
      velocity: vec3(300, 0, 0),
      owner: s,
      weapon: null,
      damage: 0,
      critType: 0,
    })!;
    // Free fall for 10 ticks: z drops by ½·g·t² exactly with the half-step integration.
    runTicks(world, 10, idle);
    const t = 10 * TICK_INTERVAL;
    expect(g.origin.z).toBeCloseTo(200 - 0.5 * 800 * t * t, 6);
    expect(g.velocity.z).toBeCloseTo(-800 * t, 6);
    runTicks(world, 600, idle);
    expect(g.flags & 1).toBe(1);
    expect(g.origin.z).toBeGreaterThan(1.9);
    expect(g.origin.z).toBeLessThan(2.2);
    expect(g.velocity.x).toBe(0);
  });
});

// The box brush helper is used by the fixture; keep the import live for future cases.
void boxBrush;
