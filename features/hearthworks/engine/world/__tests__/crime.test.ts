import { describe, expect, it } from 'vitest';
import { ITEMS, OFFICERS, RECIPES, WEAPONS } from '../../content';
import {
  DOWNED_TICKS,
  HEAT_DECAY_TICKS,
  KILL_HEAT,
  HUSTLE_MARKUP,
  hustleHeat,
  MAX_HP,
  START_MONEY,
  placeOfficer,
  stepWorld,
  type WorldEvent,
} from '..';
import { arena, give, P, ticks, withPlayer } from './arena';

const ev = <T extends WorldEvent['type']>(events: WorldEvent[], type: T) =>
  events.filter((e): e is Extract<WorldEvent, { type: T }> => e.type === type);

describe('the street trade and heat', () => {
  it('hustles anything anywhere at a markup, without a stall, and heats the player up', () => {
    const w = arena();
    const p = withPlayer(w, 5, 5);
    p.inventory.bread = 3;
    const events = ticks(w, 0, [{ type: 'hustle', playerId: P, item: 'bread', qty: 2 }]);
    expect(p.money).toBe(START_MONEY + Math.floor(ITEMS.bread.price * 2 * HUSTLE_MARKUP));
    expect(p.inventory.bread).toBe(1);
    expect(p.heat).toBe(10); // 8 base + 2 for the second unit
    expect(ev(events, 'hustled')[0]).toMatchObject({ item: 'bread', qty: 2, heat: 10 });
  });

  it('heats contraband more, caps at 100, and refuses what you do not have', () => {
    const w = arena();
    const p = withPlayer(w, 5, 5);
    p.inventory['mystery-tonic'] = 50;
    ticks(w, 0, [{ type: 'hustle', playerId: P, item: 'mystery-tonic', qty: 1 }]);
    expect(p.heat).toBe(hustleHeat('mystery-tonic', 1));
    expect(p.heat).toBeGreaterThan(hustleHeat('bread', 1));
    for (let i = 0; i < 10; i++)
      ticks(w, 0, [{ type: 'hustle', playerId: P, item: 'mystery-tonic', qty: 4 }]);
    expect(p.heat).toBe(100);
    const events = ticks(w, 0, [{ type: 'hustle', playerId: P, item: 'bread', qty: 1 }]);
    expect(ev(events, 'rejected')[0]).toMatchObject({ reason: 'missing-ingredients' });
    expect(ticks(w, 0, [{ type: 'hustle', playerId: P, item: 'bread', qty: 0 }])).toContainEqual(
      expect.objectContaining({ type: 'rejected', reason: 'bad-amount' }),
    );
  });

  it('pays far more for back-alley goods than for legal ones, and no stall will buy them', () => {
    const alley = Object.values(RECIPES).filter((r) => ITEMS[r.output].contraband);
    expect(alley.length).toBeGreaterThanOrEqual(2);
    for (const r of alley)
      expect(ITEMS[r.output].price * HUSTLE_MARKUP).toBeGreaterThan(ITEMS.stew.price * 3);
    const w = arena();
    const p = withPlayer(w, 5, 5);
    stepWorld(w, 0, [{ type: 'place', playerId: P, kind: 'stall', x: 8, z: 8 }]);
    p.inventory['alley-stew'] = 1;
    p.inventory.bread = 1;
    const events = ticks(w, 0, [
      { type: 'sell', playerId: P, item: 'alley-stew', qty: 1 },
      { type: 'sell', playerId: P, item: 'bread', qty: 1 },
    ]);
    expect(ev(events, 'rejected').map((e) => e.reason)).toEqual(['contraband']);
    expect(p.heat).toBe(0); // the legal loop makes no heat
    expect(ev(events, 'sold')).toHaveLength(1);
  });

  it('cools off slowly and deterministically: one point per HEAT_DECAY_TICKS', () => {
    const w = arena();
    const p = withPlayer(w, 5, 5);
    p.heat = 10; // below the threshold, so nobody comes
    ticks(w, HEAT_DECAY_TICKS * 3);
    expect(p.heat).toBe(7);
    ticks(w, HEAT_DECAY_TICKS * 20);
    expect(p.heat).toBe(0);
  });
});

describe('guns', () => {
  it('buys, equips, restocks and refuses what you cannot afford', () => {
    const w = arena();
    const p = withPlayer(w, 5, 5);
    let events = ticks(w, 0, [{ type: 'buyWeapon', playerId: P, weapon: 'marksman' }]);
    expect(ev(events, 'rejected')[0]).toMatchObject({ reason: 'cannot-afford' });
    events = ticks(w, 0, [
      { type: 'equip', playerId: P, weapon: 'pistol' },
      { type: 'buyWeapon', playerId: P, weapon: 'pistol' },
      { type: 'equip', playerId: P, weapon: 'pistol' },
    ]);
    expect(ev(events, 'rejected')[0]).toMatchObject({ reason: 'no-weapon' }); // not yet owned
    expect(p.money).toBe(START_MONEY - WEAPONS.pistol.price);
    expect(p.arms.guns.pistol).toEqual({ mag: 12, reserve: 24 });
    expect(p.arms.equipped).toBe('pistol');
    ticks(w, 0, [{ type: 'buyWeapon', playerId: P, weapon: 'pistol' }]); // an owned gun: buying = a spare magazine
    expect(p.arms.guns.pistol?.reserve).toBe(36);
    expect(p.money).toBe(START_MONEY - WEAPONS.pistol.price - WEAPONS.pistol.ammoPrice);
    ticks(w, 0, [{ type: 'equip', playerId: P, weapon: null }]);
    expect(p.arms.equipped).toBeNull();
  });

  function duel(range: number, gun: Parameters<typeof give>[2] = 'pistol') {
    const w = arena(32);
    const p = withPlayer(w, 5, 16);
    p.money = 5000;
    give(w, P, gun);
    const o = placeOfficer(w, 'metrocop', 5 + range, 16, p, [])!;
    // Park the officer: it stands where it is and never fires, so only the player acts in these tests.
    o.readyAt = 1e9;
    o.nextPlanTick = 1e9;
    o.mover.path = [];
    o.mover.goalX = null;
    o.mover.goalZ = null;
    w.tick += 10; // past the equip delay
    return { w, p, o };
  }

  it('hits what is in line, with damage falling off over distance', () => {
    const near = duel(2);
    ticks(near.w, 0, [{ type: 'shoot', playerId: P, x: 12, z: 16 }]);
    const far = duel(8);
    ticks(far.w, 0, [{ type: 'shoot', playerId: P, x: 12, z: 16 }]);
    const dNear = OFFICERS.metrocop.hp - near.o.hp;
    const dFar = OFFICERS.metrocop.hp - far.o.hp;
    expect(dNear).toBe(13);
    expect(dFar).toBe(10);
    expect(dFar).toBeLessThan(dNear);
  });

  it('misses what is out of range, off to the side, or aimed away from', () => {
    const { w, o } = duel(11); // the pistol reaches 10
    const hp = o.hp;
    ticks(w, 0, [{ type: 'shoot', playerId: P, x: 16, z: 16 }]);
    expect(o.hp).toBe(hp);
    const side = duel(4);
    ticks(side.w, 0, [{ type: 'shoot', playerId: P, x: 5, z: 25 }]); // away from the officer
    expect(side.o.hp).toBe(OFFICERS.metrocop.hp);
  });

  it('respects the fire interval in the sim: a flood of shoot commands fires once per interval', () => {
    const { w, p } = duel(4);
    const cmds = Array.from({ length: 20 }, () => ({
      type: 'shoot' as const,
      playerId: P,
      x: 9,
      z: 16,
    }));
    const events = ticks(w, 0, cmds);
    expect(ev(events, 'shot')).toHaveLength(1);
    expect(p.arms.guns.pistol?.mag).toBe(11);
    ticks(w, WEAPONS.pistol.fireTicks - 1);
    expect(ticks(w, 0, [{ type: 'shoot', playerId: P, x: 9, z: 16 }])).toHaveLength(0); // still cooling down
    ticks(w, 1);
    expect(ev(ticks(w, 0, [{ type: 'shoot', playerId: P, x: 9, z: 16 }]), 'shot')).toHaveLength(1);
  });

  it('runs dry, reloads from the reserve over reloadTicks, and cannot shoot meanwhile', () => {
    const { w, p } = duel(4);
    const gun = p.arms.guns.pistol!;
    for (let i = 0; i < 12; i++) {
      ticks(w, WEAPONS.pistol.fireTicks, [{ type: 'shoot', playerId: P, x: 9, z: 16 }]);
    }
    expect(gun.mag).toBe(0);
    // A dry shot starts the reload instead.
    let events = ticks(w, 0, [{ type: 'shoot', playerId: P, x: 9, z: 16 }]);
    expect(ev(events, 'reloading')).toHaveLength(1);
    expect(ev(events, 'shot')).toHaveLength(0);
    ticks(w, WEAPONS.pistol.reloadTicks - 1);
    expect(gun.mag).toBe(0);
    events = ticks(w, 1);
    expect(ev(events, 'reloaded')).toHaveLength(1);
    expect(gun).toEqual({ mag: 12, reserve: 12 });
    // Manual reload with a full magazine does nothing; with no reserve it is refused.
    expect(ticks(w, 0, [{ type: 'reload', playerId: P }])).toHaveLength(0);
    gun.mag = 3;
    gun.reserve = 0;
    expect(ev(ticks(w, 0, [{ type: 'reload', playerId: P }]), 'rejected')[0]).toMatchObject({
      reason: 'no-ammo',
    });
  });

  it('scatters shotgun pellets: eight at close range, which is enough to kill a Metrocop, and far fewer at four tiles', () => {
    const near = duel(2, 'shotgun');
    ticks(near.w, 0, [{ type: 'shoot', playerId: P, x: 7, z: 16 }]);
    expect(near.w.officers).toHaveLength(0); // 8 pellets of 8 each, all inside the hit radius
    const far = duel(4, 'shotgun');
    ticks(far.w, 0, [{ type: 'shoot', playerId: P, x: 9, z: 16 }]);
    expect(far.o.hp).toBeGreaterThan(0);
    expect(far.o.hp).toBeLessThan(OFFICERS.metrocop.hp);
  });

  it('does not let a shot through a ledge', () => {
    const { w, o } = duel(5);
    for (let z = 14; z <= 18; z++) {
      w.height[z * w.size + 8] = 6; // a wall of high ground between them
    }
    ticks(w, 0, [{ type: 'shoot', playerId: P, x: 10, z: 16 }]);
    expect(o.hp).toBe(OFFICERS.metrocop.hp);
  });

  it('kills an officer: cash drops, heat jumps, an event says so', () => {
    const { w, p, o } = duel(5, 'marksman');
    const before = p.money;
    const events = ticks(w, 0, [{ type: 'shoot', playerId: P, x: 10, z: 16 }]); // one round kills a Metrocop
    expect(ev(events, 'officerDown')[0]).toMatchObject({
      officerId: o.id,
      drop: OFFICERS.metrocop.drop,
    });
    expect(w.officers).toHaveLength(0);
    expect(p.money).toBe(before + OFFICERS.metrocop.drop);
    expect(p.heat).toBeGreaterThanOrEqual(KILL_HEAT);
  });
});

describe('getting hurt', () => {
  function shootout() {
    const w = arena(32);
    const p = withPlayer(w, 5, 16);
    give(w, P, 'pistol');
    p.inventory['mystery-tonic'] = 4;
    p.inventory.bread = 2;
    p.heat = 60;
    const o = placeOfficer(w, 'combine-soldier', 14, 16, p, [])!;
    return { w, p, o };
  }

  it('costs health when an armed player is shot, and regrows it once safe', () => {
    const { w, p, o } = shootout();
    ticks(w, 0, [{ type: 'equip', playerId: P, weapon: 'pistol' }]);
    for (let i = 0; i < 400 && p.hp === MAX_HP; i++) ticks(w, 1);
    expect(p.hp).toBeLessThan(MAX_HP);
    expect(o.firedTick).toBeGreaterThan(0);
    // Make the player safe: no officers, no heat.
    w.officers = [];
    p.heat = 0;
    const hurt = p.hp;
    ticks(w, 300);
    expect(p.hp).toBeGreaterThan(hurt);
  });

  it('downs a player at 0 health, then wakes them at the meadow, fined, contraband gone, inventory kept', () => {
    const { w, p } = shootout();
    p.hp = 4;
    const moneyBefore = p.money;
    let downed = false;
    const all: WorldEvent[] = [];
    for (let i = 0; i < 600 && !downed; i++) {
      const e = ticks(w, 1);
      all.push(...e);
      downed = ev(e, 'downed').length > 0;
    }
    expect(downed).toBe(true);
    expect(p.hp).toBe(0);
    // Out of action while down: commands are refused, movement quietly ignored.
    const x = p.x;
    const events = ticks(w, 0, [
      { type: 'move', playerId: P, x: 9, z: 9 },
      { type: 'hustle', playerId: P, item: 'bread', qty: 1 },
    ]);
    expect(p.x).toBe(x);
    expect(ev(events, 'rejected').map((e) => e.reason)).toEqual(['downed']);
    // Everyone hunting them leaves.
    expect(w.officers.every((o) => o.mode === 'leave')).toBe(true);
    const after = ticks(w, DOWNED_TICKS);
    const r = ev(after, 'respawned')[0];
    const mid = Math.floor(w.size / 2);
    expect(r).toMatchObject({ playerId: P, x: mid, z: mid });
    expect(p).toMatchObject({ x: mid, z: mid, hp: MAX_HP, heat: 0 });
    expect(p.inventory['mystery-tonic']).toBeUndefined();
    expect(p.inventory.bread).toBe(2);
    expect(p.money).toBeLessThan(moneyBefore);
    expect(r.fine).toBe(moneyBefore - p.money);
    expect(p.arms.guns.pistol).toBeDefined();
  });
});
