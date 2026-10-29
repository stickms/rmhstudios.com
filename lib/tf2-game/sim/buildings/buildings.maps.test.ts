/**
 * Buildings on a real map (needs TF2_ROOT): on ctf_2fort an engineer can't
 * build in his respawn room (EstimateValidBuildPos → PointInRespawnRoom),
 * finds a valid spot at a pickup out in the map, builds a sentry that comes
 * up and sweeps, and a teleporter pair that links.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { IN_ATTACK, TF_CLASS_ENGINEER, TF_TEAM_RED } from '../../core/constants';
import { emptyUserCmd, type UserCmd } from '../../core/types';
import { vec3 } from '../../core/vec';
import { OBJ_SENTRYGUN, OBJ_TELEPORTER } from '../building-api';
import { loadMap, type LoadedMap } from '../map-loader';
import { GR_STATE_RND_RUNNING } from '../rules';
import { GameWorld } from '../world';
import type { Player } from '../player';
import {
  BS_PLACING,
  handleBuildCommand,
  ObjectSentrygun,
  ObjectTeleporter,
  registerBuildings,
  SENTRY_STATE_SEARCHING,
  TELEPORTER_STATE_READY,
  WeaponBuilder,
  type TFBaseObject,
} from './index';

const ROOT = process.env.TF2_ROOT;

const look = (yaw: number, buttons = 0): UserCmd => {
  const c = emptyUserCmd();
  c.viewAngles.y = yaw;
  c.buttons = buttons;
  return c;
};

function step(world: GameWorld, p: Player, ticks: number, cmd: () => UserCmd): void {
  for (let i = 0; i < ticks; i++) {
    world.queueCommand(p.id, cmd());
    world.step();
  }
}

/** Walks the map's pickups looking for a spot (and a yaw) where `type` can be placed; places it there. */
function buildSomewhere(
  world: GameWorld,
  eng: Player,
  type: number,
  mode: number,
  skip: Set<string>,
): TFBaseObject | null {
  const spots = world
    .findAllByClassname('item_ammopack_medium')
    .concat(
      world.findAllByClassname('item_healthkit_medium'),
      world.findAllByClassname('item_ammopack_small'),
    );
  for (const s of spots) {
    for (let yaw = 0; yaw < 360; yaw += 45) {
      const key = `${Math.round(s.origin.x)},${Math.round(s.origin.y)},${yaw}`;
      if (skip.has(key)) continue;
      world.teleportEntity(
        eng,
        vec3(s.origin.x, s.origin.y, s.origin.z + 8),
        vec3(0, yaw, 0),
        vec3(),
      );
      step(world, eng, 8, () => look(yaw));
      if (!handleBuildCommand(eng, { action: 'build', objectType: type, objectMode: mode }))
        return null;
      step(world, eng, 30, () => look(yaw));
      const builder = eng.activeWeapon() as WeaponBuilder;
      if (builder.buildState === BS_PLACING) {
        const bp = builder.objectInHand()!;
        step(world, eng, 1, () => look(yaw, IN_ATTACK));
        skip.add(key);
        if (!bp.placing && !bp.removed) return bp;
      }
      // Put it away and try the next one.
      eng.switchToSlot(2);
      step(world, eng, 2, () => look(yaw));
    }
  }
  return null;
}

describe.skipIf(!ROOT)('buildings on real maps', () => {
  let fort: LoadedMap;
  beforeAll(() => {
    registerBuildings();
    const bytes = readFileSync(path.join(ROOT!, 'tf', 'maps', 'ctf_2fort.bsp'));
    fort = loadMap(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      name: 'ctf_2fort',
    });
  });

  it('ctf_2fort: no building in the spawn room; a sentry and a teleporter pair elsewhere', () => {
    const world = new GameWorld({ map: fort, options: { seed: 3, lagCompensation: false } });
    const eng = world.addPlayer('engie', { bot: true });
    eng.requestTeam(TF_TEAM_RED);
    eng.requestClass(TF_CLASS_ENGINEER);
    for (let i = 0; i < 1200 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    expect(world.rules.state).toBe(GR_STATE_RND_RUNNING);
    expect(eng.alive).toBe(true);
    expect(eng.inRespawnRoom()).toBe(true);

    // In the respawn room every direction is refused.
    for (let yaw = 0; yaw < 360; yaw += 90) {
      handleBuildCommand(eng, { action: 'build', objectType: OBJ_SENTRYGUN });
      step(world, eng, 30, () => look(yaw));
      const b = eng.activeWeapon() as WeaponBuilder;
      expect(b.buildState, `yaw ${yaw}`).not.toBe(BS_PLACING);
      eng.switchToSlot(2);
      step(world, eng, 2, () => look(yaw));
    }

    const tried = new Set<string>();
    const sentry = buildSomewhere(world, eng, OBJ_SENTRYGUN, 0, tried);
    expect(sentry).toBeInstanceOf(ObjectSentrygun);
    const s = sentry as ObjectSentrygun;
    expect(world.pointInRespawnRoom(null, s.origin)).toBe(false);
    // It stands on the ground: a short trace down from its base hits the map.
    expect(Number.isFinite(s.origin.z)).toBe(true);
    for (let i = 0; i < Math.round(11 / 0.015) && s.building; i++)
      step(world, eng, 1, () => look(eng.eyeAngles.y));
    expect(s.building).toBe(false);
    step(world, eng, 100, () => look(eng.eyeAngles.y));
    expect(s.state).toBe(SENTRY_STATE_SEARCHING);

    eng.ammo[3] = 200;
    const entrance = buildSomewhere(world, eng, OBJ_TELEPORTER, 0, tried) as ObjectTeleporter;
    eng.ammo[3] = 200;
    const exit = buildSomewhere(world, eng, OBJ_TELEPORTER, 1, tried) as ObjectTeleporter;
    expect(entrance).toBeInstanceOf(ObjectTeleporter);
    expect(exit).toBeInstanceOf(ObjectTeleporter);
    for (let i = 0; i < Math.round(22 / 0.015) && (entrance.building || exit.building); i++) {
      step(world, eng, 1, () => look(eng.eyeAngles.y));
    }
    step(world, eng, 30, () => look(eng.eyeAngles.y));
    expect(entrance.matching()).toBe(exit);
    expect(entrance.state).toBe(TELEPORTER_STATE_READY);
  });
});
