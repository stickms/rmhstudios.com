/**
 * TF2 players in third person: the class body animated by TFPlayerAnimState
 * (player-anim-state.ts) from the networked player record, the held weapon's c_model
 * bone-merged, team / über skins, the cloak (fade + dissolve, no refraction), disguises
 * (enemies see the disguise class/team/weapon; the spy and his team see him with a
 * disguise-kit tint), the loadout's items (loadout-models.ts: an unlock weapon's own model,
 * cosmetics with paint, styles, body groups and unusual effects), crit glow, burning (particles), and death (a death sequence, gibs on
 * explosive deaths, a corpse kept for a while). The flag a player carries is drawn by the
 * flag renderable at this player's `flag` attachment (`attachment()`).
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { CLASS_DATA } from '../../data/classes';
import { playerAnimSuffix, STOCK_WEAPONS, type StockWeapon } from '../../data/weapons';
import {
  decodeItems,
  tfClassOf,
  type PublicItem,
  type ReplicatedItems,
} from '../../sim/items/loadout';
import { FL_INWATER, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { TF_COND } from '../../sim/conditions';
import { LIFE_ALIVE } from '../../sim/entity';
import {
  TF_DMG_CUSTOM_BACKSTAB,
  TF_DMG_CUSTOM_BURNING,
  TF_DMG_CUSTOM_HEADSHOT,
} from '../../sim/damage';
import type { DeathEvent } from '../../sim/events';
import type { SequenceDesc } from './animator';
import {
  inCond,
  LightProbe,
  num,
  stateOrigin,
  str,
  TEAM_GLOW,
  type EntityState,
  type RenderContext,
} from './common';
import type { EffectSystem } from './effects';
import {
  heldModelName,
  ItemInstance,
  PlayerOutfit,
  weaponLook,
  type WeaponLook,
} from './loadout-models';
import type { ModelAsset } from './model-asset';
import { ModelInstance } from './model-instance';
import { angleNormalize, TFPlayerAnimState, type PlayerAnimInput } from './player-anim-state';

/** Seconds a corpse stays, then fades over CORPSE_FADE (tf_ragdoll / cl_ragdoll_fade_time). */
export const CORPSE_TIME = 10;
export const CORPSE_FADE = 1;
/** Cloak fade in/out (tf_spy_invis_time, tf_spy_invis_unstealth_time). */
export const CLOAK_IN_TIME = 1;
export const CLOAK_OUT_TIME = 2;

/** Base activity fallbacks when a model lacks the translated one and the base. */
const ACT_FALLBACK: Record<string, string> = {
  ACT_MP_DEPLOYED: 'ACT_MP_RUN',
  ACT_MP_DEPLOYED_IDLE: 'ACT_MP_STAND_IDLE',
  ACT_MP_CROUCH_DEPLOYED: 'ACT_MP_CROUCHWALK',
  ACT_MP_CROUCH_DEPLOYED_IDLE: 'ACT_MP_CROUCH_IDLE',
  ACT_MP_SWIM_DEPLOYED: 'ACT_MP_SWIM',
  ACT_MP_JUMP_START: 'ACT_MP_AIRWALK',
  ACT_MP_JUMP_FLOAT: 'ACT_MP_AIRWALK',
  ACT_MP_JUMP: 'ACT_MP_AIRWALK',
  ACT_MP_DOUBLEJUMP_CROUCH: 'ACT_MP_CROUCHWALK',
  ACT_MP_FALLING_STOMP: 'ACT_MP_AIRWALK',
  ACT_MP_SWIM: 'ACT_MP_STAND_IDLE',
  ACT_MP_AIRWALK: 'ACT_MP_STAND_IDLE',
  ACT_MP_CROUCHWALK: 'ACT_MP_CROUCH_IDLE',
  ACT_MP_CROUCH_IDLE: 'ACT_MP_STAND_IDLE',
  ACT_MP_RUN: 'ACT_MP_STAND_IDLE',
};

const WEAPON_ROLE_FALLBACK = ['PRIMARY', 'SECONDARY', 'MELEE'];
/** Max barrel spin (rad/s) and its approach per 1/60 s (tf_weapon_minigun.cpp). */
const MINIGUN_SPIN = 20;
const MINIGUN_ACCEL = 0.1 * 60;

export const classShortName = (cls: number): string => {
  const m = CLASS_DATA[cls]?.model ?? '';
  return /models\/player\/(\w+)\.mdl/.exec(m)?.[1] ?? 'scout';
};

/** The stock weapon a class shows for a slot (disguises: the target's loadout). */
function classWeapon(
  cls: number,
  slot: 'primary' | 'secondary' | 'melee',
): StockWeapon | undefined {
  const def = CLASS_DATA[cls]?.defaultLoadout[slot];
  return def !== undefined ? STOCK_WEAPONS[def] : undefined;
}

interface Corpse {
  inst: ModelInstance;
  weapon: ModelInstance | null;
  age: number;
  /** Ragdoll-lite: settle the body to the floor when there is no death sequence. */
  fall: number;
  origin: { x: number; y: number; z: number };
  yaw: number;
}

const tmpV = new Vector3();
const tmpQ = new Quaternion();
const Z_AXIS = new Vector3(0, 0, 1);

export class PlayerRenderable {
  private inst: ModelInstance | null = null;
  private weapon: ModelInstance | null = null;
  private weaponModel = '';
  private weaponItem: ItemInstance | null = null;
  private readonly outfit: PlayerOutfit;
  private itemsField = '';
  private items: ReplicatedItems | null = null;
  private model = '';
  private readonly anim = new TFPlayerAnimState();
  private readonly probe = new LightProbe();
  private lastEventSeq = -1;
  private lastLife = -1;
  private invis = 0;
  private barrelAngle = 0;
  private barrelSpeed = 0;
  private readonly corpses: Corpse[] = [];
  private pendingDeath: DeathEvent | null = null;
  private readonly origin = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private visible = false;
  private burnKey = '';
  /** Called for footstep events (sound hook). */
  onFootstep: ((player: number, side: string) => void) | null = null;

  constructor(
    readonly id: number,
    private readonly effects: EffectSystem | null,
  ) {
    this.outfit = new PlayerOutfit(id, effects);
  }

  /** The player's replicated items (NET_PLAYER `items`), decoded once per change. */
  private replicatedItems(s: EntityState): ReplicatedItems {
    const field = str(s.fields, 'items');
    if (field !== this.itemsField || !this.items) {
      this.itemsField = field;
      this.items = decodeItems(field);
    }
    return this.items;
  }

  /** The model the viewer sees: the disguise to enemies, else the real class. */
  private appearance(s: EntityState, ctx: RenderContext) {
    const f = s.fields;
    const realCls = num(f, 'cls');
    const team = num(f, 'team');
    const disguised = inCond(f, TF_COND.DISGUISED) && num(f, 'disguiseClass') > 0;
    const enemyView = ctx.localTeam !== team;
    if (disguised && enemyView) {
      const cls = num(f, 'disguiseClass');
      const dteam = num(f, 'disguiseTeam') || team;
      // The disguise holds the target's weapon of the slot the spy has out (SDK GetDisguiseWeapon).
      const slot = (['primary', 'secondary', 'melee'] as const)[
        Math.max(0, Math.min(2, num(f, 'activeSlot')))
      ];
      const stock = classWeapon(cls, slot) ?? classWeapon(cls, 'primary');
      return {
        cls,
        team: dteam,
        weapon: stock ? weaponLook(stock.defindex, cls) : undefined,
        held: undefined as PublicItem | undefined,
        // The disguise wears the target class's stock look.
        items: null as ReplicatedItems | null,
        tint: false,
      };
    }
    const def = num(f, 'activeWeapon', -1);
    const items = this.replicatedItems(s);
    return {
      cls: realCls,
      team,
      weapon: weaponLook(def, realCls),
      held: items.weapons.find((w) => w.item === def && !w.worn),
      items,
      tint: disguised,
    };
  }

  update(s: EntityState, ctx: RenderContext): void {
    const f = s.fields;
    const life = num(f, 'lifeState');
    stateOrigin(s, this.origin);
    const look = this.appearance(s, ctx);
    const model = CLASS_DATA[look.cls]?.model ?? '';
    // Death: hand the current body over to a corpse.
    if (this.lastLife === LIFE_ALIVE && life !== LIFE_ALIVE) this.die(ctx);
    if (life === LIFE_ALIVE && this.lastLife !== LIFE_ALIVE) {
      this.anim.reset(num(f, 'eyeYaw'));
      this.invis = inCond(f, TF_COND.STEALTHED) ? 1 : 0;
    }
    this.lastLife = life;
    this.updateCorpses(ctx);
    const alive = life === LIFE_ALIVE;
    const hidden =
      !alive || (ctx.firstPerson && ctx.localPlayer === this.id) || num(f, 'effects') & 0x20; // EF_NODRAW
    if (!model) return this.hide();
    if (model !== this.model || !this.inst) {
      const asset = ctx.models.peek(model);
      if (asset === undefined) return this.hide();
      if (!asset) return this.hide();
      this.replaceBody(asset, ctx);
      this.model = model;
    }
    const inst = this.inst!;
    if (hidden) {
      this.hide();
      this.stopBurning();
      return;
    }
    this.visible = true;
    if (!inst.root.parent) ctx.scene.add(inst.root);
    inst.root.visible = true;
    this.updateWeapon(look.weapon, look.held, look.cls, look.team, ctx);
    if (ctx.loadout)
      inst.setBodygroups(this.outfit.update(inst, look.items, look.cls, look.team, ctx));
    // Skin: team, + 2 while invulnerable (SDK C_TFPlayer::GetSkin).
    const uber = inCond(f, TF_COND.INVULNERABLE) || inCond(f, TF_COND.INVULNERABLE_WEARINGOFF);
    const flicker =
      inCond(f, TF_COND.INVULNERABLE_WEARINGOFF) && Math.floor(ctx.time * 10) % 2 === 0;
    const teamSkin = look.team === TF_TEAM_BLUE ? 1 : 0;
    inst.setSkin(teamSkin + (uber && !flicker ? 2 : 0));
    // Cloak fade (SDK CTFPlayerShared::InvisibilityThink).
    const stealthed = inCond(f, TF_COND.STEALTHED) || inCond(f, TF_COND.STEALTHED_BLINK);
    const target = inCond(f, TF_COND.STEALTHED_BLINK) ? 0.4 : stealthed ? 1 : 0;
    if (this.invis < target) this.invis = Math.min(target, this.invis + ctx.dt / CLOAK_IN_TIME);
    else this.invis = Math.max(target, this.invis - ctx.dt / CLOAK_OUT_TIME);
    const u = inst.uniforms;
    u.uCloak.value = this.invis;
    inst.root.visible = this.invis < 0.999;
    this.outfit.setVisible(this.invis < 0.5);
    // Disguise-kit tint for the spy's own side; crit glow; burning darken.
    const tint = u.uTint.value as Vector3;
    tint.set(1, 1, 1);
    if (look.tint) tint.set(0.8, 0.8, 0.85);
    const glow = u.uGlow.value as Vector3;
    const crit =
      inCond(f, TF_COND.CRITBOOSTED) ||
      inCond(f, TF_COND.CRITBOOSTED_FIRST_BLOOD) ||
      inCond(f, TF_COND.CRITBOOSTED_ON_KILL);
    glow.set(0, 0, 0);
    if (crit)
      glow
        .copy(TEAM_GLOW[look.team] ?? TEAM_GLOW[TF_TEAM_RED])
        .multiplyScalar(0.6 + 0.2 * Math.sin(ctx.time * 8));
    this.probe.update(ctx, u, this.origin, 40);
    // Animation.
    this.animate(s, ctx, look.weapon);
    // Burning particles follow the body.
    if (inCond(f, TF_COND.BURNING)) this.startBurning(look.team);
    else this.stopBurning();
  }

  private replaceBody(asset: ModelAsset, ctx: RenderContext): void {
    this.inst?.dispose();
    this.weapon = null;
    this.weaponItem = null;
    this.weaponModel = '';
    this.inst = new ModelInstance(asset, { fog: ctx.lighting?.shared });
    if (this.inst.animator) {
      this.inst.animator.onEvent = (ev) => {
        if (ev.event === 7001) this.onFootstep?.(this.id, ev.options ?? '');
      };
    }
    this.lastEventSeq = -1;
  }

  /**
   * The held weapon: an unlock's loadout-channel model when published (the class's stock
   * weapon of the slot from the game channel meanwhile, or when there is none), else the stock
   * weapon's c_model.
   */
  private updateWeapon(
    look: WeaponLook | undefined,
    entry: PublicItem | undefined,
    cls: number,
    team: number,
    ctx: RenderContext,
  ): void {
    const inst = this.inst!;
    const name = heldModelName(ctx.loadout, look, cls, entry);
    const part = name ? ctx.loadout!.peek(name) : null;
    if (part) {
      const key = `loadout:${name}`;
      if (key !== this.weaponModel) {
        this.dropWeapon();
        const item = new ItemInstance(part, inst.uniforms);
        if (item.attachTo(inst)) {
          this.weaponItem = item;
          this.weapon = item.inst;
        } else item.dispose();
        this.weaponModel = key;
      }
      this.weaponItem?.dress({ cls: tfClassOf(cls), festive: entry?.festive, entry });
      return;
    }
    const model = look?.stock?.worldModel ?? '';
    const key = model ? `game:${model}` : '';
    if (key !== this.weaponModel) {
      const asset = model ? ctx.models.peek(model) : null;
      if (asset === undefined) return; // loading: keep the old one
      this.dropWeapon();
      this.weaponModel = key;
      if (asset) {
        this.weapon = new ModelInstance(asset, { uniforms: inst.uniforms, noAnim: true });
        inst.attach(this.weapon);
      }
    }
    this.weapon?.setSkin(team === TF_TEAM_BLUE ? 1 : 0);
  }

  private dropWeapon(): void {
    this.weaponItem?.dispose();
    if (!this.weaponItem) this.weapon?.dispose();
    this.weaponItem = null;
    this.weapon = null;
  }

  private animate(s: EntityState, ctx: RenderContext, weapon: WeaponLook | undefined): void {
    const inst = this.inst!;
    const animator = inst.animator;
    const f = s.fields;
    const set = animator?.set;
    const role = weapon?.role ?? 'PRIMARY';
    const suffix = playerAnimSuffix(role);
    const isMinigun = !!weapon?.isMinigun;
    const flags = num(f, 'flags');
    const onGround = !!f.onGround;
    const waterLevel =
      f.mv_waterLevel !== undefined
        ? num(f, 'mv_waterLevel')
        : flags & FL_INWATER
          ? onGround
            ? 1
            : 2
          : 0;
    const inp: PlayerAnimInput = {
      time: ctx.time,
      dt: ctx.dt,
      vx: num(f, 'vx'),
      vy: num(f, 'vy'),
      vz: num(f, 'vz'),
      onGround,
      ducked: !!f.ducked,
      waterLevel,
      eyeYaw: num(f, 'eyeYaw', num(f, 'yaw')),
      eyePitch: num(f, 'eyePitch', num(f, 'pitch')),
      inCond: (c) => inCond(f, c),
      suffix: set && !set.hasActivity(`ACT_MP_STAND_${suffix}`) ? this.fallbackSuffix(set) : suffix,
      isMinigun,
      isSniperRifle: !!weapon?.isSniperRifle,
      hasActivity: (a) => !!set?.hasActivity(a),
    };
    // Gesture events (PlayerAnimEvent_t + a change counter).
    const evSeq = num(f, 'animEventSeq', -1);
    if (this.lastEventSeq >= 0 && evSeq !== this.lastEventSeq)
      this.anim.doAnimationEvent(num(f, 'animEvent'), inp);
    this.lastEventSeq = evSeq;
    const entityYaw = num(f, 'yaw', inp.eyeYaw);
    let renderYaw = inp.eyeYaw;
    if (animator && set) {
      const mainSeq = (x: number, y: number) => {
        const m = animator.main?.seq;
        if (!m) return 0;
        const px = animator.getPoseParam('move_x');
        const py = animator.getPoseParam('move_y');
        animator.setPoseParam('move_x', x);
        animator.setPoseParam('move_y', y);
        const v = animator.groundSpeed(m);
        animator.setPoseParam('move_x', px);
        animator.setPoseParam('move_y', py);
        return v;
      };
      renderYaw = this.anim.update(inp, entityYaw, mainSeq);
      const act = this.pickActivity(this.anim.translatedMain, this.anim.mainActivity, inp);
      if (act) animator.setActivity(act);
      if (this.anim.restartMain) {
        animator.restartMain();
        this.anim.restartMain = false;
      }
      for (const g of this.anim.gestures) {
        if (g.ifNotPlaying && animator.isGesturePlaying(g.slot, g.activity)) continue;
        const seq = set.selectWeightedSequence(g.activity);
        if (seq) animator.restartGesture(g.slot, seq, g.activity, g.autoKill);
      }
      this.anim.gestures.length = 0;
      animator.setPoseParam('move_x', this.anim.moveX);
      animator.setPoseParam('move_y', this.anim.moveY);
      animator.setPoseParam('body_yaw', this.anim.bodyYaw);
      animator.setPoseParam('body_pitch', this.anim.bodyPitch);
    }
    this.yaw = renderYaw;
    inst.place(this.origin, { x: 0, y: renderYaw, z: 0 });
    inst.animate(ctx.dt);
    inst.applyPose();
    this.spinBarrel(isMinigun && inCond(f, TF_COND.AIMING), ctx.dt);
    inst.updateMatrices();
  }

  private fallbackSuffix(set: NonNullable<ModelInstance['animator']>['set']): string {
    for (const r of WEAPON_ROLE_FALLBACK) if (set.hasActivity(`ACT_MP_STAND_${r}`)) return r;
    return '';
  }

  private pickActivity(translated: string, base: string, inp: PlayerAnimInput): string | null {
    const has = inp.hasActivity;
    if (has(translated)) return translated;
    if (has(base)) return base;
    let b = base;
    for (let i = 0; i < 4; i++) {
      const next = ACT_FALLBACK[b];
      if (!next) break;
      b = next;
      const t = this.anim.translate(b, inp);
      if (has(t)) return t;
    }
    return null;
  }

  /** Minigun barrel (CTFMinigun::UpdateBarrelMovement + StandardBlendingRules). */
  private spinBarrel(spinning: boolean, dt: number): void {
    const target = spinning ? MINIGUN_SPIN : 0;
    if (this.barrelSpeed < target)
      this.barrelSpeed = Math.min(target, this.barrelSpeed + MINIGUN_ACCEL * dt);
    else this.barrelSpeed = Math.max(target, this.barrelSpeed - MINIGUN_ACCEL * dt);
    this.barrelAngle += this.barrelSpeed * dt;
    const barrel = this.weapon?.bone('barrel');
    if (barrel && this.weapon !== null && barrel !== this.inst?.bone('barrel')) {
      barrel.quaternion.setFromAxisAngle(Z_AXIS, this.barrelAngle);
    } else if (barrel) barrel.quaternion.setFromAxisAngle(Z_AXIS, this.barrelAngle);
  }

  private startBurning(team: number): void {
    const key = `burn:${this.id}`;
    if (this.burnKey === key || !this.effects) return;
    this.burnKey = key;
    this.effects.loop(key, team === TF_TEAM_BLUE ? 'burningplayer_blue' : 'burningplayer_red', {
      entity: this.id,
    });
  }

  private stopBurning(): void {
    if (!this.burnKey) return;
    this.effects?.stop(this.burnKey);
    this.burnKey = '';
  }

  private hide(): void {
    if (this.inst) this.inst.root.visible = false;
    this.visible = false;
    this.outfit.setVisible(false);
  }

  // ─── death ────────────────────────────────────────────────────────────────

  /** The kill notice for this player (from the event stream). */
  onDeath(ev: DeathEvent, ctx: RenderContext): void {
    this.pendingDeath = ev;
    const c = this.corpses[this.corpses.length - 1];
    if (c && c.age < 0.5) this.applyDeath(c, ev, ctx);
  }

  private die(ctx: RenderContext): void {
    this.stopBurning();
    const inst = this.inst;
    if (!inst || !this.visible) return;
    const corpse: Corpse = {
      inst,
      weapon: this.weapon,
      age: 0,
      fall: 0,
      origin: { ...this.origin },
      yaw: this.yaw,
    };
    this.corpses.push(corpse);
    // The live body is rebuilt on respawn (its items stay on the corpse).
    this.outfit.setVisible(false);
    this.inst = null;
    this.weapon = null;
    this.weaponItem = null;
    this.model = '';
    this.weaponModel = '';
    const a = inst.animator;
    if (a) {
      for (let i = 0; i < a.gestures.length; i++) a.gestures[i] = null;
      a.setPoseParam('body_yaw', 0);
    }
    this.applyDeath(corpse, this.pendingDeath, ctx);
    this.pendingDeath = null;
    while (this.corpses.length > 2) this.removeCorpse(0);
  }

  private applyDeath(c: Corpse, ev: DeathEvent | null, ctx: RenderContext): void {
    if (ev?.gib && this.effects) {
      this.effects.gibs(classShortName(ev.victimClass || 1), c.origin, ev, ctx);
      c.inst.root.visible = false;
      c.age = CORPSE_TIME;
      return;
    }
    const a = c.inst.animator;
    if (!a) return;
    const want =
      ev?.customKill === TF_DMG_CUSTOM_HEADSHOT
        ? 'headshot'
        : ev?.customKill === TF_DMG_CUSTOM_BACKSTAB
          ? 'backstab'
          : ev?.customKill === TF_DMG_CUSTOM_BURNING || ev?.burning
            ? 'burning'
            : 'headshot';
    const seq = findDeathSequence([...a.set.sequences.values()], want);
    if (seq) a.setSequence(seq, { restart: true });
    if (ev?.burning) this.effects?.oneShot('burningplayer_corpse', { pos: c.origin });
  }

  private updateCorpses(ctx: RenderContext): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.age += ctx.dt;
      if (c.age >= CORPSE_TIME + CORPSE_FADE) {
        this.removeCorpse(i);
        continue;
      }
      const inst = c.inst;
      if (!inst.root.parent) ctx.scene.add(inst.root);
      inst.uniforms.uAlpha.value =
        c.age > CORPSE_TIME ? 1 - (c.age - CORPSE_TIME) / CORPSE_FADE : 1;
      if (inst.animator?.main?.seq && /death/i.test(inst.animator.main.seq.name)) {
        inst.place(c.origin, { x: 0, y: c.yaw, z: 0 });
      } else {
        // Ragdoll-lite: no death sequence — tip over and settle (gravity on a hinge at the feet).
        c.fall = Math.min(1, c.fall + ctx.dt * (0.6 + c.fall * 3));
        inst.place(c.origin, { x: 0, y: c.yaw, z: 0 });
        tmpV.set(0, 0, 0);
        tmpQ.setFromAxisAngle(tmpV.set(1, 0, 0), (-Math.PI / 2) * c.fall * c.fall);
        inst.root.matrix.multiply(new Matrix4().makeRotationFromQuaternion(tmpQ));
      }
      if (c.age < 4) {
        inst.animate(ctx.dt);
        inst.applyPose();
      }
      inst.updateMatrices();
      this.probe.update(ctx, inst.uniforms, c.origin, 16);
    }
  }

  private removeCorpse(i: number): void {
    const c = this.corpses[i];
    c.inst.dispose();
    this.corpses.splice(i, 1);
  }

  // ─── queries ──────────────────────────────────────────────────────────────

  /** An attachment of the live body (or its weapon), three world space. */
  attachment(name: string, out: Matrix4): boolean {
    if (!this.inst || !this.visible) return false;
    return this.inst.attachmentMatrix(name, out);
  }

  get instance(): ModelInstance | null {
    return this.inst;
  }

  get weaponInstance(): ModelInstance | null {
    return this.weapon;
  }

  get renderYaw(): number {
    return angleNormalize(this.yaw);
  }

  dispose(): void {
    this.stopBurning();
    this.outfit.dispose();
    this.inst?.dispose();
    this.inst = null;
    while (this.corpses.length) this.removeCorpse(0);
  }
}

/** A class's death sequence for a kill kind (headshot / backstab / burning), else any. */
export function findDeathSequence(
  seqs: readonly SequenceDesc[],
  kind: string,
): SequenceDesc | null {
  const deaths = seqs.filter((s) => /death/i.test(s.name));
  return deaths.find((s) => s.name.toLowerCase().includes(kind)) ?? deaths[0] ?? null;
}
