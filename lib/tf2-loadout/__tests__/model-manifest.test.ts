import { describe, expect, it } from 'vitest';
import {
  buildIconManifest,
  buildModelManifest,
  buildTauntManifest,
  classModelEntries,
  uniqueModels,
} from '../model-manifest';
import { MODEL_NAME } from '../models.server';
import { pickModel } from '../use-models';

const ITEMS_GAME = `
"items_game"
{
  "prefabs"
  {
    "weapon_base" { "item_slot" "primary" "item_name" "#T_Gun" }
    "base_hat" { "item_slot" "head" "item_name" "#T_Hat" }
    "tournament_medal" { "item_slot" "misc" }
  }
  "items"
  {
    "13" { "name" "Scattergun" "prefab" "weapon_base" "item_name" "#T_Gun" "model_player" "Models\\\\Weapons\\\\c_scattergun.mdl" "image_inventory" "backpack\\\\Weapons/c_models\\\\c_scattergun/c_scattergun" "used_by_classes" { "scout" "1" } }
    "940" { "name" "Gibus" "prefab" "base_hat" "item_name" "#T_Hat" "model_player_per_class" { "basename" "models/player/items/all_class/gibus_%s.mdl" } "used_by_classes" { "demoman" "1" "soldier" "1" } }
    "941" { "name" "Shield" "prefab" "weapon_base" "item_name" "#T_Gun" "model_player" "models/w/shield.mdl" "extra_wearable" "models/w/shield_back.mdl" "used_by_classes" { "demoman" "1" } }
    "942" { "name" "Medal" "prefab" "tournament_medal" "model_player" "models/m.mdl" "used_by_classes" { "scout" "1" } }
    "943" { "name" "No model" "prefab" "base_hat" "item_name" "#T_Hat" "image_inventory" "backpack/player/items/scout/nomodel" "used_by_classes" { "scout" "1" } }
  }
}`;
const ENGLISH = `"lang" { "Tokens" { "T_Gun" "Gun" "T_Hat" "Hat" } }`;

describe('buildModelManifest', () => {
  const m = buildModelManifest(ITEMS_GAME, ENGLISH);

  it('lists one shared model, normalising the path', () => {
    expect(m.find((i) => i.id === 13)?.models).toEqual([
      { mdl: 'models/weapons/c_scattergun.mdl', role: 'main', glb: '13.glb' },
    ]);
  });

  it('expands a per-class basename, using the game\'s "demo" spelling', () => {
    expect(m.find((i) => i.id === 940)?.models).toEqual([
      {
        class: 'soldier',
        mdl: 'models/player/items/all_class/gibus_soldier.mdl',
        role: 'main',
        glb: '940_soldier.glb',
      },
      {
        class: 'demoman',
        mdl: 'models/player/items/all_class/gibus_demo.mdl',
        role: 'main',
        glb: '940_demoman.glb',
      },
    ]);
  });

  it('adds an extra wearable as its own file', () => {
    expect(m.find((i) => i.id === 941)?.models.map((x) => x.glb)).toEqual([
      '941.glb',
      '941_extra.glb',
    ]);
  });

  it('skips excluded families and items with no model', () => {
    expect(m.map((i) => i.id)).toEqual([13, 940, 941]);
  });

  it('lists each .mdl once', () => {
    expect(uniqueModels(m)).toHaveLength(5);
  });
});

describe('pickModel', () => {
  const ids = new Set(['940_soldier', '13']);
  it('prefers the per-class variant, then the shared model, else none', () => {
    expect(pickModel(ids, 940, 'soldier')).toBe('940_soldier');
    expect(pickModel(ids, 940, 'scout')).toBeNull();
    expect(pickModel(ids, 13, 'scout')).toBe('13');
    expect(pickModel(ids, 7)).toBeNull();
  });
});

describe('buildIconManifest', () => {
  const icons = buildIconManifest(ITEMS_GAME, ENGLISH);

  it('lists the inventory icon of every loadout item, normalised, including ones with no model', () => {
    expect(icons).toEqual([
      { id: 13, icon: 'backpack/weapons/c_models/c_scattergun/c_scattergun', file: '13.webp' },
      { id: 943, icon: 'backpack/player/items/scout/nomodel', file: '943.webp' },
    ]);
  });

  it('skips excluded families', () => {
    expect(icons.some((i) => i.id === 942)).toBe(false);
  });
});

describe('classModelEntries', () => {
  const entry = classModelEntries();

  it("lists the nine class bodies, with the game's file-name spellings", () => {
    expect(entry.models).toHaveLength(9);
    expect(entry.models.find((m) => m.class === 'demoman')).toEqual({
      class: 'demoman',
      mdl: 'models/player/demo.mdl',
      role: 'main',
      glb: 'class_demoman.glb',
    });
  });

  it('names every body in a form the model routes accept, and nothing like an item id', () => {
    for (const m of entry.models) expect(MODEL_NAME.test(m.glb.replace(/\.glb$/, ''))).toBe(true);
    expect(MODEL_NAME.test('class_')).toBe(false);
    expect(MODEL_NAME.test('class_../x')).toBe(false);
  });
});

describe('stock weapons', () => {
  it('lists a hidden "baseitem" weapon, which the builder shows, but not other hidden items', () => {
    const items = `
"items_game"
{
  "prefabs" { "weapon_base" { "item_slot" "primary" "item_name" "#T_Gun" } }
  "items"
  {
    "199" { "name" "Shotgun" "prefab" "weapon_base" "hidden" "1" "baseitem" "1" "model_player" "models/w/shotgun.mdl" "used_by_classes" { "soldier" "1" } }
    "200" { "name" "Internal" "prefab" "weapon_base" "hidden" "1" "model_player" "models/w/internal.mdl" "used_by_classes" { "soldier" "1" } }
  }
}`;
    expect(buildModelManifest(items, ENGLISH).map((i) => i.id)).toEqual([199]);
  });
});

describe('animation clip names', () => {
  it('are accepted by the model routes, and nothing path-like is', () => {
    expect(MODEL_NAME.test('anim_scout_taunt_conga')).toBe(true);
    expect(MODEL_NAME.test('anim_demoman_taunt_rps_rock_win')).toBe(true);
    expect(MODEL_NAME.test('anim_scout_../x')).toBe(false);
    expect(MODEL_NAME.test('anim_scout_')).toBe(false);
    expect(MODEL_NAME.test('anim__taunt')).toBe(false);
  });
});

describe('buildTauntManifest', () => {
  const items = `
"items_game"
{
  "prefabs" { "taunt" { "item_slot" "taunt" "item_name" "#T_Taunt" } }
  "items"
  {
    "1118" { "name" "Conga" "prefab" "taunt" "used_by_classes" { "scout" "1" "pyro" "1" "spy" "1" }
      "taunt" { "custom_taunt_scene_per_class" {
        "scout" "scenes/player/scout/low/Taunt_Conga.vcd"
        "pyro" { "1" "scenes\\\\player\\\\pyro\\\\low\\\\taunt_conga.vcd" "2" "scenes/player/pyro/low/taunt_conga2.vcd" }
      } } }
    "13" { "name" "Scattergun" "item_slot" "primary" "item_name" "#T_Taunt" "used_by_classes" { "scout" "1" } }
    "1119" { "name" "No scene" "prefab" "taunt" "used_by_classes" { "scout" "1" } }
  }
}`;
  it('lists the scene each class plays, as a bare name, including a class with several', () => {
    expect(buildTauntManifest(items, ENGLISH)).toEqual([
      { id: 1118, scenes: { scout: ['taunt_conga'], pyro: ['taunt_conga', 'taunt_conga2'] } },
    ]);
  });
});
