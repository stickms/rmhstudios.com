/**
 * TF2 players in third person: the class body animated by TFPlayerAnimState
 * (player-anim-state.ts) from the networked player record, the held weapon's c_model
 * bone-merged, team / über skins, the cloak (fade + dissolve, no refraction), disguises
 * (enemies see the disguise class/team/weapon; the spy and his team see him with a
 * disguise-kit tint), the loadout's items (loadout-models.ts: an unlock weapon's own model,
 * cosmetics with paint, styles, body groups and unusual effects), crit glow, burning (particles), and death (gibs on
 * explosive deaths, else the kill's death animation where TF2 has one and then a ragdoll: corpse.ts). The flag a player carries is drawn by the
 * flag renderable at this player's `flag` attachment (`attachment()`).
 */
import { Matrix4, Vector3 } from 'three';
import { CLASS_DATA } from '../../data/classes';
import { playerAnimSuffix, STOCK_WEAPONS, type StockWeapon } from '../../data/weapons';
import {
  decodeItems,
  tfClassOf,
  type PublicItem,
  type ReplicatedItems,
} from '../../sim/items/loadout';
import { FL_INWATER, TF_CLASS_DEMOMAN, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { TF_COND } from '../../sim/conditions';
import { LIFE_ALIVE } from '../../sim/entity';
import {
  DMG_BURN,
  TF_DMG_CUSTOM_BACKSTAB,
  TF_DMG_CUSTOM_BURNING,
  TF_DMG_CUSTOM_BURNING_ARROW,
  TF_DMG_CUSTOM_BURNING_FLARE,
  TF_DMG_CUSTOM_DECAPITATION,
  TF_DMG_CUSTOM_HEADSHOT,
  TF_DMG_CUSTOM_HEADSHOT_DECAPITATION,
} from '../../sim/damage';
import { TF_DEATH_FEIGN_DEATH, type DeathEvent, type EffectEvent } from '../../sim/events';
import { Corpse } from './corpse';
import {
  inCond,
  LightProbe,
  modelLod,
  num,
  stateOrigin,
  str,
  TEAM_GLOW,
  type EntityState,
  type RenderContext,
} from './common';
import type { EffectSystem } from './effects';
import { killstreakerSystem, sheenColor } from '@/lib/tf2-loadout/killstreak';
import {
  heldModelName,
  ItemInstance,
  PlayerOutfit,
  setSheenUniforms,
  WEAPON_ATTACHMENT,
  weaponEffect,
  weaponLook,
  type WeaponLook,
} from './loadout-models';
import { paintUniforms } from './model-material';
import type { ModelAsset } from './model-asset';
import { ModelInstance } from './model-instance';
import { angleNormalize, TFPlayerAnimState, type PlayerAnimInput } from './player-anim-state';

/** Seconds a body lies, then fades over CORPSE_FADE (cl_ragdoll_fade_time; sooner when the player respawns). */
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

interface CorpseEntry {
  corpse: Corpse;
  /** Its death (animation or not) was chosen from the kill notice. */
  decided: boolean;
  /** The player was on the ground when they died (death animations play only there). */
  onGround: boolean;
}

/** Bodies kept per player (the oldest goes first). */
const MAX_CORPSES = 2;

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
  private readonly corpses: CorpseEntry[] = [];
  private pendingDeath: DeathEvent | null = null;
  private pendingPush: {
    force: { x: number; y: number; z: number };
    at: { x: number; y: number; z: number } | null;
  } | null = null;
  /** The live player's velocity and footing (what their body inherits). */
  private readonly velocity = { x: 0, y: 0, z: 0 };
  private onGround = true;
  private readonly origin = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private visible = false;
  private burnKey = '';
  /** The held weapon's unusual effect (`effects` loop key and system). */
  private weaponFxKey = '';
  /** Killstreaker eye effects running (loop keys). */
  private eyeFx: string[] = [];
  private eyeFxSystem = '';
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
      // Respawned: their old body goes at once, so nobody takes it for them.
      if (this.lastLife >= 0) for (const c of this.corpses) c.corpse.fadeSoon();
    }
    if (life === LIFE_ALIVE) {
      this.velocity.x = num(f, 'vx');
      this.velocity.y = num(f, 'vy');
      this.velocity.z = num(f, 'vz');
      this.onGround = !!f.onGround;
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
      this.stopItemEffects();
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
    // Animation, then what follows the pose: jiggle bones, the weapon's and the eyes' effects.
    this.animate(s, ctx, look.weapon);
    if (ctx.loadout) this.outfit.afterPose(ctx);
    this.updateItemEffects(look.held, look.team, look.cls, this.invis < 0.5, ctx);
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
      this.weaponItem?.dress({ cls: tfClassOf(cls), festive: entry?.festive, entry, team });
      this.weaponItem?.setSheen(entry?.sheen, team, ctx.time);
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
        // Its own uniform set over the wearer's (lit with them), so a sheen stays on the weapon.
        this.weapon = new ModelInstance(asset, {
          uniforms: paintUniforms(inst.uniforms),
          noAnim: true,
        });
        inst.attach(this.weapon);
      }
    }
    this.weapon?.setSkin(team === TF_TEAM_BLUE ? 1 : 0);
    if (this.weapon) setSheenUniforms(this.weapon.uniforms, entry?.sheen, team, ctx.time);
  }

  /**
   * The held weapon's unusual effect (its control points on the weapon's `unusual_<n>`
   * attachments) and, during a streak of five kills or more, the weapon's killstreaker at the eyes
   * in the sheen's colour (C_TFPlayer killstreak effects). Third person only: the view model draws
   * its own weapon effect.
   */
  private updateItemEffects(
    held: PublicItem | undefined,
    team: number,
    cls: number,
    shown: boolean,
    ctx: RenderContext,
  ): void {
    const fx = this.effects;
    if (!fx) return;
    const system = shown ? weaponEffect(held) : undefined;
    const onWeapon = !!system && !!this.weapon?.asset.attachments.has('unusual_0');
    const key = onWeapon ? `wfx:${this.id}:${system}` : '';
    if (key !== this.weaponFxKey) {
      if (this.weaponFxKey) fx.stop(this.weaponFxKey);
      this.weaponFxKey = key;
    }
    if (key && system) fx.loop(key, system, { entity: this.id, schemaPrefix: WEAPON_ATTACHMENT });
    const eyes = shown
      ? killstreakerSystem(held?.streaker, ctx.killStreak?.(this.id) ?? 0)
      : undefined;
    if (eyes !== this.eyeFxSystem) {
      for (const k of this.eyeFx) fx.stop(k);
      this.eyeFx = [];
      this.eyeFxSystem = eyes ?? '';
    }
    if (!eyes || !this.inst) return;
    const c = sheenColor(held?.sheen, team) ?? sheenColor(1, team)!;
    const colour = { x: c[0], y: c[1], z: c[2] };
    // The Demoman has one eye (the other is under his patch).
    const sides = cls === TF_CLASS_DEMOMAN ? ['eyeglow_r'] : ['eyeglow_r', 'eyeglow_l'];
    const keys: string[] = [];
    for (const side of sides) {
      if (!this.inst.asset.attachments.has(side)) continue;
      const k = `ks:${this.id}:${side}`;
      keys.push(k);
      fx.loop(k, eyes, { entity: this.id, attachment: side, cps: { 9: colour } });
    }
    this.eyeFx = keys;
  }

  private stopItemEffects(): void {
    if (this.weaponFxKey) this.effects?.stop(this.weaponFxKey);
    this.weaponFxKey = '';
    for (const k of this.eyeFx) this.effects?.stop(k);
    this.eyeFx = [];
    this.eyeFxSystem = '';
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
    if (animator) animator.lod = modelLod(ctx, this.origin);
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
    // The Dead Ringer: a body drops while the Spy lives on, cloaked.
    if (ev.deathFlags & TF_DEATH_FEIGN_DEATH) {
      this.feignBody(ev, ctx);
      return;
    }
    this.pendingDeath = ev;
    const c = this.corpses[this.corpses.length - 1];
    if (c && c.corpse.age < 0.25 && !c.decided) this.applyDeath(c, ev, ctx);
  }

  /** The sim's ragdoll push for this player's body (or the feigned one). */
  onRagdoll(ev: EffectEvent): void {
    if (!ev.force) return;
    const push = {
      force: {
        x: ev.force.x - this.velocity.x,
        y: ev.force.y - this.velocity.y,
        z: ev.force.z - this.velocity.z,
      },
      at: ev.start ?? null,
    };
    const c = this.corpses[this.corpses.length - 1];
    if (c && c.corpse.age < 0.5) c.corpse.setPush(push.force, push.at);
    else this.pendingPush = push;
  }

  private die(ctx: RenderContext): void {
    this.stopBurning();
    this.stopItemEffects();
    const inst = this.inst;
    if (!inst || !this.visible) return;
    // TF2 drops the weapon (the ammo pack shows it); the body keeps its cosmetics hidden with it.
    this.dropWeapon();
    const corpse = new Corpse(inst, {
      origin: { ...this.origin },
      yaw: this.yaw,
      velocity: { ...this.velocity },
      lifetime: CORPSE_TIME,
      fade: CORPSE_FADE,
    });
    const entry: CorpseEntry = { corpse, decided: false, onGround: this.onGround };
    this.corpses.push(entry);
    // The live body is rebuilt on respawn.
    this.outfit.setVisible(false);
    this.inst = null;
    this.model = '';
    this.weaponModel = '';
    const a = inst.animator;
    if (a) {
      // Gestures blend out under the death sequence; the body animates at full detail.
      a.clearGestures(true);
      a.lod = 0;
      a.setPoseParam('body_yaw', 0);
    }
    if (this.pendingDeath) this.applyDeath(entry, this.pendingDeath, ctx);
    this.pendingDeath = null;
    if (this.pendingPush) corpse.setPush(this.pendingPush.force, this.pendingPush.at);
    this.pendingPush = null;
    while (this.corpses.length > MAX_CORPSES) this.removeCorpse(0);
  }

  /**
   * The death the kill calls for (C_TFRagdoll): gibs for an explosive crit; the class's death
   * animation for a headshot / decapitation, a backstab or a burning death when the player died on
   * the ground (CTFPlayerShared::GetSequenceForDeath), physics when it ends; anything else is a
   * ragdoll at once. A decapitated body loses its head.
   */
  private applyDeath(entry: CorpseEntry, ev: DeathEvent, ctx: RenderContext): void {
    entry.decided = true;
    const c = entry.corpse;
    if (ev.gib && this.effects) {
      this.effects.gibs(classShortName(ev.victimClass || 1), this.corpseOrigin(c), ev, ctx);
      c.inst.root.visible = false;
      c.age = CORPSE_TIME + CORPSE_FADE;
      return;
    }
    const a = c.inst.animator;
    const name = tf2DeathSequence(ev, entry.onGround);
    const seq = a && name ? a.set.seq(name) : null;
    if (seq) c.playDeath(seq);
    if (isDecapitation(ev.customKill)) c.inst.bone('bip_head')?.scale.setScalar(0.001);
    if (ev.burning || ev.customKill === TF_DMG_CUSTOM_BURNING)
      this.effects?.oneShot('burningplayer_corpse', { pos: this.corpseOrigin(c) });
  }

  private corpseOrigin(c: Corpse): { x: number; y: number; z: number } {
    return c.ragdoll ? c.ragdoll.centre({ x: 0, y: 0, z: 0 }) : { ...this.origin };
  }

  /** A Dead Ringer body: a copy of the Spy's pose that ragdolls (he stays, cloaked). */
  private feignBody(ev: DeathEvent, ctx: RenderContext): void {
    const live = this.inst;
    if (!live || !this.visible) return;
    const copy = new ModelInstance(live.asset, { fog: ctx.lighting?.shared });
    copy.pos.set(live.pos);
    copy.quat.set(live.quat);
    copy.setSkin(live.skin);
    copy.applyPose();
    copy.root.matrix.copy(live.root.matrix);
    copy.updateMatrices();
    const corpse = new Corpse(copy, {
      origin: { ...this.origin },
      yaw: this.yaw,
      velocity: { ...this.velocity },
      lifetime: CORPSE_TIME,
      fade: CORPSE_FADE,
    });
    const entry: CorpseEntry = { corpse, decided: false, onGround: this.onGround };
    this.corpses.push(entry);
    this.applyDeath(entry, { ...ev, gib: false }, ctx);
    while (this.corpses.length > MAX_CORPSES) this.removeCorpse(0);
  }

  private updateCorpses(ctx: RenderContext): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      if (!this.corpses[i].corpse.update(ctx, this.probe)) this.removeCorpse(i);
    }
  }

  private removeCorpse(i: number): void {
    this.corpses[i].corpse.dispose();
    this.corpses.splice(i, 1);
  }

  // ─── queries ──────────────────────────────────────────────────────────────

  /** An attachment of the live body (or its weapon), three world space. */
  attachment(name: string, out: Matrix4): boolean {
    if (!this.inst || !this.visible) return false;
    if (name.startsWith(WEAPON_ATTACHMENT))
      return !!this.weapon?.attachmentMatrix(name.slice(WEAPON_ATTACHMENT.length), out);
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
    this.stopItemEffects();
    this.outfit.dispose();
    this.inst?.dispose();
    this.inst = null;
    while (this.corpses.length) this.removeCorpse(0);
  }
}

/**
 * The class's death animation for a kill (CTFPlayerShared::GetSequenceForDeath), or null for a ragdoll at
 * once: `primary_death_headshot` for a headshot or a decapitation, `primary_death_backstab` for a
 * backstab, `primary_death_burning` for a death by fire; only on the ground.
 */
export function tf2DeathSequence(
  ev: Pick<DeathEvent, 'customKill' | 'damageType'> | null,
  onGround: boolean,
): string | null {
  if (!ev || !onGround) return null;
  switch (ev.customKill) {
    case TF_DMG_CUSTOM_HEADSHOT:
    case TF_DMG_CUSTOM_HEADSHOT_DECAPITATION:
    case TF_DMG_CUSTOM_DECAPITATION:
      return 'primary_death_headshot';
    case TF_DMG_CUSTOM_BACKSTAB:
      return 'primary_death_backstab';
    case TF_DMG_CUSTOM_BURNING:
    case TF_DMG_CUSTOM_BURNING_FLARE:
    case TF_DMG_CUSTOM_BURNING_ARROW:
      return 'primary_death_burning';
  }
  return ev.damageType & DMG_BURN ? 'primary_death_burning' : null;
}

const isDecapitation = (custom: number) =>
  custom === TF_DMG_CUSTOM_DECAPITATION || custom === TF_DMG_CUSTOM_HEADSHOT_DECAPITATION;
