/**
 * Engineer buildings and the sapper against the SDK's numbers, on the
 * box-world fixture: placement and its refusals (CalculatePlacementPos /
 * IsPlacementPosValid / EstimateValidBuildPos), the construction time
 * (BaseObjectThink every 7 ticks → Construct), sentry damage per level
 * (FindTarget / Attack / Fire, 16 per bullet through the distance rule),
 * friendly-disguise immunity, level 3 rockets every 3 s, wrench upgrades,
 * dispenser healing and metal, teleporter recharge and the teleport, the
 * sapper's drain and its removal, carrying, class-change cleanup and
 * determinism.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FL_GODMODE,
  IN_ATTACK,
  IN_ATTACK2,
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_SCOUT,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
} from '../../core/constants';
import { emptyUserCmd, type UserCmd } from '../../core/types';
import { vec3 } from '../../core/vec';
import { BspEntity } from '../../formats/keyvalues';
import { DISPENSER, OBJECT_INFO, SENTRY, TELEPORTER } from '../../data';
import { BoxWorld, rampBrush, roomBrushes, boxBrush } from '../__fixtures__/box-world';
import { OBJ_DISPENSER, OBJ_SENTRYGUN, OBJ_TELEPORTER } from '../building-api';
import { TF_COND } from '../conditions';
import {
  applyDistanceAndCrit,
  CRIT_NONE,
  DMG_BLAST,
  DMG_BULLET,
  DMG_HALF_FALLOFF,
  DMG_NOCLOSEDISTANCEMOD,
  DMG_USEDISTANCEMOD,
  SENTRY_MAX_RANGE,
  TF_WEAPON,
} from '../damage';
import { GR_STATE_RND_RUNNING } from '../rules';
import { GameWorld } from '../world';
import type { Player } from '../player';
import type { ObjectEvent, SimEvent } from '../events';
import { createNetRecord } from '../net-schema';
import {
  BS_PLACING,
  BS_PLACING_INVALID,
  fillEngineerHud,
  handleBuildCommand,
  NET_SENTRYGUN,
  objectsOf,
  ObjectDispenser,
  ObjectSapper,
  ObjectSentrygun,
  ObjectTeleporter,
  PdaEngineerBuild,
  PdaEngineerDestroy,
  registerBuildings,
  SENTRY_STATE_ATTACKING,
  SENTRY_STATE_SEARCHING,
  TELEPORTER_STATE_READY,
  TELEPORTER_STATE_RECHARGING,
  TFBaseObject,
  WeaponBuilder,
} from './index';

beforeAll(() => registerBuildings());

// ─── Helpers ────────────────────────────────────────────────────────────────

const kv = (pairs: Record<string, string>): BspEntity => new BspEntity(Object.entries(pairs));
const TICKS = (s: number): number => Math.round(s / TICK_INTERVAL);

function roomWorld(extraBrushes = roomBrushes(1024, 512), seed = 7): GameWorld {
  const collision = new BoxWorld(extraBrushes);
  const entities = [
    kv({ classname: 'worldspawn' }),
    kv({
      classname: 'info_player_teamspawn',
      origin: '-900 -900 8',
      TeamNum: '2',
      angles: '0 0 0',
    }),
    kv({ classname: 'info_player_teamspawn', origin: '-900 900 8', TeamNum: '2', angles: '0 0 0' }),
    kv({
      classname: 'info_player_teamspawn',
      origin: '900 -900 8',
      TeamNum: '3',
      angles: '0 180 0',
    }),
    kv({
      classname: 'info_player_teamspawn',
      origin: '900 900 8',
      TeamNum: '3',
      angles: '0 180 0',
    }),
  ];
  return new GameWorld({ collision, entities, options: { seed, lagCompensation: false } });
}

function addPlayer(world: GameWorld, name: string, team: number, cls: number): Player {
  const p = world.addPlayer(name, { bot: true });
  p.requestTeam(team);
  p.requestClass(cls);
  return p;
}

function startRound(world: GameWorld): void {
  for (let i = 0; i < 4000 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
  expect(world.rules.state).toBe(GR_STATE_RND_RUNNING);
}

/** What each player does every tick (default: stand still, look along +x). */
type Script = Map<Player, () => UserCmd>;
const look = (yaw: number, buttons = 0, pitch = 0): UserCmd => {
  const c = emptyUserCmd();
  c.viewAngles.x = pitch;
  c.viewAngles.y = yaw;
  c.buttons = buttons;
  return c;
};

function run(world: GameWorld, ticks: number, script: Script = new Map()): void {
  for (let i = 0; i < ticks; i++) {
    world.forEachPlayer((p) => {
      const f = script.get(p);
      world.queueCommand(p.id, f ? f() : look(p.eyeAngles.y, 0, p.eyeAngles.x));
    });
    world.step();
  }
}

function place(world: GameWorld, p: Player, x: number, y: number, yaw = 0): void {
  world.teleportEntity(p, vec3(x, y, 1), vec3(0, yaw, 0), vec3());
  run(world, 10, new Map([[p, () => look(yaw)]]));
}

function objectsOfType<T extends TFBaseObject>(
  world: GameWorld,
  ctor: new (...a: never[]) => T,
): T[] {
  return objectsOf(world).filter((o): o is T => o instanceof ctor && !o.removed);
}

/**
 * Takes out a blueprint of `type` (through the build menu command) facing `yaw`,
 * waits for the deploy delay and places it. Returns the new building (or null when
 * refused).
 */
function build(
  world: GameWorld,
  eng: Player,
  type: number,
  mode = 0,
  yaw = 0,
): TFBaseObject | null {
  expect(handleBuildCommand(eng, { action: 'build', objectType: type, objectMode: mode })).toBe(
    true,
  );
  run(world, TICKS(0.4), new Map([[eng, () => look(yaw)]]));
  const builder = eng.activeWeapon() as WeaponBuilder;
  expect(builder).toBeInstanceOf(WeaponBuilder);
  const blueprint = builder.objectInHand();
  if (builder.buildState !== BS_PLACING) {
    return null;
  }
  run(world, 1, new Map([[eng, () => look(yaw, IN_ATTACK)]]));
  run(world, 2, new Map([[eng, () => look(yaw)]]));
  return blueprint && !blueprint.removed && !blueprint.placing ? blueprint : null;
}

/** Finishes construction at once (setup for tests that aren't about build time). */
function quickBuild(o: TFBaseObject): void {
  o.health = o.maxHealth;
  o.constructionTimeLeft = 0;
  o.finishedBuilding();
}

/** Upgrades by wrench hits (25 metal each) to `level`, letting each upgrade animation finish. */
function upgradeTo(world: GameWorld, o: TFBaseObject, eng: Player, level: number): number {
  let hits = 0;
  while (o.level < level) {
    eng.ammo[3] = 200;
    expect(o.onWrenchHit(eng, null)).toBe(true);
    hits++;
    if (o.upgrading) run(world, TICKS(1.6));
  }
  return hits;
}

const objectEvents = (events: SimEvent[], kind: ObjectEvent['kind']): ObjectEvent[] =>
  events.filter((e): e is ObjectEvent => e.type === 'object' && e.kind === kind);

/** The SDK's sentry bullet damage against a player at the given centre distance (spread off). */
function sentryBulletDamage(distance: number): number {
  const d = applyDistanceAndCrit({
    damage: SENTRY.bulletDamage,
    distance,
    damageType: DMG_BULLET | DMG_USEDISTANCEMOD | DMG_NOCLOSEDISTANCEMOD,
    weaponId: TF_WEAPON.SENTRY_BULLET,
    critType: CRIT_NONE,
    optimalDistance: SENTRY_MAX_RANGE,
    attackerIsPlayer: true,
  }).damage;
  return Math.trunc(d + 0.5);
}

interface Arena {
  world: GameWorld;
  eng: Player;
}

function engineerArena(seed = 7): Arena {
  const world = roomWorld(roomBrushes(1024, 512), seed);
  const eng = addPlayer(world, 'engie', TF_TEAM_RED, TF_CLASS_ENGINEER);
  startRound(world);
  place(world, eng, 0, 0, 0);
  return { world, eng };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('registration and loadouts', () => {
  it('gives the engineer the build PDA, destroy PDA and builder, and the spy a sapper in slot 2', () => {
    const world = roomWorld();
    const eng = addPlayer(world, 'e', TF_TEAM_RED, TF_CLASS_ENGINEER);
    const spy = addPlayer(world, 's', TF_TEAM_BLUE, TF_CLASS_SPY);
    startRound(world);
    expect(eng.weapons[3]).toBeInstanceOf(PdaEngineerBuild);
    expect(eng.weapons[4]).toBeInstanceOf(PdaEngineerDestroy);
    expect(eng.weapons[5]).toBeInstanceOf(WeaponBuilder);
    expect((eng.weapons[5] as WeaponBuilder).sapperMode).toBe(false);
    const sapper = spy.weapons[1] as WeaponBuilder;
    expect(sapper).toBeInstanceOf(WeaponBuilder);
    expect(sapper.sapperMode).toBe(true);
    expect(OBJECT_INFO.OBJ_ATTACHMENT_SAPPER.selectionSlot).toBe(1);
  });
});

describe('placing and building', () => {
  it('a sentry costs 130 metal and builds in the SDK time (100 construction thinks of 7 ticks)', () => {
    const { world, eng } = engineerArena();
    expect(eng.ammo[3]).toBe(200);
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    expect(sentry).toBeInstanceOf(ObjectSentrygun);
    expect(eng.ammo[3]).toBe(200 - OBJECT_INFO.OBJ_SENTRYGUN.cost);
    expect(sentry.building).toBe(true);
    // The engineer put the builder away (SwitchOwnersWeaponToLast → the wrench).
    expect(eng.activeSlot).toBe(2);
    const start = world.curtime;
    let t = 0;
    for (let i = 0; i < TICKS(15) && sentry.building; i++) {
      run(world, 1);
      t = world.curtime - start;
    }
    expect(sentry.building).toBe(false);
    // BuildTime 10 s in 0.1 s construction steps; each think lands on the 7th tick (TIME_TO_TICKS
    // rounds 6.67 up), so 100 thinks of 0.105 s, the first within 0.105 s of placing.
    const thinks = OBJECT_INFO.OBJ_SENTRYGUN.buildTime / 0.1;
    const think = 7 * TICK_INTERVAL;
    expect(t).toBeGreaterThan((thinks - 1) * think - 3 * TICK_INTERVAL - 1e-6);
    expect(t).toBeLessThanOrEqual(thinks * think + 1e-6);
    expect(sentry.health).toBe(SENTRY.baseHealth);
    expect(sentry.ammoShells).toBe(SENTRY.maxShells[1]);
    expect(sentry.state).toBe(SENTRY_STATE_SEARCHING);
    const hud = fillEngineerHud(eng);
    expect(hud.sentry.exists).toBe(true);
    expect(hud.sentry.shells).toBe(150);
    expect(hud.metal).toBe(70);
  });

  it('wrench hits during construction speed it up (+1.5× each for 1 s)', () => {
    const { world, eng } = engineerArena();
    const disp = build(world, eng, OBJ_DISPENSER) as ObjectDispenser;
    expect(disp).toBeInstanceOf(ObjectDispenser);
    const start = world.curtime;
    while (disp.building) {
      disp.onWrenchHit(eng, null);
      run(world, TICKS(0.8));
    }
    // 20 s at 2.5× ≈ 8.4 s.
    expect(world.curtime - start).toBeLessThan(9.5);
    expect(world.curtime - start).toBeGreaterThan(7.5);
  });

  it('one of each building; the teleporter is one entrance and one exit', () => {
    const { world, eng } = engineerArena();
    eng.ammo[3] = 200;
    expect(build(world, eng, OBJ_SENTRYGUN)).not.toBeNull();
    eng.ammo[3] = 200;
    expect(handleBuildCommand(eng, { action: 'build', objectType: OBJ_SENTRYGUN })).toBe(false);
    place(world, eng, 300, 0, 0);
    expect(build(world, eng, OBJ_TELEPORTER, 0)).not.toBeNull();
    place(world, eng, 300, 300, 0);
    expect(build(world, eng, OBJ_TELEPORTER, 1)).not.toBeNull();
    expect(
      handleBuildCommand(eng, { action: 'build', objectType: OBJ_TELEPORTER, objectMode: 0 }),
    ).toBe(false);
    // Not enough metal for a dispenser.
    eng.ammo[3] = 99;
    expect(handleBuildCommand(eng, { action: 'build', objectType: OBJ_DISPENSER })).toBe(false);
  });

  it('attack2 turns the blueprint by 90° steps', () => {
    const { world, eng } = engineerArena();
    handleBuildCommand(eng, { action: 'build', objectType: OBJ_SENTRYGUN });
    run(world, TICKS(0.4), new Map([[eng, () => look(0)]]));
    run(world, 1, new Map([[eng, () => look(0, IN_ATTACK2)]]));
    run(world, TICKS(0.6), new Map([[eng, () => look(0)]]));
    const bp = (eng.activeWeapon() as WeaponBuilder).objectInHand()!;
    expect(bp.desiredBuildRotations).toBe(1);
    expect(bp.currentBuildRotation).toBeCloseTo(90, 5);
    run(world, 1, new Map([[eng, () => look(0, IN_ATTACK)]]));
    expect(bp.placing).toBe(false);
    expect(bp.angles.y).toBeCloseTo(90, 5);
  });

  describe('refuses invalid spots', () => {
    const tryAt = (world: GameWorld, eng: Player, type = OBJ_SENTRYGUN): WeaponBuilder => {
      handleBuildCommand(eng, { action: 'build', objectType: type });
      run(world, TICKS(0.4), new Map([[eng, () => look(0)]]));
      const b = eng.activeWeapon() as WeaponBuilder;
      run(world, 1, new Map([[eng, () => look(0, IN_ATTACK)]]));
      return b;
    };

    it('on a steep slope', () => {
      // A 50° ramp ahead of the engineer (normal z ≈ 0.64 < 0.65).
      const brushes = [...roomBrushes(1024, 512), rampBrush(40, 240, -200, 200, 0, 240)];
      const world = roomWorld(brushes);
      const eng = addPlayer(world, 'e', TF_TEAM_RED, TF_CLASS_ENGINEER);
      startRound(world);
      place(world, eng, -30, 0, 0);
      const b = tryAt(world, eng);
      expect(b.buildState).toBe(BS_PLACING_INVALID);
      expect(objectsOfType(world, ObjectSentrygun).filter((o) => !o.placing)).toHaveLength(0);
      expect(eng.ammo[3]).toBe(200);
    });

    it('a gentle slope is fine', () => {
      const brushes = [...roomBrushes(1024, 512), rampBrush(40, 400, -200, 200, 0, 60)];
      const world = roomWorld(brushes);
      const eng = addPlayer(world, 'e', TF_TEAM_RED, TF_CLASS_ENGINEER);
      startRound(world);
      place(world, eng, -30, 0, 0);
      tryAt(world, eng);
      expect(objectsOfType(world, ObjectSentrygun).filter((o) => !o.placing)).toHaveLength(1);
    });

    it('in a wall', () => {
      const brushes = [
        ...roomBrushes(1024, 512),
        boxBrush({ x: 50, y: -300, z: 0 }, { x: 90, y: 300, z: 512 }),
      ];
      const world = roomWorld(brushes);
      const eng = addPlayer(world, 'e', TF_TEAM_RED, TF_CLASS_ENGINEER);
      startRound(world);
      place(world, eng, 0, 0, 0);
      const b = tryAt(world, eng);
      expect(b.buildState).toBe(BS_PLACING_INVALID);
      expect(objectsOfType(world, ObjectSentrygun).filter((o) => !o.placing)).toHaveLength(0);
    });

    it('in a func_nobuild (but a zone that allows sentries lets them)', () => {
      const world = roomWorld();
      const eng = addPlayer(world, 'e', TF_TEAM_RED, TF_CLASS_ENGINEER);
      startRound(world);
      const nb = world.spawnEntity('func_nobuild', (e) => {
        e.origin.x = 100;
        e.setSize(vec3(-60, -100, -10), vec3(60, 100, 100));
      });
      place(world, eng, 0, 0, 0);
      const b = tryAt(world, eng);
      expect(b.buildState).toBe(BS_PLACING_INVALID);
      (nb as unknown as { allowSentry: boolean }).allowSentry = true;
      run(world, TICKS(0.3), new Map([[eng, () => look(0)]]));
      run(world, 1, new Map([[eng, () => look(0, IN_ATTACK)]]));
      expect(objectsOfType(world, ObjectSentrygun).filter((o) => !o.placing)).toHaveLength(1);
    });

    it('inside a player', () => {
      const world = roomWorld();
      const eng = addPlayer(world, 'e', TF_TEAM_RED, TF_CLASS_ENGINEER);
      const mate = addPlayer(world, 'm', TF_TEAM_RED, TF_CLASS_SOLDIER);
      startRound(world);
      place(world, eng, 0, 0, 0);
      world.teleportEntity(mate, vec3(72, 0, 1), null, vec3());
      const b = tryAt(world, eng);
      expect(b.buildState).toBe(BS_PLACING_INVALID);
      expect(objectsOfType(world, ObjectSentrygun).filter((o) => !o.placing)).toHaveLength(0);
    });

    it('in a respawn room', () => {
      const world = roomWorld();
      const eng = addPlayer(world, 'e', TF_TEAM_RED, TF_CLASS_ENGINEER);
      startRound(world);
      world.spawnEntity('func_respawnroom', (e) => {
        e.origin.x = 100;
        e.setSize(vec3(-60, -100, -10), vec3(60, 100, 100));
      });
      place(world, eng, 0, 0, 0);
      expect(tryAt(world, eng).buildState).toBe(BS_PLACING_INVALID);
    });
  });
});

describe('sentry gun', () => {
  interface KillRun {
    t: number;
    shots: number;
    /** Each hit's damage and the centre-to-centre distance when it landed. */
    hits: Array<{ amount: number; distance: number }>;
    events: SimEvent[];
  }

  /** A built sentry of `level`; a scout appears `distance` in front of it; until it dies. */
  function killTime(level: number, distance: number, seed = 7): KillRun {
    const { world, eng } = engineerArena(seed);
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    if (level > 1) upgradeTo(world, sentry, eng, level);
    // Keep the engineer out of the way, behind the sentry.
    place(world, eng, -200, 0, 0);
    const scout = addPlayer(world, 'scout', TF_TEAM_BLUE, TF_CLASS_SCOUT);
    run(world, TICKS(12));
    expect(scout.alive).toBe(true);
    world.drainEvents();
    world.teleportEntity(
      scout,
      vec3(sentry.origin.x + distance, sentry.origin.y, 1),
      vec3(0, 180, 0),
      vec3(),
    );
    const start = world.curtime;
    const events: SimEvent[] = [];
    const hits: KillRun['hits'] = [];
    const seq0 = sentry.fireSeq;
    const a = vec3();
    const b = vec3();
    for (let i = 0; i < TICKS(5) && scout.alive; i++) {
      run(world, 1);
      const ev = world.drainEvents();
      events.push(...ev);
      for (const e of ev) {
        if (e.type !== 'damage' || e.victim !== scout.id) continue;
        sentry.worldSpaceCenter(a);
        scout.worldSpaceCenter(b);
        hits.push({ amount: e.amount, distance: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) });
      }
    }
    expect(scout.alive).toBe(false);
    return { t: world.curtime - start, shots: (sentry.fireSeq - seq0 + 256) & 255, hits, events };
  }

  /**
   * Every bullet did the SDK's 16 through the distance rule (sentry centre → victim
   * centre, optimal 1100, close-range bonus damped); the bullets push the scout back
   * (sentry push scale 16), so later ones land a little further away.
   */
  function expectSdkBullets(run: KillRun): void {
    expect(run.hits.length).toBe(run.shots);
    let total = 0;
    for (const h of run.hits) {
      expect(Math.abs(h.amount - sentryBulletDamage(h.distance))).toBeLessThanOrEqual(1);
      total += h.amount;
    }
    expect(total).toBeGreaterThanOrEqual(125);
    expect(total - run.hits[run.hits.length - 1].amount).toBeLessThan(125);
  }

  it('level 1 kills a scout at the SDK rate: 16 per bullet through the distance rule, every 5 thinks', () => {
    const r = killTime(1, 400);
    expectSdkBullets(r);
    // The first bullet: 16 + the close-range bonus at ~400 units (18).
    expect(r.hits[0].amount).toBe(sentryBulletDamage(Math.hypot(400, 41 - 33)));
    // 0.2 s refire lands on the 5th 0.045 s think (0.225 s), plus acquisition and the first turn.
    const interval = 5 * 3 * TICK_INTERVAL;
    expect(r.t).toBeGreaterThanOrEqual((r.shots - 1) * interval - 1e-6);
    expect(r.t).toBeLessThan((r.shots - 1) * interval + 0.5);
    const death = r.events.find((e) => e.type === 'death');
    expect(death && death.type === 'death' && death.weapon).toBe('obj_sentrygun');
    expect(death && death.type === 'death' && death.attacker).toBeGreaterThan(0);
  });

  it('level 2 fires twice as often (0.1 s → every 3 thinks)', () => {
    const r = killTime(2, 400);
    expectSdkBullets(r);
    const interval = 3 * 3 * TICK_INTERVAL;
    expect(r.t).toBeGreaterThanOrEqual((r.shots - 1) * interval - 1e-6);
    expect(r.t).toBeLessThan((r.shots - 1) * interval + 0.5);
    const death = r.events.find((e) => e.type === 'death');
    expect(death && death.type === 'death' && death.weapon).toBe('obj_sentrygun2');
  });

  it('ignores a spy disguised as its team, and shoots him once he drops it', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    place(world, eng, -200, 0, 0);
    const spy = addPlayer(world, 'spy', TF_TEAM_BLUE, TF_CLASS_SPY);
    run(world, TICKS(12));
    spy.cond.add(TF_COND.DISGUISED);
    spy.disguiseTeam = TF_TEAM_RED;
    spy.disguiseClass = TF_CLASS_SOLDIER;
    world.teleportEntity(spy, vec3(sentry.origin.x + 300, sentry.origin.y, 1), null, vec3());
    run(world, TICKS(2));
    expect(sentry.state).toBe(SENTRY_STATE_SEARCHING);
    expect(spy.health).toBe(spy.maxHealth);
    spy.cond.remove(TF_COND.DISGUISED);
    spy.disguiseTeam = 0;
    run(world, TICKS(0.5));
    expect(sentry.enemy).toBe(spy.id);
    expect(sentry.state).toBe(SENTRY_STATE_ATTACKING);
    expect(spy.health).toBeLessThan(spy.maxHealth);
  });

  it('level 3 fires a 100-damage rocket every 3 s', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    upgradeTo(world, sentry, eng, 3);
    expect(sentry.level).toBe(3);
    expect(sentry.ammoRockets).toBe(SENTRY.maxRockets);
    place(world, eng, -200, 0, 0);
    const heavy = addPlayer(world, 'heavy', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    run(world, TICKS(12));
    heavy.flags |= FL_GODMODE;
    world.teleportEntity(heavy, vec3(sentry.origin.x + 500, sentry.origin.y, 1), null, vec3());
    const fired: number[] = [];
    let seq = sentry.rocketSeq;
    for (let i = 0; i < TICKS(10); i++) {
      run(world, 1);
      if (sentry.rocketSeq !== seq) {
        seq = sentry.rocketSeq;
        fired.push(world.curtime);
      }
    }
    expect(fired.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < fired.length; i++) {
      const gap = fired[i] - fired[i - 1];
      // m_flNextRocketAttack = now + 3; tried on the next shot after that (every 0.135 s).
      expect(gap).toBeGreaterThan(SENTRY.rocketInterval);
      expect(gap).toBeLessThan(SENTRY.rocketInterval + 0.2);
    }
    expect(sentry.ammoRockets).toBe(SENTRY.maxRockets - fired.length);
  });

  it('a sentry rocket explodes for 100 at the centre', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    upgradeTo(world, sentry, eng, 3);
    place(world, eng, -200, 0, 0);
    const heavy = addPlayer(world, 'heavy', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
    run(world, TICKS(12));
    world.teleportEntity(heavy, vec3(sentry.origin.x + 300, sentry.origin.y, 1), null, vec3());
    world.drainEvents();
    let rocketHit = 0;
    let expected = 0;
    const a = vec3();
    const b = vec3();
    for (let i = 0; i < TICKS(1.5) && !rocketHit; i++) {
      run(world, 1);
      for (const e of world.drainEvents()) {
        if (e.type === 'damage' && e.victim === heavy.id && e.amount >= 50) {
          rocketHit = e.amount;
          // A direct hit (no splash falloff), then the rocket launcher's distance rule measured
          // from the scorer — the engineer — as CTFGameRules::ApplyOnDamageModifyRules does.
          eng.worldSpaceCenter(a);
          heavy.worldSpaceCenter(b);
          const d = applyDistanceAndCrit({
            damage: SENTRY.rocketDamage,
            distance: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
            damageType: DMG_BLAST | DMG_HALF_FALLOFF | DMG_USEDISTANCEMOD,
            weaponId: TF_WEAPON.ROCKETLAUNCHER,
            critType: CRIT_NONE,
            attackerIsPlayer: true,
          }).damage;
          expected = Math.trunc(d + 0.5);
        }
      }
    }
    expect(rocketHit).toBeGreaterThan(0);
    expect(Math.abs(rocketHit - expected)).toBeLessThanOrEqual(2);
  });

  it('wrench hits upgrade 1 → 2 → 3 at 25 metal each, 200 per level', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    eng.ammo[3] = 200;
    for (let i = 1; i <= 7; i++) {
      expect(sentry.onWrenchHit(eng, null)).toBe(true);
      expect(sentry.upgradeMetal).toBe(25 * i);
      expect(eng.ammo[3]).toBe(200 - 25 * i);
    }
    sentry.onWrenchHit(eng, null);
    expect(sentry.level).toBe(2);
    expect(sentry.upgrading).toBe(true);
    expect(sentry.maxHealth).toBe(180);
    expect(sentry.maxShells).toBe(SENTRY.maxShells[2]);
    expect(eng.ammo[3]).toBe(0);
    // No upgrade metal while the animation plays.
    eng.ammo[3] = 200;
    expect(sentry.onWrenchHit(eng, null)).toBe(false);
    run(world, TICKS(1.6));
    expect(sentry.upgrading).toBe(false);
    expect(upgradeTo(world, sentry, eng, 3)).toBe(8);
    expect(sentry.level).toBe(3);
    expect(sentry.maxHealth).toBe(216);
    // Maxed: no more upgrade metal.
    eng.ammo[3] = 200;
    expect(sentry.onWrenchHit(eng, null)).toBe(false);
    expect(eng.ammo[3]).toBe(200);
  });

  it('the wrench repairs at 3 HP per metal and refills shells (1 metal) and rockets (2 metal)', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    upgradeTo(world, sentry, eng, 3);
    sentry.health = 100;
    sentry.ammoShells = 100;
    sentry.ammoRockets = 10;
    eng.ammo[3] = 200;
    sentry.onWrenchHit(eng, null);
    // 100 HP for 34 metal (102 by the ratio, capped at max health 216).
    expect(sentry.health).toBe(202);
    // Then 40 shells (40 metal) and 8 rockets (16 metal).
    expect(sentry.ammoShells).toBe(140);
    expect(sentry.ammoRockets).toBe(18);
    expect(eng.ammo[3]).toBe(200 - 34 - 40 - 16);
  });
});

describe('dispenser', () => {
  it('heals 10 HP/s at level 1 and 15 at level 2, and hands out its metal', () => {
    const { world, eng } = engineerArena();
    const disp = build(world, eng, OBJ_DISPENSER) as ObjectDispenser;
    quickBuild(disp);
    expect(disp.metal).toBe(DISPENSER.startMetal);
    const mate = addPlayer(world, 'mate', TF_TEAM_RED, TF_CLASS_SOLDIER);
    run(world, TICKS(12));
    // Engineer away; the soldier stands next to the dispenser.
    place(world, eng, -400, 0, 0);
    world.teleportEntity(mate, vec3(disp.origin.x - 40, disp.origin.y + 10, 1), null, vec3());
    mate.health = 50;
    run(world, TICKS(0.5));
    expect(disp.isHealingTarget(mate.id)).toBe(true);
    const h0 = mate.health;
    run(world, TICKS(4));
    expect(mate.health - h0).toBeGreaterThanOrEqual(DISPENSER.healRate[1] * 4 - 1);
    expect(mate.health - h0).toBeLessThanOrEqual(DISPENSER.healRate[1] * 4 + 1);
    // Level 2.
    upgradeTo(world, disp, eng, 2);
    run(world, TICKS(0.5));
    mate.health = 50;
    const h1 = mate.health;
    run(world, TICKS(4));
    expect(mate.health - h1).toBeGreaterThanOrEqual(DISPENSER.healRate[2] * 4 - 1);
    expect(mate.health - h1).toBeLessThanOrEqual(DISPENSER.healRate[2] * 4 + 1);
    // No overheal from a dispenser.
    run(world, TICKS(20));
    expect(mate.health).toBe(mate.maxHealth);
  });

  it('gives metal from its store and generates 40 (+10 per level) every 6 s', () => {
    const { world, eng } = engineerArena();
    const disp = build(world, eng, OBJ_DISPENSER) as ObjectDispenser;
    quickBuild(disp);
    // Let it generate for a while with nobody near (first refill after 3 s, then every 6).
    place(world, eng, -500, 0, 0);
    run(world, TICKS(15.2));
    expect(disp.metal).toBe(DISPENSER.startMetal + 3 * DISPENSER.generateMetal);
    eng.ammo[3] = 0;
    world.teleportEntity(eng, vec3(disp.origin.x - 50, disp.origin.y, 1), null, vec3());
    run(world, TICKS(0.3));
    expect(eng.ammo[3]).toBe(DISPENSER.metalPerDispense);
    run(world, TICKS(1.05));
    expect(eng.ammo[3]).toBe(2 * DISPENSER.metalPerDispense);
    const hud = fillEngineerHud(eng);
    expect(hud.dispenser.metal).toBe(disp.metal);
  });

  it('a disguised enemy spy is healed, an undisguised one is not', () => {
    const { world, eng } = engineerArena();
    const disp = build(world, eng, OBJ_DISPENSER) as ObjectDispenser;
    quickBuild(disp);
    place(world, eng, -500, 0, 0);
    const spy = addPlayer(world, 'spy', TF_TEAM_BLUE, TF_CLASS_SPY);
    run(world, TICKS(12));
    world.teleportEntity(spy, vec3(disp.origin.x + 50, disp.origin.y, 1), null, vec3());
    spy.health = 50;
    run(world, TICKS(1));
    expect(disp.isHealingTarget(spy.id)).toBe(false);
    spy.cond.add(TF_COND.DISGUISED);
    spy.disguiseTeam = TF_TEAM_RED;
    run(world, TICKS(1));
    expect(disp.isHealingTarget(spy.id)).toBe(true);
  });
});

describe('teleporters', () => {
  function teleArena(): Arena & { entrance: ObjectTeleporter; exit: ObjectTeleporter } {
    const { world, eng } = engineerArena();
    place(world, eng, -300, -300, 0);
    const entrance = build(world, eng, OBJ_TELEPORTER, 0) as ObjectTeleporter;
    place(world, eng, 300, 300, 0);
    const exit = build(world, eng, OBJ_TELEPORTER, 1) as ObjectTeleporter;
    expect(entrance).toBeInstanceOf(ObjectTeleporter);
    expect(exit).toBeInstanceOf(ObjectTeleporter);
    expect(eng.ammo[3]).toBe(200 - 2 * OBJECT_INFO.OBJ_TELEPORTER.cost);
    quickBuild(entrance);
    quickBuild(exit);
    place(world, eng, 0, -600, 0);
    run(world, TICKS(0.3));
    return { world, eng, entrance, exit };
  }

  it('links the two ends, sends a teammate standing on the entrance to the exit, and recharges 10 / 5 / 3 s', () => {
    const { world, eng, entrance, exit } = teleArena();
    expect(entrance.matching()).toBe(exit);
    expect(entrance.state).toBe(TELEPORTER_STATE_READY);
    const mate = addPlayer(world, 'mate', TF_TEAM_RED, TF_CLASS_SOLDIER);
    run(world, TICKS(12));
    for (const level of [1, 2, 3]) {
      if (level > 1) {
        upgradeTo(world, entrance, eng, level);
        expect(exit.level).toBe(level);
        run(world, TICKS(0.5));
      }
      // Wait until ready, then step on.
      for (let i = 0; i < TICKS(12) && entrance.state !== TELEPORTER_STATE_READY; i++)
        run(world, 1);
      expect(entrance.state).toBe(TELEPORTER_STATE_READY);
      world.teleportEntity(
        mate,
        vec3(entrance.origin.x, entrance.origin.y, entrance.origin.z + 13),
        null,
        vec3(),
      );
      let sentAt = -1;
      let arrivedAt = -1;
      for (let i = 0; i < TICKS(2) && arrivedAt < 0; i++) {
        run(world, 1);
        if (sentAt < 0 && mate.cond.has(TF_COND.SELECTED_TO_TELEPORT)) sentAt = world.curtime;
        if (Math.hypot(mate.origin.x - exit.origin.x, mate.origin.y - exit.origin.y) < 1)
          arrivedAt = world.curtime;
      }
      expect(sentAt).toBeGreaterThan(0);
      expect(arrivedAt).toBeGreaterThan(0);
      // Sent, then 0.1 s to the exit's receive, then BUILD_TELEPORTER_FADEOUT_TIME.
      expect(arrivedAt - sentAt).toBeGreaterThanOrEqual(0.1 + TELEPORTER.fadeOutTime - 1e-6);
      expect(arrivedAt - sentAt).toBeLessThan(0.1 + TELEPORTER.fadeOutTime + 0.2);
      expect(mate.origin.z).toBeCloseTo(exit.origin.z + TELEPORTER.maxs.z + 1, 0);
      expect(entrance.state).toBe(TELEPORTER_STATE_RECHARGING);
      expect(entrance.rechargeDuration).toBe(TELEPORTER.rechargeTime[level]);
      // Ready again after the fades and the level's recharge.
      const readyAt = entrance.rechargeTime;
      for (let i = 0; i < TICKS(12) && entrance.state !== TELEPORTER_STATE_READY; i++)
        run(world, 1);
      expect(world.curtime).toBeGreaterThan(readyAt);
      expect(world.curtime).toBeLessThan(readyAt + 0.1);
      run(world, TICKS(0.4));
      expect(mate.cond.has(TF_COND.TELEPORTED)).toBe(true);
      world.teleportEntity(mate, vec3(0, 0, 1), null, vec3());
      run(world, 2);
    }
    expect(eng.stats.teleports).toBe(3);
  });

  it('enemy spies can use it; other enemies cannot', () => {
    const { world, entrance, exit } = teleArena();
    const spy = addPlayer(world, 'spy', TF_TEAM_BLUE, TF_CLASS_SPY);
    const soldier = addPlayer(world, 'sol', TF_TEAM_BLUE, TF_CLASS_SOLDIER);
    run(world, TICKS(12));
    world.teleportEntity(
      soldier,
      vec3(entrance.origin.x, entrance.origin.y, entrance.origin.z + 13),
      null,
      vec3(),
    );
    run(world, TICKS(1));
    expect(
      Math.hypot(soldier.origin.x - exit.origin.x, soldier.origin.y - exit.origin.y),
    ).toBeGreaterThan(100);
    world.teleportEntity(soldier, vec3(0, 0, 1), null, vec3());
    spy.cond.add(TF_COND.DISGUISED);
    spy.disguiseTeam = TF_TEAM_RED;
    world.teleportEntity(
      spy,
      vec3(entrance.origin.x, entrance.origin.y, entrance.origin.z + 13),
      null,
      vec3(),
    );
    run(world, TICKS(1));
    expect(Math.hypot(spy.origin.x - exit.origin.x, spy.origin.y - exit.origin.y)).toBeLessThan(1);
  });
});

describe('sapper', () => {
  it('drains 25 HP/s, disables the sentry, and two wrench hits take it off', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    place(world, eng, -300, 0, 0);
    const spy = addPlayer(world, 'spy', TF_TEAM_BLUE, TF_CLASS_SPY);
    run(world, TICKS(12));
    // The spy is disguised (so the sentry leaves him be), next to the sentry, facing it.
    spy.cond.add(TF_COND.DISGUISED);
    spy.disguiseTeam = TF_TEAM_RED;
    world.teleportEntity(
      spy,
      vec3(sentry.origin.x + 80, sentry.origin.y, 1),
      vec3(0, 180, 0),
      vec3(),
    );
    const spyScript: Script = new Map([[spy, () => look(180, 0, 20)]]);
    run(world, 5, spyScript);
    const sel = look(180, 0, 20);
    sel.weaponSelect = 2;
    run(world, 1, new Map([[spy, () => sel]]));
    expect(spy.activeSlot).toBe(1);
    run(world, TICKS(0.6), spyScript);
    run(world, 1, new Map([[spy, () => look(180, IN_ATTACK, 20)]]));
    run(world, TICKS(0.3), spyScript);
    expect(sentry.sapped).toBe(true);
    expect(sentry.disabled).toBe(true);
    // The disguise stays (sapping doesn't remove it).
    expect(spy.cond.has(TF_COND.DISGUISED)).toBe(true);
    const sapper = world.entity(sentry.sapperId) as ObjectSapper;
    expect(sapper).toBeInstanceOf(ObjectSapper);
    expect(sapper.health).toBe(100);
    const h0 = sentry.health;
    run(world, TICKS(2), spyScript);
    expect(h0 - sentry.health).toBeGreaterThanOrEqual(2 * 25 - 3);
    expect(h0 - sentry.health).toBeLessThanOrEqual(2 * 25 + 3);
    // Disabled: no shots even with the disguise gone.
    spy.cond.remove(TF_COND.DISGUISED);
    const seq = sentry.fireSeq;
    run(world, TICKS(0.5), spyScript);
    expect(sentry.fireSeq).toBe(seq);
    // The engineer's wrench: 65 per hit, two hits.
    expect(sentry.onWrenchHit(eng, null)).toBe(true);
    expect(sapper.health).toBe(35);
    world.drainEvents();
    expect(sentry.onWrenchHit(eng, null)).toBe(true);
    expect(sapper.removed).toBe(true);
    expect(sentry.sapped).toBe(false);
    const destroyed = objectEvents(world.drainEvents(), 'destroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0].attacker).toBe(eng.id);
    // Disabled for SAPPER_REMOVE_DISABLE_TIME more, then back.
    expect(sentry.disabled).toBe(true);
    run(world, TICKS(0.7));
    expect(sentry.disabled).toBe(false);
  });

  it('a sapper left alone destroys the building and credits the spy', () => {
    const { world, eng } = engineerArena();
    const disp = build(world, eng, OBJ_DISPENSER) as ObjectDispenser;
    quickBuild(disp);
    place(world, eng, -400, 0, 0);
    const spy = addPlayer(world, 'spy', TF_TEAM_BLUE, TF_CLASS_SPY);
    run(world, TICKS(12));
    world.teleportEntity(spy, vec3(disp.origin.x + 80, disp.origin.y, 1), vec3(0, 180, 0), vec3());
    const sel = look(180, 0, 20);
    sel.weaponSelect = 2;
    run(world, 1, new Map([[spy, () => sel]]));
    run(world, TICKS(0.6), new Map([[spy, () => look(180, 0, 20)]]));
    run(world, 1, new Map([[spy, () => look(180, IN_ATTACK, 20)]]));
    expect(disp.sapperId).not.toBe(-1);
    const events: SimEvent[] = [];
    for (let i = 0; i < TICKS(8) && !disp.removed; i++) {
      run(world, 1, new Map([[spy, () => look(180, 0, 20)]]));
      events.push(...world.drainEvents());
    }
    expect(disp.removed).toBe(true);
    const d = objectEvents(events, 'destroyed').find((e) => e.object === disp.id);
    expect(d?.attacker).toBe(spy.id);
    expect(d?.weapon).toBe('obj_attachment_sapper');
    expect(spy.stats.destructions).toBe(1);
    // Destroyed buildings drop half their cost in metal.
    const gib = world.findAllByClassname('tf_ammo_pack')[0] as unknown as { metal: number };
    expect(gib.metal).toBe(OBJECT_INFO.OBJ_DISPENSER.cost / 2);
  });
});

describe('carrying, destroying, cleanup', () => {
  it('attack2 picks up a built sentry; redeploying builds fast and climbs back to its level', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    upgradeTo(world, sentry, eng, 3);
    sentry.ammoShells = 77;
    // Face the sentry (it is ~72 units ahead along +x) and press attack2 with the wrench out.
    run(world, TICKS(0.2), new Map([[eng, () => look(0, 0, 20)]]));
    run(world, 1, new Map([[eng, () => look(0, IN_ATTACK2, 20)]]));
    expect(sentry.carried).toBe(true);
    expect(eng.activeWeapon()).toBeInstanceOf(WeaponBuilder);
    // Can't switch away while carrying; moves at 90 %.
    expect(eng.switchToSlot(0)).toBe(false);
    expect(eng.activeWeapon()!.speedMod()).toBeCloseTo(0.9, 6);
    place(world, eng, 400, 0, 0);
    run(world, TICKS(0.6), new Map([[eng, () => look(0)]]));
    const metal = eng.ammo[3];
    run(world, 1, new Map([[eng, () => look(0, IN_ATTACK)]]));
    expect(sentry.carried).toBe(false);
    expect(sentry.building).toBe(true);
    expect(sentry.carryDeploy).toBe(true);
    expect(sentry.level).toBe(1);
    expect(eng.ammo[3]).toBe(metal);
    const start = world.curtime;
    while (sentry.building) run(world, 1);
    // 10 s at 1 + 2 (the redeploy bonus): 34 thinks of 0.105 s.
    expect(world.curtime - start).toBeLessThan(10.5 / 3 + 0.25);
    for (let i = 0; i < TICKS(5) && sentry.level < 3; i++) run(world, 1);
    expect(sentry.level).toBe(3);
    run(world, TICKS(1.7));
    expect(sentry.carryDeploy).toBe(false);
    expect(sentry.ammoShells).toBe(77);
    expect(sentry.maxHealth).toBe(216);
  });

  it('a sapped building cannot be picked up', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    sentry.onAddSapper(-1);
    run(world, TICKS(0.2), new Map([[eng, () => look(0, 0, 20)]]));
    run(world, 1, new Map([[eng, () => look(0, IN_ATTACK2, 20)]]));
    expect(sentry.carried).toBe(false);
  });

  it('the destruction PDA detonates (explosion, gibs, no credit)', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    world.drainEvents();
    const pda = eng.weapons[4] as PdaEngineerDestroy;
    expect(pda.destroyBuilding({ objectType: OBJ_SENTRYGUN })).toBe(true);
    expect(sentry.removed).toBe(true);
    const ev = world.drainEvents();
    expect(objectEvents(ev, 'detonated')).toHaveLength(1);
    expect(objectEvents(ev, 'destroyed')).toHaveLength(0);
    expect(world.findAllByClassname('tf_ammo_pack')).toHaveLength(1);
  });

  it('changing class removes the buildings without exploding; dying does not', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    eng.commitSuicide();
    run(world, TICKS(1));
    expect(sentry.removed).toBe(false);
    eng.desiredClass = TF_CLASS_SOLDIER;
    world.rules.respawnNow(eng);
    expect(eng.playerClass).toBe(TF_CLASS_SOLDIER);
    world.drainEvents();
    run(world, TICKS(0.2));
    expect(sentry.removed).toBe(true);
    const ev = world.drainEvents();
    expect(objectEvents(ev, 'removed')).toHaveLength(1);
    expect(
      world.findAllByClassname('tf_ammo_pack').filter((e) => e.owner === sentry.id),
    ).toHaveLength(0);
  });

  it('changing team detonates them', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    eng.requestTeam(TF_TEAM_BLUE);
    run(world, TICKS(0.2));
    expect(sentry.removed).toBe(true);
  });

  it('enemies destroying a building credit the kill feed with its icon', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    const soldier = addPlayer(world, 'sol', TF_TEAM_BLUE, TF_CLASS_SOLDIER);
    run(world, TICKS(12));
    world.drainEvents();
    const info = {
      ...createInfo(),
      attacker: soldier.id,
      inflictor: soldier.id,
      damage: 500,
      killIcon: 'tf_projectile_rocket',
    };
    world.applyDamage(sentry, info);
    const d = objectEvents(world.drainEvents(), 'destroyed');
    expect(d).toHaveLength(1);
    expect(d[0].attacker).toBe(soldier.id);
    expect(d[0].weapon).toBe('tf_projectile_rocket');
    expect(soldier.stats.destructions).toBe(1);
  });
});

describe('net state and determinism', () => {
  it('writes the sentry record (aim pose, ammo, level, owner)', () => {
    const { world, eng } = engineerArena();
    const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
    quickBuild(sentry);
    run(world, TICKS(1));
    expect(sentry.netSchema()).toBe(NET_SENTRYGUN);
    const rec = createNetRecord(NET_SENTRYGUN);
    sentry.writeNet(rec);
    expect(rec.objectType).toBe(OBJ_SENTRYGUN);
    expect(rec.level).toBe(1);
    expect(rec.shells).toBe(150);
    expect(rec.owner).toBe(eng.id);
    expect(Math.abs(rec.aimYaw as number)).toBeLessThanOrEqual(50.001);
    for (const f of NET_SENTRYGUN.fields) expect(rec[f.name], f.name).not.toBeUndefined();
  });

  it('the same inputs give the same game', () => {
    const trace = (): string => {
      const { world, eng } = engineerArena(11);
      const sentry = build(world, eng, OBJ_SENTRYGUN) as ObjectSentrygun;
      quickBuild(sentry);
      upgradeTo(world, sentry, eng, 3);
      place(world, eng, -200, 0, 0);
      const heavy = addPlayer(world, 'h', TF_TEAM_BLUE, TF_CLASS_HEAVYWEAPONS);
      run(world, TICKS(12));
      world.drainEvents();
      world.teleportEntity(
        heavy,
        vec3(sentry.origin.x + 600, sentry.origin.y + 150, 1),
        null,
        vec3(),
      );
      const out: string[] = [];
      for (let i = 0; i < TICKS(6); i++) {
        run(world, 1);
        out.push(
          `${heavy.health}|${sentry.curAngles.x.toFixed(4)}|${sentry.curAngles.y.toFixed(4)}|${sentry.ammoShells}|${sentry.ammoRockets}`,
        );
      }
      out.push(
        JSON.stringify(
          world.drainEvents().filter((e) => e.type === 'damage' || e.type === 'death'),
        ),
      );
      return out.join('\n');
    };
    expect(trace()).toBe(trace());
  });
});

function createInfo() {
  return {
    attacker: -1,
    inflictor: -1,
    weaponId: 0,
    weaponDefIndex: -1,
    killIcon: '',
    damage: 0,
    baseDamage: 0,
    damageForForce: 0,
    maxDamage: 0,
    damageType: 0,
    customKill: 0,
    critType: 0 as const,
    position: vec3(),
    force: vec3(),
    reportedPosition: vec3(),
    damagedOtherPlayers: 0,
    damageBonus: 0,
    directHitEntity: -1,
    hitGroup: 0,
    afterburn: 0,
  };
}
