import { describe, expect, it } from 'vitest';
import {
  DAY_TICKS,
  MILESTONES,
  ROAD_COST,
  ROAD_REFUND,
  ROAD_RUN_MAX,
  UTILITIES,
  ZONES,
  ZONE_BRUSH_MAX,
} from '../../content';
import {
  FLAG_CONNECTED,
  FLAG_POWERED,
  FLAG_WATERED,
  TICK_MS,
  cellLevel,
  cellZone,
  flagsAt,
  lotLevelAt,
  milestoneProgress,
  nextStep,
  packCell,
  recomputeCity,
  roadAt,
  roadLink,
  stepWorld,
  tileIndex,
  utilityAt,
  zoneAt,
  worldHash,
} from '..';
import { buildFirstTown, mid, rejects, run, ticks, townWorld } from './town';
import { P, setTile } from './arena';

describe('roads', () => {
  it('lays a straight run for a price, skips tiles already paved, and takes half-ish back when removed', () => {
    const w = townWorld();
    const m = mid(w);
    const money = w.players[P].money;
    const ev = run(w, { type: 'placeRoad', x: m, z: m, x2: m + 4, z2: m });
    expect(rejects(ev)).toEqual([]);
    expect(w.city.roadCount).toBe(5);
    expect(w.players[P].money).toBe(money - 5 * ROAD_COST);
    // A second, overlapping run only pays for the new tiles.
    run(w, { type: 'placeRoad', x: m + 3, z: m, x2: m + 6, z2: m });
    expect(w.city.roadCount).toBe(7);
    expect(w.players[P].money).toBe(money - 7 * ROAD_COST);
    const before = w.players[P].money;
    run(w, { type: 'removeRoad', x: m, z: m, x2: m + 6, z2: m });
    expect(w.city.roadCount).toBe(0);
    expect(w.players[P].money).toBe(before + 7 * ROAD_REFUND);
    expect(rejects(run(w, { type: 'removeRoad', x: m, z: m }))).toEqual(['nothing-there']);
  });

  it('refuses water, trees, buildings, odd shapes and overlong runs; stops a run at the first bad tile', () => {
    const w = townWorld();
    const m = mid(w);
    setTile(w, m + 2, m, 3, 'forest');
    expect(rejects(run(w, { type: 'placeRoad', x: m + 2, z: m }))).toEqual(['bad-terrain']);
    expect(rejects(run(w, { type: 'placeRoad', x: 0, z: 0 }))).toEqual(['bad-terrain']); // the water rim
    expect(rejects(run(w, { type: 'placeRoad', x: -1, z: 4 }))).toEqual(['out-of-bounds']);
    expect(rejects(run(w, { type: 'placeRoad', x: m, z: m, x2: m + 3, z2: m + 3 }))).toEqual([
      'bad-shape',
    ]);
    expect(rejects(run(w, { type: 'placeRoad', x: 2, z: 2, x2: 2 + ROAD_RUN_MAX, z2: 2 }))).toEqual(
      ['bad-amount'],
    );
    run(w, { type: 'place', kind: 'park', x: m + 5, z: m });
    expect(rejects(run(w, { type: 'placeRoad', x: m + 5, z: m }))).toEqual(['occupied']);
    // The run lays what it can and stops at the tree, with no complaint because something was laid.
    const ev = run(w, { type: 'placeRoad', x: m, z: m, x2: m + 4, z2: m });
    expect(rejects(ev)).toEqual([]);
    expect(roadAt(w, m + 1, m)).toBe(true);
    expect(roadAt(w, m + 2, m)).toBe(false);
    expect(roadAt(w, m + 3, m)).toBe(false);
  });

  it('cannot be laid without the money, and a broke player lays nothing', () => {
    const w = townWorld();
    w.players[P].money = ROAD_COST * 2 + 1;
    const m = mid(w);
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 5, z2: m });
    expect(w.city.roadCount).toBe(2);
    expect(rejects(run(w, { type: 'placeRoad', x: m, z: m + 3, x2: m + 2, z2: m + 3 }))).toEqual([
      'cannot-afford',
    ]);
  });

  it('keeps `place road` working as a one-tile alias so older clients and saves are not stranded', () => {
    const w = townWorld();
    const m = mid(w);
    run(w, { type: 'place', kind: 'road', x: m, z: m });
    expect(roadAt(w, m, m)).toBe(true);
    expect(w.buildings).toHaveLength(0);
  });

  it('joins neighbours across a ramp but not across a cliff', () => {
    const w = townWorld();
    const m = mid(w);
    setTile(w, m + 1, m, 4);
    setTile(w, m + 2, m, 6);
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 2, z2: m });
    expect(roadLink(w, m, m, m + 1, m)).toBe(true);
    expect(roadLink(w, m + 1, m, m + 2, m)).toBe(false);
    expect(roadLink(w, m, m, m + 2, m)).toBe(false); // not neighbours
    expect(roadLink(w, m, m, m, m + 1)).toBe(false); // no road there
  });

  it('only counts roads that reach the town green as the town network', () => {
    const w = townWorld();
    const m = mid(w);
    run(w, { type: 'placeRoad', x: m + 2, z: m, x2: m + 5, z2: m });
    expect(w.city.stats.roads).toBe(4);
    expect(w.city.stats.connectedRoads).toBe(0); // a street that does not touch the green is not the town yet
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 1, z2: m });
    expect(w.city.stats.connectedRoads).toBe(6);
    // Cutting the street in two strands the far end again.
    run(w, { type: 'removeRoad', x: m + 3, z: m });
    expect(w.city.stats.connectedRoads).toBe(3);
    expect(flagsAt(w, m + 5, m) & FLAG_CONNECTED).toBe(0);
    expect(flagsAt(w, m + 1, m) & FLAG_CONNECTED).toBe(FLAG_CONNECTED);
  });
});

describe('zones', () => {
  it('paints a rectangle for a price per tile and refuses what cannot take it', () => {
    const w = townWorld();
    const m = mid(w);
    const money = w.players[P].money;
    run(w, { type: 'placeRoad', x: m, z: m });
    run(w, { type: 'place', kind: 'park', x: m + 2, z: m + 2 });
    const ev = run(w, { type: 'zone', zone: 'homes', x: m + 1, z: m + 1, x2: m + 3, z2: m + 3 });
    expect(rejects(ev)).toEqual([]);
    // 9 tiles minus the park's tile.
    expect(ev.find((e) => e.type === 'zoned')).toMatchObject({
      count: 8,
      cost: 8 * ZONES.homes.cost,
    });
    expect(w.players[P].money).toBe(money - ROAD_COST - 60 - 8 * ZONES.homes.cost);
    expect(zoneAt(w, m + 1, m + 1)).toBe('homes');
    expect(zoneAt(w, m + 2, m + 2)).toBeNull();
    expect(rejects(run(w, { type: 'zone', zone: 'homes', x: m + 1, z: m + 1 }))).toEqual([
      'occupied',
    ]); // already homes
    expect(rejects(run(w, { type: 'zone', zone: 'market', x: m, z: m }))).toEqual(['occupied']); // a road
    expect(rejects(run(w, { type: 'zone', zone: 'market', x: 0, z: 0 }))).toEqual(['bad-terrain']);
    expect(rejects(run(w, { type: 'zone', zone: 'market', x: 1, z: 1, x2: 40, z2: 40 }))).toEqual([
      'bad-amount',
    ]);
    expect(ZONE_BRUSH_MAX).toBeGreaterThanOrEqual(16 * 16);
  });

  it('repaints an empty zone, clears it with a half refund, and builds over it', () => {
    const w = townWorld();
    const m = mid(w);
    run(w, { type: 'zone', zone: 'homes', x: m + 4, z: m + 4 });
    run(w, { type: 'zone', zone: 'market', x: m + 4, z: m + 4 });
    expect(zoneAt(w, m + 4, m + 4)).toBe('market');
    const money = w.players[P].money;
    run(w, { type: 'unzone', x: m + 4, z: m + 4 });
    expect(zoneAt(w, m + 4, m + 4)).toBeNull();
    expect(w.players[P].money).toBe(money + Math.floor(ZONES.market.cost / 2));
    run(w, { type: 'zone', zone: 'homes', x: m + 4, z: m + 4 });
    run(w, { type: 'place', kind: 'plot', x: m + 4, z: m + 4 });
    expect(zoneAt(w, m + 4, m + 4)).toBeNull();
    expect(rejects(run(w, { type: 'unzone', x: m + 4, z: m + 4 }))).toEqual(['nothing-there']);
  });

  it('keeps workshops locked until the Hamlet milestone opens them', () => {
    const w = townWorld();
    const m = mid(w);
    expect(rejects(run(w, { type: 'zone', zone: 'workshop', x: m + 2, z: m + 2 }))).toEqual([
      'locked',
    ]);
    w.city.reached.push('hamlet');
    expect(rejects(run(w, { type: 'zone', zone: 'workshop', x: m + 2, z: m + 2 }))).toEqual([]);
  });
});

describe('utilities', () => {
  it('needs a road to feed it, and powers or waters a lot only within reach along the roads', () => {
    const w = townWorld(64);
    w.players[P].money = 5000;
    const m = mid(w);
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 20, z2: m });
    run(w, { type: 'placeUtility', kind: 'windmill', x: m + 1, z: m + 1 });
    run(w, { type: 'placeUtility', kind: 'well', x: m + 1, z: m - 1 });
    // A lot just beside the road near the utilities, and one right at the far end.
    w.city.cells[tileIndex(w, m + 2, m + 1)] = packCell({ zone: 'homes', level: 1 });
    w.city.cells[tileIndex(w, m + 20, m + 1)] = packCell({ zone: 'homes', level: 1 });
    recomputeCity(w);
    const near = flagsAt(w, m + 2, m + 1);
    expect(near & FLAG_CONNECTED && near & FLAG_POWERED && near & FLAG_WATERED).toBeTruthy();
    const far = flagsAt(w, m + 20, m + 1);
    expect(far & FLAG_CONNECTED).toBeTruthy();
    expect(far & FLAG_POWERED).toBe(0); // beyond the windmill's reach
    expect(far & FLAG_WATERED).toBe(0);
    // A second windmill by the far lot lights it.
    run(w, { type: 'placeUtility', kind: 'windmill', x: m + 19, z: m + 1 });
    expect(flagsAt(w, m + 20, m + 1) & FLAG_POWERED).toBe(FLAG_POWERED);
  });

  it('shares limited supply nearest-first and reports the shortfall', () => {
    const w = townWorld(40);
    const m = mid(w);
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 9, z2: m });
    run(w, { type: 'placeUtility', kind: 'windmill', x: m + 1, z: m - 1 });
    const capacity = UTILITIES.windmill.supply;
    // Level-3 homes draw 3 power each: five of them need 15 against a supply of 12.
    const lots = [2, 3, 4, 5, 6].map((dx) => m + dx);
    for (const x of lots)
      w.city.cells[tileIndex(w, x, m + 1)] = packCell({ zone: 'homes', level: 3 });
    recomputeCity(w);
    const powered = lots.filter((x) => flagsAt(w, x, m + 1) & FLAG_POWERED);
    expect(powered).toEqual(lots.slice(0, 4)); // the nearest four; the fifth goes dark
    expect(w.city.stats.powerSupply).toBe(capacity);
    expect(w.city.stats.powerDemand).toBe(15);
    expect(w.city.stats.powerCover).toBe(80);
  });

  it('must stand on the shore when it draws from water, and clears an empty zone under it', () => {
    const w = townWorld();
    w.players[P].money = 5000;
    w.city.reached.push('hamlet');
    const m = mid(w);
    expect(rejects(run(w, { type: 'placeUtility', kind: 'pump', x: m, z: m }))).toEqual([
      'no-shore',
    ]);
    // x=1 is next to the water rim.
    run(w, { type: 'zone', zone: 'homes', x: 1, z: m });
    run(w, { type: 'placeUtility', kind: 'pump', x: 1, z: m });
    expect(utilityAt(w, 1, m)).toBe('pump');
    expect(zoneAt(w, 1, m)).toBeNull();
    const money = w.players[P].money;
    run(w, { type: 'removeUtility', x: 1, z: m });
    expect(utilityAt(w, 1, m)).toBeNull();
    expect(w.players[P].money).toBe(money + Math.floor(UTILITIES.pump.cost / 2));
  });

  it('keeps the better utilities locked behind milestones', () => {
    const w = townWorld();
    w.players[P].money = 5000;
    expect(rejects(run(w, { type: 'placeUtility', kind: 'pump', x: 1, z: mid(w) }))).toEqual([
      'locked',
    ]);
    expect(rejects(run(w, { type: 'placeUtility', kind: 'waterwheel', x: 1, z: mid(w) }))).toEqual([
      'locked',
    ]);
  });

  it('powers a harvester so it gathers twice as often', () => {
    const gathered = (powered: boolean) => {
      const w = townWorld();
      w.players[P].money = 5000;
      const m = mid(w);
      run(w, { type: 'placeRoad', x: m, z: m, x2: m + 3, z2: m });
      run(w, { type: 'place', kind: 'plot', x: m + 2, z: m + 2 });
      run(w, { type: 'place', kind: 'harvester', x: m + 2, z: m + 1 });
      if (powered) run(w, { type: 'placeUtility', kind: 'windmill', x: m + 3, z: m + 1 });
      const h = w.buildings.find((b) => b.kind === 'harvester')!;
      expect(!!(flagsAt(w, h.x, h.z) & FLAG_POWERED)).toBe(powered);
      // A crop that is already ripe, so only the machine's rhythm matters.
      w.crops.push({ id: w.nextId++, kind: 'wheat', x: m + 2, z: m + 2, plantedTick: -100000 });
      ticks(w, 10); // the first multiple of 10 comes before the first multiple of 20
      return Object.values(h.storage ?? {}).reduce((s, n) => s + (n ?? 0), 0);
    };
    expect(gathered(false)).toBe(0);
    expect(gathered(true)).toBeGreaterThan(0);
  });
});

describe('growth, people and demand', () => {
  it('only sprouts lots on tiles the road network reaches', () => {
    const w = townWorld();
    const m = mid(w);
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 3, z2: m });
    run(w, { type: 'zone', zone: 'homes', x: m + 1, z: m + 1, x2: m + 3, z2: m + 1 }); // beside the road
    run(w, { type: 'zone', zone: 'homes', x: m + 10, z: m + 10 }); // nowhere near it
    run(w, { type: 'placeUtility', kind: 'windmill', x: m, z: m + 2 });
    ticks(w, 6000);
    expect([m + 1, m + 2, m + 3].some((x) => lotLevelAt(w, x, m + 1) > 0)).toBe(true);
    expect(lotLevelAt(w, m + 10, m + 10)).toBe(0);
  });

  it('draws people to housing, then to jobs, and houses nobody in an empty town', () => {
    const w = townWorld();
    ticks(w, 2000);
    expect(w.city.population).toBe(0);
    buildFirstTown(w);
    ticks(w, 6000);
    const s = w.city.stats;
    expect(w.city.population).toBeGreaterThan(0);
    expect(w.city.population).toBeLessThanOrEqual(s.housing);
    expect(s.jobs).toBeGreaterThan(0);
    expect(w.city.peakPopulation).toBeGreaterThanOrEqual(w.city.population);
  });

  it('asks for more shops as the town fills, and more homes when there are jobs going spare', () => {
    const w = townWorld();
    buildFirstTown(w);
    ticks(w, 3000);
    expect(w.city.stats.demandMarket).toBeGreaterThanOrEqual(0);
    // Hand-built: lots of people, no shops.
    w.city.cells.fill(0);
    w.city.roadCount = 0;
    const m = mid(w);
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 6, z2: m });
    for (let dx = 1; dx <= 5; dx++)
      w.city.cells[tileIndex(w, m + dx, m + 1)] = packCell({ zone: 'homes', level: 3 });
    w.city.population = 24;
    recomputeCity(w);
    expect(w.city.stats.demandMarket).toBeGreaterThan(60);
    // Add plenty of jobs (a bigger shop row) and homes want to grow again.
    for (let dx = 1; dx <= 5; dx++)
      w.city.cells[tileIndex(w, m + dx, m - 1)] = packCell({ zone: 'market', level: 3 });
    recomputeCity(w);
    expect(w.city.stats.demandMarket).toBeLessThan(60);
  });

  it('pays the town’s net into the players’ pockets each day, shared evenly', () => {
    const w = townWorld();
    stepWorld(w, 0, [{ type: 'join', playerId: 'q' }]);
    buildFirstTown(w);
    ticks(w, DAY_TICKS * 3 - w.tick - 1);
    const a = w.players[P].money;
    const b = w.players.q.money;
    expect(w.city.day).toBe(2);
    const ev = ticks(w, 1);
    expect(ev.find((e) => e.type === 'cityDay')).toMatchObject({ day: 3 });
    const net = w.city.stats.net;
    expect(net).toBeGreaterThan(0);
    const da = w.players[P].money - a;
    const db = w.players.q.money - b;
    expect(da + db).toBe(net);
    expect(Math.abs(da - db)).toBeLessThanOrEqual(1);
    expect(w.city.day).toBe(3);
  });
});

describe('lots in the world', () => {
  it('are solid: nothing may be built on one and nobody walks through', () => {
    const w = townWorld();
    const m = mid(w);
    w.city.cells[tileIndex(w, m + 3, m + 3)] = packCell({ zone: 'homes', level: 2 });
    w.city.dirty = true;
    expect(rejects(run(w, { type: 'place', kind: 'plot', x: m + 3, z: m + 3 }))).toEqual([
      'occupied',
    ]);
    expect(rejects(run(w, { type: 'placeRoad', x: m + 3, z: m + 3 }))).toEqual(['occupied']);
    expect(rejects(run(w, { type: 'zone', zone: 'market', x: m + 3, z: m + 3 }))).toEqual([
      'occupied',
    ]);
    expect(cellLevel(w.city.cells[tileIndex(w, m + 3, m + 3)])).toBe(2);
    expect(cellZone(w.city.cells[tileIndex(w, m + 3, m + 3)])).toBe('homes');
  });
});

describe('milestones', () => {
  it('is reached when every requirement holds, stays reached, and pays once to whoever claims it', () => {
    const w = townWorld();
    const def = MILESTONES[0];
    expect(milestoneProgress(w, def)).toBe(0);
    expect(rejects(run(w, { type: 'claimMilestone', id: def.id }))).toEqual(['not-reached']);
    expect(rejects(run(w, { type: 'claimMilestone', id: 'nope' }))).toEqual(['unknown-milestone']);
    // Fake a healthy little town.
    w.city.population = 20;
    const m = mid(w);
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 4, z2: m });
    run(w, { type: 'placeUtility', kind: 'windmill', x: m + 1, z: m + 1 });
    run(w, { type: 'placeUtility', kind: 'well', x: m + 2, z: m + 1 });
    for (let dx = 1; dx <= 4; dx++)
      w.city.cells[tileIndex(w, m + dx, m - 1)] = packCell({
        zone: 'homes',
        level: dx === 4 ? 1 : 2,
      });
    w.city.cells[tileIndex(w, m + 3, m + 1)] = packCell({ zone: 'market', level: 1 });
    w.city.dirty = true;
    const ev = ticks(w, 40);
    expect(ev.filter((e) => e.type === 'milestoneReached')).toEqual([
      { type: 'milestoneReached', id: def.id },
    ]);
    expect(w.city.reached).toEqual([def.id]);
    expect(milestoneProgress(w, def)).toBe(1);
    // Even if the town later empties, it stays reached.
    w.city.population = 0;
    ticks(w, 40);
    expect(w.city.reached).toContain(def.id);

    const money = w.players[P].money;
    const claim = run(w, { type: 'claimMilestone', id: def.id });
    expect(claim.find((e) => e.type === 'milestoneClaimed')).toMatchObject({ reward: def.reward });
    expect(w.players[P].money).toBe(money + def.reward);
    expect(rejects(run(w, { type: 'claimMilestone', id: def.id }))).toEqual(['already-claimed']);
  });

  it('grants its look when one is attached, and opens the workshop zone', () => {
    const w = townWorld();
    const commons = MILESTONES.find((m) => m.id === 'commons')!;
    expect(commons.rewardSkin).toBeDefined();
    w.city.reached.push('commons');
    run(w, { type: 'claimMilestone', id: 'commons' });
    expect(w.players[P].ownedSkins).toContain(commons.rewardSkin);
    expect(MILESTONES.find((m) => m.id === 'hamlet')!.unlocks).toContain('zone:workshop');
  });

  it('guides the first steps in order', () => {
    const w = townWorld();
    const m = mid(w);
    expect(nextStep(w)).toBe('road');
    run(w, { type: 'placeRoad', x: m, z: m, x2: m + 6, z2: m });
    expect(nextStep(w)).toBe('zone-homes');
    run(w, { type: 'zone', zone: 'homes', x: m + 1, z: m + 1, x2: m + 3, z2: m + 1 });
    expect(nextStep(w)).toBe('power');
    run(w, { type: 'placeUtility', kind: 'windmill', x: m + 5, z: m + 1 });
    expect(nextStep(w)).toBe('water');
    run(w, { type: 'placeUtility', kind: 'well', x: m + 5, z: m - 1 });
    expect(nextStep(w)).toBe('zone-market');
  });

  it('is reached by a first town built in one go in about five minutes of game time (perfect play)', () => {
    const w = townWorld();
    buildFirstTown(w);
    let reachedAt = -1;
    for (let t = 0; t < 20 * 60 * 15 && reachedAt < 0; t++) {
      stepWorld(w, TICK_MS);
      if (w.city.reached.includes('hamlet')) reachedAt = w.tick;
    }
    const minutes = (reachedAt * TICK_MS) / 60000;
    // Someone who has to find the tools, place them and top up the money takes longer; the bot is the floor.
    expect(minutes).toBeGreaterThan(3.5);
    expect(minutes).toBeLessThan(7.5);
  });
});

describe('determinism', () => {
  const play = (seed: number) => {
    const w = townWorld(32, seed);
    buildFirstTown(w);
    const m = mid(w);
    for (let i = 0; i < 12; i++) {
      ticks(w, 500);
      if (i === 3) run(w, { type: 'placeUtility', kind: 'windmill', x: m + 9, z: m + 1 });
      if (i === 5)
        run(w, { type: 'zone', zone: 'homes', x: m + 1, z: m + 2, x2: m + 6, z2: m + 3 });
      if (i === 7) run(w, { type: 'placeRoad', x: m + 10, z: m, x2: m + 10, z2: m + 6 });
      if (i === 9) run(w, { type: 'removeRoad', x: m + 10, z: m + 3 });
    }
    return w;
  };

  it('same seed and same commands give an identical world hash over thousands of ticks', () => {
    const a = play(11);
    const b = play(11);
    expect(a.tick).toBe(6000);
    expect(worldHash(a)).toBe(worldHash(b));
    expect(a.city.population).toBeGreaterThan(0);
    expect(worldHash(play(12))).not.toBe(worldHash(a));
  });

  it('survives a JSON round trip mid-game and carries on identically', () => {
    const a = townWorld();
    buildFirstTown(a);
    ticks(a, 2500);
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    expect(worldHash(b)).toBe(worldHash(a));
    ticks(a, 2500);
    ticks(b, 2500);
    expect(worldHash(b)).toBe(worldHash(a));
  });
});
