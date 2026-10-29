/**
 * Game modes on the real maps (needs a TF2 install at TF2_ROOT; skipped
 * without one). Scripted players are teleported onto capture areas, flags
 * and capture zones, and the round has to end the way the map's logic says:
 * dustbowl's three stages in order, payload carts pushed to the end (and
 * rolled back when left), three flag captures on 2fort, KOTH team timers
 * running out, 5CP pushed point by point.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTENTS_BLUETEAM,
  CONTENTS_REDTEAM,
  MASK_PLAYERSOLID,
  TF_CLASS_SCOUT,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  VEC_HULL_MAX,
  VEC_HULL_MIN,
} from '../../core/constants';
import { emptyTrace } from '../../core/types';
import { COLLISION_GROUP_PLAYER_MOVEMENT } from '../entity';
import type { Player } from '../player';
import {
  GR_STATE_RND_RUNNING,
  GR_STATE_TEAM_WIN,
  WINREASON_ALL_POINTS_CAPTURED,
  WINREASON_FLAG_CAPTURE_LIMIT,
} from '../rules';
import type { GameWorld } from '../world';
import {
  CaptureFlag,
  CaptureZone,
  FuncDoor,
  objectives,
  teamMayCapturePoint,
  TS_AT_BOTTOM,
  TS_AT_TOP,
  TS_GOING_UP,
  type TeamControlPoint,
} from '../entities';
import {
  addPlayers,
  areaForPoint,
  floorAt,
  makeWorld,
  run,
  runUntil,
  spotInside,
  teleport,
  TF2_ROOT,
  worldBounds,
} from './__fixtures__/map-match';

const has = (map: string): boolean =>
  !!TF2_ROOT && existsSync(path.join(TF2_ROOT, 'tf', 'maps', `${map}.bsp`));
const MAPS = [
  ['ctf_2fort', 'ctf'],
  ['ctf_turbine', 'ctf'],
  ['cp_dustbowl', 'cp_ad'],
  ['cp_granary', 'cp'],
  ['cp_badlands', 'cp'],
  ['koth_viaduct', 'koth'],
  ['koth_harvest_final', 'koth'],
  ['pl_badwater', 'pl'],
  ['pl_upward', 'pl'],
] as const;
const haveAll = MAPS.every(([m]) => has(m));

const waitRunning = (w: GameWorld): boolean =>
  runUntil(w, () => w.rules.state === GR_STATE_RND_RUNNING && !w.rules.inSetup, 200);
const won = (w: GameWorld): boolean => w.rules.state === GR_STATE_TEAM_WIN;

/** Puts every living attacker inside the point's capture area and waits for the point to flip. */
function capture(
  w: GameWorld,
  point: TeamControlPoint,
  team: number,
  players: readonly Player[],
): boolean {
  const o = objectives(w);
  const area = areaForPoint(w, point.targetname, o.areas);
  if (!area) return false;
  return runUntil(
    w,
    () => point.ownerTeam === team || won(w),
    90,
    () => {
      if (w.tickCount % 10 !== 0) return;
      for (const [k, p] of players.entries()) {
        if (!p.alive || area.isTouching(p)) continue;
        const spot = spotInside(w, area, null, k);
        if (spot) teleport(w, p, spot);
      }
    },
  );
}

/** Captures the points `team` may capture, one at a time, until the round is won. */
function captureAll(w: GameWorld, team: number, players: readonly Player[], order: string[]): void {
  const o = objectives(w);
  for (let guard = 0; guard < 12 && !won(w); guard++) {
    const next = o.sorted.find(
      (p) =>
        !p.removed &&
        p.ownerTeam !== team &&
        !p.locked &&
        teamMayCapturePoint(w, team, p.pointIndex),
    );
    if (!next) break;
    expect(capture(w, next, team, players)).toBe(true);
    order.push(next.targetname);
  }
}

/** Pushes a payload cart by keeping the pushers inside the cart's capture area. */
function pushCart(
  w: GameWorld,
  pushers: readonly Player[],
  maxSeconds: number,
  until: () => boolean,
): boolean {
  const o = objectives(w);
  const watcher = o.watchers[0];
  const train = watcher.train!;
  const area = o.areas.find((a) => a.parent === train.id)!;
  let i = 0;
  return runUntil(w, until, maxSeconds, () => {
    if (i++ % 20 !== 0) return;
    for (const [k, p] of pushers.entries()) {
      if (!p.alive || area.isTouching(p)) continue;
      const spot = spotInside(w, area, train, k);
      if (spot) teleport(w, p, spot);
    }
  });
}

describe.skipIf(!haveAll)('game mode detection', () => {
  it.each(MAPS)('%s is %s', (map, mode) => {
    const w = makeWorld(map);
    expect(w.rules.mode?.name).toBe(mode);
  });

  it.skipIf(!has('arena_well'))('arena_well is arena', () => {
    expect(makeWorld('arena_well').rules.mode?.name).toBe('arena');
  });
});

describe.skipIf(!has('cp_dustbowl'))('cp_dustbowl (attack/defend, three stages)', () => {
  it('opens the stage gates when setup ends, plays the stages in order, adds time per capture and resets cleanly', () => {
    const w = makeWorld('cp_dustbowl');
    const blu = addPlayers(w, TF_TEAM_BLUE, [TF_CLASS_SOLDIER, TF_CLASS_SOLDIER, TF_CLASS_SOLDIER]);
    addPlayers(w, TF_TEAM_RED, [TF_CLASS_SOLDIER]);
    const o = objectives(w);
    const gates = (): FuncDoor[] =>
      w.findAllByName('gate_1*').filter((e): e is FuncDoor => e instanceof FuncDoor);
    const firstGateIds = gates().map((d) => d.id);

    run(w, 5);
    expect(w.rules.inSetup).toBe(true);
    expect(gates().length).toBeGreaterThan(0);
    for (const d of gates()) expect(d.toggleState).toBe(TS_AT_BOTTOM);

    expect(waitRunning(w)).toBe(true);
    run(w, 6);
    for (const d of gates()) expect([TS_AT_TOP, TS_GOING_UP]).toContain(d.toggleState);

    const stages: string[][] = [];
    const resets: boolean[] = [];
    for (let stage = 0; stage < 3; stage++) {
      const round = o.master()!.getCurrentRound()!;
      expect(round.targetname).toBe(`round_${stage + 1}`);
      const points = round.controlPoints.slice().sort((a, b) => a.pointIndex - b.pointIndex);
      const names: string[] = [];
      for (const p of points) {
        const timer = o.timers.find((t) => !t.removed && t.showInHud && !t.disabled) ?? o.timers[0];
        const before = timer.getTimeRemaining();
        expect(capture(w, p, TF_TEAM_BLUE, blu)).toBe(true);
        names.push(p.targetname);
        // The map adds the time through a relay a moment after the capture.
        if (!won(w)) {
          run(w, 2);
          expect(timer.getTimeRemaining()).toBeGreaterThan(before);
        }
      }
      expect(won(w)).toBe(true);
      expect(w.rules.winningTeam).toBe(TF_TEAM_BLUE);
      stages.push(names);
      resets.push(w.rules.forceMapReset);
      if (stage < 2) {
        expect(waitRunning(w)).toBe(true);
        run(w, 2);
      }
    }
    // Every stage's points fall in index order (the second needs the first).
    for (const names of stages) expect(names.length).toBe(2);
    expect(resets).toEqual([false, false, true]);

    // The full reset recreates the map entities and gives RED its points back.
    expect(runUntil(w, () => w.rules.state === GR_STATE_RND_RUNNING || w.rules.inSetup, 30)).toBe(
      true,
    );
    run(w, 1);
    expect(gates().map((d) => d.id)).not.toEqual(firstGateIds);
    for (const d of gates()) expect(d.toggleState).toBe(TS_AT_BOTTOM);
    expect(o.master()!.getCurrentRound()!.targetname).toBe('round_1');
    for (const p of o.sorted) expect(p.ownerTeam).toBe(TF_TEAM_RED);
  });

  it('blocks only the enemy team with the respawn room visualizers', () => {
    const w = makeWorld('cp_dustbowl');
    addPlayers(w, TF_TEAM_RED, [TF_CLASS_SOLDIER]);
    run(w, 0.5);
    const tr = emptyTrace();
    const filter = w.entityFilter(null, COLLISION_GROUP_PLAYER_MOVEMENT);
    const zero = { x: 0, y: 0, z: 0 };
    let checked = 0;
    w.forEachEntity((e) => {
      if (
        e.classname !== 'func_respawnroomvisualizer' ||
        (e.team !== TF_TEAM_RED && e.team !== TF_TEAM_BLUE)
      )
        return;
      const { mins, maxs } = worldBounds(e);
      const c = { x: (mins.x + maxs.x) / 2, y: (mins.y + maxs.y) / 2, z: mins.z + 40 };
      const sx = maxs.x - mins.x;
      const sy = maxs.y - mins.y;
      const a = { ...c };
      const b = { ...c };
      if (sx < sy) {
        a.x = mins.x - 8;
        b.x = maxs.x + 8;
      } else {
        a.y = mins.y - 8;
        b.y = maxs.y + 8;
      }
      const enemyMask =
        MASK_PLAYERSOLID | (e.team === TF_TEAM_RED ? CONTENTS_REDTEAM : CONTENTS_BLUETEAM);
      const friendMask =
        MASK_PLAYERSOLID | (e.team === TF_TEAM_RED ? CONTENTS_BLUETEAM : CONTENTS_REDTEAM);
      w.traceHull(a, b, zero, zero, friendMask, filter, tr);
      expect(tr.entity).not.toBe(e.id);
      if (tr.fraction < 1) return; // world in the way: not a clean doorway
      w.traceHull(a, b, zero, zero, enemyMask, filter, tr);
      expect(tr.entity).toBe(e.id);
      checked++;
    });
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it('moves doors with the pusher and never leaves a player inside solid', () => {
    const w = makeWorld('cp_dustbowl');
    const [red] = addPlayers(w, TF_TEAM_RED, [TF_CLASS_SOLDIER]);
    addPlayers(w, TF_TEAM_BLUE, [TF_CLASS_SOLDIER]);
    expect(waitRunning(w)).toBe(true);
    run(w, 8);
    const door = gates().find((d) => d.toggleState === TS_AT_TOP)!;
    expect(door).toBeDefined();
    const z0 = door.origin.z;
    // Stand where the open gate closes, then close it on the player.
    const { mins, maxs } = worldBounds(door);
    // The gate's closed box: its bounds moved back to position1.
    const dx = door.position1.x - door.origin.x;
    const dy = door.position1.y - door.origin.y;
    const dz = door.position1.z - door.origin.z;
    let under: ReturnType<typeof floorAt> = null;
    for (let top = maxs.z + dz - 1; top > mins.z + dz && !under; top -= 16) {
      under = floorAt(
        w,
        (mins.x + maxs.x) / 2 + dx,
        (mins.y + maxs.y) / 2 + dy,
        top,
        mins.z + dz - 200,
      );
    }
    expect(under).not.toBeNull();
    teleport(w, red, under!);
    run(w, 0.5);
    door.acceptInput('Close', '', null, null);
    run(w, 6);
    expect(door.origin.z).not.toBe(z0);
    // The gate carried the player standing on it, then stopped against them
    // rather than pushing them into the gate housing.
    expect(red.origin.z).toBeGreaterThan(under!.z + 16);
    expect(red.alive).toBe(true);
    const tr = emptyTrace();
    w.traceHull(
      red.origin,
      red.origin,
      VEC_HULL_MIN,
      VEC_HULL_MAX,
      MASK_PLAYERSOLID,
      w.entityFilter(red, COLLISION_GROUP_PLAYER_MOVEMENT),
      tr,
    );
    expect(tr.startSolid).toBe(false);

    function gates(): FuncDoor[] {
      return w.findAllByName('gate_1*').filter((e): e is FuncDoor => e instanceof FuncDoor);
    }
  });
});

describe.skipIf(!has('pl_badwater'))('pl_badwater (payload)', () => {
  it('rolls the cart back when it is left, and BLU wins by pushing it to the end', () => {
    const w = makeWorld('pl_badwater');
    const blu = addPlayers(w, TF_TEAM_BLUE, [TF_CLASS_SOLDIER, TF_CLASS_SCOUT, TF_CLASS_SOLDIER]);
    addPlayers(w, TF_TEAM_RED, [TF_CLASS_SOLDIER]);
    const o = objectives(w);
    expect(waitRunning(w)).toBe(true);
    const watcher = o.watchers[0];
    const train = watcher.train!;

    const home = blu.map((p) => ({ ...p.origin }));
    expect(pushCart(w, blu, 60, () => watcher.totalProgress > 0.08)).toBe(true);
    expect(train.trainSpeed).toBeGreaterThan(0);
    // Leave the cart: it stops, and after the recede time it rolls back.
    for (const [k, p] of blu.entries()) teleport(w, p, home[k]);
    run(w, 3);
    const parked = watcher.totalProgress;
    expect(train.trainSpeed).toBe(0);
    run(w, 40);
    expect(watcher.totalProgress).toBeLessThan(parked);

    expect(pushCart(w, blu, 400, () => won(w))).toBe(true);
    expect(w.rules.winningTeam).toBe(TF_TEAM_BLUE);
    expect(w.rules.winReason).toBe(WINREASON_ALL_POINTS_CAPTURED);
    for (const p of o.sorted) expect(p.ownerTeam).toBe(TF_TEAM_BLUE);
  });
});

describe.skipIf(!has('pl_upward'))('pl_upward (payload)', () => {
  it('opens BLU spawn when setup ends and BLU wins by pushing the cart over the hills', () => {
    const w = makeWorld('pl_upward');
    const blu = addPlayers(w, TF_TEAM_BLUE, [TF_CLASS_SOLDIER, TF_CLASS_SOLDIER, TF_CLASS_SOLDIER]);
    addPlayers(w, TF_TEAM_RED, [TF_CLASS_SOLDIER]);
    const o = objectives(w);
    const exits = (): FuncDoor[] =>
      w.findAllByName('door_blue_exitA*').filter((e): e is FuncDoor => e instanceof FuncDoor);
    run(w, 2);
    expect(exits().length).toBeGreaterThan(0);
    for (const d of exits()) expect(d.toggleState).toBe(TS_AT_BOTTOM);
    expect(waitRunning(w)).toBe(true);
    run(w, 3);
    for (const d of exits()) expect([TS_AT_TOP, TS_GOING_UP]).toContain(d.toggleState);

    expect(pushCart(w, blu, 480, () => won(w))).toBe(true);
    expect(w.rules.winningTeam).toBe(TF_TEAM_BLUE);
    expect(o.watchers[0].totalProgress).toBeGreaterThan(0.95);
  });
});

describe.skipIf(!has('ctf_2fort'))('ctf_2fort (capture the flag)', () => {
  it('wins the round on the third capture', () => {
    const w = makeWorld('ctf_2fort');
    const [runner] = addPlayers(w, TF_TEAM_BLUE, [TF_CLASS_SCOUT]);
    addPlayers(w, TF_TEAM_RED, [TF_CLASS_SOLDIER]);
    expect(waitRunning(w)).toBe(true);
    const o = objectives(w);
    const redFlag = o.flags.find((f) => f.team === TF_TEAM_RED) as CaptureFlag;
    const zone = o.zones.find((z) => z.team === TF_TEAM_BLUE) as CaptureZone;
    expect(redFlag).toBeDefined();
    expect(zone).toBeDefined();
    const c = { x: 0, y: 0, z: 0 };
    for (let cap = 1; cap <= 3; cap++) {
      expect(runUntil(w, () => redFlag.isHome() && runner.alive, 30)).toBe(true);
      teleport(w, runner, { x: redFlag.origin.x, y: redFlag.origin.y, z: redFlag.origin.z + 8 });
      expect(runUntil(w, () => redFlag.isStolen(), 2)).toBe(true);
      zone.center(c);
      const spot = spotInside(w, zone) ?? c;
      teleport(w, runner, spot);
      expect(runUntil(w, () => w.rules.flagCaptures[TF_TEAM_BLUE] === cap, 2)).toBe(true);
      if (cap < 3) expect(won(w)).toBe(false);
    }
    expect(runUntil(w, () => won(w), 1)).toBe(true);
    expect(w.rules.winningTeam).toBe(TF_TEAM_BLUE);
    expect(w.rules.winReason).toBe(WINREASON_FLAG_CAPTURE_LIMIT);
  });
});

describe.each([['koth_viaduct'], ['koth_harvest_final']])('%s (king of the hill)', (map) => {
  it.skipIf(!has(map))(
    'unlocks the point, and the holder wins when its team timer runs out',
    () => {
      const w = makeWorld(map);
      const blu = addPlayers(w, TF_TEAM_BLUE, [TF_CLASS_SOLDIER, TF_CLASS_SOLDIER]);
      addPlayers(w, TF_TEAM_RED, [TF_CLASS_SOLDIER]);
      const o = objectives(w);
      expect(waitRunning(w)).toBe(true);
      const point = o.sorted[0];
      expect(point.locked).toBe(true);
      expect(runUntil(w, () => !point.locked, 60)).toBe(true);
      expect(capture(w, point, TF_TEAM_BLUE, blu)).toBe(true);
      const blueTimer = o.kothTimers[TF_TEAM_BLUE]!;
      expect(blueTimer.timerPaused).toBe(false);
      expect(blueTimer.getTimeRemaining()).toBeLessThanOrEqual(180);
      expect(runUntil(w, () => won(w), 200)).toBe(true);
      expect(w.rules.winningTeam).toBe(TF_TEAM_BLUE);
    },
  );
});

describe.each([['cp_badlands'], ['cp_granary']])('%s (5CP)', (map) => {
  it.skipIf(!has(map))('BLU captures the points in line order and wins', () => {
    const w = makeWorld(map);
    const blu = addPlayers(w, TF_TEAM_BLUE, [TF_CLASS_SOLDIER, TF_CLASS_SOLDIER, TF_CLASS_SOLDIER]);
    addPlayers(w, TF_TEAM_RED, [TF_CLASS_SOLDIER]);
    const o = objectives(w);
    expect(waitRunning(w)).toBe(true);
    // Mid is neutral, each team owns its two.
    const owners = o.sorted.map((p) => p.ownerTeam);
    expect(owners.filter((t) => t === TF_TEAM_RED).length).toBe(2);
    expect(owners.filter((t) => t === TF_TEAM_BLUE).length).toBe(2);
    const order: string[] = [];
    captureAll(w, TF_TEAM_BLUE, blu, order);
    expect(won(w)).toBe(true);
    expect(w.rules.winningTeam).toBe(TF_TEAM_BLUE);
    expect(order.length).toBe(3);
    // Neutral middle first, then RED's second point, then RED's last.
    const idx = order.map((n) => o.sorted.findIndex((p) => p.targetname === n));
    expect(idx[0]).toBe(2);
    expect(new Set(idx).size).toBe(3);
  });
});
