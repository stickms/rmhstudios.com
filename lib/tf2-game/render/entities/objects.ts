/**
 * Everything that is not a player: a generic model entity (prop_dynamic / prop_physics /
 * item_* / any `entity` with a model — payload carts, control point holograms, HL2 and Portal
 * props and NPC stand-ins: model + sequence + cycle + skin + body + visibility), projectiles
 * (team skins and trails), Engineer buildings (blueprints, construction and upgrade sequences,
 * sentry aim pose parameters and muzzle flashes, damage smoke, teleporter effects), pickups
 * (hidden while respawning), the CTF flag (home / dropped / carried at the carrier's `flag`
 * attachment) and point particle systems (info_particle_system).
 */
import { Matrix4, Vector3 } from 'three';
import { TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { cycleRate, type SequenceDesc } from './animator';
import {
  bool,
  LightProbe,
  num,
  stateAngles,
  stateOrigin,
  str,
  type EntityState,
  type RenderContext,
} from './common';
import type { EffectSystem } from './effects';
import { ModelInstance } from './model-instance';

/** EF_NODRAW (const.h). */
export const EF_NODRAW = 0x20;
/** kRenderTransAlpha etc.: anything but kRenderNormal (0) reads renderAlpha. */
const RENDER_NORMAL = 0;

const tmpM = new Matrix4();
const tmpV = new Vector3();

/** Any entity drawn from one model (the base of the specific renderables). */
export class ModelRenderable {
  protected inst: ModelInstance | null = null;
  protected model = '';
  protected readonly probe = new LightProbe();
  protected readonly origin = { x: 0, y: 0, z: 0 };
  protected readonly angles = { x: 0, y: 0, z: 0 };
  protected seqName = '';
  protected visible = false;
  /** Height above the origin the ambient light is sampled at. */
  protected lightHeight = 16;

  constructor(
    readonly id: number,
    protected readonly effects: EffectSystem | null,
  ) {}

  /** The model to draw for a state ('' for none). */
  protected modelOf(s: EntityState): string {
    return str(s.fields, 'model');
  }

  protected ensure(s: EntityState, ctx: RenderContext): ModelInstance | null {
    const model = this.modelOf(s);
    if (!model || !/\.mdl$/i.test(model)) {
      this.hide();
      return null;
    }
    if (model !== this.model || !this.inst) {
      const asset = ctx.models.peek(model);
      if (!asset) {
        if (asset === null) this.model = model;
        this.hide();
        return null;
      }
      this.inst?.dispose();
      this.inst = new ModelInstance(asset, { fog: ctx.lighting?.shared });
      this.model = model;
      this.seqName = '';
      this.onModel(this.inst, ctx);
    }
    const inst = this.inst;
    if (!inst.root.parent) ctx.scene.add(inst.root);
    return inst;
  }

  /** Hook: a new model instance was created. */
  protected onModel(inst: ModelInstance, ctx: RenderContext): void {
    void inst;
    void ctx;
  }

  protected isHidden(s: EntityState): boolean {
    const f = s.fields;
    if (num(f, 'effects') & EF_NODRAW) return true;
    if (bool(f, 'hidden')) return true;
    if (f.visible === false) return true;
    return (
      num(f, 'renderMode') !== RENDER_NORMAL &&
      f.renderAlpha !== undefined &&
      num(f, 'renderAlpha') === 0
    );
  }

  update(s: EntityState, ctx: RenderContext): void {
    const inst = this.ensure(s, ctx);
    if (!inst) return;
    if (this.isHidden(s)) {
      this.hide();
      return;
    }
    this.visible = true;
    inst.root.visible = true;
    const f = s.fields;
    stateOrigin(s, this.origin);
    stateAngles(s, this.angles);
    inst.setSkin(this.skinOf(s));
    inst.setBody(num(f, 'body'));
    const alpha =
      num(f, 'renderMode') !== RENDER_NORMAL && f.renderAlpha !== undefined
        ? num(f, 'renderAlpha') / 255
        : 1;
    inst.uniforms.uAlpha.value = alpha;
    const scale = num(f, 'modelScale') || 1;
    inst.place(this.origin, this.angles, scale);
    this.animate(s, ctx, inst);
    this.probe.update(ctx, inst.uniforms, this.origin, this.lightHeight);
    inst.applyPose();
    this.beforeMatrices(s, ctx, inst);
    inst.updateMatrices();
  }

  protected skinOf(s: EntityState): number {
    return num(s.fields, 'skin');
  }

  /** prop_dynamic: `sequence` from `animStart` at `playbackRate` (else the model's idle). */
  protected animate(s: EntityState, ctx: RenderContext, inst: ModelInstance): void {
    const a = inst.animator;
    if (!a) return;
    const f = s.fields;
    const name = str(f, 'sequence');
    let seq: SequenceDesc | undefined;
    if (name) seq = a.set.seq(name) ?? a.set.selectWeightedSequence(name) ?? undefined;
    seq ??= a.main?.seq ?? defaultSequence(a.set.sequences);
    if (!seq) return;
    if (seq.name !== this.seqName) {
      a.setSequence(seq, { restart: true, fade: !!this.seqName });
      this.seqName = seq.name;
    }
    const main = a.main;
    if (main && f.animStart !== undefined) {
      const rate = f.playbackRate !== undefined ? num(f, 'playbackRate') : 1;
      const c = (ctx.time - num(f, 'animStart')) * cycleRate(seq) * rate;
      main.cycle = seq.looping ? c - Math.floor(c) : Math.min(1, Math.max(0, c));
      a.advance(0);
      a.time = ctx.time;
      a.evaluate(inst.pos, inst.quat);
    } else {
      inst.animate(ctx.dt);
    }
  }

  /** Hook before world matrices update (procedural bones). */
  protected beforeMatrices(s: EntityState, ctx: RenderContext, inst: ModelInstance): void {
    void s;
    void ctx;
    void inst;
  }

  protected hide(): void {
    if (this.inst) this.inst.root.visible = false;
    this.visible = false;
  }

  attachment(name: string, out: Matrix4): boolean {
    if (!this.inst || !this.visible) return false;
    if (name && this.inst.attachmentMatrix(name, out)) return true;
    out.copy(this.inst.root.matrixWorld);
    return true;
  }

  get instance(): ModelInstance | null {
    return this.inst;
  }

  dispose(): void {
    this.effects?.stopEntity(this.id);
    this.inst?.dispose();
    this.inst = null;
  }
}

/** The model's idle: ACT_IDLE, a sequence named idle, else the first. */
function defaultSequence(seqs: ReadonlyMap<string, SequenceDesc>): SequenceDesc | undefined {
  let first: SequenceDesc | undefined;
  for (const s of seqs.values()) {
    if (s.hidden || s.delta) continue;
    first ??= s;
    if (s.activity === 'ACT_IDLE' || /^idle/i.test(s.name)) return s;
  }
  return first;
}

const teamSkin = (team: number) => (team === TF_TEAM_BLUE ? 1 : 0);
const teamName = (team: number) => (team === TF_TEAM_BLUE ? 'blue' : 'red');

// ─── projectiles ───────────────────────────────────────────────────────────

/** The trail a projectile model carries (tf_weaponbase_rocket / grenade_pipebomb CreateTrails). */
export function projectileTrail(model: string, team: number, critical: boolean): string | null {
  const m = model.toLowerCase();
  const t = teamName(team);
  if (m.includes('w_rocket')) return critical ? `critical_rocket_${t}` : 'rockettrail';
  if (m.includes('sentry3_rockets')) return 'sentry_rocket';
  if (m.includes('stickybomb')) return critical ? `critical_grenade_${t}` : `stickybombtrail_${t}`;
  if (m.includes('grenade')) return critical ? `critical_pipe_${t}` : `pipebombtrail_${t}`;
  if (m.includes('syringe'))
    return critical ? `nailtrails_medic_${t}_crit` : `nailtrails_medic_${t}`;
  return null;
}

export class ProjectileRenderable extends ModelRenderable {
  private trailKey = '';
  protected override lightHeight = 0;

  protected override skinOf(s: EntityState): number {
    return num(s.fields, 'skin') || teamSkin(num(s.fields, 'team'));
  }

  override update(s: EntityState, ctx: RenderContext): void {
    super.update(s, ctx);
    const f = s.fields;
    const trail = projectileTrail(this.modelOf(s), num(f, 'team'), num(f, 'critical') > 0);
    const key = `trail:${this.id}`;
    if (trail && this.visible && this.effects && this.trailKey !== trail) {
      this.effects.loop(key, trail, { entity: this.id, attachment: 'trail' });
      this.trailKey = trail;
    }
  }

  override dispose(): void {
    // Trails stop emitting and fade out on their own (the effect system drains them).
    this.effects?.stop(`trail:${this.id}`);
    super.dispose();
  }
}

// ─── pickups ───────────────────────────────────────────────────────────────

export class PickupRenderable extends ModelRenderable {
  protected override lightHeight = 8;
}

// ─── buildings ─────────────────────────────────────────────────────────────

/** TF2 building types (ObjectType_t). */
export const OBJ_DISPENSER = 0;
export const OBJ_TELEPORTER = 1;
export const OBJ_SENTRYGUN = 2;
export const OBJ_ATTACHMENT_SAPPER = 3;

export class BuildingRenderable extends ModelRenderable {
  private lastFire = -1;
  private lastRocket = -1;
  private smokeKey = '';
  private fxKeys: string[] = [];
  protected override lightHeight = 24;

  constructor(
    id: number,
    effects: EffectSystem | null,
    readonly type: string,
  ) {
    super(id, effects);
  }

  protected override skinOf(s: EntityState): number {
    return teamSkin(num(s.fields, 'team'));
  }

  protected override animate(s: EntityState, ctx: RenderContext, inst: ModelInstance): void {
    const a = inst.animator;
    if (!a) return;
    const f = s.fields;
    const set = a.set;
    // Placement blueprints: translucent, tinted by validity.
    const placing = bool(f, 'placing');
    const u = inst.uniforms;
    (u.uTint.value as Vector3).set(1, 1, 1);
    u.uAlpha.value = 1;
    if (placing) {
      const ok = f.placementOk !== false;
      (u.uTint.value as Vector3).set(ok ? 0.7 : 1.4, ok ? 1.4 : 0.5, ok ? 0.8 : 0.5);
      u.uAlpha.value = 0.6;
    }
    if (bool(f, 'building') || bool(f, 'upgrading')) {
      // Construction / upgrade: the build sequence at the progress (SDK CBaseObject sets the cycle).
      const upgrading = bool(f, 'upgrading');
      const seq =
        (upgrading ? set.seq('upgrade') : undefined) ??
        set.selectWeightedSequence('ACT_OBJ_ASSEMBLING') ??
        set.seq('build') ??
        set.seq('upgrade');
      if (seq) {
        a.setSequence(seq, { fade: false });
        const progress = upgrading ? num(f, 'upgradeProgress') : num(f, 'buildProgress');
        if (a.main) a.main.cycle = Math.min(1, Math.max(0, progress));
      }
      a.advance(0);
      a.time = ctx.time;
      a.evaluate(inst.pos, inst.quat);
      return;
    }
    const running =
      set.selectWeightedSequence('ACT_OBJ_RUNNING') ??
      set.seq('idle') ??
      set.selectWeightedSequence('ACT_OBJ_PLACING');
    if (running && a.main?.seq !== running) a.setSequence(running, { fade: false });
    if (this.type === 'sentrygun') {
      a.setPoseParam('aim_yaw', num(f, 'aimYaw'));
      a.setPoseParam('aim_pitch', num(f, 'aimPitch'));
      const fire = num(f, 'fireSeq');
      if (this.lastFire >= 0 && fire !== this.lastFire) this.fire(s, ctx, inst);
      this.lastFire = fire;
      const rocket = num(f, 'rocketSeq');
      if (this.lastRocket >= 0 && rocket !== this.lastRocket) {
        a.restartGesture(1, set.selectWeightedSequence('ACT_RANGE_ATTACK2'), 'ACT_RANGE_ATTACK2');
        this.effects?.oneShot('rocketbackblast', { entity: this.id, attachment: 'rocket' });
      }
      this.lastRocket = rocket;
    }
    if (this.type === 'teleporter') {
      // The arms spin while charged (SDK C_ObjectTeleporter: running at a rate by the charge).
      a.playbackRate = num(f, 'matchId', -1) >= 0 ? 0.5 + num(f, 'charge') : 0;
      a.setPoseParam('direction', num(f, 'yaw') - this.angles.y);
    }
    inst.animate(ctx.dt);
  }

  /** Sentry shot: the fire gesture and the muzzle flash at the barrel that fired. */
  private fire(s: EntityState, ctx: RenderContext, inst: ModelInstance): void {
    const a = inst.animator!;
    a.restartGesture(0, a.set.selectWeightedSequence('ACT_RANGE_ATTACK1'), 'ACT_RANGE_ATTACK1');
    const level = num(s.fields, 'level') || 1;
    const att = level <= 1 ? 'muzzle' : num(s.fields, 'muzzle') ? 'muzzle_r' : 'muzzle_l';
    this.effects?.oneShot(level <= 1 ? 'muzzle_sentry' : 'muzzle_sentry2', {
      entity: this.id,
      attachment: att,
    });
    void ctx;
  }

  override update(s: EntityState, ctx: RenderContext): void {
    super.update(s, ctx);
    if (!this.effects) return;
    const f = s.fields;
    const built =
      this.visible && !bool(f, 'building') && !bool(f, 'placing') && !bool(f, 'carried');
    // Damage smoke by health (C_BaseObject::UpdateDamageEffects).
    const hp = num(f, 'health');
    const max = Math.max(1, num(f, 'maxHealth'));
    const frac = hp / max;
    const stage =
      !built || frac >= 0.66 ? 0 : frac >= 0.5 ? 1 : frac >= 0.33 ? 2 : frac >= 0.2 ? 3 : 4;
    const prefix =
      this.type === 'sentrygun'
        ? 'sentrydamage_'
        : this.type === 'dispenser'
          ? 'dispenserdamage_'
          : '';
    const smoke = stage && prefix ? `${prefix}${stage}` : '';
    if (smoke !== this.smokeKey) {
      this.effects.stop(`smoke:${this.id}`);
      if (smoke)
        this.effects.loop(`smoke:${this.id}`, smoke, {
          entity: this.id,
          attachment: 'sentrydamage',
          pos: this.origin,
        });
      this.smokeKey = smoke;
    }
    // Teleporter: the team glow while linked, the charged sparkle when ready.
    if (this.type === 'teleporter') {
      const team = teamName(num(f, 'team'));
      const linked = built && num(f, 'matchId', -1) >= 0;
      const want: Array<[string, string]> = [];
      if (linked) {
        const exit = /exit/.test(this.model) || num(f, 'objectMode') === 1;
        want.push([`tele:${this.id}`, `teleporter_${team}_${exit ? 'exit' : 'entrance'}`]);
        if (num(f, 'charge') >= 1) want.push([`tele2:${this.id}`, `teleporter_${team}_charged`]);
        if ((num(f, 'level') || 1) > 1)
          want.push([`tele3:${this.id}`, `teleporter_arms_circle_${team}`]);
      }
      const keys = want.map((w) => w[0]);
      for (const k of this.fxKeys) if (!keys.includes(k)) this.effects.stop(k);
      for (const [k, sys] of want)
        this.effects.loop(k, sys, {
          entity: this.id,
          attachment: 'centre_attach',
          pos: this.origin,
        });
      this.fxKeys = keys;
    }
  }

  override dispose(): void {
    for (const k of this.fxKeys) this.effects?.stop(k);
    this.effects?.stop(`smoke:${this.id}`);
    super.dispose();
  }
}

// ─── the CTF flag ──────────────────────────────────────────────────────────

/** TF_FLAGINFO_*. */
export const FLAG_HOME = 0;
export const FLAG_STOLEN = 1;
export const FLAG_DROPPED = 2;

export class FlagRenderable extends ModelRenderable {
  private trail = '';

  protected override modelOf(s: EntityState): string {
    return str(s.fields, 'model') || 'models/flag/briefcase.mdl';
  }

  protected override skinOf(s: EntityState): number {
    const team = num(s.fields, 'team');
    return team === TF_TEAM_RED ? 0 : team === TF_TEAM_BLUE ? 1 : 2;
  }

  override update(s: EntityState, ctx: RenderContext): void {
    const f = s.fields;
    const status = num(f, 'status');
    const carrier = num(f, 'carrier', -1);
    if (bool(f, 'disabled')) {
      this.hide();
      return;
    }
    if (status === FLAG_STOLEN && carrier > 0) {
      // Carried: on the carrier's `flag` attachment; hidden from the carrier in first person.
      const inst = this.ensure(s, ctx);
      if (!inst) return;
      if (
        (ctx.firstPerson && carrier === ctx.localPlayer) ||
        !ctx.attachment(carrier, 'flag', tmpM)
      ) {
        this.hide();
        return;
      }
      this.visible = true;
      inst.root.visible = true;
      inst.setSkin(this.skinOf(s));
      inst.root.matrix.copy(tmpM);
      inst.root.matrixWorldNeedsUpdate = true;
      tmpV.setFromMatrixPosition(tmpM);
      this.origin.x = tmpV.z / 0.01905;
      this.origin.y = tmpV.x / 0.01905;
      this.origin.z = tmpV.y / 0.01905;
      this.probe.update(ctx, inst.uniforms, this.origin, 0);
      inst.animate(ctx.dt);
      inst.applyPose();
      inst.updateMatrices();
    } else {
      super.update(s, ctx);
    }
    const want =
      status === FLAG_STOLEN && this.visible
        ? str(f, 'trailEffect') || `player_intel_trail_${teamName(num(f, 'team'))}`
        : '';
    if (want !== this.trail && this.effects) {
      this.effects.stop(`flag:${this.id}`);
      if (want) this.effects.loop(`flag:${this.id}`, want, { entity: this.id });
      this.trail = want;
    }
  }
}

// ─── point particle systems ────────────────────────────────────────────────

/** info_particle_system (sim/entities/effects.ts NET_FX kind/name/active). */
export class FxEntityRenderable {
  private playing = '';

  constructor(
    readonly id: number,
    private readonly effects: EffectSystem | null,
  ) {}

  update(s: EntityState, ctx: RenderContext): void {
    void ctx;
    const f = s.fields;
    const kind = str(f, 'kind');
    const name = str(f, 'name');
    const want = kind === 'info_particle_system' && bool(f, 'active') && name ? name : '';
    if (want === this.playing || !this.effects) return;
    this.effects.stop(`fx:${this.id}`);
    if (want) {
      const o = stateOrigin(s, { x: 0, y: 0, z: 0 });
      this.effects.loop(`fx:${this.id}`, want, { pos: o });
    }
    this.playing = want;
  }

  attachment(_name: string, _out: Matrix4): boolean {
    return false;
  }

  dispose(): void {
    this.effects?.stop(`fx:${this.id}`);
  }
}
