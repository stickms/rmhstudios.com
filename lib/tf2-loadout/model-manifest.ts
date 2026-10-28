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
  /** The item style this model is for (`<id>[_<class>]_s<N>.glb`); absent for the default. */
  style?: number;
  /** The MDL skin family to render it with, for a style that only changes the skin. */
  skin?: number;
  /** Bone-merged geometry included in this model, including optional festive lights. */
  attachments?: { mdl: string; skin: number; festive?: boolean }[];
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
    // Hidden items are internal, except a class's stock weapon ("baseitem"): the builder lists it, so it needs a model.
    const stock = str(it, 'baseitem') === '1';
    if (!SLOT_SET.has(str(it, 'item_slot') ?? '') || (str(it, 'hidden') === '1' && !stock))
      continue;
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
    // Styles that change the model or its skin family are published as their own files.
    const styleBlock = block(block(it, 'visuals') ?? Object.create(null), 'styles');
    if (styleBlock && models.length) {
      const base = models.filter((m) => m.role === 'main' && m.style === undefined);
      for (const key of Object.keys(styleBlock)) {
        const k = Number(key);
        const sb = block(styleBlock, key);
        if (!sb || !Number.isInteger(k) || k < 1) continue;
        const suffix = `_s${k}`;
        const own = block(sb, 'model_player_per_class');
        const single = str(sb, 'model_player');
        const skin = Number(str(sb, 'skin_red') ?? str(sb, 'skin'));
        if (own) {
          const basename = str(own, 'basename');
          for (const c of classes) {
            const explicit = str(own, c) ?? str(own, FILE_CLASS[c]);
            const mdl = explicit ?? (basename ? basename.replace('%s', FILE_CLASS[c]) : null);
            if (mdl) {
              models.push({
                class: c,
                mdl: norm(mdl),
                role: 'main',
                glb: `${id}_${c}${suffix}.glb`,
                style: k,
              });
            }
          }
        } else if (single) {
          models.push({ mdl: norm(single), role: 'main', glb: `${id}${suffix}.glb`, style: k });
        } else if (Number.isInteger(skin) && skin > 0) {
          for (const m of base) {
            models.push({ ...m, glb: m.glb.replace(/\.glb$/, `${suffix}.glb`), style: k, skin });
          }
        }
      }
    }
    const attachments: NonNullable<ModelRef['attachments']> = [];
    const extra = str(it, 'extra_wearable');
    const skin = Number(str(block(it, 'visuals_red'), 'skin') ?? 0);
    if (extra) attachments.push({ mdl: norm(extra), skin });
    const visuals = block(it, 'visuals');
    for (const key of ['attached_models', 'attached_models_festive'] as const) {
      for (const value of Object.values(block(visuals, key) ?? {})) {
        if (typeof value !== 'object') continue;
        const mdl = str(value, 'model');
        // Source display flags: 1 = world, 2 = viewmodel. Standalone previews use world geometry.
        const flags = Number(str(value, 'model_display_flags') ?? 3);
        if (mdl && flags & 1) {
          attachments.push({
            mdl: norm(mdl),
            skin,
            ...(key === 'attached_models_festive' ? { festive: true } : {}),
          });
        }
      }
    }
    if (attachments.length) for (const model of models) model.attachments = attachments;
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

export interface TauntManifestItem {
  id: number;
  /** Per class, the animation scene file name(s) without folder or extension, e.g. `taunt_conga`. */
  scenes: Partial<Record<TfClass, string[]>>;
}

const sceneName = (p: string): string =>
  norm(p)
    .replace(/^.*\//, '')
    .replace(/\.vcd$/, '');

/**
 * Which animation scene each taunt item plays per class (`taunt.custom_taunt_scene_per_class`). The
 * scene's file name is what the asset sync resolves to a sequence of the class model, so the builder
 * can play that exact animation on the player.
 */
export function buildTauntManifest(
  itemsGame: string,
  english: string,
  only?: ReadonlySet<number>,
): TauntManifestItem[] {
  const out: TauntManifestItem[] = [];
  for (const { id, it, classes } of loadoutItems(itemsGame, english, only)) {
    if (str(it, 'item_slot') !== 'taunt') continue;
    const per = block(block(it, 'taunt') ?? Object.create(null), 'custom_taunt_scene_per_class');
    if (!per) continue;
    const scenes: TauntManifestItem['scenes'] = {};
    for (const c of classes) {
      const v = per[c];
      const names =
        typeof v === 'string'
          ? [v]
          : v && typeof v === 'object'
            ? Object.values(v).filter((x): x is string => typeof x === 'string')
            : [];
      if (names.length) scenes[c] = names.map(sceneName);
    }
    if (Object.keys(scenes).length) out.push({ id, scenes });
  }
  return out.sort((a, b) => a.id - b.id);
}

/**
 * The nine class bodies (`models/player/<class>.mdl`), published as `class_<class>.glb` so the
 * builder can show a player with the equipped cosmetics on it. They are not items, so they come
 * with id 0 and are appended to the item manifest by the manifest script.
 */
export function classModelEntries(): ModelManifestItem {
  return {
    id: 0,
    name: 'Class models',
    models: TF_CLASSES.map((c) => ({
      class: c,
      mdl: `models/player/${FILE_CLASS[c]}.mdl`,
      role: 'main' as const,
      glb: `class_${c}.glb`,
    })),
  };
}

/** The distinct `.mdl` files a manifest points at. */
export function uniqueModels(manifest: readonly ModelManifestItem[]): string[] {
  return [
    ...new Set(
      manifest.flatMap((i) =>
        i.models.flatMap((m) => [m.mdl, ...(m.attachments ?? []).map((a) => a.mdl)]),
      ),
    ),
  ].sort();
}
