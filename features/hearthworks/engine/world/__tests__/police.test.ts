import { describe, expect, it } from 'vitest';
import { OFFICERS } from '../../content';
import {
  ARREST_TICKS,
  arrestFine,
  MAX_OFFICERS,
  START_MONEY,
  placeOfficer,
  sightLine,
  stepWorld,
  tileDistance,
  wantedOfficers,
  type Command,
  type WorldEvent,
} from '..';
import { arena, give, P, setTile, ticks, withPlayer } from './arena';

const ev = <T extends WorldEvent['type']>(events: WorldEvent[], type: T) =>
  events.filter((e): e is Extract<WorldEvent, { type: T }> => e.type === type);

describe('when the police come', () => {
  it('calls for more officers as the heat climbs', () => {
    expect([0, 39, 40, 59, 60, 79, 80, 94, 95, 100].map(wantedOfficers)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });

  it('sends nobody below the threshold, and one Metrocop above it, from a far shore gate', () => {
    const quiet = arena(32);
    withPlayer(quiet, 16, 16).heat = 39;
    ticks(quiet, 300);
    expect(quiet.officers).toHaveLength(0);

    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.heat = 50;
    const events = ticks(w, 200); // the gates are looked at every few seconds, not every tick
    expect(w.officers).toHaveLength(1);
    const o = w.officers[0];
    expect(o).toMatchObject({ kind: 'metrocop', mode: 'hunt', target: P });
    expect(ev(events, 'officerSpawned')).toHaveLength(1);
    // A gate is on the shore (beside water) and well away from the player.
    const beside = [-1, 0, 1].some((dz) =>
      [-1, 0, 1].some((dx) => w.terrain[(o.gateZ + dz) * w.size + o.gateX + dx] === 'water'),
    );
    expect(beside).toBe(true);
    expect(tileDistance(o.gateX, o.gateZ, 16, 16)).toBeGreaterThanOrEqual(12);
  });

  it('scales up to Combine soldiers and never exceeds the cap', () => {
    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.heat = 100;
    p.hp = 1e6; // armed and unkillable for this test: unarmed they would simply arrest and go home
    give(w, P, 'pistol');
    for (let i = 0; i < 900; i++) {
      p.heat = 100; // keep it burning
      ticks(w, 1);
    }
    expect(w.officers.length).toBe(MAX_OFFICERS);
    // The first officer a wanted player meets is a Metrocop; the soldiers are the reinforcements.
    const byArrival = [...w.officers].sort((a, b) => a.id - b.id);
    expect(byArrival[0].kind).toBe('metrocop');
    expect(byArrival.slice(1).every((o) => o.kind === 'combine-soldier')).toBe(true);
    expect(byArrival.every((o) => o.hp === OFFICERS[o.kind].hp)).toBe(true);
  });

  it('only comes ashore where the hunt can be walked: a player cut off by water gets no police', () => {
    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.heat = 100;
    // A two-tile moat (a jump crosses only one) round a small island.
    for (let z = 10; z <= 22; z++)
      for (let x = 10; x <= 22; x++) {
        const d = Math.max(Math.abs(x - 16), Math.abs(z - 16));
        if (d === 5 || d === 6) setTile(w, x, z, 0, 'water');
      }
    ticks(w, 400);
    expect(w.officers).toHaveLength(0);
    expect(p.hp).toBe(100);
  });
});

describe('line of sight', () => {
  it('is open on flat ground, blocked by a ledge, a tree line or a building, and not by a lower step', () => {
    const w = arena(32);
    expect(sightLine(w, 5, 16, 15, 16).clear).toBe(true);
    setTile(w, 10, 16, 4); // a one-block step between flat ground: low enough to see over from eye height... no, it rises above the line
    expect(sightLine(w, 5, 16, 15, 16).clear).toBe(false);
    setTile(w, 10, 16, 3);
    setTile(w, 10, 16, 3, 'forest');
    expect(sightLine(w, 5, 16, 15, 16).clear).toBe(false);
    setTile(w, 10, 16, 3);
    withPlayer(w, 1, 1);
    w.players[P].money = 1000;
    stepWorld(w, 0, [{ type: 'place', playerId: P, kind: 'cottage', x: 10, z: 16 }]);
    expect(sightLine(w, 5, 16, 15, 16).clear).toBe(false);
    // The target on the ledge top is visible from the foot of a one-block rise, and a deep dip does not hide anyone.
    const v = arena(32);
    setTile(v, 15, 16, 4);
    expect(sightLine(v, 5, 16, 15, 16).clear).toBe(true);
    setTile(v, 10, 16, 1);
    expect(sightLine(v, 5, 16, 15, 16).clear).toBe(true);
  });

  it('hides a player behind a wall from an officer: no shots, they walk around instead', () => {
    const w = arena(32);
    const p = withPlayer(w, 20, 16);
    give(w, P, 'pistol');
    p.heat = 60;
    for (let z = 4; z <= 26; z++) setTile(w, 12, z, 7); // a long cliff
    const o = placeOfficer(w, 'metrocop', 5, 16, p, [])!;
    const shots: WorldEvent[] = [];
    for (let i = 0; i < 100; i++)
      shots.push(...ev(ticks(w, 1), 'shot').filter((e) => e.by.kind === 'officer'));
    expect(shots).toHaveLength(0);
    expect(o.mover.x).toBeLessThan(13); // still on its own side, going round the end of the cliff
  });
});

/** Run an officer toward a still player and report the kinds of step it took and how close it got. */
function hunt(
  w: ReturnType<typeof arena>,
  px: number,
  pz: number,
  from: [number, number],
  maxTicks = 1500,
) {
  const p = withPlayer(w, px, pz);
  p.heat = 60; // unarmed: they will come to arrest, never shoot
  const o = placeOfficer(w, 'metrocop', from[0], from[1], p, [])!;
  const kinds = new Set<string>();
  const visited: [number, number][] = [];
  let arrivedAt = -1;
  for (let i = 0; i < maxTicks && arrivedAt < 0; i++) {
    ticks(w, 1);
    const step = o.mover.path[0];
    if (step) kinds.add(step.kind);
    visited.push([Math.round(o.mover.x), Math.round(o.mover.z)]);
    if (Math.hypot(o.mover.x - px, o.mover.z - pz) <= 1.6) arrivedAt = i;
    // Stop before the arrest ends the scene.
    if (w.officers.length === 0) break;
  }
  return { o, kinds, visited, arrivedAt };
}

describe('hunting on rough ground', () => {
  it('goes around a cliff through its one gap', () => {
    const w = arena(24);
    for (let z = 1; z <= 20; z++) setTile(w, 12, z, 7); // a cliff with the only way round at z = 21..22
    const { arrivedAt, visited } = hunt(w, 18, 5, [4, 5]);
    expect(arrivedAt).toBeGreaterThan(0);
    expect(visited.every(([x, z]) => !(x === 12 && z <= 20))).toBe(true);
    expect(visited.some(([x, z]) => x === 12 && z >= 21)).toBe(true);
  });

  it('takes a jump when a one-block step is the way', () => {
    const w = arena(24);
    for (let z = 1; z <= 22; z++) setTile(w, 12, z, 7);
    setTile(w, 12, 5, 4); // the one way over: up a block
    const { arrivedAt, kinds, visited } = hunt(w, 18, 5, [4, 5]);
    expect(arrivedAt).toBeGreaterThan(0);
    expect(kinds.has('jump')).toBe(true);
    expect(visited.some(([x, z]) => x === 12 && z === 5)).toBe(true);
  });

  it('jumps a one-tile river', () => {
    const w = arena(24);
    for (let z = 1; z <= 22; z++) setTile(w, 12, z, 0, 'water');
    const { arrivedAt, kinds } = hunt(w, 18, 5, [4, 5]);
    expect(arrivedAt).toBeGreaterThan(0);
    expect(kinds.has('jump')).toBe(true);
  });

  it('drops down a ledge as a fall', () => {
    const w = arena(24);
    for (let z = 1; z <= 22; z++) for (let x = 13; x <= 22; x++) setTile(w, x, z, 6); // a plateau three blocks up, walled all the way round
    for (let z = 1; z <= 22; z++) setTile(w, 12, z, 3); // its foot
    const { arrivedAt, kinds } = hunt(w, 6, 5, [18, 5]);
    expect(arrivedAt).toBeGreaterThan(0);
    expect(kinds.has('fall')).toBe(true);
  });

  it('keeps hunting a moving player, re-planning as they go', () => {
    const w = arena(32);
    const p = withPlayer(w, 6, 6);
    p.heat = 90;
    const o = placeOfficer(w, 'metrocop', 28, 28, p, [])!;
    let closest = Infinity;
    for (let i = 0; i < 1200; i++) {
      // The player wanders along a diagonal.
      if (i % 4 === 0) {
        const t = (i / 4) % 40;
        p.x = 6 + (t < 20 ? t : 40 - t);
        p.z = 6 + (t < 20 ? t : 40 - t) * 0.5;
      }
      ticks(w, 1);
      if (w.officers.includes(o))
        closest = Math.min(closest, Math.hypot(o.mover.x - p.x, o.mover.z - p.z));
    }
    expect(closest).toBeLessThan(4);
  });
});

describe('arrest or fight', () => {
  function scene(armed: boolean) {
    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.inventory['mystery-tonic'] = 3;
    p.inventory.bread = 4;
    p.heat = 70;
    if (armed) give(w, P, 'pistol');
    const o = placeOfficer(w, 'metrocop', 16, 24, p, [])!;
    return { w, p, o };
  }

  it('cuffs a player who is not fighting back: a fine, the contraband gone, the heat cleared, the police leave', () => {
    const { w, p, o } = scene(false);
    const all = ticks(w, 400);
    const a = ev(all, 'arrested')[0];
    expect(a).toMatchObject({ playerId: P, officerId: o.id });
    // The fine follows the heat at the moment of the arrest (70 when the officer set out, a little less by now).
    expect(a.fine).toBeGreaterThanOrEqual(arrestFine(START_MONEY, 55));
    expect(a.fine).toBeLessThanOrEqual(arrestFine(START_MONEY, 70));
    expect(a.confiscated).toEqual({ 'mystery-tonic': 3 });
    expect(p.money).toBe(START_MONEY - a.fine);
    expect(p.inventory['mystery-tonic']).toBeUndefined();
    expect(p.inventory.bread).toBe(4);
    expect(p.heat).toBe(0);
    expect(ev(all, 'shot')).toHaveLength(0); // arrest, not a shootout
    expect(
      ev(all, 'officerLeft').length + w.officers.filter((q) => q.mode === 'leave').length,
    ).toBeGreaterThan(0);
  });

  it('gives the player a moment to resist: shooting back before the cuffs close stops the arrest', () => {
    const { w, p, o } = scene(false);
    // Walk the officer in until it is cuffing.
    for (let i = 0; i < 400 && o.arrestAt === 0; i++) ticks(w, 1);
    expect(o.arrestAt).toBeGreaterThan(0);
    give(w, P, 'pistol');
    ticks(w, 0, [{ type: 'shoot', playerId: P, x: o.mover.x, z: o.mover.z }]);
    const rest = ticks(w, ARREST_TICKS * 2);
    expect(ev(rest, 'arrested')).toHaveLength(0);
    expect(p.money).toBeGreaterThanOrEqual(START_MONEY - 400);
  });

  it('shoots at an armed player instead of arresting them', () => {
    const { w } = scene(true);
    const all = ticks(w, 200);
    expect(ev(all, 'arrested')).toHaveLength(0);
    expect(ev(all, 'shot').some((e) => e.by.kind === 'officer')).toBe(true);
  });

  it('loses interest when the heat is low and the player is far, then walks to its gate and is gone', () => {
    const w = arena(32);
    const p = withPlayer(w, 4, 4);
    p.heat = 50;
    const o = placeOfficer(w, 'metrocop', 27, 27, p, [])!;
    o.gateX = 27;
    o.gateZ = 4; // the way they came in is a walk away
    p.heat = 5;
    // They begin to leave at once (the player is 30 tiles off), then vanish at the gate.
    ticks(w, 2);
    expect(o.mode).toBe('leave');
    const events = ticks(w, 400);
    expect(ev(events, 'officerLeft')[0]).toMatchObject({ officerId: o.id });
    expect(w.officers).toHaveLength(0);
  });

  it('keeps coming while the heat is high, even from afar', () => {
    const w = arena(32);
    const p = withPlayer(w, 4, 4);
    p.heat = 90;
    const o = placeOfficer(w, 'metrocop', 27, 27, p, [])!;
    ticks(w, 40);
    expect(o.mode).toBe('hunt');
  });
});

describe('the whole thing is deterministic', () => {
  const script = (i: number): Command[] => {
    if (i === 5)
      return [
        { type: 'buyWeapon', playerId: P, weapon: 'smg' },
        { type: 'equip', playerId: P, weapon: 'smg' },
      ];
    if (i === 20) return [{ type: 'hustle', playerId: P, item: 'mystery-tonic', qty: 4 }];
    if (i % 30 === 0 && i > 60)
      return [{ type: 'hustle', playerId: P, item: 'mystery-tonic', qty: 2 }];
    if (i > 100 && i % 3 === 0) {
      return [
        {
          type: 'move',
          playerId: P,
          x: 16 + Math.floor(Math.sin(i / 50) * 4),
          z: 16 + Math.floor(Math.cos(i / 50) * 4),
        },
        { type: 'shoot', playerId: P, x: 16 + Math.sin(i / 7) * 9, z: 16 + Math.cos(i / 7) * 9 },
      ];
    }
    if (i % 50 === 0) return [{ type: 'reload', playerId: P }];
    return [];
  };
  const run = () => {
    const w = arena(32, 9);
    const p = withPlayer(w, 16, 16);
    p.money = 3000;
    p.inventory['mystery-tonic'] = 40;
    const log: WorldEvent[] = [];
    for (let i = 0; i < 2000; i++) log.push(...ticks(w, 1, script(i)));
    return { w, log };
  };

  it('2,000 ticks of crime, police and gunfire end identical from the same seed', () => {
    const a = run();
    const b = run();
    expect(JSON.stringify(a.w)).toBe(JSON.stringify(b.w));
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
    // ... and it was a real fight, not an empty soak.
    expect(ev(a.log, 'officerSpawned').length).toBeGreaterThan(0);
    expect(ev(a.log, 'shot').length).toBeGreaterThan(20);
    expect(ev(a.log, 'playerHit').length + ev(a.log, 'officerHit').length).toBeGreaterThan(0);
  });
});
