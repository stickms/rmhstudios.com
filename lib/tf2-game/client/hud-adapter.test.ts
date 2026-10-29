import { describe, expect, it } from 'vitest';
import {
  TF_CLASS_ENGINEER,
  TF_CLASS_MEDIC,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../core/constants';
import { createNetRecord, NET_PLAYER, NET_RULES, NET_WEAPON, type NetRecord } from '../sim/net-schema';
import {
  NET_CONTROL_POINT,
  NET_FLAG,
  NET_OBJECTIVE,
  NET_ROUND_TIMER,
  NET_TRAIN_WATCHER,
} from '../sim/entities/net';
import { NET_SENTRYGUN, NET_TELEPORTER } from '../sim/buildings/net';
import { TF_COND } from '../sim/conditions';
import { GR_STATE_RND_RUNNING, GR_STATE_TEAM_WIN } from '../sim/rules';
import { TF_DEATH_DOMINATION } from '../sim/events';
import { TELEPORTER_STATE_READY as SIM_TELEPORTER_READY } from '../sim/buildings/teleporter';
import { AC_STATE_IDLE as SIM_AC_IDLE, AC_STATE_SPINNING as SIM_AC_SPINNING, AC_STATE_STARTFIRING as SIM_AC_START } from '../sim/weapons/constants';
import { TF_FLAGINFO_DROPPED as SIM_FLAG_DROPPED, TF_FLAGINFO_STOLEN as SIM_FLAG_STOLEN } from '../sim/entities/flag';
import {
  AC_STATE_IDLE,
  AC_STATE_SPINNING,
  AC_STATE_STARTFIRING,
  buildHudState,
  captionStyle,
  hudSourceFromSnapshot,
  HudEventLog,
  playerLookup,
  recordHasCond,
  TELEPORTER_STATE_READY,
  TF_FLAGINFO_DROPPED,
  TF_FLAGINFO_STOLEN,
  type HudEntity,
  type HudSource,
} from './hud-adapter';
import { formatClock, isLowHealth, maxBuffedHealth } from './hud-state';
import { createHudStore } from './hud-store';

const LOCAL = 3;

function playerRecord(fields: NetRecord): NetRecord {
  return { ...createNetRecord(NET_PLAYER), ...fields };
}
function weaponRecord(fields: NetRecord): NetRecord {
  return { ...createNetRecord(NET_WEAPON), ...fields };
}
function setCond(r: NetRecord, cond: number): void {
  const k = `cond${cond >>> 5}`;
  r[k] = ((r[k] as number) | (1 << (cond & 31))) >>> 0;
}

function source(over: Partial<HudSource> = {}): HudSource {
  return {
    curtime: 100,
    localEntity: LOCAL,
    localPlayer: null,
    localWeapons: [],
    rules: { ...createNetRecord(NET_RULES), state: GR_STATE_RND_RUNNING },
    entities: [],
    names: new Map([
      [LOCAL, { name: 'Me', bot: false }],
      [5, { name: 'Bot Heavy', bot: true }],
    ]),
    scores: new Map(),
    ...over,
  };
}

describe('mirrored constants', () => {
  it('match the simulation', () => {
    expect(TELEPORTER_STATE_READY).toBe(SIM_TELEPORTER_READY);
    expect(AC_STATE_IDLE).toBe(SIM_AC_IDLE);
    expect(AC_STATE_SPINNING).toBe(SIM_AC_SPINNING);
    expect(AC_STATE_STARTFIRING).toBe(SIM_AC_START);
    expect(TF_FLAGINFO_STOLEN).toBe(SIM_FLAG_STOLEN);
    expect(TF_FLAGINFO_DROPPED).toBe(SIM_FLAG_DROPPED);
  });
});

describe('local player', () => {
  it('reads health, overheal, clip and reserve for a Soldier', () => {
    const p = playerRecord({ team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, lifeState: 0, health: 250, maxHealth: 200, activeSlot: 0, ammo1: 16, ammo2: 32 });
    setCond(p, TF_COND.BURNING);
    const weapons = [
      { slot: 0, record: weaponRecord({ defindex: 18, slot: 0, clip: 3 }) },
      { slot: 1, record: weaponRecord({ defindex: 10, slot: 1, clip: 6 }) },
      { slot: 2, record: weaponRecord({ defindex: 6, slot: 2 }) },
    ];
    const state = buildHudState(source({ localPlayer: p, localWeapons: weapons }), new HudEventLog(), { now: 1 });
    const local = state.local!;
    expect(local.alive).toBe(true);
    expect(local.health).toBe(250);
    expect(local.maxBuffedHealth).toBe(300);
    expect(local.conditions.overhealed).toBe(true);
    expect(local.conditions.burning).toBe(true);
    expect(local.ammo).toMatchObject({ kind: 'clip', clip: 3, maxClip: 4, reserve: 16, maxReserve: 20 });
    expect(local.activeWeapon?.name).toBe('Rocket Launcher');
    expect(local.slots.map((s) => s.slot)).toEqual([0, 1, 2]);
    expect(local.engineer).toBeNull();
  });

  it('shows no ammo for melee and the cloak meter for a Spy', () => {
    const p = playerRecord({ team: TF_TEAM_BLUE, cls: TF_CLASS_SPY, lifeState: 0, health: 125, maxHealth: 125, activeSlot: 2, cloak: 40, disguiseTeam: TF_TEAM_RED, disguiseClass: 6 });
    setCond(p, TF_COND.DISGUISED);
    const weapons = [
      { slot: 2, record: weaponRecord({ defindex: 4, slot: 2 }) },
      { slot: 4, record: weaponRecord({ defindex: 30, slot: 4 }) },
    ];
    const local = buildHudState(source({ localPlayer: p, localWeapons: weapons }), new HudEventLog(), { now: 1 }).local!;
    expect(local.ammo.kind).toBe('none');
    expect(local.meters.cloak).toBeCloseTo(0.4, 6);
    expect(local.conditions).toMatchObject({ disguised: true, disguiseTeam: TF_TEAM_RED, disguiseClass: 6 });
  });

  it('reads the Medi Gun charge', () => {
    const p = playerRecord({ team: TF_TEAM_RED, cls: TF_CLASS_MEDIC, lifeState: 0, health: 150, maxHealth: 150, activeSlot: 1 });
    const weapons = [{ slot: 1, record: weaponRecord({ defindex: 29, slot: 1, aux0: 0.62, aux1: 1 }) }];
    const local = buildHudState(source({ localPlayer: p, localWeapons: weapons }), new HudEventLog(), { now: 1 }).local!;
    expect(local.meters.uber).toBeCloseTo(0.62, 6);
    expect(local.meters.uberDeployed).toBe(true);
  });

  it('builds the Engineer panel from owned buildings', () => {
    const p = playerRecord({ team: TF_TEAM_RED, cls: TF_CLASS_ENGINEER, lifeState: 0, health: 125, maxHealth: 125, ammo3: 130 });
    const sentry: HudEntity = {
      id: 40,
      type: 'sentrygun',
      record: { ...createNetRecord(NET_SENTRYGUN), owner: LOCAL, level: 2, health: 180, maxHealth: 180, shells: 120, maxShells: 200, kills: 4, upgradeMetal: 50, upgradeMetalRequired: 200 },
    };
    const exit: HudEntity = {
      id: 41,
      type: 'teleporter',
      record: { ...createNetRecord(NET_TELEPORTER), owner: LOCAL, objectMode: 1, level: 1, health: 150, maxHealth: 150, teleState: TELEPORTER_STATE_READY, matchId: 42 },
    };
    const someoneElses: HudEntity = { id: 43, type: 'dispenser', record: { owner: 7, level: 1 } };
    const local = buildHudState(source({ localPlayer: p, entities: [sentry, exit, someoneElses] }), new HudEventLog(), { now: 1 }).local!;
    const e = local.engineer!;
    expect(e.metal).toBe(130);
    expect(e.maxMetal).toBe(200);
    expect(e.sentry).toMatchObject({ exists: true, level: 2, shells: 120, kills: 4, upgradeMetal: 50 });
    expect(e.exit).toMatchObject({ exists: true, ready: true, linked: true });
    expect(e.dispenser.exists).toBe(false);
    expect(e.entrance.exists).toBe(false);
  });

  it('counts the respawn down while dead', () => {
    const p = playerRecord({ team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, lifeState: 2, health: 0, maxHealth: 200, respawnAt: 107.5 });
    const local = buildHudState(source({ localPlayer: p }), new HudEventLog(), { now: 1 }).local!;
    expect(local.alive).toBe(false);
    expect(local.respawnIn).toBeCloseTo(7.5, 6);
  });

  it('reads condition bits from the cond words', () => {
    const r = playerRecord({});
    setCond(r, TF_COND.CRITBOOSTED_FIRST_BLOOD);
    expect(recordHasCond(r, TF_COND.CRITBOOSTED_FIRST_BLOOD)).toBe(true);
    expect(recordHasCond(r, TF_COND.BURNING)).toBe(false);
  });
});

describe('match', () => {
  it('reads control points, the HUD timer and payload progress', () => {
    const obj: HudEntity = { id: 60, type: 'objective_resource', record: { ...createNetRecord(NET_OBJECTIVE), gameType: 'pl', timerInHud: 61 } };
    const timer: HudEntity = { id: 61, type: 'round_timer', record: { ...createNetRecord(NET_ROUND_TIMER), endTime: 160, showInHud: true, timerLength: 600 } };
    const cp: HudEntity = {
      id: 62,
      type: 'control_point',
      record: { ...createNetRecord(NET_CONTROL_POINT), visible: true, pointIndex: 0, printName: 'First', ownerTeam: TF_TEAM_RED, trackDistance: 0.3 },
    };
    const cp2: HudEntity = {
      id: 63,
      type: 'control_point',
      record: { ...createNetRecord(NET_CONTROL_POINT), visible: true, pointIndex: 1, ownerTeam: TF_TEAM_BLUE, trackDistance: 0.1 },
    };
    const watcher: HudEntity = { id: 64, type: 'train_watcher', record: { ...createNetRecord(NET_TRAIN_WATCHER), team: TF_TEAM_BLUE, progress: 0.45, numCappers: 2 } };
    const m = buildHudState(source({ entities: [obj, timer, cp, cp2, watcher] }), new HudEventLog(), { now: 1 }).match;
    expect(m.mode).toBe('pl');
    expect(m.timer).toMatchObject({ remaining: 60, setup: false, length: 600 });
    expect(m.controlPoints).toEqual([]);
    expect(m.payloads).toHaveLength(1);
    expect(m.payloads[0]).toMatchObject({ team: TF_TEAM_BLUE, progress: 0.45, pushers: 2, receding: false });
    expect(m.payloads[0].checkpoints).toEqual([
      { at: 0.3, captured: false },
      { at: 0.1, captured: true },
    ]);
  });

  it('reads 5CP capture progress and KOTH clocks', () => {
    const obj: HudEntity = { id: 60, type: 'objective_resource', record: { ...createNetRecord(NET_OBJECTIVE), gameType: 'koth', redKothTimer: 70, blueKothTimer: 71 } };
    const red: HudEntity = { id: 70, type: 'round_timer', record: { ...createNetRecord(NET_ROUND_TIMER), paused: true, timeRemaining: 95, kothTeam: TF_TEAM_RED } };
    const blue: HudEntity = { id: 71, type: 'round_timer', record: { ...createNetRecord(NET_ROUND_TIMER), endTime: 130, kothTeam: TF_TEAM_BLUE } };
    const cp: HudEntity = {
      id: 72,
      type: 'control_point',
      record: { ...createNetRecord(NET_CONTROL_POINT), visible: true, pointIndex: 0, cappingTeam: TF_TEAM_RED, capPercent: 0.25, numRed: 2, requiredRed: 1, trackDistance: -1 },
    };
    const m = buildHudState(source({ entities: [obj, red, blue, cp] }), new HudEventLog(), { now: 1 }).match;
    expect(m.koth).toEqual({ red: 95, blue: 30, active: TF_TEAM_BLUE });
    expect(m.controlPoints[0]).toMatchObject({ cappingTeam: TF_TEAM_RED, progress: 0.75, cappers: 2, trackPosition: null });
  });

  it('reads CTF flags and the win panel', () => {
    const flag: HudEntity = { id: 80, type: 'flag', record: { ...createNetRecord(NET_FLAG), team: TF_TEAM_RED, status: TF_FLAGINFO_STOLEN, carrier: LOCAL } };
    const flag2: HudEntity = { id: 81, type: 'flag', record: { ...createNetRecord(NET_FLAG), team: TF_TEAM_BLUE, status: TF_FLAGINFO_DROPPED, resetTime: 120 } };
    const heavy: HudEntity = { id: 5, type: 'player', record: playerRecord({ team: TF_TEAM_BLUE, cls: 6 }) };
    const rules = { ...createNetRecord(NET_RULES), state: GR_STATE_TEAM_WIN, winningTeam: TF_TEAM_BLUE, winReason: 3, blueScore: 1, stateEndsAt: 110 };
    const m = buildHudState(
      source({ rules, entities: [flag, flag2, heavy], scores: new Map([[5, { score: 12, kills: 6, deaths: 1, assists: 0, pingMs: 0 }]]) }),
      new HudEventLog(),
      { now: 1 },
    ).match;
    expect(m.flags[0]).toMatchObject({ team: TF_TEAM_RED, status: 'stolen', carrierName: 'Me', carriedByLocal: true });
    expect(m.flags[1]).toMatchObject({ status: 'dropped', returnsIn: 20 });
    expect(m.roundState).toBe('team_win');
    expect(m.win).toMatchObject({ team: TF_TEAM_BLUE, blueScore: 1, nextRoundIn: 10 });
    expect(m.win?.top[0]).toMatchObject({ name: 'Bot Heavy', score: 12 });
  });
});

describe('event log', () => {
  const heavy: HudEntity = { id: 5, type: 'player', record: playerRecord({ team: TF_TEAM_BLUE, cls: 6, health: 220, maxHealth: 300 }) };
  const me = playerRecord({ team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, lifeState: 0, health: 200, maxHealth: 200 });
  const src = source({ localPlayer: me, entities: [heavy] });
  const ctx = (now: number) => ({ now, localEntity: LOCAL, lookup: playerLookup(src) });
  const death = (victim: number, attacker: number, flags = 0) =>
    ({
      type: 'death',
      victim,
      attacker,
      assister: 0,
      inflictor: 0,
      weapon: 'tf_projectile_rocket',
      weaponDefIndex: 18,
      crit: 2,
      customKill: 0,
      damageType: 0,
      deathFlags: flags,
      victimClass: 6,
      gib: false,
      burning: false,
    }) as const;

  it('fills the kill feed, kill cue and dominations', () => {
    const log = new HudEventLog();
    log.onEvent(death(5, LOCAL, TF_DEATH_DOMINATION), ctx(10));
    const s = buildHudState(src, log, { now: 10.5 });
    expect(s.killfeed).toHaveLength(1);
    expect(s.killfeed[0]).toMatchObject({ attacker: { name: 'Me', team: TF_TEAM_RED }, victim: { name: 'Bot Heavy' }, crit: 2, domination: true, involvesLocal: true, weaponName: 'Rocket Launcher' });
    expect(s.cues.killSeq).toBe(1);
    expect(s.scoreboard.find((r) => r.id === 5)?.dominated).toBe(true);
    // Local entries last 10 s, others 6 s.
    expect(buildHudState(src, log, { now: 19 }).killfeed).toHaveLength(1);
    expect(buildHudState(src, log, { now: 21 }).killfeed).toHaveLength(0);
  });

  it('opens the freeze cam on the local death and closes it on respawn', () => {
    const log = new HudEventLog();
    log.onEvent(death(LOCAL, 5, TF_DEATH_DOMINATION), ctx(20));
    let s = buildHudState(src, log, { now: 20.1 });
    expect(s.freezecam).toMatchObject({ killerName: 'Bot Heavy', killerCls: 6, killerHealth: 220, kind: 'player', dominated: true });
    expect(s.scoreboard.find((r) => r.id === 5)?.nemesis).toBe(true);
    log.onEvent({ type: 'spawn', player: LOCAL, team: TF_TEAM_RED, cls: 3 }, ctx(25));
    s = buildHudState(src, log, { now: 25 });
    expect(s.freezecam).toBeNull();
  });

  it('records damage numbers and hit cues for the local attacker only', () => {
    const log = new HudEventLog();
    const hit = { type: 'damage', victim: 5, attacker: LOCAL, amount: 105.4, health: 115, crit: 0, customKill: 0, pos: { x: 1, y: 2, z: 3 } } as const;
    log.onEvent(hit, ctx(30));
    log.onEvent({ ...hit, attacker: 5, victim: LOCAL }, ctx(30));
    const s = buildHudState(src, log, { now: 30.2 });
    expect(s.damageNumbers).toHaveLength(1);
    expect(s.damageNumbers[0]).toMatchObject({ amount: 105, world: { x: 1, y: 2, z: 3 } });
    expect(s.cues.hitSeq).toBe(1);
    expect(buildHudState(src, log, { now: 32 }).damageNumbers).toHaveLength(0);
  });

  it('keeps chat lines from the hub', () => {
    const log = new HudEventLog();
    log.onChat({ from: 5, name: 'Bot Heavy', text: 'hi', teamOnly: true, team: TF_TEAM_BLUE, at: 0 }, 40);
    const s = buildHudState(src, log, { now: 41 });
    expect(s.chat[0]).toMatchObject({ name: 'Bot Heavy', text: 'hi', teamOnly: true, team: TF_TEAM_BLUE });
  });

  it('reads caption colour and sfx tags', () => {
    expect(captionStyle('<clr:255,176,0><sfx>[Explosion]')).toEqual({ color: 'rgb(255 176 0)', sfx: true });
    expect(captionStyle('Hello')).toEqual({ color: null, sfx: false });
  });
});

describe('snapshot source and store', () => {
  it('adapts the snapshot client shape', () => {
    const fake = {
      localEntity: LOCAL,
      rules: () => null,
      localPlayer: () => playerRecord({ team: TF_TEAM_RED }),
      localWeapons: () => [],
      forEachEntity: (fn: (s: { key: number; schema: { type: string } }, r: NetRecord) => void) => {
        fn({ key: 5, schema: { type: 'player' } }, playerRecord({ team: TF_TEAM_BLUE }));
      },
      roster: new Map([[5, { name: 'x', bot: true }]]),
      scores: new Map(),
      hello: { map: 'ctf_2fort' },
    };
    const s = hudSourceFromSnapshot(fake, 12);
    expect(s.entities).toEqual([{ id: 5, type: 'player', record: expect.any(Object) }]);
    expect(s.map).toBe('ctf_2fort');
  });

  it('throttles publishes and forwards commands', () => {
    let t = 0;
    const store = createHudStore({ maxHz: 10, clock: () => t });
    let n = 0;
    store.subscribe(() => n++);
    const st = store.getSnapshot();
    store.publish({ ...st, fps: 1 });
    t = 50;
    store.publish({ ...st, fps: 2 });
    expect(store.getSnapshot().fps).toBe(1);
    t = 120;
    store.publish({ ...st, fps: 3 });
    expect(store.getSnapshot().fps).toBe(3);
    expect(n).toBe(2);
    const cmds: unknown[] = [];
    store.onCommand((c) => cmds.push(c));
    store.send({ kind: 'class', cls: 'medic' });
    expect(cmds).toEqual([{ kind: 'class', cls: 'medic' }]);
  });

  it('formats clocks and health thresholds', () => {
    expect(formatClock(125.2)).toBe('2:06');
    expect(formatClock(0)).toBe('0:00');
    expect(maxBuffedHealth(125)).toBe(185);
    expect(maxBuffedHealth(300)).toBe(450);
    expect(isLowHealth(60, 125)).toBe(true);
    expect(isLowHealth(70, 125)).toBe(false);
  });
});
