/**
 * The extracted tables against the numbers TF2 players know (community wiki values), the
 * SDK rules re-derived by hand, and the tables' own referential integrity.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASS_NAMES,
  TF_CLASS_DEMOMAN,
  TF_CLASS_ENGINEER,
  TF_CLASS_HEAVYWEAPONS,
  TF_CLASS_MEDIC,
  TF_CLASS_PYRO,
  TF_CLASS_SCOUT,
  TF_CLASS_SNIPER,
  TF_CLASS_SOLDIER,
  TF_CLASS_SPY,
  VEC_HULL_MAX,
} from '../core/constants';
import {
  BUILDING,
  CLASS_DATA,
  CRIT,
  DISPENSER,
  DMG,
  MEDIGUN,
  MINIGUN,
  OBJECT_INFO,
  PLAYER_HULL,
  ROCKET,
  SENTRY,
  SNIPER_RIFLE,
  SOUNDS,
  STICKYBOMB,
  STOCK_ITEMS,
  STOCK_WEAPONS,
  SURFACE_SOUNDS,
  TELEPORTER,
  TF_DMG,
  TF_DMG_CUSTOM,
  TF_WEAPON_IDS,
  WEAPON_SCRIPTS,
  applyDistanceAndCrit,
  buildingMaxHealth,
  critChanceMultiplier,
  damageForce,
  fallDamage,
  findSound,
  getClassData,
  getStockItem,
  maxBuffedHealth,
  medicRegenPerTick,
  radiusDamageAt,
  weaponScriptFor,
  type LoadoutSlot,
} from './index';

const PLAYABLE = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('classes', () => {
  it('has the wiki health and speed for every class', () => {
    const expected: Record<number, [number, number]> = {
      [TF_CLASS_SCOUT]: [125, 400],
      [TF_CLASS_SOLDIER]: [200, 240],
      [TF_CLASS_PYRO]: [175, 300],
      [TF_CLASS_DEMOMAN]: [175, 280],
      [TF_CLASS_HEAVYWEAPONS]: [300, 230],
      [TF_CLASS_ENGINEER]: [125, 300],
      [TF_CLASS_MEDIC]: [150, 320],
      [TF_CLASS_SNIPER]: [125, 300],
      [TF_CLASS_SPY]: [125, 320],
    };
    for (const ci of PLAYABLE) {
      const c = getClassData(ci);
      expect([c.maxHealth, c.maxSpeed], c.name).toEqual(expected[ci]);
      expect(c.name).toBe(CLASS_NAMES[ci]);
      expect(c.classIndex).toBe(ci);
    }
    expect(() => getClassData(0)).toThrow();
  });

  it('uses the class models, arms and eye heights', () => {
    for (const ci of PLAYABLE) {
      const c = getClassData(ci);
      expect(c.model).toMatch(/^models\/player\/\w+\.mdl$/);
      expect(c.handsModel).toMatch(/^models\/weapons\/c_models\/c_\w+_arms\.mdl$/);
      expect(c.viewOffsetZ).toBeGreaterThan(60);
      expect(c.viewOffsetZ).toBeLessThan(VEC_HULL_MAX.z);
    }
    expect(getClassData(TF_CLASS_HEAVYWEAPONS).model).toBe('models/player/heavy.mdl');
    expect(getClassData(TF_CLASS_DEMOMAN).handsModel).toBe('models/weapons/c_models/c_demo_arms.mdl');
    expect(getClassData(TF_CLASS_SCOUT).viewOffsetZ).toBe(65);
    expect(getClassData(TF_CLASS_SNIPER).viewOffsetZ).toBe(75);
    expect(PLAYER_HULL.standMaxs.z).toBe(82);
    expect(PLAYER_HULL.duckMaxs.z).toBe(62);
  });

  it('has the wiki reserve ammo', () => {
    expect(getClassData(TF_CLASS_SCOUT).maxAmmo.primary).toBe(32);
    expect(getClassData(TF_CLASS_SOLDIER).maxAmmo.primary).toBe(20);
    expect(getClassData(TF_CLASS_HEAVYWEAPONS).maxAmmo.primary).toBe(200);
    expect(getClassData(TF_CLASS_DEMOMAN).maxAmmo.secondary).toBe(24);
    expect(getClassData(TF_CLASS_ENGINEER).maxAmmo.metal).toBe(200);
    expect(getClassData(TF_CLASS_SNIPER).maxAmmo.primary).toBe(25);
  });

  it('builds what each class builds', () => {
    expect(getClassData(TF_CLASS_ENGINEER).buildables).toEqual([
      'OBJ_SENTRYGUN',
      'OBJ_DISPENSER',
      'OBJ_TELEPORTER',
    ]);
    expect(getClassData(TF_CLASS_SPY).buildables).toEqual(['OBJ_ATTACHMENT_SAPPER']);
    expect(getClassData(TF_CLASS_SOLDIER).buildables).toEqual([]);
  });

  it('applies the medic regen and overheal rules', () => {
    expect(medicRegenPerTick(0, false)).toBe(3);
    expect(medicRegenPerTick(10, false)).toBe(6);
    expect(medicRegenPerTick(7.5, true)).toBe(9);
    expect(maxBuffedHealth(125)).toBe(185);
    expect(maxBuffedHealth(150)).toBe(225);
    expect(maxBuffedHealth(175)).toBe(260);
    expect(maxBuffedHealth(300)).toBe(450);
  });
});

describe('default loadouts', () => {
  const expectedSlots: Record<number, LoadoutSlot[]> = {
    [TF_CLASS_SPY]: ['secondary', 'melee', 'building', 'pda', 'pda2'],
    [TF_CLASS_ENGINEER]: ['primary', 'secondary', 'melee', 'building', 'pda', 'pda2'],
  };

  it('references stock items and weapons that the class can use', () => {
    for (const ci of PLAYABLE) {
      const c = CLASS_DATA[ci];
      const slots = Object.keys(c.defaultLoadout).sort();
      expect(slots, c.name).toEqual(
        (expectedSlots[ci] ?? ['primary', 'secondary', 'melee']).slice().sort(),
      );
      for (const [slot, defindex] of Object.entries(c.defaultLoadout)) {
        const item = STOCK_ITEMS[defindex];
        expect(item, `${c.name} ${slot} ${defindex}`).toBeDefined();
        expect(item.usedByClasses[c.name]).toBe(slot);
        const weapon = STOCK_WEAPONS[defindex];
        expect(weapon, `${c.name} ${slot}`).toBeDefined();
        const entry = weapon.perClass[c.name];
        expect(entry?.slot).toBe(slot);
        expect(WEAPON_SCRIPTS[entry!.scriptName]).toBeDefined();
      }
    }
  });

  it('gives each class its stock weapons', () => {
    const byName = (ci: number, slot: LoadoutSlot) =>
      STOCK_ITEMS[CLASS_DATA[ci].defaultLoadout[slot]!].name;
    expect(byName(TF_CLASS_SCOUT, 'primary')).toBe('TF_WEAPON_SCATTERGUN');
    expect(byName(TF_CLASS_SOLDIER, 'primary')).toBe('TF_WEAPON_ROCKETLAUNCHER');
    expect(byName(TF_CLASS_SOLDIER, 'secondary')).toBe('TF_WEAPON_SHOTGUN_SOLDIER');
    expect(byName(TF_CLASS_DEMOMAN, 'secondary')).toBe('TF_WEAPON_PIPEBOMBLAUNCHER');
    expect(byName(TF_CLASS_MEDIC, 'secondary')).toBe('TF_WEAPON_MEDIGUN');
    expect(byName(TF_CLASS_SPY, 'pda2')).toBe('TF_WEAPON_INVIS');
    expect(byName(TF_CLASS_SPY, 'building')).toBe('TF_WEAPON_BUILDER_SPY');
    expect(byName(TF_CLASS_ENGINEER, 'building')).toBe('TF_WEAPON_BUILDER');
    expect(weaponScriptFor(22, 'scout')?.scriptName).toBe('tf_weapon_pistol_scout');
    expect(weaponScriptFor(22, 'engineer')?.scriptName).toBe('tf_weapon_pistol');
    expect(weaponScriptFor(9, 'engineer')?.scriptName).toBe('tf_weapon_shotgun_primary');
  });

  it('every class script weapon is a stock script', () => {
    for (const ci of PLAYABLE) {
      for (const id of CLASS_DATA[ci].scriptWeapons) {
        expect(Object.keys(WEAPON_SCRIPTS), id).toContain(id.toLowerCase());
      }
    }
  });
});

describe('weapons', () => {
  const S = WEAPON_SCRIPTS;

  it('rocket launcher: 90 damage, 4-round clip, 1100 u/s, 146 radius', () => {
    const rl = S.tf_weapon_rocketlauncher;
    expect(rl.primary.damage).toBe(90);
    expect(rl.clipSize).toBe(4);
    expect(rl.primary.timeFireDelay).toBe(0.8);
    expect(rl.primary.projectile).toBe('projectile_rocket');
    expect(rl.reloadsSingly).toBe(true);
    expect(ROCKET.speed).toBe(1100);
    expect(ROCKET.radius).toBe(146);
    expect(rl.weaponId).toBe(TF_WEAPON_IDS.TF_WEAPON_ROCKETLAUNCHER);
    expect(rl.damageType & TF_DMG.DMG_HALF_FALLOFF).toBeTruthy();
    expect(rl.damageType & DMG.DMG_BLAST).toBeTruthy();
  });

  it('scattergun: 6 × 10 pellets, clip 6, 0.625 s', () => {
    const sg = S.tf_weapon_scattergun;
    expect([sg.primary.damage, sg.primary.bulletsPerShot, sg.clipSize]).toEqual([6, 10, 6]);
    expect(sg.primary.timeFireDelay).toBe(0.625);
    expect(sg.damageType & DMG.DMG_BUCKSHOT).toBeTruthy();
  });

  it('shotguns: 6 × 10, clip 6, reload one at a time', () => {
    for (const n of [
      'tf_weapon_shotgun_primary',
      'tf_weapon_shotgun_soldier',
      'tf_weapon_shotgun_hwg',
      'tf_weapon_shotgun_pyro',
    ] as const) {
      expect([S[n].primary.damage, S[n].primary.bulletsPerShot, S[n].clipSize], n).toEqual([
        6, 10, 6,
      ]);
      expect(S[n].reloadsSingly).toBe(true);
    }
  });

  it('minigun: 9 × 4 at 0.1 s with rapid-fire crits', () => {
    const mg = S.tf_weapon_minigun;
    expect([mg.primary.damage, mg.primary.bulletsPerShot, mg.primary.timeFireDelay]).toEqual([
      9, 4, 0.1,
    ]);
    expect(mg.randomCrits).toBe('rapid');
    expect(mg.clipSize).toBe(-1);
    expect(MINIGUN.spinUpTime).toBe(0.75);
    expect(MINIGUN.aimingMaxSpeed).toBe(110);
  });

  it('demoman launchers', () => {
    expect(S.tf_weapon_pipebomblauncher.clipSize).toBe(8);
    expect(S.tf_weapon_pipebomblauncher.primary.damage).toBe(120);
    expect(S.tf_weapon_pipebomblauncher.primary.projectile).toBe('projectile_pipe_remote');
    expect(S.tf_weapon_grenadelauncher.clipSize).toBe(4);
    expect(S.tf_weapon_grenadelauncher.primary.damage).toBe(100);
    expect(S.tf_weapon_grenadelauncher.primary.projectile).toBe('projectile_pipe');
    expect(STICKYBOMB.maxActive).toBe(8);
    expect(STICKYBOMB.maxChargeTime).toBe(4);
  });

  it('melee weapons swing at 65 damage / 0.8 s, knife backstabs only', () => {
    for (const n of [
      'tf_weapon_bat',
      'tf_weapon_bottle',
      'tf_weapon_fireaxe',
      'tf_weapon_club',
      'tf_weapon_shovel',
      'tf_weapon_wrench',
      'tf_weapon_bonesaw',
      'tf_weapon_fists',
    ] as const) {
      expect(S[n].meleeWeapon, n).toBe(true);
      expect(S[n].randomCrits, n).toBe('melee');
    }
    expect(S.tf_weapon_bat.primary.damage).toBe(35);
    expect(S.tf_weapon_bat.primary.timeFireDelay).toBe(0.5);
    expect(S.tf_weapon_shovel.primary.damage).toBe(65);
    expect(S.tf_weapon_fists.primary.damage).toBe(65);
    expect(S.tf_weapon_knife.primary.damage).toBe(40);
    expect(S.tf_weapon_knife.randomCrits).toBe('backstab');
  });

  it('sniper, medic, spy and engineer weapons', () => {
    expect(S.tf_weapon_sniperrifle.randomCrits).toBe('headshot');
    expect(S.tf_weapon_sniperrifle.primary.timeFireDelay).toBe(1.5);
    expect([SNIPER_RIFLE.minDamage, SNIPER_RIFLE.maxDamage, SNIPER_RIFLE.chargePerSecond]).toEqual([
      50, 150, 50,
    ]);
    expect(S.tf_weapon_smg.clipSize).toBe(25);
    expect(S.tf_weapon_syringegun_medic.clipSize).toBe(40);
    expect(S.tf_weapon_syringegun_medic.primary.projectile).toBe('projectile_syringe');
    expect(S.tf_weapon_medigun.primary.damage).toBe(MEDIGUN.baseHealRate);
    expect(S.tf_weapon_medigun.primary.range).toBe(MEDIGUN.range);
    expect(MEDIGUN.chargeTime).toBe(40);
    expect(MEDIGUN.releaseTime).toBe(8);
    expect(S.tf_weapon_revolver.primary.damage).toBe(40);
    expect(S.tf_weapon_revolver.clipSize).toBe(6);
    expect(S.tf_weapon_pistol.clipSize).toBe(12);
    expect(S.tf_weapon_pistol_scout.clipSize).toBe(12);
    expect(S.tf_weapon_flamethrower.randomCrits).toBe('rapid');
  });

  it('every stock weapon has models, an activity role and resolvable sounds', () => {
    for (const w of Object.values(STOCK_WEAPONS)) {
      if (w.name !== 'TF_WEAPON_FISTS') {
        expect(w.viewModel, w.name).toMatch(/\.mdl$/);
        expect(w.worldModel, w.name).toMatch(/\.mdl$/);
      }
      expect(Object.keys(w.perClass).length, w.name).toBeGreaterThan(0);
      for (const sound of Object.values(w.sounds)) {
        expect(findSound(sound!), `${w.name} ${sound}`).toBeDefined();
      }
    }
    expect(STOCK_WEAPONS[18].vmActivities.ACT_VM_PRIMARYATTACK).toBe('ACT_PRIMARY_VM_PRIMARYATTACK');
    expect(STOCK_WEAPONS[4].vmActivities.ACT_VM_HITCENTER).toBe('ACT_MELEE_VM_HITCENTER');
    expect(STOCK_WEAPONS[29].vmActivities.ACT_VM_IDLE).toBe('ACT_SECONDARY_VM_IDLE');
  });
});

describe('items', () => {
  it('covers the stock defindices and their Upgradeable copies', () => {
    for (let i = 0; i <= 30; i++) expect(STOCK_ITEMS[i], `defindex ${i}`).toBeDefined();
    expect(STOCK_ITEMS[735].name).toBe('TF_WEAPON_BUILDER_SPY');
    expect(getStockItem(205)?.name).toBe('TF_WEAPON_ROCKETLAUNCHER');
    expect(STOCK_ITEMS[18].modelPlayer).toBe(
      'models/weapons/c_models/c_rocketlauncher/c_rocketlauncher.mdl',
    );
    expect(STOCK_ITEMS[18].displayName).toBe('Rocket Launcher');
    const flame = STOCK_ITEMS[21].attributes.find((a) => a.name === 'flame_speed');
    expect(flame?.value).toBe(2450);
  });
});

describe('buildings', () => {
  it('matches objects.txt and the SDK', () => {
    expect(OBJECT_INFO.OBJ_SENTRYGUN.cost).toBe(130);
    expect(OBJECT_INFO.OBJ_SENTRYGUN.upgradeCost).toBe(200);
    expect(OBJECT_INFO.OBJ_SENTRYGUN.buildTime).toBe(10);
    expect(OBJECT_INFO.OBJ_DISPENSER.cost).toBe(100);
    expect(OBJECT_INFO.OBJ_TELEPORTER.cost).toBe(50);
    expect([1, 2, 3].map((l) => buildingMaxHealth(SENTRY.baseHealth, l))).toEqual([150, 180, 216]);
    expect(SENTRY.bulletDamage).toBe(16);
    expect(SENTRY.range).toBe(1100);
    expect(SENTRY.maxShells.slice(1)).toEqual([150, 200, 200]);
    expect(DISPENSER.healRate.slice(1)).toEqual([10, 15, 20]);
    expect(TELEPORTER.rechargeTime.slice(1)).toEqual([10, 5, 3]);
    expect(BUILDING.upgradeMetalPerHit).toBe(25);
  });
});

describe('damage rules', () => {
  const RL = TF_WEAPON_IDS.TF_WEAPON_ROCKETLAUNCHER;
  const SG = TF_WEAPON_IDS.TF_WEAPON_SCATTERGUN;
  const rocketType = WEAPON_SCRIPTS.tf_weapon_rocketlauncher.damageType;
  const bulletType = WEAPON_SCRIPTS.tf_weapon_pistol.damageType;

  it('ramps up to 150% / 125% (rockets) / 175% (scattergun) and falls off to 52.8%', () => {
    const at = (damage: number, distance: number, type: number, id: number) =>
      applyDistanceAndCrit({ damage, distance, damageType: type, weaponId: id, crit: 'none' });
    expect(at(100, 512, bulletType, -1)).toBeCloseTo(100);
    expect(at(100, 1, bulletType, -1)).toBeCloseTo(150, 0);
    // With tf_damage_disablespread the roll sits at min + 0.1, so far falloff bottoms at 52.8%.
    expect(at(100, 1024, bulletType, -1)).toBeCloseTo(52.8, 5);
    expect(at(90, 1, rocketType, RL)).toBeCloseTo(112.5, 0);
    expect(at(6, 1, WEAPON_SCRIPTS.tf_weapon_scattergun.damageType, SG)).toBeCloseTo(10.5, 1);
  });

  it('crits ×3 without falloff; mini-crits ×1.35', () => {
    expect(
      applyDistanceAndCrit({
        damage: 90,
        distance: 2000,
        damageType: rocketType,
        weaponId: RL,
        crit: 'full',
      }),
    ).toBeCloseTo(270);
    expect(
      applyDistanceAndCrit({
        damage: 100,
        distance: 2000,
        damageType: bulletType,
        weaponId: -1,
        crit: 'mini',
      }),
    ).toBeCloseTo(135);
    expect(CRIT.multiplier).toBe(3);
    expect(CRIT.miniCritMultiplier).toBe(1.35);
    expect(critChanceMultiplier(0)).toBe(1);
    expect(critChanceMultiplier(800)).toBe(4);
  });

  it('blast falloff, knockback and fall damage', () => {
    expect(radiusDamageAt(90, 146, 0, rocketType)).toBe(90);
    expect(radiusDamageAt(90, 146, 146, rocketType)).toBe(45);
    expect(damageForce({ x: 48, y: 48, z: 82 }, 90, 6)).toBe(540);
    expect(damageForce({ x: 48, y: 48, z: 82 }, 500, 6)).toBe(1000);
    expect(fallDamage(600, 125)).toBe(0);
    expect(fallDamage(900, 100)).toBeCloseTo(15);
    expect(TF_DMG_CUSTOM.TF_DMG_CUSTOM_BACKSTAB).toBe(2);
    expect(TF_DMG_CUSTOM.TF_DMG_CUSTOM_HEADSHOT).toBe(1);
  });
});

describe('sounds', () => {
  it('resolves class, weapon, building and announcer sounds', () => {
    for (const ci of PLAYABLE) {
      const c = CLASS_DATA[ci];
      for (const s of Object.values(c.deathSounds)) expect(findSound(s), s).toBeDefined();
      expect(findSound(`${c.voicePrefix}.PainSharp01`), c.name).toBeDefined();
    }
    for (const info of Object.values(OBJECT_INFO)) {
      if (info.explodeSound) expect(findSound(info.explodeSound)).toBeDefined();
    }
    expect(SOUNDS['Weapon_RPG.Single'].waves.length).toBeGreaterThan(0);
    expect(findSound('weapon_rpg.single')).toBe(SOUNDS['Weapon_RPG.Single']);
    expect(findSound('Announcer.RoundBegins5Seconds')).toBeDefined();
    expect(findSound('Game.YourTeamWon')).toBeDefined();
    expect(findSound('Building_Sentrygun.Fire')).toBeDefined();
    expect(SURFACE_SOUNDS.concrete.stepLeft).toBe('Concrete.StepLeft');
    for (const s of Object.values(SURFACE_SOUNDS)) {
      if (s.stepLeft) expect(findSound(s.stepLeft), s.stepLeft).toBeDefined();
    }
  });
});
