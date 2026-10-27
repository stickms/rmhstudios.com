/**
 * Which game model files each loadout item needs.
 *
 * Reads the same schema the catalog does and lists, per item, the `.mdl` path(s)
 * to extract from the game's packed files and convert to GLB. A cosmetic worn by
 * several classes usually has one model per class (`…/ghostly_gibus_%s.mdl`),
 * which comes out as one entry per class; the converted file is then named
 * `<defindex>_<class>.glb` instead of `<defindex>.glb`. Pure and dependency-free
 * so `scripts/tf2-models/model-manifest.ts` and the tests can share it.
 */

import { block, parseVdf, str, type VdfObject } from './vdf';
import { ITEM_SLOTS, TF_CLASSES, type TfClass } from './catalog-types';

/** Class names as the game spells them inside model file names. */
const FILE_CLASS: Record<TfClass, string> = {
  scout: 'scout',
  soldier: 'soldier',
  pyro: 'pyro',
  demoman: 'demo',
  heavy: 'heavy',
  engineer: 'engineer',
  medic: 'medic',
  sniper: 'sniper',
  spy: 'spy',
};

export interface ModelRef {
  /** Absent for a model every class shares. */
  class?: TfClass;
  /** Path inside the game's files, e.g. `models/player/items/scout/bonk_helmet.mdl`. */
  mdl: string;
  /** `extra` is a second model the item adds (a shield, a back item). */
  role: 'main' | 'extra';
  /** The GLB file name this model should be converted to. */
  glb: string;
}

export interface ModelManifestItem {
  id: number;
  name: string;
  models: ModelRef[];
}

const SLOT_SET = new Set<string>(ITEM_SLOTS);
const EXCLUDED_PREFAB = /^(tournament_medal|paintkit_weapon)/;

function merge(base: VdfObject, over: VdfObject): VdfObject {
  const out: VdfObject = Object.create(null);
  for (const k of Object.keys(base)) out[k] = base[k];
  for (const k of Object.keys(over)) {
    const a = out[k];
    const b = over[k];
    out[k] = typeof a === 'object' && typeof b === 'object' ? merge(a, b) : b;
  }
  return out;
}

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();

interface LoadoutItem {
  id: number;
  name: string;
  /** The item with its prefabs merged in. */
  it: VdfObject;
  classes: TfClass[];
}

/** Every item the loadout builder lists, with prefabs resolved: the shared first half of both manifests. */
function loadoutItems(
  itemsGame: string,
  english: string,
  only?: ReadonlySet<number>,
): LoadoutItem[] {
  const ig = block(parseVdf(itemsGame), 'items_game');
  const items = block(ig, 'items');
  const prefabs = block(ig, 'prefabs');
  if (!items || !prefabs) throw new Error('items_game.txt is missing its items or prefabs');
  const tokens = block(block(parseVdf(english), 'lang'), 'Tokens') ?? Object.create(null);
  const names = new Map<string, string>();
  for (const k of Object.keys(tokens)) {
    const v = tokens[k];
    if (typeof v === 'string') names.set(k.toLowerCase(), v);
  }

  const cache = new Map<string, VdfObject>();
  const resolve = (node: VdfObject, depth = 0): VdfObject => {
    let acc: VdfObject = Object.create(null);
    if (depth < 8) {
      for (const name of (str(node, 'prefab') ?? '').split(/\s+/).filter(Boolean)) {
        let p = cache.get(name);
        if (!p) {
          const raw = block(prefabs, name);
          p = raw ? resolve(raw, depth + 1) : Object.create(null);
          cache.set(name, p as VdfObject);
        }
        acc = merge(acc, p as VdfObject);
      }
    }
    return merge(acc, node);
  };

  const out: LoadoutItem[] = [];
  for (const [idText, raw] of Object.entries(items)) {
    const id = Number(idText);
    if (!Number.isInteger(id) || typeof raw !== 'object') continue;
    if (only && !only.has(id)) continue;
    if ((str(raw, 'prefab') ?? '').split(/\s+/).some((p) => EXCLUDED_PREFAB.test(p))) continue;
    const it = resolve(raw);
    if (!SLOT_SET.has(str(it, 'item_slot') ?? '') || str(it, 'hidden') === '1') continue;
    if ((str(it, 'name') ?? '').startsWith('Upgradeable ')) continue;
    const used = block(it, 'used_by_classes');
    if (!used) continue;
    const classes = TF_CLASSES.filter((c) => {
      const v = str(used, c);
      return v && v !== '0';
    });
    if (!classes.length) continue;
    const name = names.get((str(it, 'item_name') ?? '').replace(/^#/, '').toLowerCase());
    out.push({ id, name: name ?? str(it, 'name') ?? String(id), it, classes });
  }
  return out;
}

export function buildModelManifest(
  itemsGame: string,
  english: string,
  /** Only these defindexes (e.g. the catalog's items), or every loadout item when omitted. */
  only?: ReadonlySet<number>,
): ModelManifestItem[] {
  const out: ModelManifestItem[] = [];
  for (const { id, name, it, classes } of loadoutItems(itemsGame, english, only)) {
    const models: ModelRef[] = [];
    const perClass = block(it, 'model_player_per_class');
    const single = str(it, 'model_player');
    if (perClass) {
      const basename = str(perClass, 'basename');
      for (const c of classes) {
        const explicit = str(perClass, c) ?? str(perClass, FILE_CLASS[c]);
        const mdl = explicit ?? (basename ? basename.replace('%s', FILE_CLASS[c]) : null);
        if (mdl) models.push({ class: c, mdl: norm(mdl), role: 'main', glb: `${id}_${c}.glb` });
      }
    } else if (single) {
      models.push({ mdl: norm(single), role: 'main', glb: `${id}.glb` });
    }
    const extra = str(it, 'extra_wearable');
    if (extra) models.push({ mdl: norm(extra), role: 'extra', glb: `${id}_extra.glb` });
    if (!models.length) continue;
    out.push({ id, name, models });
  }
  return out.sort((a, b) => a.id - b.id);
}

export interface IconManifestItem {
  id: number;
  /** Inventory icon texture, relative to `materials/` and without extension, e.g. `backpack/player/items/scout/bonk_helmet`. */
  icon: string;
  /** The file the converted icon is stored as. */
  file: string;
}

/**
 * Which inventory icon texture each loadout item uses (`image_inventory`), for the icons
 * channel of the asset sync. Unlike models this covers every item, taunts and
 * action items included.
 */
export function buildIconManifest(
  itemsGame: string,
  english: string,
  only?: ReadonlySet<number>,
): IconManifestItem[] {
  const out: IconManifestItem[] = [];
  for (const { id, it } of loadoutItems(itemsGame, english, only)) {
    const icon = str(it, 'image_inventory');
    if (icon) out.push({ id, icon: norm(icon), file: `${id}.webp` });
  }
  return out.sort((a, b) => a.id - b.id);
}

/** The distinct `.mdl` files a manifest points at. */
export function uniqueModels(manifest: readonly ModelManifestItem[]): string[] {
  return [...new Set(manifest.flatMap((i) => i.models.map((m) => m.mdl)))].sort();
}
