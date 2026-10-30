/**
 * Grenades: the pouch's carry limits and throws (full, lob, medium), HE radius damage falling off with
 * distance and stopped by walls, flashbang blindness by view angle and distance (and smoke blocking
 * it), the smoke's duration and its line-of-sight block, the molotov's fire and a smoke putting it out.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { IN_ATTACK, IN_ATTACK2, TICK_INTERVAL } from '../tf2-game/core/constants';
import { cmdFor, csTestWorld, setupCs } from './__fixtures__/cs-world';
import { CS_TEAM_CT, CS_TEAM_T, INFERNO_FLAME_LIFETIME, SMOKE_DURATION } from './constants';
import type { CsPlayer } from './player';
import { SLOT_PDA } from '../tf2-game/sim/weapon-api';
import {
  AREA_FIRE,
  AREA_SMOKE,
  CsArea,
  CsGrenadePouch,
  CsGrenadeProjectile,
  csRadiusDamage,
  flashAmount,
  flashPlayers,
  smokeBlocksLine,
} from './weapons/grenades';
import type { CsWorld } from './world';

beforeAll(setupCs);

function pair(w: CsWorld): { t: CsPlayer; ct: CsPlayer } {
  const t = w.addPlayer('t') as CsPlayer;
  const ct = w.addPlayer('ct') as CsPlayer;
  t.requestTeam(CS_TEAM_T);
  t.requestClass(1);
  ct.requestTeam(CS_TEAM_CT);
  ct.requestClass(1);
  for (let i = 0; i < 5; i++) w.step();
  return { t, ct };
}

const at = (w: CsWorld, p: CsPlayer, x: number, y: number, yaw = 0) => {
  w.teleportEntity(p, { x, y, z: 0.03125 }, { x: 0, y: yaw, z: 0 }, { x: 0, y: 0, z: 0 });
  p.eyeAngles.y = yaw;
  p.armor = 0;
};

let n = 0;
function idle(w: CsWorld, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    w.forEachPlayer((p) =>
      w.queueCommand(p.id, cmdFor(w, ++n, { viewAngles: { x: 0, y: p.eyeAngles.y, z: 0 } })),
    );
    w.step();
    w.drainEvents();
  }
}

describe('grenades', () => {
  it('HE: radius damage falls off with distance, stops at the radius and at walls', () => {
    const w = csTestWorld({ settings: { freezeTime: 0 } });
    const { t, ct } = pair(w);
    at(w, ct, -800, 300);
    const hit = (dist: number): number => {
      ct.health = 100;
      csRadiusDamage(w, { x: -800 - dist, y: 300, z: 30 }, 99, 350, t.id, 44, 'hegrenade', 1 << 6);
      return 100 - ct.health;
    };
    const near = hit(20);
    const mid = hit(150);
    const far = hit(300);
    expect(near).toBeGreaterThan(80);
    expect(mid).toBeLessThan(near);
    expect(far).toBeLessThan(mid);
    expect(hit(400)).toBe(0);
    // The mid crate (concrete, x −60…60) shields a player behind it.
    at(w, ct, 120, 0);
    ct.health = 100;
    csRadiusDamage(w, { x: -120, y: 0, z: 30 }, 99, 350, t.id, 44, 'hegrenade', 1 << 6);
    expect(ct.health).toBe(100);
  });

  it('flashbang: blinds by view angle and distance; smoke blocks it', () => {
    const eye = { x: 0, y: 0, z: 64 };
    const fwd = { x: 1, y: 0, z: 0 };
    const facing = flashAmount(eye, fwd, { x: 200, y: 0, z: 64 });
    const side = flashAmount(eye, fwd, { x: 0, y: 200, z: 64 });
    const behind = flashAmount(eye, fwd, { x: -200, y: 0, z: 64 });
    expect(facing).toBe(1);
    expect(side).toBeLessThan(facing);
    expect(behind).toBeLessThan(side);
    expect(behind).toBeGreaterThan(0);
    expect(flashAmount(eye, fwd, { x: 1000, y: 0, z: 64 })).toBeLessThan(facing);
    expect(flashAmount(eye, fwd, { x: 2000, y: 0, z: 64 })).toBe(0);

    const w = csTestWorld({ settings: { freezeTime: 0 } });
    const { t, ct } = pair(w);
    at(w, t, -800, 300, 0);
    at(w, ct, -800, 500, 180);
    flashPlayers(w, { x: -600, y: 300, z: 64 });
    // t looks at it (east), ct looks away (west).
    expect(t.flashDuration).toBeGreaterThan(4);
    expect(ct.flashDuration).toBeGreaterThan(0);
    expect(ct.flashDuration).toBeLessThan(t.flashDuration);
    // A smoke between the flash and the eye stops it.
    t.flashDuration = 0;
    w.spawnEntity('cs_area', (e) => {
      const a = e as CsArea;
      a.kind = AREA_SMOKE;
      a.radius = 100;
      a.startedAt = w.curtime;
      a.endsAt = w.curtime + 18;
      a.origin.x = -700;
      a.origin.y = 300;
      a.origin.z = 0;
    });
    flashPlayers(w, { x: -600, y: 300, z: 64 });
    expect(t.flashDuration).toBe(0);
  });

  it('smoke: blooms when the grenade comes to rest, lasts ~18 s and blocks sight', () => {
    const w = csTestWorld({ settings: { freezeTime: 0 } });
    const { t } = pair(w);
    at(w, t, -900, 0, 0);
    t.money = 1000;
    w.teleportEntity(t, { x: -1300, y: 0, z: 0.03125 }, null, null);
    expect(t.buy('smokegrenade')).toBeNull();
    w.teleportEntity(t, { x: -900, y: 0, z: 0.03125 }, null, null);
    // Out with slot 4, pin pulled with +attack, let go: a full throw east.
    const throwCmd = (buttons: number, select = 0) => ({
      buttons,
      weaponSelect: select,
      viewAngles: { x: -10, y: 0, z: 0 },
    });
    w.queueCommand(t.id, cmdFor(w, ++n, throwCmd(0, SLOT_PDA + 1)));
    w.step();
    expect(t.activeWeapon()).toBeInstanceOf(CsGrenadePouch);
    for (let i = 0; i < 80; i++) {
      w.queueCommand(t.id, cmdFor(w, ++n, throwCmd(IN_ATTACK)));
      w.step();
    }
    w.queueCommand(t.id, cmdFor(w, ++n, throwCmd(0)));
    w.step();
    const flying = w.findAllByClassname('cs_grenade_projectile');
    expect(flying).toHaveLength(1);
    expect((flying[0] as CsGrenadeProjectile).velocity.x).toBeGreaterThan(400);
    let smoke: CsArea | null = null;
    for (let i = 0; i < 66 * 8 && !smoke; i++) {
      idle(w, 1);
      smoke = (w.findAllByClassname('cs_area')[0] as CsArea | undefined) ?? null;
    }
    expect(smoke?.kind).toBe(AREA_SMOKE);
    const c = smoke!.origin;
    expect(
      smokeBlocksLine(
        w,
        { x: c.x - 400, y: c.y, z: c.z + 40 },
        { x: c.x + 400, y: c.y, z: c.z + 40 },
      ),
    ).toBe(true);
    expect(
      smokeBlocksLine(
        w,
        { x: c.x - 400, y: c.y + 600, z: c.z + 40 },
        { x: c.x + 400, y: c.y + 600, z: c.z + 40 },
      ),
    ).toBe(false);
    const born = w.curtime;
    while (!smoke!.removed && w.curtime - born < 30) idle(w, 6);
    expect(w.curtime - born).toBeGreaterThan(SMOKE_DURATION - 0.6);
    expect(w.curtime - born).toBeLessThan(SMOKE_DURATION + 0.6);
  });

  it('the throw strengths: a lob (+attack2) goes slower than a full throw', () => {
    const speeds: number[] = [];
    for (const buttons of [IN_ATTACK, IN_ATTACK | IN_ATTACK2, IN_ATTACK2]) {
      const w = csTestWorld({ settings: { freezeTime: 0 } });
      const { t } = pair(w);
      t.giveNamedWeapon('weapon_hegrenade');
      at(w, t, -900, 0, 0);
      w.queueCommand(t.id, cmdFor(w, ++n, { weaponSelect: SLOT_PDA + 1 }));
      w.step();
      for (let i = 0; i < 80; i++) {
        w.queueCommand(t.id, cmdFor(w, ++n, { buttons }));
        w.step();
      }
      w.queueCommand(t.id, cmdFor(w, ++n, {}));
      w.step();
      const g = w.findAllByClassname('cs_grenade_projectile')[0] as CsGrenadeProjectile;
      speeds.push(Math.hypot(g.velocity.x, g.velocity.y, g.velocity.z));
    }
    expect(speeds[0]).toBeGreaterThan(speeds[1]);
    expect(speeds[1]).toBeGreaterThan(speeds[2]);
  });

  it('molotov: the fire burns standing players for ~7 s; a smoke puts it out', () => {
    const w = csTestWorld({ settings: { freezeTime: 0 } });
    const { t, ct } = pair(w);
    at(w, ct, 600, 300);
    const fire = w.spawnEntity('cs_area', (e) => {
      const a = e as CsArea;
      a.kind = AREA_FIRE;
      a.radius = 150;
      a.startedAt = w.curtime;
      a.endsAt = w.curtime + INFERNO_FLAME_LIFETIME;
      a.owner = t.id;
      a.origin.x = 600;
      a.origin.y = 300;
      a.origin.z = 0;
    }) as CsArea;
    idle(w, Math.round(1 / TICK_INTERVAL));
    expect(100 - ct.health).toBeGreaterThanOrEqual(30);
    expect(100 - ct.health).toBeLessThanOrEqual(50);
    w.spawnEntity('cs_area', (e) => {
      const a = e as CsArea;
      a.kind = AREA_SMOKE;
      a.radius = 144;
      a.startedAt = w.curtime;
      a.endsAt = w.curtime + 18;
      a.origin.x = 620;
      a.origin.y = 300;
      a.origin.z = 0;
    });
    idle(w, 4);
    expect(fire.removed).toBe(true);
  });

  it('carry limits (ammo_grenade_limit_*): two flashbangs, four in all, one fire grenade', () => {
    const w = csTestWorld({ settings: { freezeTime: 0 } });
    const { t } = pair(w);
    expect(t.giveNamedWeapon('weapon_flashbang')).not.toBeNull();
    expect(t.giveNamedWeapon('weapon_flashbang')).not.toBeNull();
    expect(t.giveNamedWeapon('weapon_flashbang')).toBeNull();
    expect(t.giveNamedWeapon('weapon_molotov')).not.toBeNull();
    expect(t.giveNamedWeapon('weapon_incgrenade')).toBeNull();
    expect(t.giveNamedWeapon('weapon_hegrenade')).not.toBeNull();
    expect(t.giveNamedWeapon('weapon_decoy')).toBeNull();
    expect((t.weapons[SLOT_PDA] as CsGrenadePouch).total()).toBe(4);
  });
});
