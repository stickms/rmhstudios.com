/**
 * Items beyond stock (sim/items): attributes applied where the SDK hooks them, against the SDK's
 * formulas for well-known unlocks; the equip checks (the saved-loadout validation plus the game's
 * rules); when a new loadout goes on (respawn room, resupply, respawn); the public form every client
 * renders from; and determinism with items. With TF2_ROOT set, the real catalog build is checked
 * against the fixture's attribute values.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_ATTACK2,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../../core/constants';
import { RADIUS_DAMAGE } from '../../data/damage';
import { MINIGUN, ROCKET } from '../../data/weapons';
import { buildCatalog } from '../../../tf2-loadout/catalog-build';
import { TF_COND } from '../conditions';
import type { LoadoutEvent } from '../events';
import type { Player } from '../player';
import { TF_WEAPON_SWITCH_TIME, createWeapon } from '../weapon-api';
import { weaponSpecFor } from '../loadout';
import { Medigun } from '../weapons/medigun';
import { Minigun } from '../weapons/minigun';
import { RocketLauncher } from '../weapons/launchers';
import { CompoundBow } from '../weapons/bow';
import {
  cmd,
  damageTo,
  makeWorld,
  place,
  run,
  setRandomCritsEnabled,
  startRound,
  ticks,
} from '../weapons/__fixtures__/world';
import { hookPlayer, hookWeapon } from './attributes';
import { applyLoadoutCommand } from './command';
import { checkGameLoadout, decodeItems, encodeItems, planLoadout } from './loadout';
import { setItemCatalog } from './registry';
import { resolveItem, weaponSpecForItem } from './resolve';
import { weaponScript } from './scripts';
import { ITEMS, testCatalog } from './__fixtures__/catalog';
import type { GameWorld } from '../world';

beforeAll(() => setRandomCritsEnabled(false));
afterAll(() => {
  setRandomCritsEnabled(false);
  setItemCatalog(null);
});
beforeEach(() => setItemCatalog(testCatalog()));

/** A round running with one player per (team, class), each given `slots` for its class first. */
function arena(
  specs: Array<{ team: number; cls: number; slots?: Record<string, { item: number }> }>,
): {
  world: GameWorld;
  players: Player[];
} {
  const world = makeWorld();
  const players = specs.map((s, i) => {
    const p = world.addPlayer(`p${i}`, { bot: true });
    p.requestTeam(s.team);
    // Chosen before the class is picked, so the first spawn puts it on.
    if (s.slots) p.setClassLoadout(s.cls, s.slots);
    p.requestClass(s.cls);
    return p;
  });
  startRound(world);
  run(world, 5);
  world.drainEvents();
  return { world, players };
}

const rocketsOf = (world: GameWorld): Array<{ speed: number; damage: number }> => {
  const out: Array<{ speed: number; damage: number }> = [];
  world.forEachEntity((e) => {
    if (e.classname === 'tf_projectile_rocket') {
      const v = e.velocity;
      out.push({
        speed: Math.hypot(v.x, v.y, v.z),
        damage: (e as unknown as { damage: number }).damage,
      });
    }
  });
  return out;
};

describe('attributes applied where the SDK hooks them', () => {
  it('Direct Hit: rocket speed ×1.8, blast radius ×0.3, damage ×1.25, mini-crits airborne targets', () => {
    const spec = weaponSpecForItem(127, TF_CLASS_SOLDIER)!;
    expect(spec.classname).toBe('tf_weapon_rocketlauncher_directhit');
    expect(spec.stats?.damage).toBeCloseTo(90 * 1.25);
    expect(spec.stats?.maxClip).toBe(4);
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { primary: { item: 127 } } },
    ]);
    const [s] = players;
    const w = s.activeWeapon()!;
    expect(w).toBeInstanceOf(RocketLauncher);
    expect(w.defindex).toBe(127);
    // CTFBaseRocket::GetRadius: TF_ROCKET_RADIUS × mult_explosion_radius.
    expect(hookWeapon(w, s, 'mult_explosion_radius', RADIUS_DAMAGE.rocketRadius)).toBeCloseTo(
      RADIUS_DAMAGE.rocketRadius * 0.3,
    );
    run(world, ticks(1));
    run(world, 2, (p) => cmd(p, IN_ATTACK, 0, 0));
    const rockets = rocketsOf(world);
    expect(rockets.length).toBeGreaterThan(0);
    expect(rockets[0].speed).toBeCloseTo(ROCKET.speed * 1.8, 0);
    expect(rockets[0].damage).toBeCloseTo(112.5);
  });

  it('mini_crit_airborne: a target blasted into the air takes a mini-crit from the Direct Hit, not from stock', () => {
    for (const [item, expected] of [
      [127, 1],
      [18, 0],
    ] as const) {
      const { world, players } = arena([
        { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { primary: { item } } },
        { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
      ]);
      const [s, v] = players;
      place(world, s, 0, 0, 0);
      run(world, ticks(1.1), (p) => (p === v ? null : cmd(p, 0, 0, 0)));
      v.health = 10000;
      world.drainEvents();
      let crit = -1;
      for (let i = 0; i < ticks(1.5) && crit < 0; i++) {
        // Held in the air where an enemy blast put it (CTFPlayer::InAirDueToExplosion).
        place(world, v, 300, 0, 180, 160);
        v.blastJumpState = 4;
        run(world, 1, (p) => (p === v ? null : cmd(p, IN_ATTACK, -20, 0)));
        for (const e of damageTo(world.drainEvents(), v.id)) crit = e.crit;
      }
      expect(crit).toBe(expected);
    }
  });

  it('Black Box: a three-rocket clip, and health back by the damage dealt (up to 20)', () => {
    expect(weaponSpecForItem(228, TF_CLASS_SOLDIER)!.stats?.maxClip).toBe(3); // round(4 × 0.75)
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { primary: { item: 228 } } },
      { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS },
    ]);
    const [s, v] = players;
    expect(s.activeWeapon()!.maxClip).toBe(3);
    place(world, s, 0, 0, 0);
    place(world, v, 250, 0, 180);
    run(world, ticks(1.1), (p) => cmd(p, 0, 0, p === s ? 0 : 180));
    s.health = 100;
    v.health = 10000;
    world.drainEvents();
    let hit = false;
    for (let i = 0; i < ticks(1) && !hit; i++) {
      run(world, 1, (p) => (p === s ? cmd(p, IN_ATTACK, 4, 0) : cmd(p, 0, 0, 180)));
      hit = damageTo(world.drainEvents(), v.id).length > 0;
    }
    expect(hit).toBe(true);
    expect(s.health).toBeGreaterThan(100);
    expect(s.health).toBeLessThanOrEqual(120);
  });

  it('Liberty Launcher: clip 5, speed ×1.4, damage ×0.75', () => {
    const spec = weaponSpecForItem(414, TF_CLASS_SOLDIER)!;
    expect(spec.stats?.maxClip).toBe(5);
    expect(spec.stats?.damage).toBeCloseTo(67.5);
    const w = createWeapon(spec)!;
    expect(hookWeapon(w, null, 'mult_projectile_speed', ROCKET.speed)).toBeCloseTo(1540);
  });

  it('Degreaser: draws in 40 % of the switch time, and the next weapon draws 30 % faster', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_PYRO, slots: { primary: { item: 215 } } },
    ]);
    const [p] = players;
    run(world, ticks(1));
    expect(p.switchToSlot(1)).toBe(true);
    run(world, ticks(1));
    let t = world.curtime;
    expect(p.switchToSlot(0)).toBe(true);
    expect(p.activeWeapon()!.nextPrimaryAttack - t).toBeCloseTo(TF_WEAPON_SWITCH_TIME * 0.4, 5);
    run(world, ticks(1));
    t = world.curtime;
    expect(p.switchToSlot(1)).toBe(true);
    expect(p.activeWeapon()!.nextPrimaryAttack - t).toBeCloseTo(TF_WEAPON_SWITCH_TIME * 0.7, 5);
  });

  it('Kritzkrieg: charges 25 % faster and releases crits instead of invulnerability', () => {
    const stock = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_MEDIC },
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER },
    ]);
    const kritz = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_MEDIC, slots: { secondary: { item: 35 } } },
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER },
    ]);
    const charge: number[] = [];
    for (const { world, players } of [stock, kritz]) {
      const [m, s] = players;
      place(world, m, 0, 0, 0);
      place(world, s, 120, 0, 0);
      m.switchToSlot(1);
      run(world, ticks(0.6));
      for (let i = 0; i < ticks(4); i++)
        run(world, 1, (p) => (p === m ? cmd(p, IN_ATTACK, 0, 0) : cmd(p, 0, 0, 0)));
      const mg = m.weapons[1] as Medigun;
      charge.push(mg.chargeLevel);
      if (mg.defindex === 35) {
        mg.chargeLevel = 1;
        run(world, 2, (p) => (p === m ? cmd(p, IN_ATTACK | IN_ATTACK2, 0, 0) : cmd(p, 0, 0, 0)));
        expect(s.cond.has(TF_COND.CRITBOOSTED)).toBe(true);
        expect(s.cond.has(TF_COND.INVULNERABLE)).toBe(false);
      }
    }
    expect(charge[1] / charge[0]).toBeCloseTo(1.25, 1);
  });

  it('Natascha: spin-up × 1.3, damage × 0.75', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_HEAVYWEAPONS, slots: { primary: { item: 41 } } },
    ]);
    const [h] = players;
    const w = h.activeWeapon() as Minigun;
    expect(w).toBeInstanceOf(Minigun);
    expect(w.stats.damage).toBeCloseTo(9 * 0.75);
    run(world, ticks(1));
    const t = world.curtime + 0.015;
    run(world, 1, (p) => cmd(p, IN_ATTACK2, 0, 0));
    expect(w.nextPrimaryAttack - t).toBeCloseTo(MINIGUN.spinUpTime * 1.3, 2);
  });

  it('Gunboats: worn, not held — no secondary, and a rocket jump hurts 40 % as much', () => {
    const plan = planLoadout(TF_CLASS_SOLDIER, { secondary: { item: 133 } }, weaponSpecFor);
    expect(plan.slots.find((s) => s.key === 'secondary')?.spec).toBeNull();
    expect(plan.worn.length).toBe(1);
    const { players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { secondary: { item: 133 } } },
    ]);
    const [s] = players;
    expect(s.weapons[1]).toBeNull();
    expect(hookPlayer(s, 'rocket_jump_dmg_reduction', 100)).toBeCloseTo(40);
    expect(decodeItems(s.items).weapons.find((w) => w.slot === 'secondary')?.worn).toBe(true);
  });

  it('Powerjack: provides move speed only while it is out (provide_on_active)', () => {
    const { world, players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_PYRO, slots: { melee: { item: 214 } } },
    ]);
    const [p] = players;
    const base = p.computeMaxSpeed();
    p.switchToSlot(2);
    run(world, 1);
    expect(p.computeMaxSpeed() / base).toBeCloseTo(1.15, 3);
    p.switchToSlot(0);
    run(world, 1);
    expect(p.computeMaxSpeed()).toBeCloseTo(base, 3);
  });

  it('Ambassador: no random crits (mult_crit_chance 0); its headshot mode (set_weapon_mode 1) is simulated', () => {
    const play = resolveItem(61, TF_CLASS_SPY)!;
    expect(play.kind).toBe('weapon');
    expect(play.unsupported).toEqual([]);
    expect(play.unsupported).not.toContain('mult_crit_chance');
    const spec = weaponSpecForItem(61, TF_CLASS_SPY)!;
    expect(spec.stats?.fireDelay).toBeCloseTo(0.5 * 1.2);
    const w = createWeapon(spec)!;
    expect(hookWeapon(w, null, 'mult_crit_chance', 0.02)).toBe(0);
  });

  it('Huntsman: its own class (CTFCompoundBow) is simulated, with the max-ammo penalty applied', () => {
    const play = resolveItem(56, TF_CLASS_SNIPER)!;
    expect(play.kind).toBe('weapon');
    expect(play.unsupported).toEqual([]);
    const { players } = arena([
      { team: TF_TEAM_RED, cls: TF_CLASS_SNIPER, slots: { primary: { item: 56 } } },
    ]);
    const [s] = players;
    expect(s.weapons[0]).toBeInstanceOf(CompoundBow);
    expect(s.weapons[0]!.defindex).toBe(56);
    // mult_maxammo_primary 0.5 on the Sniper's 25: RoundFloatToInt( 12.5 ) is 12 (halves to even).
    expect(s.maxAmmo[1]).toBe(12);
  });

  it('Shortstop: an unlock script on the Pistol class, reload ×1.5, and its shove reported', () => {
    const spec = weaponSpecForItem(220, 1)!;
    expect(spec.classname).toBe('tf_weapon_handgun_scout_primary');
    expect(spec.stats?.maxClip).toBe(4);
    expect(spec.stats?.reloadTime).toBeCloseTo(
      weaponScript('tf_weapon_handgun_scout_primary')!.primary.timeReload * 1.5,
      5,
    );
    expect(resolveItem(220, 1)!.unsupported).toContain('mechanic:shove');
  });
});

describe('equip checks', () => {
  const cat = () => testCatalog();
  it('accepts a valid loadout and drops taunts and placement offsets', () => {
    const r = checkGameLoadout(cat(), 'soldier', {
      primary: { item: 127 },
      cosmetic2: { item: 30001, paint: 5029, style: 1, effect: 13, fx: { s: 2 } },
      taunt1: { item: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slots.taunt1).toBeUndefined();
    expect(r.slots.cosmetic1?.item).toBe(30001);
    expect(r.slots.cosmetic1?.fx).toBeUndefined();
  });
  it('refuses an item the class cannot use', () => {
    expect(checkGameLoadout(cat(), 'scout', { primary: { item: 127 } })).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });
  it('refuses an item in the wrong slot', () => {
    expect(checkGameLoadout(cat(), 'soldier', { secondary: { item: 127 } })).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });
  it('refuses a repeated cosmetic', () => {
    expect(
      checkGameLoadout(cat(), 'soldier', {
        cosmetic1: { item: 30003 },
        cosmetic2: { item: 30003 },
      }),
    ).toMatchObject({ ok: false, reason: 'rules' });
  });
  it('refuses cosmetics that cover the same region, or conflicting ones', () => {
    expect(
      checkGameLoadout(cat(), 'soldier', {
        cosmetic1: { item: 30001 },
        cosmetic2: { item: 30002 },
      }),
    ).toMatchObject({ ok: false, reason: 'rules' });
    expect(
      checkGameLoadout(cat(), 'soldier', {
        cosmetic1: { item: 30003 },
        cosmetic2: { item: 30006 },
      }),
    ).toMatchObject({ ok: false, reason: 'rules' });
  });
  it('refuses more than three cosmetics, and works without a catalog never', () => {
    expect(
      checkGameLoadout(cat(), 'soldier', {
        cosmetic1: { item: 30001 },
        cosmetic2: { item: 30003 },
        cosmetic3: { item: 30004 },
        cosmetic4: { item: 30005 },
      }),
    ).toMatchObject({ ok: false, reason: 'rules' });
    expect(checkGameLoadout(null, 'soldier', {})).toMatchObject({
      ok: false,
      reason: 'no-catalog',
    });
  });
  it('refuses a paint on an unpaintable item and an unknown style', () => {
    expect(
      checkGameLoadout(cat(), 'soldier', { cosmetic1: { item: 30002, paint: 5029 } }),
    ).toMatchObject({ ok: false });
    expect(
      checkGameLoadout(cat(), 'soldier', { cosmetic1: { item: 30001, style: 7 } }),
    ).toMatchObject({ ok: false });
  });
  it('takes a killstreak kit on a weapon only, and a killstreaker only with a sheen', () => {
    expect(
      checkGameLoadout(cat(), 'soldier', { primary: { item: 127, sheen: 6, streaker: 2006 } }),
    ).toMatchObject({ ok: true });
    expect(
      checkGameLoadout(cat(), 'soldier', { cosmetic1: { item: 30001, sheen: 6 } }),
    ).toMatchObject({ ok: false });
    expect(
      checkGameLoadout(cat(), 'soldier', { primary: { item: 127, streaker: 2006 } }),
    ).toMatchObject({ ok: false });
    expect(checkGameLoadout(cat(), 'soldier', { primary: { item: 127, sheen: 9 } })).toMatchObject({
      ok: false,
    });
  });
});

describe('when a new loadout goes on', () => {
  const answers = (world: GameWorld): LoadoutEvent[] =>
    world.drainEvents().filter((e): e is LoadoutEvent => e.type === 'loadout');

  it('outside the respawn room: pending until a resupply cabinet', () => {
    const { world, players } = arena([{ team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER }]);
    const [s] = players;
    s.ownRespawnRoomCount = 0;
    expect(applyLoadoutCommand(world, s, 'soldier', { primary: { item: 127 } })).toBe('pending');
    expect(answers(world)[0]).toMatchObject({ status: 'pending', player: s.id, to: s.id });
    expect(s.weapons[0]!.defindex).toBe(18);
    expect(s.loadoutPending).toBe(true);
    s.regenerate();
    expect(s.weapons[0]!.defindex).toBe(127);
    expect(s.loadoutPending).toBe(false);
  });

  it('in the own respawn room: on at once (ForceRegenerateAndRespawn)', () => {
    const { world, players } = arena([{ team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER }]);
    const [s] = players;
    s.ownRespawnRoomCount = 1;
    s.inRespawnRoom = () => true;
    expect(applyLoadoutCommand(world, s, 'soldier', { primary: { item: 228 } })).toBe('applied');
    expect(s.weapons[0]!.defindex).toBe(228);
    expect(s.loadoutPending).toBe(false);
  });

  it('dead, or for another class: at the next spawn as that class', () => {
    const { world, players } = arena([{ team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER }]);
    const [s] = players;
    expect(applyLoadoutCommand(world, s, 'pyro', { primary: { item: 215 } })).toBe('pending');
    s.commitSuicide();
    s.requestClass(TF_CLASS_PYRO);
    world.rules.respawnNow(s);
    expect(s.playerClass).toBe(TF_CLASS_PYRO);
    expect(s.weapons[0]!.defindex).toBe(215);
  });

  it('a refused loadout changes nothing', () => {
    const { world, players } = arena([{ team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER }]);
    const [s] = players;
    expect(applyLoadoutCommand(world, s, 'soldier', { primary: { item: 215 } })).toBe('refused');
    expect(answers(world)[0]).toMatchObject({ status: 'refused', reason: 'invalid' });
    expect(s.loadoutPending).toBe(false);
  });
});

describe('the public form', () => {
  it('round-trips weapons, worn items and cosmetics with paint, effect, style, festive and war paint', () => {
    const items = {
      weapons: [
        { slot: 'primary', item: 127, festive: true, kit: 102, wear: 2, seed: 12345 },
        { slot: 'secondary', item: 133, worn: true },
        { slot: 'melee', item: 6 },
        { slot: 'action', item: 5000 },
      ],
      cosmetics: [{ item: 30001, paint: 5029, effect: 13, style: 1 }, { item: 30003 }],
    };
    const s = encodeItems(items);
    expect(s).toMatch(/^[\w./]+$/);
    expect(s.length).toBeLessThan(200);
    expect(decodeItems(s)).toEqual(items);
  });

  it('a player record carries what is equipped', () => {
    const { players } = arena([
      {
        team: TF_TEAM_RED,
        cls: TF_CLASS_SOLDIER,
        slots: { primary: { item: 127 }, cosmetic1: { item: 30001 } },
      },
    ]);
    const rec: Record<string, unknown> = {};
    players[0].writeNet(rec as never);
    const items = decodeItems(rec.items as string);
    expect(items.weapons.map((w) => w.item)).toEqual([127, 10, 6]);
    expect(items.cosmetics).toEqual([{ item: 30001 }]);
    expect(rec.loadoutPending).toBe(false);
  });
});

describe('determinism with items', () => {
  it('two worlds with the same seed and loadouts stay identical', () => {
    const states: string[] = [];
    for (let k = 0; k < 2; k++) {
      const { world, players } = arena([
        { team: TF_TEAM_RED, cls: TF_CLASS_SOLDIER, slots: { primary: { item: 127 } } },
        { team: TF_TEAM_BLUE, cls: TF_CLASS_HEAVYWEAPONS, slots: { primary: { item: 41 } } },
      ]);
      const [s, h] = players;
      place(world, s, -300, 0, 0);
      place(world, h, 300, 0, 180);
      for (let i = 0; i < ticks(3); i++)
        run(world, 1, (p) => cmd(p, IN_ATTACK, 2, p === s ? 0 : 180));
      states.push(
        JSON.stringify(
          players.map((p) => [p.health, p.origin, p.weapons.map((w) => w && [w.defindex, w.clip])]),
        ),
      );
    }
    expect(states[0]).toBe(states[1]);
  });
});

const TF2_ROOT = process.env.TF2_ROOT;
const itemsGame = TF2_ROOT ? join(TF2_ROOT, 'tf/scripts/items/items_game.txt') : '';
describe.skipIf(!TF2_ROOT || !existsSync(itemsGame))('the real catalog build', () => {
  it('carries item_class and the gameplay attributes the fixture uses', () => {
    const decode = (p: string) => {
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
    for (const fixture of ITEMS.filter((i) => i.id < 30000)) {
      const real = catalog.items.find((i) => i.id === fixture.id);
      expect(real?.ic, fixture.n).toBe(fixture.ic);
      expect(real?.at, fixture.n).toEqual(fixture.at);
    }
  });
});
