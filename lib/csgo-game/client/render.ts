/**
 * CS:GO's renderables and first-person view model for the shared entity renderer
 * (EntityRendererOptions.factory, game-profile.ts ProfileViewModel).
 *
 *   - Players are original, team-coloured figures built here (a body, a head, a visor stripe), not the
 *     game's agent characters; they crouch, turn, lean with their aim and fall when they die, and hold
 *     the weapon they have out (its published world model).
 *   - Dropped weapons, the planted bomb and thrown grenades draw their published models.
 *   - Smoke clouds and fires run the game's particle systems while the area lasts.
 *   - The view model is the active weapon's published view model, swayed and bobbed with the view.
 *
 * Browser only (three.js).
 */

import {
  CapsuleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  BoxGeometry,
  type WebGLRenderer,
} from 'three';
import type { Vec3 } from '../../tf2-game/core/vec';
import { LIFE_ALIVE } from '../../tf2-game/sim/entity';
import type { NetRecord } from '../../tf2-game/sim/net-schema';
import type { Player } from '../../tf2-game/sim/player';
import { sourceFovToVertical, type SourceCamera } from '../../tf2-game/render/camera';
import { SOURCE_UNIT, srcToThree } from '../../tf2-game/render/coords';
import type { EffectSystem, EntityRenderable, EntityState, RenderContext } from '../../tf2-game/render/entities';
import { bool, LightProbe, num, stateAngles, stateOrigin, str } from '../../tf2-game/render/entities/common';
import { ModelInstance } from '../../tf2-game/render/entities/model-instance';
import type { ProfileViewModel } from '../../tf2-game/client/game-profile';
import { CS_GRENADE_KINDS, csWeapon, csWeaponByDefindex, csWeaponTable, hasCsWeaponData } from '../data/weapon-data';
import { CS_TEAM_CT, CS_TEAM_T } from '../constants';
import { VM_ACTIVITIES, type CsWeapon } from '../weapons/base';

/** Team colours of the figures (T sand, CT steel blue) and their visor. */
const TEAM_BODY: Record<number, number> = { [CS_TEAM_T]: 0xb8925a, [CS_TEAM_CT]: 0x4d6f99 };
const TEAM_HEAD: Record<number, number> = { [CS_TEAM_T]: 0xcfab78, [CS_TEAM_CT]: 0x6f8fb8 };
const NEUTRAL = 0x8a8a8a;
const VISOR = 0x1c1f24;

/** The planted bomb's model (the C4's own planted variant). */
const PLANTED_C4 = 'models/weapons/w_c4_planted.mdl';

/** Every published weapon model a match may show (view and world), preloaded with the map. */
export function preloadCsModels(): string[] {
  if (!hasCsWeaponData()) return [];
  const out = new Set<string>();
  for (const w of csWeaponTable().weapons.values()) {
    if (w.viewModel) out.add(w.viewModel);
    if (w.worldModel) out.add(w.worldModel);
  }
  out.add(PLANTED_C4);
  return [...out].filter((m) => /\.mdl$/i.test(m));
}

const tmpV = { x: 0, y: 0, z: 0 };
const tmpA = { x: 0, y: 0, z: 0 };

/** A published model placed at a Source origin and angles (weapons, the bomb, grenades). */
class PlacedModel {
  inst: ModelInstance | null = null;
  model = '';

  /** The instance for `model`, loading it on first use (null while loading or when absent). */
  ensure(model: string, ctx: RenderContext, parent = ctx.scene): ModelInstance | null {
    if (!model) {
      this.hide();
      return null;
    }
    if (model !== this.model || !this.inst) {
      const asset = ctx.models.peek(model);
      if (!asset) {
        if (asset === undefined) void ctx.models.asset(model);
        this.hide();
        return null;
      }
      this.inst?.dispose();
      this.inst = new ModelInstance(asset, { fog: ctx.lighting?.shared });
      this.model = model;
    }
    if (this.inst.root.parent !== parent) parent.add(this.inst.root);
    this.inst.root.visible = true;
    return this.inst;
  }

  place(origin: Vec3, angles: Vec3): void {
    if (!this.inst) return;
    this.inst.place(origin, angles, 1);
    this.inst.applyPose();
    this.inst.updateMatrices();
  }

  hide(): void {
    if (this.inst) this.inst.root.visible = false;
  }

  dispose(): void {
    this.inst?.dispose();
    this.inst = null;
  }
}

/** A player: an original figure in its team's colours, holding the weapon it has out. */
export class CsPlayerFigure implements EntityRenderable {
  private readonly root = new Group();
  private readonly body: Mesh;
  private readonly head: Mesh;
  private readonly visor: Mesh;
  private readonly bodyMat = new MeshBasicMaterial({ color: NEUTRAL });
  private readonly headMat = new MeshBasicMaterial({ color: NEUTRAL });
  private readonly weapon = new PlacedModel();
  private readonly origin = { x: 0, y: 0, z: 0 };
  private crouch = 0;
  private fall = 0;
  private team = -1;

  constructor(readonly id: number) {
    // Source units: 72 tall standing (the CS hull), the head's centre at 64 (the eye).
    const body = new CapsuleGeometry(13 * SOURCE_UNIT, 30 * SOURCE_UNIT, 4, 10);
    this.body = new Mesh(body, this.bodyMat);
    this.head = new Mesh(new SphereGeometry(7.5 * SOURCE_UNIT, 12, 10), this.headMat);
    this.visor = new Mesh(new BoxGeometry(11 * SOURCE_UNIT, 3 * SOURCE_UNIT, 4 * SOURCE_UNIT), new MeshBasicMaterial({ color: VISOR }));
    this.root.add(this.body, this.head, this.visor);
    this.root.name = `cs_player:${id}`;
  }

  update(s: EntityState, ctx: RenderContext): void {
    const f = s.fields;
    const alive = num(f, 'lifeState') === LIFE_ALIVE;
    const team = num(f, 'team');
    const local = s.id === ctx.localPlayer && ctx.firstPerson;
    if (!this.root.parent) ctx.scene.add(this.root);
    this.root.visible = !local && (alive || this.fall < 1) && team >= CS_TEAM_T;
    if (team !== this.team) {
      this.team = team;
      this.bodyMat.color.setHex(TEAM_BODY[team] ?? NEUTRAL);
      this.headMat.color.setHex(TEAM_HEAD[team] ?? NEUTRAL);
    }
    stateOrigin(s, this.origin);
    const yaw = num(f, 'eyeYaw');
    const pitch = num(f, 'eyePitch');
    // Crouch and fall ease toward their state (no snapping between snapshots).
    const k = Math.min(1, ctx.dt * 12);
    this.crouch += ((bool(f, 'ducked') ? 1 : 0) - this.crouch) * k;
    this.fall = alive ? 0 : Math.min(1, this.fall + ctx.dt * 2.5);
    const height = 72 - 18 * this.crouch;
    const bodyLen = height - 2 * 13 - 16;
    this.body.scale.set(1, Math.max(0.3, bodyLen / 30), 1);
    this.body.position.set(0, (13 + bodyLen / 2) * SOURCE_UNIT, 0);
    this.head.position.set(0, (height - 7) * SOURCE_UNIT, 0);
    this.visor.position.set(0, (height - 6) * SOURCE_UNIT, -6 * SOURCE_UNIT);
    // three's figure faces −Z; Source yaw turns about +Z (three +Y). A dying figure tips backwards.
    srcToThree(this.origin.x, this.origin.y, this.origin.z, this.root.position);
    this.root.rotation.set(0, ((yaw - 90) * Math.PI) / 180, 0, 'YXZ');
    this.root.rotateX((this.fall * Math.PI) / 2);
    this.head.rotation.x = (-pitch * Math.PI) / 360;
    this.root.updateMatrixWorld();
    // The weapon out, at the right hand, along the aim.
    const name = str(f, 'weaponName');
    const info = alive && this.root.visible && name ? csWeapon(name) : null;
    const inst = info ? this.weapon.ensure(info.worldModel, ctx) : null;
    if (!inst) {
      this.weapon.hide();
      return;
    }
    const yr = (yaw * Math.PI) / 180;
    tmpV.x = this.origin.x + Math.cos(yr) * 10 - Math.sin(yr) * 7;
    tmpV.y = this.origin.y + Math.sin(yr) * 10 + Math.cos(yr) * 7;
    tmpV.z = this.origin.z + height - 22;
    tmpA.x = pitch;
    tmpA.y = yaw;
    tmpA.z = 0;
    this.weapon.place(tmpV, tmpA);
  }

  attachment(name: string, out: Matrix4): boolean {
    if (!this.root.visible) return false;
    if (name === 'muzzle' && this.weapon.inst?.root.visible && this.weapon.inst.attachmentMatrix('muzzle_flash', out)) return true;
    out.copy(this.root.matrixWorld);
    return true;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.body.geometry.dispose();
    this.head.geometry.dispose();
    this.visor.geometry.dispose();
    this.bodyMat.dispose();
    this.headMat.dispose();
    (this.visor.material as MeshBasicMaterial).dispose();
    this.weapon.dispose();
  }
}

/** A published model at the entity's origin: dropped weapons, the planted bomb, thrown grenades. */
class CsModelEntity implements EntityRenderable {
  private readonly model = new PlacedModel();
  private readonly origin = { x: 0, y: 0, z: 0 };
  private readonly angles = { x: 0, y: 0, z: 0 };

  constructor(
    readonly id: number,
    private readonly modelOf: (s: EntityState) => string,
    private readonly fx: EffectSystem | null = null,
    private readonly loopOf: ((s: EntityState) => string) | null = null,
  ) {}

  update(s: EntityState, ctx: RenderContext): void {
    const inst = this.model.ensure(this.modelOf(s), ctx);
    stateOrigin(s, this.origin);
    stateAngles(s, this.angles);
    if (inst) this.model.place(this.origin, this.angles);
    const system = this.loopOf?.(s) ?? '';
    const key = `cs:${this.id}`;
    if (system && this.fx && !this.fx.isLooping(key)) this.fx.loop(key, system, { pos: { ...this.origin } });
    else if (!system && this.fx?.isLooping(key)) this.fx.stop(key);
  }

  attachment(name: string, out: Matrix4): boolean {
    const inst = this.model.inst;
    if (!inst?.root.visible) return false;
    if (name && inst.attachmentMatrix(name, out)) return true;
    out.copy(inst.root.matrixWorld);
    return true;
  }

  dispose(): void {
    this.fx?.stop(`cs:${this.id}`);
    this.model.dispose();
  }
}

/** The grenade kinds' world models, from the weapon data (grenade → its weapon). */
function grenadeModel(kind: number): string {
  const name = CS_GRENADE_KINDS[kind];
  if (!name || !hasCsWeaponData()) return '';
  return csWeapon(`weapon_${name}`)?.worldModel ?? '';
}

/** The particle systems a smoke cloud (kind 0) and a fire (kind 1) run while they last. */
const AREA_SYSTEMS = ['explosion_smokegrenade', 'molotov_groundfire'];

/** Smoke clouds and fires: the game's particle systems at the area's centre while it lasts. */
class CsAreaEntity implements EntityRenderable {
  private readonly origin = { x: 0, y: 0, z: 0 };
  private started = false;

  constructor(
    readonly id: number,
    private readonly fx: EffectSystem,
  ) {}

  update(s: EntityState): void {
    if (this.started) return;
    this.started = true;
    stateOrigin(s, this.origin);
    const system = AREA_SYSTEMS[num(s.fields, 'kind')] ?? AREA_SYSTEMS[0];
    this.fx.loop(`csarea:${this.id}`, system, { pos: { ...this.origin } });
  }

  attachment(): boolean {
    return false;
  }

  dispose(): void {
    this.fx.stop(`csarea:${this.id}`);
  }
}

/** EntityRendererOptions.factory: CS:GO's entity types; anything else falls through to the shared ones. */
export function csEntityFactory(s: EntityState, fx: EffectSystem): EntityRenderable | null {
  switch (s.type) {
    case 'cs_player':
      return new CsPlayerFigure(s.id);
    case 'cs_dropped_weapon':
      return new CsModelEntity(s.id, (e) => {
        const info = csWeaponByDefindex(num(e.fields, 'defindex')) ?? csWeapon(str(e.fields, 'weaponName'));
        return info?.worldModel ?? '';
      });
    case 'cs_planted_c4':
      return new CsModelEntity(
        s.id,
        (e) => (bool(e.fields, 'exploded') ? '' : PLANTED_C4),
        fx,
        (e) => (bool(e.fields, 'exploded') || bool(e.fields, 'defused') ? '' : 'c4_timer_light'),
      );
    case 'cs_grenade':
      return new CsModelEntity(s.id, (e) => grenadeModel(num(e.fields, 'kind')));
    case 'cs_area':
      return new CsAreaEntity(s.id, fx);
    default:
      return null;
  }
}

// ─── View model ──────────────────────────────────────────────────────────────

/**
 * The view model is drawn only once the weapon's model carries animation clips. CS:GO stores every view
 * model's sequences as frame animations, which the converter decodes from models builder 2
 * (srcanim.py `decode_frame_anim`); a model published before that has none and would sit in its bind pose
 * across the view, so until it is rebuilt the game plays as with `cl_drawviewmodel 0` (the HUD's crosshair).
 */
export const viewModelAnimated = (inst: ModelInstance): boolean => (inst.animator?.set.sequences.size ?? 0) > 0;

/**
 * Off while the frame-animation rotations are being verified: models builder 2 decodes the clips' layout
 * correctly but its compressed-rotation values still pose the arms wrongly, so the view is left clear.
 */
export const CS_DRAW_VIEWMODEL = false;

/**
 * Each team's default gloves (the generic first-person hands, no faction sleeves), from the model channel:
 * T the fingerless gloves, CT the hard-knuckle ones, else bare hands. Resolved once from `mdl/index.json`.
 */
const GLOVE_PREFS: Record<number, RegExp[]> = {
  [CS_TEAM_T]: [/\/v_glove_fingerless\.mdl$/, /\/v_bare_hands\.mdl$/],
  [CS_TEAM_CT]: [/\/v_glove_hardknuckle\.mdl$/, /\/v_bare_hands\.mdl$/],
};
let gloveModels: Record<number, string> | null = null;
let gloveLookup: Promise<void> | null = null;
function glovesFor(team: number, ctx: RenderContext): string {
  if (!gloveModels) {
    gloveLookup ??= ctx.models.loadIndex().then((index) => {
      const keys = Object.keys(index ?? {});
      const pick = (res: RegExp[]) => res.map((re) => keys.find((k) => re.test(k))).find(Boolean) ?? '';
      gloveModels = { [CS_TEAM_T]: pick(GLOVE_PREFS[CS_TEAM_T]), [CS_TEAM_CT]: pick(GLOVE_PREFS[CS_TEAM_CT]) };
    });
    return '';
  }
  return gloveModels[team] ?? gloveModels[CS_TEAM_CT] ?? '';
}

/** How far (units) and how fast the weapon bobs and sways with movement and turning. */
const BOB_AMOUNT = 0.6;
const BOB_RATE = 9;
const SWAY_LAG = 8;

/**
 * The first-person weapon: the active weapon's published view model, drawn in its own scene over
 * the world (viewmodel_fov), bobbing with the walk and lagging a little behind turns.
 */
export class CsViewModel implements ProfileViewModel {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(68, 1, SOURCE_UNIT, 2048 * SOURCE_UNIT);
  private readonly model = new PlacedModel();
  /** The team's gloves, bone-merged onto the weapon (CS:GO's view models animate the weapon; the hands follow). */
  private gloves: ModelInstance | null = null;
  private glovesModel = '';
  private readonly probe = new LightProbe();
  /** The activity playing and its change counter (the weapon's networked vmActivity / vmActivitySeq). */
  private lastAct = -1;
  private lastSeq = -1;
  private fov = 68;
  private bob = 0;
  private swayYaw = 0;
  private swayPitch = 0;
  private visible = false;

  constructor(private readonly fx: EffectSystem) {
    void this.fx;
  }

  setFov(fov: number): void {
    this.fov = fov;
  }

  update(
    p: Player | null,
    me: NetRecord | null,
    frame: { eyeOrigin: Vec3; eyeAngles: Vec3; velocity: Vec3; dt: number; visible: boolean },
    ctx: RenderContext,
  ): void {
    const w = p?.activeWeapon() as CsWeapon | null;
    const info = w ? csWeaponByDefindex(w.defindex) : null;
    this.visible = CS_DRAW_VIEWMODEL && !!p && !!info && frame.visible;
    if (!this.visible || !info) {
      this.model.hide();
      return;
    }
    const fresh = this.model.model !== info.viewModel;
    const inst = this.model.ensure(info.viewModel, ctx, this.scene);
    if (!inst || !viewModelAnimated(inst)) {
      this.model.hide();
      this.visible = false;
      return;
    }
    if (fresh) {
      // A new weapon model: the gloves merge onto its bones again.
      this.gloves?.dispose();
      this.gloves = null;
      this.glovesModel = '';
    }
    const glovesModel = glovesFor(typeof me?.team === 'number' ? me.team : CS_TEAM_CT, ctx);
    if (glovesModel && glovesModel !== this.glovesModel) {
      const asset = ctx.models.peek(glovesModel);
      if (asset === undefined) void ctx.models.asset(glovesModel);
      else {
        this.gloves?.dispose();
        this.gloves = asset ? new ModelInstance(asset, { uniforms: inst.uniforms, noAnim: true }) : null;
        this.glovesModel = glovesModel;
        if (this.gloves) inst.attach(this.gloves);
      }
    }
    // The weapon's activity (idle, draw, fire, reload, …) as a sequence of its own activity table: a
    // new change counter restarts a one-shot, an idle loops (a model held in its bind pose would sit
    // across the view).
    const a = inst.animator;
    const act = (w as CsWeapon & { vmActivity?: number }).vmActivity ?? 0;
    const seqNo = (w as CsWeapon & { vmActivitySeq?: number }).vmActivitySeq ?? 0;
    if (a && (fresh || act !== this.lastAct || seqNo !== this.lastSeq)) {
      const name = VM_ACTIVITIES[act] ?? 'ACT_VM_IDLE';
      const seq = a.set.selectWeightedSequence(name) ?? a.set.selectWeightedSequence('ACT_VM_IDLE') ?? a.set.sequences.values().next().value ?? null;
      a.setSequence(seq, { restart: seqNo !== this.lastSeq || fresh, fade: !fresh });
      this.lastAct = act;
      this.lastSeq = seqNo;
    }
    const speed = Math.hypot(frame.velocity.x, frame.velocity.y);
    this.bob += frame.dt * BOB_RATE * Math.min(1, speed / 250);
    const k = Math.min(1, frame.dt * SWAY_LAG);
    this.swayYaw = lerpAngle(this.swayYaw, frame.eyeAngles.y, k);
    this.swayPitch = lerpAngle(this.swayPitch, frame.eyeAngles.x, k);
    const amp = BOB_AMOUNT * Math.min(1, speed / 250);
    tmpV.x = frame.eyeOrigin.x;
    tmpV.y = frame.eyeOrigin.y;
    tmpV.z = frame.eyeOrigin.z + Math.sin(this.bob * 2) * amp * 0.5;
    tmpA.x = this.swayPitch;
    tmpA.y = this.swayYaw;
    tmpA.z = Math.sin(this.bob) * amp;
    inst.place(tmpV, tmpA, 1);
    // Lit like the world at the eye (the ambient cube, the sun); unlit it draws black.
    this.probe.update(ctx, inst.uniforms, frame.eyeOrigin, 0);
    if (inst.animator) inst.animate(frame.dt);
    inst.applyPose();
    inst.updateMatrices();
  }

  render(renderer: WebGLRenderer, cam: SourceCamera): void {
    if (!this.visible) return;
    const c = this.camera;
    c.fov = sourceFovToVertical(this.fov);
    c.aspect = cam.camera.aspect;
    c.layers.enable(1);
    c.position.copy(cam.camera.position);
    c.quaternion.copy(cam.camera.quaternion);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, c);
    renderer.autoClear = auto;
  }

  attachment(name: string, out: Matrix4): boolean {
    const inst = this.model.inst;
    if (!this.visible || !inst) return false;
    return inst.attachmentMatrix(name === 'muzzle' ? '1' : name, out) || inst.attachmentMatrix('muzzle_flash', out);
  }

  dispose(): void {
    this.gloves?.dispose();
    this.gloves = null;
    this.model.dispose();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

