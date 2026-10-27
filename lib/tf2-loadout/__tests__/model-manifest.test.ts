import { describe, expect, it } from 'vitest';
import { buildModelManifest, uniqueModels } from '../model-manifest';
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
    "13" { "name" "Scattergun" "prefab" "weapon_base" "item_name" "#T_Gun" "model_player" "Models\\\\Weapons\\\\c_scattergun.mdl" "used_by_classes" { "scout" "1" } }
    "940" { "name" "Gibus" "prefab" "base_hat" "item_name" "#T_Hat" "model_player_per_class" { "basename" "models/player/items/all_class/gibus_%s.mdl" } "used_by_classes" { "demoman" "1" "soldier" "1" } }
    "941" { "name" "Shield" "prefab" "weapon_base" "item_name" "#T_Gun" "model_player" "models/w/shield.mdl" "extra_wearable" "models/w/shield_back.mdl" "used_by_classes" { "demoman" "1" } }
    "942" { "name" "Medal" "prefab" "tournament_medal" "model_player" "models/m.mdl" "used_by_classes" { "scout" "1" } }
    "943" { "name" "No model" "prefab" "base_hat" "item_name" "#T_Hat" "used_by_classes" { "scout" "1" } }
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
