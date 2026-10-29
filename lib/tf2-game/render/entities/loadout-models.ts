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
 *   - team skins: a material with a BLU variant (`extras.blu`, lib/tf2-loadout/team-skins.ts)
 *     wears BLU's texture / tint on a BLU player (decoded on first use, shared by every player);
 *   - killstreak kits: the sheen tints and sweeps the weapon's materials (model-material.ts
 *     uSheen); the killstreaker's eye particles are the player renderer's;
 *   - weapon unusual effects: `unusual:<id>:<particle suffix>` with its control points on the
 *     weapon's own `unusual_<n>` attachments (`weapon:` names, `weaponEffect`);
 *   - jiggle bones (lib/tf2-loadout/jiggle.ts) swing on cosmetics within JIGGLE_LOD_DISTANCE.
 *
 * Cosmetics are not drawn beyond COSMETIC_LOD_DISTANCE from the camera (their unusual effects
 * stop there too) — players in the distance cost their body and weapon only.
 */
import {
  CanvasTexture,
  Color,
  type Material,
  Matrix4,
  type Mesh,
  type ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  Vector3,
  Vector4,
} from 'three';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import {
  renameSkeleton,
  resetJiggle,
  setupJiggle,
  stepJiggle,
  type JiggleBone,
  type JiggleSpec,
} from '@/lib/tf2-loadout/jiggle';
import { sheenColor } from '@/lib/tf2-loadout/killstreak';
import {
  hasTeamVariants,
  loadTeamTextures,
  peekTeamTextures,
  teamVariantOf,
  type TeamSkinSource,
} from '@/lib/tf2-loadout/team-skins';
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
import {
  fallbackColor,
  paintUniforms,
  type InstanceUniforms,
  type ModelMaterialExtras,
} from './model-material';

/** Source units from the camera beyond which cosmetics are not drawn. */
export const COSMETIC_LOD_DISTANCE = 1800;
/**
 * Item meshes (draw calls) the cosmetics and worn items of all players may draw per frame, nearest
 * players first; 24 decorated players draw ~110 (render harness `loadout-crowd`).
 */
export const ITEM_DRAW_BUDGET = 200;
/** Source units from the camera beyond which cosmetics' jiggle bones hang still (at rest). */
export const JIGGLE_LOD_DISTANCE = 1000;
/** Attachment-name prefix that resolves on a player's held weapon only (weapon unusual effects). */
export const WEAPON_ATTACHMENT = 'weapon:';
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
  /** Some material looks different on BLU (team-skins.ts). */
  teamVariants: boolean;
  /** Flexible jiggle bones (the GLB's `extras.jiggle`). */
  jiggle: JiggleSpec[];
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
      jiggle?: JiggleSpec[];
      particleAttachments?: Record<string, { bone: string; pose: number[]; bind?: number[] }>;
    };
    for (const [key, a] of Object.entries(extras.particleAttachments ?? {})) {
      asset.attachments.set(key.toLowerCase(), {
        name: key,
        bone: a.bone,
        local: new Matrix4().fromArray(a.pose),
        // A plain-mesh item (most weapons) has no bones of its own: its private ones are placed
        // in the item's bind space (ModelInstance.attachmentMatrix).
        ...(a.bind ? { bind: new Matrix4().fromArray(a.bind) } : {}),
      });
    }
    const chain = extras.attach ? [extras.attach, ...(extras.attach.fallbacks ?? [])] : [];
    return {
      name,
      asset,
      attach: chain.map((a) => ({ bone: a.bone, pose: new Matrix4().fromArray(a.pose) })),
      boneMerge: extras.boneMerge === true,
      teamVariants: hasTeamVariants(gltf.scene),
      jiggle: Array.isArray(extras.jiggle) ? extras.jiggle : [],
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
  /** Template indexes of materials the war paint replaced (team skins leave their map alone). */
  private readonly warPainted = new Set<number>();
  private blu = false;
  /** RED's uniforms of the materials a BLU skin changed, to put back. */
  private readonly redLook = new Map<ShaderMaterial, Record<string, { value: unknown }>>();
  private jiggleBones: JiggleBone[] | null = null;
  private jiggling = false;
  /** Meshes the item draws (each a draw call: one per material, merged at conversion). */
  readonly meshCount: number;
  disposed = false;

  constructor(
    readonly part: LoadoutPart,
    owner: InstanceUniforms,
  ) {
    this.inst = new ModelInstance(part.asset, { uniforms: paintUniforms(owner), noAnim: true });
    let n = 0;
    this.inst.scene.traverse((o) => {
      if ((o as Mesh).isMesh) n++;
    });
    this.meshCount = n;
  }

  /** Hangs the item on `body` (bone-merged or on its bone). False when the body lacks the bone. */
  attachTo(body: ModelInstance): boolean {
    if (this.part.boneMerge) {
      body.attach(this.inst);
      return true;
    }
    for (const a of this.part.attach) {
      if (body.attachRigid(this.inst, [a.bone], a.pose)) {
        // A rigid item is skinned only for its jiggle bones: its copies of the class's bone names
        // must not be found by a later bone-merge looking up the wearer's skeleton.
        if (this.inst.bones.length) renameSkeleton(this.inst.scene);
        return true;
      }
    }
    return false;
  }

  /** Paint (`#rrggbb`, or none), per-class submodel, festivizer, war paint. */
  dress(opts: {
    paint?: string;
    cls?: string | null;
    festive?: boolean;
    entry?: PublicItem;
    /** The wearer's team: BLU wears the model's BLU skin where it has one. */
    team?: number;
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
    if (opts.team !== undefined) this.setTeam(opts.team);
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
      this.warPainted.add(i);
      done = true;
    });
  }

  /** RED's or BLU's skin (TF_TEAM_BLUE: BLU); BLU's textures arrive asynchronously, once per model. */
  setTeam(team: number): void {
    const blu = team === TF_TEAM_BLUE;
    if (blu === this.blu) return;
    this.blu = blu;
    if (!this.part.teamVariants) return;
    if (!blu) {
      this.applyTeam(false, null);
      return;
    }
    // BLU's tints and colours at once; its textures as soon as they are decoded (at once when
    // another player already wears the model).
    const gltf = this.part.asset.gltf as unknown as TeamSkinSource;
    const ready = peekTeamTextures(gltf);
    this.applyTeam(true, ready ?? null);
    if (!ready)
      void loadTeamTextures(gltf).then((tex) => {
        if (!this.disposed && this.blu) this.applyTeam(true, tex);
      });
  }

  private applyTeam(blu: boolean, textures: ReadonlyMap<number, Texture> | null): void {
    this.inst.forEachMaterial((m, i) => {
      const src = this.part.asset.materials[i];
      const v = teamVariantOf(src);
      if (!v) return;
      let red = this.redLook.get(m);
      if (!red) {
        red = {};
        for (const k of ['uMap', 'uHasMap', 'uColor', 'uPaintDefault', 'uPaintReplace'])
          red[k] = m.uniforms[k];
        this.redLook.set(m, red);
      }
      // Back to RED's own uniform objects (shared with the template), then BLU's changes on new ones.
      for (const [k, val] of Object.entries(red)) {
        if (k === 'uMap' || k === 'uHasMap' || k === 'uColor') {
          if (this.warPainted.has(i)) continue;
        }
        m.uniforms[k] = val;
      }
      if (!blu) return;
      const map = v.baseColorTexture !== undefined ? textures?.get(v.baseColorTexture) : undefined;
      if (map && !this.warPainted.has(i)) {
        m.uniforms.uMap = { value: map };
        m.uniforms.uHasMap = { value: 1 };
        m.uniforms.uColor = { value: new Color(1, 1, 1) };
      } else if (!m.uniforms.uHasMap.value && v.name && !this.warPainted.has(i)) {
        // Untextured (an install without texture data): BLU's material name picks its colour.
        const ud = { ...(src?.userData as ModelMaterialExtras), material: v.name };
        m.uniforms.uColor = { value: fallbackColor({ name: v.name } as Material, ud) };
      }
      if (v.tintDefault?.length === 3) {
        const c = new Color().setRGB(
          v.tintDefault[0],
          v.tintDefault[1],
          v.tintDefault[2],
          SRGBColorSpace,
        );
        m.uniforms.uPaintDefault = { value: new Vector3(c.r, c.g, c.b) };
      }
      if (v.tintReplace !== undefined) m.uniforms.uPaintReplace = { value: v.tintReplace };
    });
  }

  /**
   * A killstreak sheen on the item (lib/tf2-loadout/killstreak.ts; undefined: none), its sweep
   * clocked by `time` (seconds).
   */
  setSheen(sheen: number | undefined, team: number, time: number): void {
    setSheenUniforms(this.inst.uniforms, sheen, team, time);
  }

  /** Swings the item's jiggle bones by `dt` (after the wearer's pose); `near: false` rests them. */
  stepJiggle(dt: number, near: boolean): void {
    if (!this.part.jiggle.length) return;
    this.jiggleBones ??= setupJiggle(this.inst.scene, this.part.jiggle, this.inst.mergedBones);
    if (!this.jiggleBones.length) return;
    if (!near) {
      if (this.jiggling) resetJiggle(this.jiggleBones);
      this.jiggling = false;
      return;
    }
    this.jiggling = true;
    stepJiggle(this.jiggleBones, dt);
  }

  /** Jiggle bones being simulated this frame (stats). */
  get jiggleCount(): number {
    return this.jiggling ? (this.jiggleBones?.length ?? 0) : 0;
  }

  dispose(): void {
    this.disposed = true;
    this.inst.dispose();
  }
}

/** Sheen strength (the shader's uSheen.w): the rim and sweep stay below the lit colour. */
const SHEEN_STRENGTH = 0.9;
const tmpColor = new Color();

/**
 * Writes a killstreak sheen into an item's own uniforms (from `paintUniforms`: never the wearer's
 * set, or the body would shine too). No sheen switches it off.
 */
export function setSheenUniforms(
  uniforms: InstanceUniforms,
  sheen: number | undefined,
  team: number,
  time: number,
): void {
  const u = uniforms as InstanceUniforms & {
    uSheen?: { value: Vector4 };
    uSheenTime?: { value: number };
  };
  if (!u.uSheen || !u.uSheenTime) return;
  const c = sheenColor(sheen, team);
  if (!c) {
    u.uSheen.value.w = 0;
    return;
  }
  const lin = tmpColor.setRGB(c[0], c[1], c[2], SRGBColorSpace);
  u.uSheen.value.set(lin.r, lin.g, lin.b, SHEEN_STRENGTH);
  u.uSheenTime.value = time;
}

/**
 * The loadout particle system of a weapon's unusual effect (`unusual:<id>:<particle suffix>`,
 * the manifest's per-weapon variant), or undefined when the entry has none the weapon can show.
 */
export function weaponEffect(entry: PublicItem | undefined): string | undefined {
  const effect = entry?.effect;
  if (effect === undefined || !entry) return undefined;
  const item = catalogItem(entry.item);
  if (!item) return undefined;
  const suffix = item.ps ?? catalogItem(modelItemId(item))?.ps;
  if (!suffix) return undefined;
  const known = itemCatalog()?.effects.find((e) => e.id === effect);
  if (!known || known.category !== 'weapon') return undefined;
  return `${UNUSUAL_PREFIX}${effect}:${suffix}`;
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
    let near = this.isNear(body, ctx);
    let draws = 0;
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
        w.part.dress({ paint: item?.p ? paintColor(entry.paint, team) : undefined, cls, team });
        draws += w.part.meshCount;
      }
    }
    // The frame's item draw budget, nearest players first (EntityRenderer sorts them): a player
    // past it shows body and weapon only, as one past COSMETIC_LOD_DISTANCE does.
    const budget = ctx.itemDrawBudget;
    if (near && budget && draws) {
      if (budget.left >= draws) budget.left -= draws;
      else near = false;
    }
    for (const w of this.worn.values()) {
      if (w.part) w.part.inst.root.visible = near;
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

  private isNear(body: ModelInstance, ctx: RenderContext, range = COSMETIC_LOD_DISTANCE): boolean {
    const cam = ctx.cameraPosition;
    if (!cam) return true;
    tmpV.setFromMatrixPosition(body.root.matrixWorld);
    return tmpV.distanceTo(cam) < range * SOURCE_UNIT;
  }

  /**
   * After the wearer's pose for the frame: the cosmetics' jiggle bones swing (within
   * JIGGLE_LOD_DISTANCE of the camera, while shown; farther away they rest — LOD).
   * Returns how many jiggle bones were simulated.
   */
  afterPose(ctx: RenderContext): number {
    const body = this.body;
    if (!body || !this.worn.size) return 0;
    const near = this.visible && body.root.visible && this.isNear(body, ctx, JIGGLE_LOD_DISTANCE);
    let n = 0;
    for (const w of this.worn.values()) {
      if (!w.part) continue;
      w.part.stepJiggle(ctx.dt, near);
      n += w.part.jiggleCount;
    }
    return n;
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
