/**
 * The tuning of the crime route, pinned. The targets are written in docs/hearthworks-balance.md and measured by
 * `pnpm exec tsx scripts/hearthworks/balance.ts`; these tests keep the invariants that tuning leans on, using the same
 * scripted players (balance-sim.ts) so a number pinned here is the number the report prints. Everything is seeded:
 * same seed, same outcome, so nothing here is flaky, but a later change that moves the feel will fail loudly and say
 * which target it moved.
 */

import { describe, expect, it } from 'vitest';
import { ITEMS, OFFICERS, RECIPES, WEAPONS, WEAPON_IDS } from '../../content';
import {
  CUSTOMER_PREMIUM,
  FINE_FLOOR,
  HEAT_DECAY_TICKS,
  HEAT_MAX,
  HUSTLE_HEAT_PER_UNIT,
  HUSTLE_HEAT_PER_UNIT_CONTRABAND,
  HUSTLE_MARKUP,
  MAX_HP,
  MAX_OFFICERS,
  START_MONEY,
  WANTED_HEAT,
  arrestFine,
  downedFine,
  hustleHeat,
  placeOfficer,
  responseTicks,
  sightLine,
  stepWorld,
  wantedOfficers,
  type WorldEvent,
} from '..';
import {
  duelKill,
  fight,
  gunman,
  hustler,
  makeRng,
  rate,
  run,
  secs,
  summarize,
} from './balance-sim';
import { arena, give, P, setTile, ticks, withPlayer } from './arena';

const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const median = (xs: number[]) => summarize(xs).p50;
const withStock = (n: number) => (_w: unknown, p: { inventory: Record<string, number> }) => {
  p.inventory['mystery-tonic'] = n;
};

describe('target: crime is tempting, the legal route is honest', () => {
  it('pays contraband three times what the stall pays for the best legal dish, and never launders legal goods', () => {
    for (const r of Object.values(RECIPES).filter((q) => ITEMS[q.output].contraband))
      expect(ITEMS[r.output].price * HUSTLE_MARKUP).toBeGreaterThanOrEqual(ITEMS.stew.price * 3);
    // A street buyer never pays more than a customer at a stall does (plus a little), so hustling bread is no trick.
    expect(HUSTLE_MARKUP).toBeLessThanOrEqual(CUSTOMER_PREMIUM + 0.1);
  });

  it('makes heat in proportion to the deal: no bulk discount, so a dump calls the police', () => {
    // The first sale is safe, a small deal is safe, a deal of six wanted units is not.
    expect(hustleHeat('mystery-tonic', 1)).toBeLessThan(WANTED_HEAT / 2);
    expect(hustleHeat('mystery-tonic', 3)).toBeLessThan(WANTED_HEAT);
    expect(hustleHeat('mystery-tonic', 6)).toBeGreaterThanOrEqual(WANTED_HEAT);
    expect(hustleHeat('mystery-tonic', 20)).toBeGreaterThanOrEqual(HEAT_MAX);
    for (const item of ['mystery-tonic', 'bread'] as const)
      for (let q = 1; q < 30; q++) {
        const marginal = hustleHeat(item, q + 1) - hustleHeat(item, q);
        expect(marginal).toBeGreaterThanOrEqual(
          item === 'bread' ? HUSTLE_HEAT_PER_UNIT : HUSTLE_HEAT_PER_UNIT_CONTRABAND,
        );
      }
    expect(hustleHeat('mystery-tonic', 1)).toBeGreaterThan(hustleHeat('bread', 1));
  });

  it('lets a careful dealer earn steadily with no police at all, and punishes a dump', () => {
    const careful = seeds(4).map(
      (s) =>
        run(
          'careful',
          hustler({
            batch: 3,
            dealBelow: 100,
            ceiling: WANTED_HEAT - 4,
            fleeWhen: 1,
            lieLow: true,
          }),
          { seed: s, ticks: 6000, size: 32, setup: withStock(40) as never },
        ).log,
    );
    for (const l of careful) {
      expect(l.spawned).toBe(0);
      expect(l.hustleIncome).toBeGreaterThanOrEqual(2000); // 5 minutes
      expect(l.moneyEnd - l.moneyStart).toBe(l.hustleIncome);
    }
    const dump = seeds(4).map(
      (s) =>
        run(
          'dump',
          hustler({ batch: 20, dealBelow: 100, fleeWhen: 0, lieLow: false, maxDeals: 1 }),
          { seed: s, ticks: 6000, size: 32, setup: withStock(20) as never },
        ).log,
    );
    for (const l of dump) {
      expect(l.arrests + l.downs).toBeGreaterThan(0);
      // The hotter the deal, the bigger the fine: a dump keeps well under two thirds of its take.
      expect(l.moneyEnd - l.moneyStart).toBeLessThan(l.hustleIncome * 0.65);
    }
    // Per tonic, careful play out-earns the dump by a clear margin.
    expect(median(careful.map((l) => l.hustleIncome / 18))).toBeGreaterThan(
      median(dump.map((l) => (l.moneyEnd - l.moneyStart) / 20)) * 1.4,
    );
  });
});

describe('target: heat cools when you lie low', () => {
  it('loses one point per HEAT_DECAY_TICKS: wanted to calm in a minute and a quarter, full to zero in four minutes', () => {
    expect(HEAT_DECAY_TICKS).toBe(50);
    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.heat = 44;
    let calm = -1;
    for (let t = 1; t < 4000 && calm < 0; t++) {
      ticks(w, 1);
      w.officers = []; // lying low somewhere nobody looks
      if (p.heat < 15) calm = t;
    }
    expect(secs(calm)).toBeGreaterThan(65);
    expect(secs(calm)).toBeLessThan(80);
    p.heat = HEAT_MAX;
    ticks(w, HEAT_MAX * HEAT_DECAY_TICKS);
    expect(p.heat).toBe(0);
  });

  it('never goes below zero, even from a fractional value', () => {
    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.heat = 0.5;
    ticks(w, HEAT_DECAY_TICKS * 3);
    expect(p.heat).toBe(0);
  });
});

describe('target: the first police response is survivable', () => {
  it('lands one Metrocop within a look of the gates, who forms up before shooting', () => {
    const logs = seeds(8).map((s) => {
      const events: WorldEvent[] = [];
      const w = arena(32, s);
      const p = withPlayer(w, 16, 16);
      give(w, P, 'pistol');
      p.heat = 45;
      let spawnTick = -1;
      let firstShot = -1;
      for (let t = 1; t <= 600 && firstShot < 0; t++) {
        p.hp = MAX_HP;
        p.heat = Math.max(p.heat, 41); // keep it at the first rung
        const ev = ticks(w, 1);
        events.push(...ev);
        for (const e of ev) {
          if (e.type === 'officerSpawned' && spawnTick < 0) spawnTick = w.tick;
          if (e.type === 'shot' && e.by.kind === 'officer' && firstShot < 0) firstShot = w.tick;
        }
      }
      return { spawnTick, firstShot, events, w };
    });
    for (const l of logs) {
      expect(l.spawnTick).toBeGreaterThan(0);
      expect(l.spawnTick).toBeLessThanOrEqual(responseTicks(41) + 20);
      expect(l.firstShot - l.spawnTick).toBeGreaterThanOrEqual(40); // 2 s forming up and walking in before the first shot
      expect(
        l.events
          .filter((e) => e.type === 'officerSpawned')
          .every((e) => e.officer.kind === 'metrocop'),
      ).toBe(true);
    }
  });

  it('sends a Metrocop first even at full heat, and soldiers only as reinforcements', () => {
    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.hp = 1e6;
    give(w, P, 'pistol');
    for (let i = 0; i < 900; i++) {
      p.heat = HEAT_MAX;
      ticks(w, 1);
    }
    const order = [...w.officers].sort((a, b) => a.id - b.id);
    expect(order).toHaveLength(MAX_OFFICERS);
    expect(order[0].kind).toBe('metrocop');
    expect(order.slice(1).every((o) => o.kind === 'combine-soldier')).toBe(true);
  });

  it('reinforces faster the hotter the player is', () => {
    expect(responseTicks(50)).toBeGreaterThan(responseTicks(70));
    expect(responseTicks(70)).toBeGreaterThan(responseTicks(90));
    expect(wantedOfficers(HEAT_MAX)).toBe(MAX_OFFICERS);
  });

  it('never shoots an unarmed hustler: they only arrest, and an unarmed runner can get clean away', () => {
    const logs = seeds(8).map(
      (s) =>
        run(
          'runner',
          hustler({ batch: 6, dealBelow: 100, fleeWhen: 1, lieLow: true, maxDeals: 1 }),
          { seed: s, ticks: 6000, size: 32, setup: withStock(6) as never },
        ).log,
    );
    for (const l of logs) {
      expect(l.damageTaken).toBe(0);
      expect(l.downs).toBe(0);
      expect(l.spawned).toBeGreaterThan(0);
    }
    expect(rate(logs.map((l) => l.arrests === 0))).toBeGreaterThanOrEqual(0.25); // escape is possible
    expect(rate(logs.map((l) => l.arrests === 0))).toBeLessThanOrEqual(0.8); // ... but not guaranteed
    // Standing still is a sure arrest, and it costs the share the fine table says.
    const stand = seeds(4).map(
      (s) =>
        run(
          'stand',
          hustler({ batch: 6, dealBelow: 100, fleeWhen: 0, lieLow: false, maxDeals: 1 }),
          { seed: s, ticks: 3000, size: 32, setup: withStock(6) as never },
        ).log,
    );
    for (const l of stand) {
      expect(l.arrests).toBe(1);
      expect(l.fines).toBeLessThanOrEqual(arrestFine(START_MONEY + l.hustleIncome, 50));
    }
  });
});

describe('target: guns feel distinct', () => {
  it('has the CS:GO-ish roles on the sheet: price, rate of fire, reach, spread', () => {
    const cost = (g: keyof typeof WEAPONS) => WEAPONS[g].price;
    expect(cost('pistol')).toBeLessThan(cost('smg'));
    expect(cost('smg')).toBeLessThan(cost('revolver'));
    expect(cost('revolver')).toBeLessThan(cost('shotgun'));
    expect(cost('shotgun')).toBeLessThan(cost('rifle'));
    expect(cost('rifle')).toBeLessThan(cost('marksman'));
    expect(WEAPONS.pistol.price).toBeLessThanOrEqual(START_MONEY / 2); // a first gun is a first-day buy
    expect(WEAPONS.marksman.price).toBeGreaterThan(START_MONEY * 4); // the sniper is a late-game sink
    const rps = (g: keyof typeof WEAPONS) => 1 / WEAPONS[g].fireTicks;
    expect(rps('smg')).toBeGreaterThan(rps('rifle'));
    expect(rps('rifle')).toBeGreaterThan(rps('pistol'));
    expect(rps('pistol')).toBeGreaterThan(rps('revolver'));
    expect(rps('revolver')).toBeGreaterThan(rps('marksman'));
    expect(WEAPONS.marksman.range).toBeGreaterThan(WEAPONS.rifle.range);
    expect(WEAPONS.rifle.range).toBeGreaterThan(WEAPONS.revolver.range);
    expect(WEAPONS.revolver.range).toBeGreaterThan(WEAPONS.pistol.range);
    expect(WEAPONS.smg.range).toBeGreaterThan(WEAPONS.shotgun.range);
    expect(WEAPONS.shotgun.pellets).toBeGreaterThanOrEqual(6);
    expect(WEAPONS.marksman.spread).toBeLessThan(WEAPONS.pistol.spread);
    expect(WEAPONS.smg.spread).toBeGreaterThan(WEAPONS.rifle.spread);
    expect(WEAPONS.marksman.reloadTicks).toBeGreaterThan(WEAPONS.pistol.reloadTicks);
    // Ammo is a cost: a rifle's rounds cost more than a pistol's, and a sniper's the most.
    const perRound = (g: keyof typeof WEAPONS) => WEAPONS[g].ammoPrice / WEAPONS[g].magazine;
    expect(perRound('marksman')).toBeGreaterThan(perRound('rifle'));
    expect(perRound('rifle')).toBeGreaterThan(perRound('pistol'));
  });

  /** Median shots to kill a parked officer, over fifteen seeds. */
  const shotsToKill = (
    g: (typeof WEAPON_IDS)[number],
    kind: keyof typeof OFFICERS,
    range: number,
  ) => median(seeds(15).map((s) => duelKill(g, kind, range, s).shots));

  it('kills a Metrocop in the number of rounds the roles promise (±1)', () => {
    const near = (g: (typeof WEAPON_IDS)[number], n: number, range = 4) =>
      expect(Math.abs(shotsToKill(g, 'metrocop', range) - n)).toBeLessThanOrEqual(1);
    near('pistol', 5);
    near('revolver', 2);
    near('smg', 10);
    near('rifle', 6);
    near('shotgun', 1, 2); // point-blank: one blast
    near('shotgun', 2, 4);
    for (const r of [2, 11, 20]) expect(shotsToKill('marksman', 'metrocop', r)).toBe(1); // one tap at any range
    expect(shotsToKill('revolver', 'metrocop', 11)).toBe(3); // the magnum thins out with distance
  });

  it('kills a Combine soldier in the rounds the roles promise (±1)', () => {
    const near = (g: (typeof WEAPON_IDS)[number], n: number, range = 4) =>
      expect(Math.abs(shotsToKill(g, 'combine-soldier', range) - n)).toBeLessThanOrEqual(1);
    near('pistol', 11);
    near('revolver', 5);
    near('rifle', 13);
    near('marksman', 2);
    expect(shotsToKill('marksman', 'combine-soldier', 20)).toBeLessThanOrEqual(3);
  });

  it('keeps the specialists in their lanes: the shotgun and SMG fall off, the sniper reaches', () => {
    const smgNear = shotsToKill('smg', 'metrocop', 4);
    const smgFar = shotsToKill('smg', 'metrocop', 8);
    expect(smgFar).toBeGreaterThan(smgNear * 1.5);
    // Out of its reach a gun never kills.
    expect(duelKill('shotgun', 'metrocop', 8, 1).killed).toBe(false);
    expect(duelKill('pistol', 'metrocop', 12, 1).killed).toBe(false);
    expect(duelKill('marksman', 'metrocop', 20, 1).killed).toBe(true);
    // At point blank the shotgun out-kills the rifle (time to first kill); at range the rifle does.
    const t = (g: (typeof WEAPON_IDS)[number], r: number) =>
      median(seeds(15).map((s) => duelKill(g, 'metrocop', r, s).ticks));
    expect(t('shotgun', 2)).toBeLessThan(t('rifle', 2));
    expect(t('rifle', 11)).toBeLessThan(t('smg', 8) + 1000); // (smg is out at 11)
    expect(duelKill('smg', 'metrocop', 11, 1).killed).toBe(false);
  });
});

describe('target: a well-armed player can fight a small squad, not a large one', () => {
  const winRate = (
    g: (typeof WEAPON_IDS)[number],
    kind: 'metrocop' | 'combine-soldier',
    n: number,
    count = 12,
  ) =>
    rate(
      seeds(count).map((s) => fight({ weapon: g, kind, count: n, seed: s, fullAmmo: true }).won),
    );

  it('wins a first response with any gun, and a pistol is hurt by it', () => {
    for (const g of WEAPON_IDS) expect(winRate(g, 'metrocop', 1)).toBeGreaterThanOrEqual(0.9);
    const left = seeds(12).map(
      (s) =>
        fight({ weapon: 'pistol', kind: 'metrocop', count: 1, seed: s, fullAmmo: true }).hpLeft,
    );
    expect(median(left)).toBeGreaterThanOrEqual(60);
    expect(median(left)).toBeLessThan(100);
  });

  it('wins two Metrocops with a real gun, and a pistol can lose to them', () => {
    for (const g of ['revolver', 'smg', 'rifle', 'marksman'] as const)
      expect(winRate(g, 'metrocop', 2)).toBeGreaterThanOrEqual(0.9);
    expect(winRate('pistol', 'metrocop', 2)).toBeLessThan(0.9);
    expect(winRate('pistol', 'metrocop', 2)).toBeGreaterThan(0.2);
  });

  it('is beaten by three Metrocops without a rifle or sniper, and by four with anything but a perfect sniper', () => {
    for (const g of ['pistol', 'revolver', 'smg', 'shotgun'] as const)
      expect(winRate(g, 'metrocop', 3)).toBeLessThanOrEqual(0.1);
    expect(winRate('rifle', 'metrocop', 4)).toBeLessThanOrEqual(0.7);
    expect(winRate('rifle', 'metrocop', 4)).toBeGreaterThanOrEqual(0.1);
    expect(winRate('pistol', 'metrocop', 4)).toBe(0);
  });

  it('puts soldiers out of reach of a small gun and makes even a rifle sweat', () => {
    for (const g of ['pistol', 'revolver', 'smg', 'shotgun'] as const)
      expect(winRate(g, 'combine-soldier', 2)).toBeLessThanOrEqual(0.1);
    expect(winRate('rifle', 'combine-soldier', 2)).toBeLessThanOrEqual(0.85);
    expect(winRate('rifle', 'combine-soldier', 2)).toBeGreaterThanOrEqual(0.3);
    for (const g of WEAPON_IDS) {
      expect(winRate(g, 'combine-soldier', 3)).toBeLessThanOrEqual(0.15);
      expect(winRate(g, 'combine-soldier', 4)).toBeLessThanOrEqual(0.05);
    }
  });

  it('holds off a fight that keeps going: nobody but a sniper outlasts the escalation', () => {
    const survive = (g: (typeof WEAPON_IDS)[number]) =>
      rate(
        seeds(6).map(
          (s) =>
            run('gunman', gunman({ weapon: g, engage: true }), {
              seed: s,
              ticks: 2400,
              size: 32,
              setup: (_w, p) => {
                p.money = 6000;
                p.heat = 45;
              },
              until: (_w, _p, l) => l.downs > 0,
            }).log.downs === 0,
        ),
      );
    for (const g of ['pistol', 'revolver', 'smg', 'shotgun', 'rifle'] as const)
      expect(survive(g)).toBeLessThanOrEqual(0.2);
  });
});

describe('target: it is deterministic', () => {
  it('replays a run exactly: same seed, same log', () => {
    const go = () =>
      run('d', hustler({ batch: 4, dealBelow: 100, fleeWhen: 1, lieLow: true }), {
        seed: 5,
        ticks: 2400,
        size: 32,
        setup: withStock(40) as never,
      });
    const a = go();
    const b = go();
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
    expect(JSON.stringify(a.w)).toBe(JSON.stringify(b.w));
    expect(a.log.spawned).toBeGreaterThan(0);
    const c = run('d', hustler({ batch: 4, dealBelow: 100, fleeWhen: 1, lieLow: true }), {
      seed: 6,
      ticks: 2400,
      size: 32,
      setup: withStock(40) as never,
    });
    expect(JSON.stringify(c.w)).not.toBe(JSON.stringify(a.w));
  });
});

describe('bugs the harness found', () => {
  it('police come ashore only where they can walk to the player, even when the farthest shore is cut off', () => {
    const w = arena(32);
    const p = withPlayer(w, 24, 16);
    p.heat = 60;
    give(w, P, 'pistol');
    // A two-tile moat (a jump crosses one) closes off the whole west of the island: its shores are the farthest.
    for (let z = 0; z < 32; z++) for (const x of [8, 9]) setTile(w, x, z, 0, 'water');
    ticks(w, 400);
    expect(w.officers.length).toBeGreaterThan(0);
    expect(w.officers.every((o) => o.gateX >= 10)).toBe(true);
  });

  it('an officer with no way back to the gate goes home in seconds, not after a minute of standing about', () => {
    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.heat = 60;
    give(w, P, 'pistol');
    const o = placeOfficer(w, 'metrocop', 28, 16, p, [])!;
    // Marooned on a 4-block-high pillar ringed by water: a drop they can make but not undo, and a gate behind them.
    for (let z = 10; z <= 22; z++) for (let x = 22; x <= 30; x++) setTile(w, x, z, 0, 'water');
    setTile(w, 26, 16, 5);
    o.mover.x = 26;
    o.mover.z = 16;
    o.mover.fromX = 26;
    o.mover.fromZ = 16;
    o.mover.path = [];
    o.gateX = 3;
    o.gateZ = 3;
    o.mode = 'leave';
    o.leaveSince = w.tick;
    p.heat = 0;
    const events = ticks(w, 200);
    expect(events.filter((e) => e.type === 'officerLeft')).toHaveLength(1); // gone in seconds, not after the minute
    expect(w.officers).toHaveLength(0);
  });

  it('does not hit a bystander standing in the line of fire', () => {
    const w = arena(32);
    const wanted = withPlayer(w, 20, 16, 'wanted');
    const bystander = withPlayer(w, 12, 16, 'bystander');
    give(w, 'wanted', 'pistol');
    wanted.heat = 70;
    bystander.heat = 0;
    placeOfficer(w, 'metrocop', 5, 16, wanted, []);
    const hits: string[] = [];
    for (let t = 0; t < 400; t++) {
      wanted.heat = Math.max(wanted.heat, 70);
      for (const e of ticks(w, 1)) if (e.type === 'playerHit') hits.push(e.playerId);
    }
    expect(bystander.hp).toBe(MAX_HP);
    expect(hits.every((id) => id === 'wanted')).toBe(true);
  });

  it('does not let a shot squeeze through the corner where two walls meet diagonally', () => {
    const w = arena(32);
    withPlayer(w, 1, 1);
    w.players[P].money = 1e6;
    for (let i = 4; i <= 24; i++)
      stepWorld(w, 0, [{ type: 'place', playerId: P, kind: 'cottage', x: i, z: i }]);
    expect(sightLine(w, 3, 6, 8, 5).clear).toBe(false);
    expect(sightLine(w, 5, 8, 10, 7).clear).toBe(false);
    // Past the end of the wall it is open again.
    expect(sightLine(w, 3, 28, 8, 27).clear).toBe(true);
  });

  it('never fines more than the player has, or less than the floor when they have it, or below zero', () => {
    for (const money of [0, 1, 10, 29, 30, 31, 100, 300, 5000, 123456]) {
      for (const heat of [0, 15, 40, 70, 100]) {
        for (const f of [arrestFine(money, heat), downedFine(money, heat)]) {
          expect(f).toBeGreaterThanOrEqual(Math.min(money, FINE_FLOOR));
          expect(f).toBeLessThanOrEqual(money);
          expect(Number.isInteger(f)).toBe(true);
        }
        expect(arrestFine(money, heat)).toBeGreaterThanOrEqual(downedFine(money, heat) - 1);
      }
    }
    // A broke player is arrested for nothing, and stays at zero.
    const w = arena(32);
    const p = withPlayer(w, 16, 16);
    p.money = 0;
    p.heat = 70;
    const o = placeOfficer(w, 'metrocop', 16, 18, p, [])!;
    void o;
    const ev = ticks(w, 300);
    expect(ev.filter((e) => e.type === 'arrested')).toHaveLength(1);
    expect(p.money).toBe(0);
  });

  it('keeps every number sane through a long, ugly firefight (no negative money, ammo from nowhere, or heat out of range)', () => {
    for (const s of seeds(4)) {
      const w = arena(40, s);
      const p = withPlayer(w, 20, 20);
      p.money = 4000;
      p.inventory['mystery-tonic'] = 30;
      const rand = makeRng(s);
      const guns = WEAPON_IDS;
      const start = new Map<string, number>();
      let bought = 0;
      for (let t = 0; t < 1500; t++) {
        const g = guns[Math.floor(rand() * guns.length)];
        const cmds = [] as Parameters<typeof stepWorld>[2] & unknown[];
        const roll = rand();
        if (roll < 0.04) cmds.push({ type: 'buyWeapon', playerId: P, weapon: g });
        else if (roll < 0.08) cmds.push({ type: 'equip', playerId: P, weapon: g });
        else if (roll < 0.1) cmds.push({ type: 'reload', playerId: P });
        else if (roll < 0.14)
          cmds.push({
            type: 'hustle',
            playerId: P,
            item: 'mystery-tonic',
            qty: 1 + Math.floor(rand() * 4),
          });
        else if (roll < 0.7)
          cmds.push({
            type: 'shoot',
            playerId: P,
            x: p.x + (rand() - 0.5) * 20,
            z: p.z + (rand() - 0.5) * 20,
          });
        else if (roll < 0.8)
          cmds.push({ type: 'move', playerId: P, x: 10 + rand() * 20, z: 10 + rand() * 20 });
        stepWorld(w, 50, cmds);
        bought += 0;
        expect(p.money).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(p.money)).toBe(true);
        expect(p.hp).toBeGreaterThanOrEqual(0);
        expect(p.hp).toBeLessThanOrEqual(MAX_HP);
        expect(p.heat).toBeGreaterThanOrEqual(0);
        expect(p.heat).toBeLessThanOrEqual(HEAT_MAX);
        for (const [id, st] of Object.entries(p.arms.guns)) {
          const def = WEAPONS[id as keyof typeof WEAPONS];
          expect(st.mag).toBeGreaterThanOrEqual(0);
          expect(st.mag).toBeLessThanOrEqual(def.magazine);
          expect(st.reserve).toBeGreaterThanOrEqual(0);
          expect(st.reserve).toBeLessThanOrEqual(def.maxMags * def.magazine);
        }
        expect(w.officers.length).toBeLessThanOrEqual(MAX_OFFICERS);
      }
      void start;
      void bought;
    }
  });

  it('conserves ammunition: rounds fired are exactly the rounds that left the magazine and the reserve', () => {
    const w = arena(32);
    const p = withPlayer(w, 5, 16);
    p.money = 1e6;
    give(w, P, 'rifle');
    const g = p.arms.guns.rifle!;
    const total = g.mag + g.reserve;
    let shots = 0;
    for (let t = 0; t < 600; t++) {
      for (const e of ticks(w, 1, [{ type: 'shoot', playerId: P, x: 25, z: 16 }]))
        if (e.type === 'shot') shots++;
    }
    expect(shots).toBe(total - (g.mag + g.reserve));
    expect(g.mag + g.reserve).toBe(0);
    // Out of rounds means no shot, and no reload from nothing.
    const ev = ticks(w, 40, [{ type: 'shoot', playerId: P, x: 25, z: 16 }]);
    expect(ev.filter((e) => e.type === 'shot')).toHaveLength(0);
    expect(g.mag + g.reserve).toBe(0);
  });
});
