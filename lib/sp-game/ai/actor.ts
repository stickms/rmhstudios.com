/**
 * Scripted actors: the NPCs of the Half-Life 2 train station and Portal's
 * GLaDOS stand-in (generic_actor). Not the SDK's AI — these maps drive their
 * characters almost entirely through scripted_sequence, logic_choreographed_scene,
 * aiscripted_schedule and the ai_goal_* entities, so an actor here is:
 *
 * - a solid human hull (HULL_HUMAN 13 × 13 × 72) for traces and a kinematic
 *   physics box, standing on the ground;
 * - an animation state the renderer plays (sequences by name or activity);
 * - straight-line walking / running to a point (path_corner chains, scripted
 *   moves, act-busy hints), stepping like an NPC (18-unit steps, gravity);
 * - turning to face a point or entity; idle actors look at a nearby player;
 * - npc_metropolice: shoves a player who crowds it, and fires OnCupCopped when
 *   a thrown physics object hits it (the "pick up that can" beat);
 * - OnPlayerUse for citizens.
 *
 * Damage kills (a ragdoll is the renderer's business): OnDeath.
 */

import { angleDiff, copy, normalize, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { emptyTrace } from '../../tf2-game/core/types';
import { MASK_NPCSOLID } from '../../tf2-game/core/constants';
import type { Entity } from '../../tf2-game/sim/entity';
import { COLLISION_GROUP_NPC, DAMAGE_YES, MOVETYPE_STEP, SOLID_BBOX } from '../../tf2-game/sim/entity';
import type { DamageInfo } from '../../tf2-game/sim/damage';
import { PHYS_GROUP, type PhysBody } from '../physics/physics-world';
import { registerSp, SpEntity, USE_TOGGLE } from '../entities/base';

/** CONTENTS_MONSTER. */
const CONTENTS_MONSTER = 0x2000000;

export const HULL_HUMAN_MINS = Object.freeze({ x: -13, y: -13, z: 0 });
export const HULL_HUMAN_MAXS = Object.freeze({ x: 13, y: 13, z: 72 });

/** Default models for classes the map leaves blank. */
const DEFAULT_MODELS: Record<string, string> = {
  npc_metropolice: 'models/police.mdl',
  npc_barney: 'models/barney.mdl',
  npc_breen: 'models/breen.mdl',
  npc_kleiner: 'models/kleiner.mdl',
  npc_vortigaunt: 'models/vortigaunt.mdl',
  npc_cscanner: 'models/combine_scanner.mdl',
  npc_strider: 'models/combine_strider.mdl',
  npc_pigeon: 'models/pigeon.mdl',
  npc_combine_camera: 'models/combine_camera/combine_camera.mdl',
  npc_citizen: 'models/humans/group01/male_01.mdl',
};

export interface MoveGoal {
  pos: Vec3;
  speed: number;
  /** Called on arrival (or failure: `ok` false). */
  done: ((ok: boolean) => void) | null;
  /** Face this yaw on arrival (NaN = keep). */
  yaw: number;
  activity: string;
}

export class SpActor extends SpEntity {
  phys: PhysBody | null = null;
  contents = CONTENTS_MONSTER;
  /** Playing a scripted_sequence / scene animation (idle behaviour off). */
  scripted = 0;
  goal: MoveGoal | null = null;
  /** Yaw we turn toward (NaN none). */
  idealYaw = NaN;
  faceTarget: Entity | null = null;
  yawSpeed = 180;
  dead = false;
  /** The last damage's push and where it landed (the ragdoll's, on death). */
  private lastBlow: { force: Vec3; at: Vec3 } | null = null;
  private stuckTicks = 0;
  private shoveAt = 0;
  private cupCopped = false;
  /** Squad / relationship strings set by inputs (kept for the HUD / debugging). */
  readonly responseContext = new Map<string, string>();
  /** Speaking until (scenes), for the renderer's mouth flex. */
  speakingUntil = 0;
  /** The player is inside our hull (spawned or scripted into it): we don't block each other until apart. */
  overlapsPlayer = false;

  passableToPlayer(): boolean {
    return this.overlapsPlayer;
  }

  private updatePlayerOverlap(): void {
    const p = this.sp.player;
    const o = this.origin;
    this.overlapsPlayer =
      o.x + this.mins.x < p.origin.x + p.maxs.x &&
      o.x + this.maxs.x > p.origin.x + p.mins.x &&
      o.y + this.mins.y < p.origin.y + p.maxs.y &&
      o.y + this.maxs.y > p.origin.y + p.mins.y &&
      o.z + this.mins.z < p.origin.z + p.maxs.z &&
      o.z + this.maxs.z > p.origin.z + p.mins.z;
  }

  override spawn(): void {
    if (!this.model) this.model = this.kvString('model') || DEFAULT_MODELS[this.classname] || '';
    super.spawn();
    this.solid = SOLID_BBOX;
    this.moveType = MOVETYPE_STEP;
    this.collisionGroup = COLLISION_GROUP_NPC;
    copy(this.mins, HULL_HUMAN_MINS);
    copy(this.maxs, HULL_HUMAN_MAXS);
    if (this.classname === 'npc_cscanner' || this.classname === 'npc_pigeon') {
      this.mins.x = this.mins.y = -8;
      this.maxs.x = this.maxs.y = 8;
      this.maxs.z = 16;
    }
    if (this.classname === 'npc_strider') {
      this.mins.x = this.mins.y = -38;
      this.maxs.x = this.maxs.y = 38;
      this.maxs.z = 500;
    }
    this.health = this.kvNumber('health', 0) || 40;
    this.maxHealth = this.health;
    this.takeDamage = DAMAGE_YES;
    this.sp.collision.addBox(this);
    this.phys = this.sp.physics.createKinematicBox(this.id, this.mins, this.maxs, this.origin, PHYS_GROUP.NPC, PHYS_GROUP.PROP);
    this.playActivity('ACT_IDLE');
    if (this.spawnflags & 4) this.dropToFloor();
  }

  isNPC(): boolean {
    return true;
  }

  override isSolid(): boolean {
    return !this.dead && !this.removed && (this.effects & 0x20) === 0;
  }

  touchCandidate(): boolean {
    return !this.dead;
  }

  override eyePosition(out: Vec3): Vec3 {
    out.x = this.origin.x;
    out.y = this.origin.y;
    out.z = this.origin.z + this.maxs.z * 0.9;
    return out;
  }

  /** Plays the sequence for an activity (ACT_IDLE, ACT_WALK, ACT_RUN…), looping. */
  playActivity(act: string): void {
    const seq = this.findActivity(act);
    if (seq) {
      if (this.anim?.sequence !== seq.name) this.playSequence(seq.name, 1, true);
    } else if (!this.anim) this.anim = { sequence: act.toLowerCase().replace('act_', ''), startTime: this.world.curtime, rate: 1, loop: true, duration: 1 };
  }

  dropToFloor(): void {
    const tr = emptyTrace();
    const end = vec3(this.origin.x, this.origin.y, this.origin.z - 256);
    this.sp.collision.traceHull(this.origin, end, this.mins, this.maxs, MASK_NPCSOLID, (id) => id !== this.id, tr);
    if (!tr.startSolid && tr.fraction < 1) copy(this.origin, tr.endPos);
  }

  /** Walk (or run) to a point. */
  moveTo(pos: Vec3, run: boolean, done: ((ok: boolean) => void) | null = null, yaw = NaN): void {
    const act = run ? 'ACT_RUN' : 'ACT_WALK';
    const seq = this.findActivity(act);
    const speed = seq && seq.groundSpeed > 10 ? seq.groundSpeed : run ? 190 : 75;
    this.goal = { pos: { ...pos }, speed, done, yaw, activity: act };
    this.stuckTicks = 0;
  }

  /** Snap to a point (scripted teleports). */
  teleportTo(pos: Vec3, yaw = NaN): void {
    copy(this.origin, pos);
    if (!Number.isNaN(yaw)) this.angles.y = yaw;
    this.syncBody();
  }

  stopMoving(ok: boolean): void {
    const g = this.goal;
    this.goal = null;
    if (g && !Number.isNaN(g.yaw)) this.idealYaw = g.yaw;
    if (!this.scripted) this.playActivity('ACT_IDLE');
    g?.done?.(ok);
  }

  faceEntity(e: Entity | null): void {
    this.faceTarget = e;
  }

  simulate(): void {
    if (this.dead) return;
    this.updatePlayerOverlap();
    const dt = this.sp.tick;
    if (this.goal) this.walk(dt);
    // Turning.
    let yawTarget = this.idealYaw;
    if (this.faceTarget && !this.faceTarget.removed) {
      yawTarget = (Math.atan2(this.faceTarget.origin.y - this.origin.y, this.faceTarget.origin.x - this.origin.x) * 180) / Math.PI;
    } else if (!this.goal && !this.scripted && Number.isNaN(this.idealYaw)) {
      // Idle: look at a nearby player.
      const p = this.sp.player;
      const d = Math.hypot(p.origin.x - this.origin.x, p.origin.y - this.origin.y);
      if (d < 160 && !p.dead) yawTarget = (Math.atan2(p.origin.y - this.origin.y, p.origin.x - this.origin.x) * 180) / Math.PI;
    }
    if (!Number.isNaN(yawTarget)) {
      const diff = angleDiff(yawTarget, this.angles.y);
      const step = this.yawSpeed * dt;
      this.angles.y += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      if (Math.abs(diff) <= step && !this.faceTarget) this.idealYaw = NaN;
    }
    this.behave();
    this.syncBody();
  }

  /** Per-class behaviour hooks. */
  protected behave(): void {}

  private walk(dt: number): void {
    const g = this.goal!;
    const dx = g.pos.x - this.origin.x;
    const dy = g.pos.y - this.origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) {
      this.stopMoving(true);
      return;
    }
    this.playActivity(g.activity);
    this.idealYaw = (Math.atan2(dy, dx) * 180) / Math.PI;
    const step = Math.min(dist, g.speed * dt);
    const to = vec3(this.origin.x + (dx / dist) * step, this.origin.y + (dy / dist) * step, this.origin.z);
    if (!this.stepTo(to)) {
      if (++this.stuckTicks > 66) this.stopMoving(false);
    } else this.stuckTicks = 0;
  }

  /** NPC step move (SDK: CAI_MoveProbe ground move): up a step, across, down to the floor. */
  private stepTo(to: Vec3): boolean {
    const c = this.sp.collision;
    const tr = emptyTrace();
    const filter = (id: number): boolean => id !== this.id && !(id === this.sp.player.id && this.overlapsPlayer);
    const up = vec3(this.origin.x, this.origin.y, this.origin.z + 18);
    c.traceHull(this.origin, up, this.mins, this.maxs, MASK_NPCSOLID, filter, tr);
    const start = vec3(tr.endPos.x, tr.endPos.y, tr.endPos.z);
    const across = vec3(to.x, to.y, start.z);
    c.traceHull(start, across, this.mins, this.maxs, MASK_NPCSOLID, filter, tr);
    if (tr.fraction < 0.01) return false;
    const mid = vec3(tr.endPos.x, tr.endPos.y, tr.endPos.z);
    const down = vec3(mid.x, mid.y, mid.z - 18 - 64);
    c.traceHull(mid, down, this.mins, this.maxs, MASK_NPCSOLID, filter, tr);
    if (tr.startSolid) return false;
    copy(this.origin, tr.endPos);
    return true;
  }

  syncBody(): void {
    this.phys?.setKinematicTarget(this.origin, ZERO);
  }

  override isUsable(): boolean {
    return !this.dead;
  }

  override use(activator: Entity): boolean {
    this.fireOutput('OnPlayerUse', activator);
    return true;
  }

  override onTakeDamage(info: DamageInfo): number {
    if (this.dead || this.takeDamage !== DAMAGE_YES) return 0;
    this.health -= info.damage;
    this.lastBlow = { force: { ...info.force }, at: { ...info.position } };
    this.fireOutput('OnDamaged', this.sp.entity(info.attacker));
    if (this.health <= 0) this.die(this.sp.entity(info.attacker));
    return info.damage;
  }

  die(attacker: Entity | null): void {
    if (this.dead) return;
    this.dead = true;
    this.goal = null;
    this.playActivity('ACT_DIESIMPLE');
    // HL2's NPCs become ragdolls where they die (CBaseCombatCharacter::BecomeRagdoll), pushed by the blow:
    // the renderer builds the ragdoll from this.
    this.extra = {
      ...(this.extra ?? {}),
      ragdoll: this.lastBlow ?? { force: { x: 0, y: 0, z: 0 }, at: { ...this.origin } },
    };
    this.fireOutput('OnDeath', attacker);
    this.phys?.setGroups(0, 0);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'startscripting':
        this.scripted++;
        return true;
      case 'stopscripting':
        this.scripted = Math.max(0, this.scripted - 1);
        return true;
      case 'addcontext': {
        const [k, v] = value.split(':');
        if (k) this.responseContext.set(k, v ?? '');
        return true;
      }
      case 'clearcontext':
        this.responseContext.clear();
        return true;
      case 'removecontext':
        this.responseContext.delete(value.split(':')[0]);
        return true;
      case 'sethealth':
        this.health = parseFloat(value) || 0;
        if (this.health <= 0) this.die(activator);
        return true;
      case 'givewepon':
      case 'giveweapon':
        this.extra = { ...(this.extra ?? {}), weapon: value };
        return true;
      case 'setrelationship':
      case 'setsquad':
      case 'setenemyfilter':
      case 'wake':
      case 'sleep':
      case 'setreadinesslow':
      case 'setreadinessmedium':
      case 'setreadinesshigh':
      case 'disableshadow':
      case 'enableshadow':
      case 'speakresponseconcept':
      case 'ignitelifetime':
      case 'startpatrolling':
      case 'stoppatrolling':
      case 'setfollowtarget':
      case 'inspecttargetphoto':
      case 'inspecttargetspotlight':
      case 'setpolicegoal':
      case 'setlightingoriginhack':
      case 'flyaway':
      case 'setangry':
      case 'settargetentity':
      case 'toggle':
      case 'ragdoll':
        this.handleClassInput(input.toLowerCase(), value, activator);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  /** Class-specific inputs (cameras, scanners, pigeons…). */
  protected handleClassInput(input: string, value: string, activator: Entity | null): void {
    if (input === 'setpolicegoal') this.extra = { ...(this.extra ?? {}), policeGoal: value };
    else if (input === 'flyaway') {
      this.moveTo(vec3(this.origin.x + 512, this.origin.y, this.origin.z + 256), true, () => this.world.remove(this));
    } else if (input === 'setfollowtarget' || input === 'settargetentity') this.faceEntity(this.sp.findByName(value, this, activator, null));
    else if (input === 'setangry') this.extra = { ...(this.extra ?? {}), angry: true };
    else if (input === 'toggle') this.visualOn = !this.visualOn;
  }

  override onRemove(): void {
    if (this.phys) this.sp.physics.removeBody(this.phys);
    this.phys = null;
    this.sp.collision.removeBox(this);
  }

  // ─── Metrocop beats ────────────────────────────────────────────────────

  /** SDK-observed behaviour: a cop shoves a player who stands too close. */
  protected shoveIfCrowded(): void {
    if (this.scripted || this.goal) return;
    const p = this.sp.player;
    if (p.dead) return;
    const dx = p.origin.x - this.origin.x;
    const dy = p.origin.y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > 44 || Math.abs(p.origin.z - this.origin.z) > 40 || this.sp.curtime < this.shoveAt) return;
    this.shoveAt = this.sp.curtime + 2;
    this.idealYaw = (Math.atan2(dy, dx) * 180) / Math.PI;
    const dir = vec3(dx, dy, 0);
    normalize(dir);
    p.move.velocity.x += dir.x * 300;
    p.move.velocity.y += dir.y * 300;
    p.move.velocity.z += 100;
    p.move.groundEntity = -1;
    p.move.flags &= ~1;
    p.move.punchAngle.x = 8;
    const seq = this.findSequence('pushplayer');
    if (seq) this.playSequence(seq.name, 1, false);
    this.sp.emitSound('NPC_MetroPolice.Shove', { entity: this.id });
    this.fireOutput('OnPushedPlayer', p);
  }

  /** A physics object thrown by the player hit this cop. */
  protected checkCupCopped(): void {
    if (this.cupCopped) return;
    this.worldSpaceCenter(cc);
    for (const [id, b] of this.sp.bodiesByEntity) {
      if (b.kind !== 'dynamic' || b.held) continue;
      const e = this.sp.entity(id) as (Entity & { thrownAt?: number }) | null;
      if (!e || !e.thrownAt || this.sp.curtime - e.thrownAt > 3) continue;
      b.getCenter(bc);
      if (Math.abs(bc.x - cc.x) > 24 || Math.abs(bc.y - cc.y) > 24 || Math.abs(bc.z - cc.z) > 44) continue;
      const v = b.getVelocity(vec3());
      if (Math.hypot(v.x, v.y, v.z) < 60) continue;
      this.cupCopped = true;
      this.fireOutput('OnCupCopped', this.sp.player);
      return;
    }
  }
}

const ZERO = Object.freeze(vec3());
const cc = vec3();
const bc = vec3();

export class NpcMetropolice extends SpActor {
  protected override behave(): void {
    this.shoveIfCrowded();
    this.checkCupCopped();
  }
}

/** npc_security_camera (Portal) / npc_combine_camera: a camera that tracks the player; Ragdoll drops it. */
export class NpcCamera extends SpActor {
  override spawn(): void {
    if (!this.model) this.model = this.classname === 'npc_security_camera' ? 'models/props/security_camera.mdl' : 'models/combine_camera/combine_camera.mdl';
    super.spawn();
    this.mins.x = this.mins.y = this.mins.z = -8;
    this.maxs.x = this.maxs.y = this.maxs.z = 8;
    this.phys?.setGroups(0, 0);
    this.extra = { kind: this.classname, ragdolled: false, pitch: 0, yaw: 0 };
  }

  override simulate(): void {
    if (this.extra?.ragdolled) return;
    const p = this.sp.player;
    const eye = p.eyePosition(vec3());
    const d = vec3(eye.x - this.origin.x, eye.y - this.origin.y, eye.z - this.origin.z);
    if (this.extra) {
      this.extra.yaw = (Math.atan2(d.y, d.x) * 180) / Math.PI;
      this.extra.pitch = (-Math.atan2(d.z, Math.hypot(d.x, d.y)) * 180) / Math.PI;
    }
  }

  override isSolid(): boolean {
    return false;
  }

  override isUsable(): boolean {
    return false;
  }

  protected override handleClassInput(input: string, value: string, activator: Entity | null): void {
    if (input === 'ragdoll' && this.extra && !this.extra.ragdolled) {
      // Knocked off its mount: a falling physics prop takes its place.
      this.extra.ragdolled = true;
      const info = this.sp.assets.model(this.model);
      if (info?.physics) {
        this.sp.spawnEntity('prop_physics', (ent) => {
          ent.model = this.model;
          copy(ent.origin, this.origin);
          copy(ent.angles, this.angles);
        });
        this.effects |= 0x20;
      }
      this.sp.emitSound('Portal.Camera_Die', { entity: this.id });
      return;
    }
    super.handleClassInput(input, value, activator);
  }
}

registerSp(
  SpActor,
  'npc_citizen',
  'npc_barney',
  'npc_breen',
  'npc_kleiner',
  'npc_vortigaunt',
  'npc_cscanner',
  'npc_strider',
  'npc_pigeon',
  'generic_actor',
  'cycler_actor',
  'monster_generic',
);
registerSp(NpcMetropolice, 'npc_metropolice');
registerSp(NpcCamera, 'npc_security_camera', 'npc_combine_camera');

export { USE_TOGGLE };
