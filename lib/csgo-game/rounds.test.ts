/**
 * Bomb defusal and deathmatch on the shared round machine: the freeze time, buying (validated on the
 * host), the live round, the round end and the next round; the economy (round rewards, the loss bonus
 * ladder, plant and defuse bonuses, kill rewards); the C4 (plant timing inside a bomb target, the
 * defuse with and without a kit, interruptions, the explosion); the halftime side switch; deathmatch's
 * respawns and spawn protection.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { IN_ATTACK, IN_FORWARD, IN_USE, TICK_INTERVAL } from '../tf2-game/core/constants';
import { createDamageInfo, DMG_BULLET } from '../tf2-game/sim/damage';
import { GR_STATE_PREROUND, GR_STATE_RND_RUNNING, GR_STATE_TEAM_WIN } from '../tf2-game/sim/rules';
import { SLOT_PDA2 } from '../tf2-game/sim/weapon-api';
import { cmdFor, csTestWorld, setupCs, SITE_A } from './__fixtures__/cs-world';
import {
  C4_ARM_TIME,
  CS_TEAM_CT,
  CS_TEAM_T,
  CS_WIN_BOMB_DEFUSED,
  CS_WIN_CTS_WIN,
  CS_WIN_TARGET_BOMBED,
  CS_WIN_TARGET_SAVED,
  CS_WIN_TERRORISTS_WIN,
} from './constants';
import { lossBonus } from './economy';
import type { CsPlayer } from './player';
import type { CsSettings } from './rules';
import { CsC4, PlantedC4 } from './weapons/c4';
import type { CsWorld } from './world';

beforeAll(setupCs);

let cmdNo = 0;

function teams(w: CsWorld, t: number, ct: number): { ts: CsPlayer[]; cts: CsPlayer[] } {
  const ts: CsPlayer[] = [];
  const cts: CsPlayer[] = [];
  for (let i = 0; i < t; i++) {
    const p = w.addPlayer(`t${i}`) as CsPlayer;
    p.requestTeam(CS_TEAM_T);
    p.requestClass(1);
    ts.push(p);
  }
  for (let i = 0; i < ct; i++) {
    const p = w.addPlayer(`ct${i}`) as CsPlayer;
    p.requestTeam(CS_TEAM_CT);
    p.requestClass(1);
    cts.push(p);
  }
  return { ts, cts };
}

/** Steps until `cond` (or `max` ticks); every player idles unless `cmd` says otherwise. */
function stepUntil(
  w: CsWorld,
  cond: () => boolean,
  max = 66 * 60,
  cmd?: (p: CsPlayer) => Parameters<typeof cmdFor>[2] | null,
): number {
  for (let i = 0; i < max; i++) {
    if (cond()) return i;
    // Everyone gets a command each tick (idle by default: the world would repeat the last one).
    w.forEachPlayer((p) => {
      w.queueCommand(p.id, cmdFor(w, ++cmdNo, cmd?.(p as CsPlayer) ?? {}));
    });
    w.step();
    w.drainEvents();
  }
  return -1;
}

const live = (w: CsWorld) => () => w.rules.state === GR_STATE_RND_RUNNING;

function worldWith(settings: Partial<CsSettings> = {}): CsWorld {
  return csTestWorld({ settings: { freezeTime: 2, roundRestartDelay: 1, ...settings } });
}

describe('round flow and economy', () => {
  it('freeze → buy → live → end → next round, with the round rewards and the loss bonus ladder', () => {
    const w = worldWith({ buyTime: 3 });
    const { ts, cts } = teams(w, 2, 2);
    expect(stepUntil(w, () => w.rules.state === GR_STATE_PREROUND)).toBeGreaterThanOrEqual(0);
    // Freeze time: frozen, can buy (start money 800), cannot shoot.
    expect(ts[0].money).toBe(800);
    const z = { ...ts[0].origin };
    stepUntil(
      w,
      () => false,
      30,
      () => ({ forwardMove: 450, buttons: IN_FORWARD }),
    );
    expect(Math.hypot(ts[0].origin.x - z.x, ts[0].origin.y - z.y)).toBeLessThan(1);
    expect(ts[0].cannotAttack()).toBe(true);
    expect(ts[0].buy('vest')).toBeNull();
    expect(ts[0].money).toBe(150);
    expect(ts[0].armor).toBe(100);
    // Live: the buy time runs 3 s past the freeze.
    expect(stepUntil(w, live(w))).toBeGreaterThanOrEqual(0);
    expect(ts[1].buy('hegrenade')).toBeNull();
    stepUntil(w, () => false, Math.ceil(3.1 / TICK_INTERVAL));
    expect(ts[1].buy('flashbang')).toBe('the buy time has expired');
    // The Counter-Terrorists die: the Terrorists win by elimination.
    for (const p of cts) p.commitSuicide();
    w.step();
    expect(w.rules.state).toBe(GR_STATE_TEAM_WIN);
    expect(w.csRules.roundWinner).toBe(CS_TEAM_T);
    expect(w.csRules.roundWinReason).toBe(CS_WIN_TERRORISTS_WIN);
    expect(w.rules.teamScores[CS_TEAM_T]).toBe(1);
    expect(ts[0].money).toBe(150 + 3250);
    expect(cts[0].money).toBe(800 + 1400);
    // The next round: everyone back, the dead with the default loadout.
    expect(stepUntil(w, () => w.rules.state === GR_STATE_PREROUND)).toBeGreaterThanOrEqual(0);
    expect(cts.every((p) => p.alive)).toBe(true);
    expect(ts[0].armor).toBe(100); // survivors keep what they had
    expect(cts[0].weapons[1]?.classname).toMatch(/hkp2000|usp/);
    // Four more CT losses walk the ladder: 1900, 2400, 2900, 3400 (capped).
    const got: number[] = [];
    let last = cts[0].money;
    for (let r = 0; r < 4; r++) {
      stepUntil(w, live(w));
      for (const p of cts) p.commitSuicide();
      w.step();
      got.push(cts[0].money - last);
      last = cts[0].money;
      stepUntil(w, () => w.rules.state === GR_STATE_PREROUND);
    }
    expect(got).toEqual([1900, 2400, 2900, 3400]);
    expect(w.csRules.lossStreak[CS_TEAM_CT]).toBe(5);
    expect(lossBonus(1)).toBe(1400);
    expect(lossBonus(9)).toBe(3400);
    // A CT win takes one step off their streak (2019 rule): the next loss pays 2900.
    stepUntil(w, live(w));
    for (const p of ts) p.commitSuicide();
    w.step();
    expect(w.csRules.roundWinReason).toBe(CS_WIN_CTS_WIN);
    expect(w.csRules.lossStreak[CS_TEAM_CT]).toBe(4);
  });

  it('time runs out: the Counter-Terrorists win, and surviving Terrorists get no loss bonus', () => {
    const w = worldWith({ roundTime: 0.05 });
    const { ts, cts } = teams(w, 2, 1);
    stepUntil(w, live(w));
    ts[1].commitSuicide();
    const m0 = ts[0].money;
    const m1 = ts[1].money;
    stepUntil(w, () => w.rules.state === GR_STATE_TEAM_WIN);
    expect(w.csRules.roundWinReason).toBe(CS_WIN_TARGET_SAVED);
    expect(w.csRules.roundWinner).toBe(CS_TEAM_CT);
    expect(cts[0].money).toBe(800 + 3250);
    expect(ts[0].money).toBe(m0); // alive at the time-out
    expect(ts[1].money).toBe(m1 + 1400);
  });

  it('kill rewards come from the weapon data (rifle $300, knife $1500); a teamkill costs $300', () => {
    const w = worldWith({ freezeTime: 0 });
    const { ts, cts } = teams(w, 2, 2);
    stepUntil(w, live(w));
    const kill = (victim: CsPlayer, attacker: CsPlayer, weapon: string) => {
      const info = createDamageInfo();
      info.attacker = attacker.id;
      info.inflictor = attacker.id;
      info.weaponDefIndex = weapon === 'knife' ? 42 : 7;
      info.damage = 500;
      info.damageType = DMG_BULLET;
      w.applyDamage(victim, info);
    };
    const m = ts[0].money;
    kill(cts[0], ts[0], 'ak47');
    expect(ts[0].money).toBe(m + 300);
    kill(cts[1], ts[1], 'knife');
    // The round ended (CTs dead) — the knife kill paid 1500 before the round reward.
    expect(ts[1].money).toBe(800 + 1500 + 3250);
    const w2 = worldWith({ freezeTime: 0 });
    w2.options.friendlyFire = true;
    const t2 = teams(w2, 2, 1);
    stepUntil(w2, live(w2));
    const info = createDamageInfo();
    info.attacker = t2.ts[0].id;
    info.inflictor = t2.ts[0].id;
    info.weaponDefIndex = 7;
    info.damage = 1000;
    info.damageType = DMG_BULLET;
    w2.applyDamage(t2.ts[1], info);
    expect(t2.ts[1].alive).toBe(false);
    expect(t2.ts[0].money).toBe(800 - 300);
  });

  it('friendly fire is off by default', () => {
    const w = worldWith({ freezeTime: 0 });
    const { ts } = teams(w, 2, 1);
    stepUntil(w, live(w));
    const info = createDamageInfo();
    info.attacker = ts[0].id;
    info.inflictor = ts[0].id;
    info.weaponDefIndex = 7;
    info.damage = 50;
    info.damageType = DMG_BULLET;
    expect(w.applyDamage(ts[1], info)).toBe(0);
    expect(ts[1].health).toBe(100);
  });

  it('halftime switches sides after half the rounds, resets the money and swaps the scores; MR ends the match', () => {
    const w = worldWith({ maxRounds: 4 });
    const { ts, cts } = teams(w, 1, 1);
    const winRound = (loser: CsPlayer) => {
      stepUntil(w, live(w));
      loser.commitSuicide();
      w.step();
      stepUntil(w, () => w.rules.state === GR_STATE_PREROUND);
    };
    winRound(cts[0]);
    winRound(cts[0]);
    // Round 3: sides switched — the first T is a CT now, with $800 and the default pistol.
    expect(ts[0].team).toBe(CS_TEAM_CT);
    expect(cts[0].team).toBe(CS_TEAM_T);
    expect(ts[0].money).toBe(800);
    expect(w.rules.teamScores[CS_TEAM_CT]).toBe(2);
    expect(w.rules.teamScores[CS_TEAM_T]).toBe(0);
    expect(w.csRules.halftimeDone).toBe(true);
    // One more win for the same player (now a CT) ends the match at 3 (first to maxRounds / 2 + 1).
    stepUntil(w, live(w));
    cts[0].commitSuicide();
    w.step();
    expect(w.rules.gameOver).toBe(true);
    // The next round starts a new match.
    stepUntil(w, () => w.rules.state === GR_STATE_PREROUND);
    expect(w.rules.teamScores[CS_TEAM_T] + w.rules.teamScores[CS_TEAM_CT]).toBe(0);
    expect(ts[0].money).toBe(800);
  });
});

describe('buying', () => {
  it('validates zone, time, team, money and carry limits', () => {
    const w = worldWith({ freezeTime: 10 });
    const { ts, cts } = teams(w, 1, 1);
    stepUntil(w, () => w.rules.state === GR_STATE_PREROUND);
    const t = ts[0];
    const ct = cts[0];
    expect(t.inBuyZone()).toBe(true);
    expect(t.buy('m4a1')).toMatch(/not available to your team/);
    expect(t.buy('ak47')).toMatch(/insufficient funds/);
    expect(t.buy('defuser')).toMatch(/only Counter-Terrorists/);
    expect(t.buy('nonsense')).toMatch(/unknown item/);
    t.money = 16000;
    expect(t.buy('ak47')).toBeNull();
    expect(t.weapons[0]?.classname).toBe('weapon_ak47');
    expect(t.buy('ak47')).toMatch(/already have/);
    expect(t.buy('vesthelm')).toBeNull();
    expect(t.buy('vest')).toMatch(/already have armor/);
    // Grenades: two flashbangs, one HE, four in all, one fire grenade.
    expect(t.buy('flashbang')).toBeNull();
    expect(t.buy('flashbang')).toBeNull();
    expect(t.buy('flashbang')).toMatch(/cannot carry/);
    expect(t.buy('hegrenade')).toBeNull();
    expect(t.buy('molotov')).toBeNull();
    expect(t.buy('smokegrenade')).toMatch(/cannot carry/);
    ct.money = 5000;
    expect(ct.buy('incgrenade')).toBeNull();
    expect(ct.buy('defuser')).toBeNull();
    expect(ct.defuser).toBe(true);
    expect(ct.buy('defuser')).toMatch(/already have/);
    // Out of the buy zone.
    w.teleportEntity(ct, { x: 0, y: 0, z: 100 }, null, null);
    expect(ct.buy('vest')).toMatch(/not in a buy zone/);
  });
});

describe('the bomb', () => {
  function bombRound(settings: Partial<CsSettings> = {}) {
    const w = worldWith({ freezeTime: 0, ...settings });
    const { ts, cts } = teams(w, 1, 1);
    stepUntil(w, live(w));
    stepUntil(w, () => ts[0].hasC4(), 10);
    expect(ts[0].hasC4()).toBe(true);
    return { w, t: ts[0], ct: cts[0] };
  }

  const plantCmd = () => ({
    buttons: IN_ATTACK,
    weaponSelect: SLOT_PDA2 + 1,
    viewAngles: { x: 60, y: 0, z: 0 },
  });

  it('plants only inside a bomb target, after the arming time, cancelled by moving', () => {
    const { w, t } = bombRound();
    // Outside: nothing happens.
    stepUntil(
      w,
      () => false,
      Math.ceil(4 / TICK_INTERVAL),
      (p) => (p === t ? plantCmd() : null),
    );
    expect(w.csRules.plantedC4).toBeNull();
    w.teleportEntity(t, { x: SITE_A.x, y: SITE_A.y, z: 0.03125 }, null, { x: 0, y: 0, z: 0 });
    expect(t.inBombTarget()).toBe(true);
    // Moving cancels.
    stepUntil(
      w,
      () => false,
      Math.ceil(1.5 / TICK_INTERVAL) + 70,
      (p) => (p === t ? plantCmd() : null),
    );
    const c4 = t.weapons[SLOT_PDA2] as CsC4;
    expect(c4.planting).toBe(true);
    stepUntil(
      w,
      () => false,
      2,
      (p) => (p === t ? { ...plantCmd(), forwardMove: 450 } : null),
    );
    expect(c4.planting).toBe(false);
    // Hold still: planted C4_ARM_TIME after the arming starts (not before).
    stepUntil(
      w,
      () => c4.planting,
      66 * 2,
      (p) => (p === t ? plantCmd() : null),
    );
    const start = w.curtime;
    const ticks = stepUntil(
      w,
      () => w.csRules.plantedC4 !== null,
      66 * 6,
      (p) => (p === t ? plantCmd() : null),
    );
    expect(ticks).toBeGreaterThan(0);
    const took = w.curtime - start;
    expect(took).toBeGreaterThanOrEqual(C4_ARM_TIME - 2 * TICK_INTERVAL);
    expect(took).toBeLessThan(C4_ARM_TIME + 2 * TICK_INTERVAL);
    expect(t.hasC4()).toBe(false);
    expect(t.money).toBe(800 + 300);
    expect(w.bombSiteAt(w.csRules.plantedC4!.origin)).toBe('A');
  });

  function planted(settings: Partial<CsSettings> = {}) {
    const r = bombRound(settings);
    const { w, t } = r;
    w.teleportEntity(t, { x: SITE_A.x, y: SITE_A.y, z: 0.03125 }, null, { x: 0, y: 0, z: 0 });
    stepUntil(
      w,
      () => w.csRules.plantedC4 !== null,
      66 * 6,
      (p) => (p === t ? plantCmd() : null),
    );
    return { ...r, c4: w.csRules.plantedC4 as PlantedC4 };
  }

  /** The CT's command at the bomb: looking down at it, holding +use. */
  const useCmd = (w: CsWorld, ct: CsPlayer, c4: PlantedC4, use = true) => {
    const e = ct.eyePosition({ x: 0, y: 0, z: 0 });
    const pitch =
      (Math.atan2(e.z - c4.origin.z, Math.hypot(c4.origin.x - e.x, c4.origin.y - e.y)) * 180) /
      Math.PI;
    const yaw = (Math.atan2(c4.origin.y - e.y, c4.origin.x - e.x) * 180) / Math.PI;
    void w;
    return { buttons: use ? IN_USE : 0, viewAngles: { x: pitch, y: yaw, z: 0 } };
  };

  it('defuses in 10 s without a kit, 5 s with one; letting go interrupts', () => {
    for (const kit of [false, true]) {
      const { w, ct, c4 } = planted();
      ct.defuser = kit;
      w.teleportEntity(ct, { x: c4.origin.x + 30, y: c4.origin.y, z: 0.03125 }, null, {
        x: 0,
        y: 0,
        z: 0,
      });
      // Start, let go after 1 s: interrupted.
      stepUntil(
        w,
        () => false,
        66,
        (p) => (p === ct ? useCmd(w, ct, c4) : null),
      );
      expect(c4.defuser).toBe(ct.id);
      stepUntil(
        w,
        () => false,
        2,
        (p) => (p === ct ? useCmd(w, ct, c4, false) : null),
      );
      expect(c4.defuser).toBe(-1);
      const start = w.curtime;
      stepUntil(
        w,
        () => c4.defused,
        66 * 12,
        (p) => (p === ct ? useCmd(w, ct, c4) : null),
      );
      expect(c4.defused).toBe(true);
      expect(w.curtime - start).toBeCloseTo(kit ? 5 : 10, 1);
      expect(w.csRules.roundWinReason).toBe(CS_WIN_BOMB_DEFUSED);
      expect(ct.money).toBe(800 + 300 + 3500);
    }
  });

  it('explodes after mp_c4timer: the Terrorists win, nearby players die', () => {
    const { w, ct, c4 } = planted({ c4Timer: 10 });
    w.teleportEntity(ct, { x: c4.origin.x + 200, y: c4.origin.y, z: 0.03125 }, null, null);
    const ticks = stepUntil(w, () => c4.exploded, 66 * 12);
    expect(ticks * TICK_INTERVAL).toBeGreaterThan(9.5);
    expect(w.csRules.roundWinReason).toBe(CS_WIN_TARGET_BOMBED);
    expect(ct.alive).toBe(false);
  });

  it('all Terrorists dead does not end a round with the bomb down', () => {
    const { w, t, c4 } = planted({ c4Timer: 10 });
    t.commitSuicide();
    w.step();
    expect(w.rules.state).toBe(GR_STATE_RND_RUNNING);
    expect(c4.removed).toBe(false);
  });
});

describe('deathmatch', () => {
  it('respawns after ~2 s with spawn protection that firing ends', () => {
    const w = csTestWorld({ mode: 'dm' });
    const { ts, cts } = teams(w, 1, 1);
    stepUntil(w, live(w));
    expect(w.csRules.teammatesAreEnemies).toBe(true);
    const p = ts[0];
    expect(p.weapons[0]?.classname).toBe('weapon_ak47');
    expect(p.armor).toBe(100);
    p.commitSuicide();
    const ticks = stepUntil(w, () => p.alive, 66 * 5);
    expect(ticks * TICK_INTERVAL).toBeGreaterThan(1.8);
    expect(ticks * TICK_INTERVAL).toBeLessThan(2.3);
    expect(w.curtime < p.immuneUntil).toBe(true);
    p.armor = 0;
    const info = createDamageInfo();
    info.attacker = cts[0].id;
    info.inflictor = cts[0].id;
    info.damage = 50;
    info.damageType = DMG_BULLET;
    expect(w.applyDamage(p, info)).toBe(0);
    p.onFiredWeapon();
    expect(w.applyDamage(p, info)).toBe(50);
    // Free buys.
    expect(p.buy('awp')).toBeNull();
    expect(p.money).toBe(800);
  });

  it('a 10-minute match by default; kills score points', () => {
    const w = csTestWorld({ mode: 'dm' });
    teams(w, 1, 1);
    stepUntil(w, live(w));
    expect(w.csRules.matchEndsAt - w.curtime).toBeCloseTo(600, 0);
  });
});
