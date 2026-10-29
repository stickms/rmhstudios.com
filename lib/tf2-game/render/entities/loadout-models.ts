/**
 * Items on players, from the loadout builder's model channel (`/api/tf2-loadout/models`, the
 * GLBs scripts/tf2-assets/convert.py publishes): unlock weapons in third and first person, and
 * cosmetics (plus worn weapon-slot items such as the Gunboats) on the class body.
 *
 * A loadout GLB is one item in its compiled bind space (metres, the game channel's scale). It
 * names the bone it follows and its pose-to-bone matrix (`extras.attach`, with fallbacks up the
 * item's bone chain); a cosmetic that spreads over several bones (`extras.boneMerge`) is skinned
 * and deforms with the wearer's skeleton (lib/tf2-loadout/bone-merge.ts). Each part is drawn
 * with the game's model material (lit, faded, cloaked and crit-glowing with its wearer) and:
 *
 *   - paint: the material's BLENDTINTBYBASEALPHA tint (model-material.ts PAINT), the team's
 *     colour of a two-tone paint (RED `rgb`, BLU `rgb2`);
 *   - style: the style's own file when published (pickModel), its body groups on the wearer;
 *   - per-class variants (`use_per_class_bodygroups`) show the wearer's submodel;
 *   - festivizer geometry only on a festivized weapon;
 *   - war paints: the kit's composite (lib/tf2-loadout/warpaint-client.ts, one request at a
 *     time, cached) replaces the weapon's base texture;
 *   - unusual effects: the loadout particle channel's bundle (ParticleLibrary `unusual:<id>`)
 *     following the wearer's head.
 *
 * The channel publishes RED skins only, so a BLU player's unpainted cosmetics wear the RED skin
 * (two-tone paints still switch). Jiggle bones hang still. Cosmetics are not drawn beyond
 * COSMETIC_LOD_DISTANCE from the camera (their unusual effects stop there too) — players in the
 * distance cost their body and weapon only.
 */
import {
  CanvasTexture,
  Color,
  type Material,
  Matrix4,
  type Mesh,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import { bodygroupsOf, classVariant, merge } from '@/lib/tf2-loadout/bodygroups';
import { modelItemId, type Bodygroups } from '@/lib/tf2-loadout/catalog-types';
import { modelUrl, pickModel } from '@/lib/tf2-loadout/use-models';
import { renderWarPaint } from '@/lib/tf2-loadout/warpaint-client';
import { TF_TEAM_BLUE, type ClassName } from '../../core/constants';
import { CLASS_DATA } from '../../data/classes';
import { VM_ACTIVITY_TABLES } from '../../data/unlock-scripts';
import {
  STOCK_WEAPONS,
  WEAPON_ROLES,
  weaponScriptFor,
  type StockWeapon,
  type WeaponRole,
} from '../../data/weapons';
import { tfClassOf, type PublicItem, type ReplicatedItems } from '../../sim/items/loadout';
import { catalogItem, itemCatalog } from '../../sim/items/registry';
import { resolveItem, stockItemFor } from '../../sim/items/resolve';
import { implementingScript, weaponScript } from '../../sim/items/scripts';
import type { RenderContext } from './common';
import type { EffectSystem } from './effects';
import { UNUSUAL_PREFIX } from './effects';
import { ModelAsset, type GltfLoaderLike } from './model-asset';
import { ModelInstance } from './model-instance';
import { paintUniforms, type InstanceUniforms } from './model-material';

/** Source units from the camera beyond which cosmetics are not drawn. */
export const COSMETIC_LOD_DISTANCE = 1800;
/** Source units → metres (the GLB scale). */
const SOURCE_UNIT = 0.01905;

// ─── what a weapon looks like ────────────────────────────────────────────────

/** How a held weapon is drawn and animated (stock or unlock). */
export interface WeaponLook {
  defindex: number;
  /** Activity role: the item's anim_slot, else the script's WeaponType. */
  role: WeaponRole;
  isMinigun: boolean;
  isSniperRifle: boolean;
  /** The stock weapon itself, or the class's stock weapon of the slot — drawn from the game
   * channel when the item has no loadout model (or while it loads). */
  stock: StockWeapon | undefined;
  /** The loadout-channel model's item (a decorated weapon's base), null for stock weapons. */
  modelItem: number | null;
  /** Base view-model activity → the arms' activity for this weapon. */
  vmActivities: Readonly<Record<string, string>>;
  muzzleFlash: string | null;
  /** The c_model is bone-merged onto the arms (false: the arms are the weapon, the Fists). */
  attachToHands: boolean;
}

const ROLES = new Set<string>(WEAPON_ROLES);

/** The look of the weapon `defindex` held by class `classIndex`, undefined when unknown. */
export function weaponLook(defindex: number, classIndex: number): WeaponLook | undefined {
  if (defindex < 0) return undefined;
  const className = CLASS_DATA[classIndex]?.name as ClassName | undefined;
  const stock = STOCK_WEAPONS[defindex];
  if (stock) {
    const script = className ? weaponScriptFor(defindex, className) : undefined;
    return {
      defindex,
      role: stock.role,
      isMinigun: stock.name === 'TF_WEAPON_MINIGUN',
      isSniperRifle: stock.name === 'TF_WEAPON_SNIPERRIFLE',
      stock,
      modelItem: null,
      vmActivities: stock.vmActivities,
      muzzleFlash: script?.muzzleFlashParticle ?? null,
      attachToHands: stock.attachToHands,
    };
  }
  const play = resolveItem(defindex, classIndex);
  const item = catalogItem(defindex);
  if (!play || !item || !play.scriptName) return undefined;
  const script = weaponScript(play.scriptName);
  const base = implementingScript(play.scriptName);
  const animSlot = item.an?.toUpperCase();
  const role = (
    animSlot && ROLES.has(animSlot) ? animSlot : (script?.weaponType ?? 'PRIMARY')
  ) as WeaponRole;
  const stockDef = stockItemFor(classIndex, play.slot);
  return {
    defindex,
    role,
    isMinigun: base === 'tf_weapon_minigun',
    isSniperRifle: base === 'tf_weapon_sniperrifle',
    stock: stockDef !== undefined ? STOCK_WEAPONS[stockDef] : undefined,
    modelItem: modelItemId(item),
    vmActivities: VM_ACTIVITY_TABLES[role] ?? {},
    muzzleFlash: script?.muzzleFlashParticle ?? null,
    attachToHands: true,
  };
}

// ─── the model channel ───────────────────────────────────────────────────────

/** Where loadout GLBs come from (the app's API by default; the render harness serves a folder). */
export interface LoadoutModelSource {
  list(): Promise<readonly string[]>;
  url(name: string): string;
}

export const LOADOUT_MODEL_API: LoadoutModelSource = {
  async list() {
    const r = await fetch('/api/tf2-loadout/models');
    if (!r.ok) return [];
    return ((await r.json()) as { ids?: string[] }).ids ?? [];
  },
  url: modelUrl,
};

/** A loaded loadout model and how it hangs on a body. */
export interface LoadoutPart {
  name: string;
  asset: ModelAsset;
  /** Bones to follow, first match wins, each with the item's pose on it. */
  attach: Array<{ bone: string; pose: Matrix4 }>;
  /** Skinned over the wearer's bones (bone-merged) instead of hung on one. */
  boneMerge: boolean;
}

interface AttachExtras {
  bone: string;
  pose: number[];
  fallbacks?: Array<{ bone: string; pose: number[] }>;
}

export class LoadoutModels {
  private ids: Set<string> | null = null;
  private idsPromise: Promise<void> | null = null;
  private readonly parts = new Map<string, Promise<LoadoutPart | null>>();
  private readonly ready = new Map<string, LoadoutPart | null>();

  constructor(
    private readonly source: LoadoutModelSource = LOADOUT_MODEL_API,
    private readonly loader: GltfLoaderLike = new Tf2GLTFLoader(),
  ) {}

  private loadIds(): void {
    this.idsPromise ??= this.source
      .list()
      .then((ids) => {
        this.ids = new Set(ids);
      })
      .catch(() => {
        this.ids = new Set();
      });
  }

  /**
   * The model to show for an item worn by class `cls` in `style`: null when the channel has
   * none, undefined while the list loads.
   */
  pick(item: number, cls: string | null, style?: number): string | null | undefined {
    this.loadIds();
    if (!this.ids) return undefined;
    return pickModel(this.ids, item, cls ?? undefined, style);
  }

  /** The part if loaded (null: failed or absent; undefined: loading — starts it). */
  peek(name: string): LoadoutPart | null | undefined {
    if (this.ready.has(name)) return this.ready.get(name);
    if (!this.parts.has(name)) {
      const p = this.load(name).catch((e: unknown) => {
        console.warn(`[tf2 loadout models] ${name}:`, e);
        return null;
      });
      this.parts.set(name, p);
      void p.then((v) => this.ready.set(name, v));
    }
    return undefined;
  }

  private async load(name: string): Promise<LoadoutPart | null> {
    const gltf = await this.loader.loadAsync(this.source.url(name));
    // The materials the meshes actually carry (the loader hands meshes its own variants of the
    // glTF materials, so the dependency list would not match them).
    const materials: Material[] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        if (!materials.includes(m)) materials.push(m);
    });
    for (const m of materials) {
      // glTF BLEND / MASK as the game material reads them.
      if (m.transparent && !m.userData.translucent) m.userData.translucent = true;
    }
    gltf.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // Copied onto every instance's clone (Object3D userData is cloned).
      if (mats.some((m) => m.userData?.festive)) mesh.userData.festive = true;
    });
    const asset = new ModelAsset(`loadout/${name}`, gltf, materials, null);
    asset.frame = new Matrix4();
    const extras = gltf.scene.userData as {
      attach?: AttachExtras;
      boneMerge?: boolean;
      particleAttachments?: Record<string, { bone: string; pose: number[] }>;
    };
    for (const [key, a] of Object.entries(extras.particleAttachments ?? {})) {
      asset.attachments.set(key.toLowerCase(), {
        name: key,
        bone: a.bone,
        local: new Matrix4().fromArray(a.pose),
      });
    }
    const chain = extras.attach ? [extras.attach, ...(extras.attach.fallbacks ?? [])] : [];
    return {
      name,
      asset,
      attach: chain.map((a) => ({ bone: a.bone, pose: new Matrix4().fromArray(a.pose) })),
      boneMerge: extras.boneMerge === true,
    };
  }

  async whenIdle(): Promise<void> {
    let n = -1;
    while (n !== this.parts.size) {
      n = this.parts.size;
      await Promise.all(this.parts.values());
    }
    await this.idsPromise;
  }
}

// ─── war paints ──────────────────────────────────────────────────────────────

const paintTextures = new Map<string, Promise<CanvasTexture | null>>();
let paintChain: Promise<unknown> = Promise.resolve();

/** A war paint composite, cached; requests run one at a time (the compositor keeps only the latest). */
function warPaintTexture(
  script: string,
  wear: number,
  seed: number,
): Promise<CanvasTexture | null> {
  const key = `${script}|${wear}|${seed}`;
  let p = paintTextures.get(key);
  if (!p) {
    p = paintChain.then(async () => {
      if (typeof document === 'undefined') return null;
      const res = await renderWarPaint(script, wear, seed);
      if (!res) return null;
      const canvas = document.createElement('canvas');
      canvas.width = res.w;
      canvas.height = res.h;
      canvas
        .getContext('2d')
        ?.putImageData(
          new ImageData(res.rgba as Uint8ClampedArray<ArrayBuffer>, res.w, res.h),
          0,
          0,
        );
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      tex.flipY = false;
      return tex;
    });
    paintChain = p.catch(() => null);
    paintTextures.set(key, p);
  }
  return p;
}

/** The pattern script of a war-painted (or decorated) weapon entry, if the catalog has it. */
function warPaintScript(entry: PublicItem): string | undefined {
  const item = catalogItem(entry.item);
  const kit = item?.sk ? item.sk.kit : entry.kit;
  if (kit === undefined || !item?.wk) return undefined;
  return itemCatalog()?.kits?.find((k) => k.id === kit)?.w[item.wk];
}

// ─── one drawn item ──────────────────────────────────────────────────────────

const notFestive = (m: Mesh): boolean => !m.userData.festive;

/** A loadout part drawn on a body (a cosmetic or a weapon). */
export class ItemInstance {
  readonly inst: ModelInstance;
  private paintKey = '';
  private warPaintKey = '';
  private festive: boolean | null = null;
  disposed = false;

  constructor(
    readonly part: LoadoutPart,
    owner: InstanceUniforms,
  ) {
    this.inst = new ModelInstance(part.asset, { uniforms: paintUniforms(owner), noAnim: true });
  }

  /** Hangs the item on `body` (bone-merged or on its bone). False when the body lacks the bone. */
  attachTo(body: ModelInstance): boolean {
    if (this.part.boneMerge) {
      body.attach(this.inst);
      return true;
    }
    for (const a of this.part.attach)
      if (body.attachRigid(this.inst, [a.bone], a.pose)) return true;
    return false;
  }

  /** Paint (`#rrggbb`, or none), per-class submodel, festivizer, war paint. */
  dress(opts: {
    paint?: string;
    cls?: string | null;
    festive?: boolean;
    entry?: PublicItem;
  }): void {
    const u = this.inst.uniforms as InstanceUniforms & {
      uPaint: { value: Vector3 };
      uPaintOn: { value: number };
    };
    const key = opts.paint ?? '';
    if (key !== this.paintKey) {
      this.paintKey = key;
      if (opts.paint) {
        const c = new Color(opts.paint);
        u.uPaint.value.set(c.r, c.g, c.b);
        u.uPaintOn.value = 1;
      } else u.uPaintOn.value = 0;
    }
    this.inst.setBodygroups(classVariant(opts.cls ?? undefined));
    const festive = !!opts.festive;
    if (festive !== this.festive) {
      this.festive = festive;
      this.inst.setMeshFilter(festive ? null : notFestive);
    }
    const script = opts.entry ? warPaintScript(opts.entry) : undefined;
    const wpKey = script ? `${script}|${opts.entry?.wear ?? 1}|${opts.entry?.seed ?? 0}` : '';
    if (wpKey !== this.warPaintKey) {
      this.warPaintKey = wpKey;
      if (script) {
        void warPaintTexture(script, opts.entry?.wear ?? 1, opts.entry?.seed ?? 0).then((tex) => {
          if (tex && !this.disposed && this.warPaintKey === wpKey) this.applyWarPaint(tex);
        });
      }
    }
  }

  /** The kit's composite in place of the weapon's own base texture (the first non-attachment material). */
  private applyWarPaint(tex: CanvasTexture): void {
    let done = false;
    this.inst.forEachMaterial((m, i) => {
      if (done || this.part.asset.materials[i]?.userData?.attachment) return;
      m.uniforms.uMap = { value: tex };
      m.uniforms.uHasMap = { value: 1 };
      m.uniforms.uColor = { value: new Color(1, 1, 1) };
      done = true;
    });
  }

  dispose(): void {
    this.disposed = true;
    this.inst.dispose();
  }
}

/** A paint's colour for a team: BLU wears a two-tone paint's second colour. */
export function paintColor(paint: number | undefined, team: number): string | undefined {
  if (paint === undefined) return undefined;
  const p = itemCatalog()?.paints.find((x) => x.id === paint);
  if (!p) return undefined;
  return team === TF_TEAM_BLUE && p.rgb2 ? p.rgb2 : p.rgb;
}

// ─── a player's cosmetics ────────────────────────────────────────────────────

interface Worn {
  key: string;
  entry: PublicItem;
  part: ItemInstance | null;
  /** The model name being shown ('' while unresolved, null: none). */
  model: string | null | '';
  effectKey: string;
}

/**
 * The cosmetics and worn weapon-slot items on one player's body, rebuilt when the body is
 * replaced (a class change, a respawn — the old body keeps its items as a corpse).
 */
export class PlayerOutfit {
  private body: ModelInstance | null = null;
  private readonly worn = new Map<string, Worn>();
  private itemsKey = '';
  private visible = true;

  constructor(
    private readonly playerId: number,
    private readonly effects: EffectSystem | null,
  ) {}

  /**
   * Dresses `body` in `items` (null: nothing, as a disguised spy to enemies). Returns the body
   * groups the worn items select on the class body.
   */
  update(
    body: ModelInstance,
    items: ReplicatedItems | null,
    classIndex: number,
    team: number,
    ctx: RenderContext,
  ): Bodygroups {
    if (body !== this.body) {
      // The old body (and the items on it) went to a corpse or was disposed with its children.
      this.forget();
      this.body = body;
    }
    const lib = ctx.loadout;
    const cls = tfClassOf(classIndex);
    const list: Array<{ key: string; entry: PublicItem }> = [];
    if (items) {
      items.cosmetics.forEach((c, i) => list.push({ key: `c${i}:${c.item}`, entry: c }));
      for (const w of items.weapons)
        if (w.worn) list.push({ key: `w${w.slot}:${w.item}`, entry: w });
    }
    const key = list.map((l) => `${l.key}:${l.entry.style ?? ''}`).join('|');
    if (key !== this.itemsKey) {
      this.itemsKey = key;
      const keep = new Set(list.map((l) => l.key));
      for (const [k, w] of this.worn) if (!keep.has(k)) this.drop(k, w);
    }
    const groups: Array<Bodygroups | undefined> = [];
    const near = this.isNear(body, ctx);
    for (const { key: k, entry } of list) {
      const item = catalogItem(entry.item);
      groups.push(bodygroupsOf(item ?? undefined, entry.style));
      let w = this.worn.get(k);
      if (!w) {
        w = { key: k, entry, part: null, model: '', effectKey: '' };
        this.worn.set(k, w);
      }
      w.entry = entry;
      if (lib && w.model === '') {
        const name = lib.pick(item ? modelItemId(item) : entry.item, cls, entry.style);
        if (name !== undefined) w.model = name;
      }
      if (lib && w.model && !w.part) {
        const part = lib.peek(w.model);
        if (part === null) w.model = null;
        else if (part) {
          const made = new ItemInstance(part, body.uniforms);
          if (made.attachTo(body)) w.part = made;
          else {
            made.dispose();
            w.model = null;
          }
        }
      }
      if (w.part) {
        w.part.dress({ paint: item?.p ? paintColor(entry.paint, team) : undefined, cls });
        w.part.inst.root.visible = near;
      }
      this.updateEffect(w, near && this.visible);
    }
    return merge(groups);
  }

  /** Hides the effects with the body (first person, cloak, death). */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) for (const w of this.worn.values()) this.stopEffect(w);
  }

  private isNear(body: ModelInstance, ctx: RenderContext): boolean {
    const cam = ctx.cameraPosition;
    if (!cam) return true;
    tmpV.setFromMatrixPosition(body.root.matrixWorld);
    return tmpV.distanceTo(cam) < COSMETIC_LOD_DISTANCE * SOURCE_UNIT;
  }

  private updateEffect(w: Worn, on: boolean): void {
    const effect = w.entry.effect;
    const item = catalogItem(w.entry.item);
    const applies =
      effect !== undefined &&
      !!item &&
      (item.s === 'head' || item.s === 'misc') &&
      itemCatalog()?.effects.some((e) => e.id === effect && e.category === 'cosmetic');
    if (!on || !applies || !this.effects) return this.stopEffect(w);
    const key = `unusual:${this.playerId}:${w.key}`;
    if (w.effectKey === key) return;
    w.effectKey = key;
    this.effects.loop(key, `${UNUSUAL_PREFIX}${effect}`, {
      entity: this.playerId,
      attachment: 'head',
    });
  }

  private stopEffect(w: Worn): void {
    if (!w.effectKey) return;
    this.effects?.stop(w.effectKey);
    w.effectKey = '';
  }

  private drop(k: string, w: Worn): void {
    this.stopEffect(w);
    w.part?.dispose();
    this.worn.delete(k);
  }

  /** Lets go of the items without disposing them (they belong to the old body now). */
  private forget(): void {
    for (const w of this.worn.values()) this.stopEffect(w);
    this.worn.clear();
    this.itemsKey = '';
  }

  dispose(): void {
    for (const [k, w] of this.worn) this.drop(k, w);
    this.body = null;
  }
}

const tmpV = new Vector3();

/** The loadout model name for a held unlock (undefined: still resolving). */
export function heldModelName(
  lib: LoadoutModels | null | undefined,
  look: WeaponLook | undefined,
  classIndex: number,
  entry: PublicItem | undefined,
): string | null | undefined {
  if (!lib || !look || look.modelItem === null) return null;
  return lib.pick(look.modelItem, tfClassOf(classIndex), entry?.style);
}
