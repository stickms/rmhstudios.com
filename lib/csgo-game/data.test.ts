/**
 * The weapon data (the compact items_game JSON's shape, read from the hand-written fixture) and the map
 * entities: a synthetic entity lump with the classnames de_dust2 places (the real BSP is not in the
 * repository; the list follows the public map's entity dump as the VDC documents those classes) —
 * every CS class gets its CS handler, every generic one the shared engine's, the rest are inert.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { BspEntity } from '../tf2-game/formats/keyvalues';
import { isEntityClassRegistered } from '../tf2-game/sim/entity-registry';
import {
  SLOT_MELEE,
  SLOT_PDA,
  SLOT_PDA2,
  SLOT_PRIMARY,
  SLOT_SECONDARY,
} from '../tf2-game/sim/weapon-api';
import { BoxWorld, roomBrushes } from '../tf2-game/sim/__fixtures__/box-world';
import { setupCs } from './__fixtures__/cs-world';
import { CS_TEAM_CT, CS_TEAM_T } from './constants';
import { buildCsWeaponTable, csWeapon, parseCsWeapon } from './data/weapon-data';
import { WEAPON_DATA_FIXTURE } from './data/__fixtures__/weapon-data.fixture';
import { CsBombTarget, CsBuyZone, CsMapParameters, CsTeamSpawn } from './entities';
import { CsWorld } from './world';

beforeAll(setupCs);

describe('weapon data', () => {
  it('reads the compact items_game document: categories, slots, teams, prices, stats', () => {
    const t = buildCsWeaponTable(WEAPON_DATA_FIXTURE);
    const ak = t.weapons.get('weapon_ak47')!;
    expect(ak).toMatchObject({
      short: 'ak47',
      category: 'rifle',
      slot: SLOT_PRIMARY,
      team: CS_TEAM_T,
      price: 2700,
      damage: 36,
      clipSize: 30,
      reserveMax: 90,
      maxSpeed: 215,
      fullAuto: true,
    });
    expect(ak.inaccuracy.move).toBeGreaterThan(100);
    expect(ak.recoil.seed).toBe(223);
    expect(t.weapons.get('weapon_m4a1')!.team).toBe(CS_TEAM_CT);
    expect(t.weapons.get('weapon_glock')!.slot).toBe(SLOT_SECONDARY);
    expect(t.weapons.get('weapon_knife')!.slot).toBe(SLOT_MELEE);
    expect(t.weapons.get('weapon_hegrenade')!).toMatchObject({
      slot: SLOT_PDA,
      grenade: 'hegrenade',
      damage: 99,
      range: 350,
    });
    expect(t.weapons.get('weapon_c4')!.slot).toBe(SLOT_PDA2);
    const awp = t.weapons.get('weapon_awp')!;
    expect(awp).toMatchObject({
      category: 'sniper',
      zoomLevels: 2,
      maxSpeedAlt: 100,
      killAward: 100,
    });
    expect(awp.inaccuracyAlt.stand).toBeLessThan(awp.inaccuracy.stand);
    // Not in items_game: the community reload times and the shell-by-shell shotguns.
    expect(ak.reloadTime).toBeCloseTo(2.43, 2);
    expect(t.weapons.get('weapon_nova')!.reloadsSingly).toBe(true);
    expect(t.gear.get('item_assaultsuit')!.price).toBe(1000);
    expect(t.byDefindex.get(7)).toBe(ak);
    expect(csWeapon('ak47')?.name).toBe('weapon_ak47');
  });

  it('falls back to an old weapon script, then to defaults, attribute by attribute', () => {
    const w = parseCsWeapon(
      'weapon_test',
      {
        defindex: 999,
        visuals: { weapon_type: 'Pistol' },
        attributes: { damage: { value: '42' } },
      },
      { maxplayerspeed: '230', weaponprice: '500', clip_size: '15' },
    );
    expect(w).toMatchObject({
      damage: 42,
      maxSpeed: 230,
      price: 500,
      clipSize: 15,
      killAward: 300,
      category: 'pistol',
    });
  });

  it('refuses something that is not an items document', () => {
    expect(() => buildCsWeaponTable({} as never)).toThrow();
  });
});

/** The classnames in de_dust2's entity lump (static props, func_detail and lights compiled away aside). */
const DUST2_CLASSNAMES = [
  'worldspawn',
  'info_player_terrorist',
  'info_player_counterterrorist',
  'info_deathmatch_spawn',
  'func_bomb_target',
  'func_buyzone',
  'info_map_parameters',
  'prop_dynamic',
  'prop_physics_multiplayer',
  'func_door_rotating',
  'func_door',
  'func_brush',
  'func_illusionary',
  'func_areaportalwindow',
  'func_clip_vphysics',
  'trigger_soundscape',
  'env_soundscape',
  'env_soundscape_proxy',
  'env_fog_controller',
  'env_tonemap_controller',
  'env_sun',
  'env_cubemap',
  'env_sprite',
  'env_wind',
  'ambient_generic',
  'light_environment',
  'shadow_control',
  'color_correction',
  'sky_camera',
  'water_lod_control',
  'infodecal',
  'info_target',
  'keyframe_rope',
  'move_rope',
  'logic_auto',
  'point_spotlight',
];

describe('de_dust2 map entities (synthetic lump)', () => {
  it('builds a CsWorld from them: the CS classes are CS handlers, the shared ones the engine’s', () => {
    const lump = DUST2_CLASSNAMES.map(
      (cls, i) =>
        new BspEntity(
          Object.entries({
            classname: cls,
            origin: `${(i % 6) * 100 - 300} ${Math.floor(i / 6) * 100 - 300} 8`,
            ...(cls === 'info_map_parameters' ? { bombradius: '650' } : {}),
            ...(cls === 'func_buyzone'
              ? { TeamNum: '3', mins: '-64 -64 0', maxs: '64 64 64' }
              : {}),
            ...(cls === 'func_bomb_target' ? { mins: '-64 -64 0', maxs: '64 64 64' } : {}),
          }),
        ),
    );
    const world = new CsWorld({ collision: new BoxWorld(roomBrushes(1024, 512)), entities: lump });
    const byClass = new Map<string, unknown>();
    world.forEachEntity((e) => byClass.set(e.classname, e));
    expect(byClass.get('info_player_terrorist')).toBeInstanceOf(CsTeamSpawn);
    expect((byClass.get('info_player_terrorist') as CsTeamSpawn).team).toBe(CS_TEAM_T);
    expect((byClass.get('info_player_counterterrorist') as CsTeamSpawn).team).toBe(CS_TEAM_CT);
    expect(byClass.get('func_bomb_target')).toBeInstanceOf(CsBombTarget);
    expect(byClass.get('func_buyzone')).toBeInstanceOf(CsBuyZone);
    expect((byClass.get('info_map_parameters') as CsMapParameters).bombRadius).toBe(650);
    expect(world.bombRadius).toBe(650);
    // The generic classes de_dust2 relies on are the shared engine's.
    for (const cls of [
      'prop_dynamic',
      'func_door',
      'func_door_rotating',
      'func_brush',
      'ambient_generic',
      'logic_auto',
      'env_fog_controller',
    ]) {
      expect(isEntityClassRegistered(cls), cls).toBe(true);
    }
    // The cs_gamerules network proxy exists and survives a map cleanup.
    expect(world.findAllByClassname('cs_gamerules')).toHaveLength(1);
  });
});
