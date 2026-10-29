/**
 * Scripting entities that drive actors (SDK: scripted.cpp CAI_ScriptedSequence,
 * CAI_ScriptedSchedule; ai_goal_actbusy.cpp; ai_goal_police.cpp;
 * ai_scripted_conditions; monstermaker.cpp CNPCMaker / CTemplateNPCMaker).
 *
 * scripted_sequence: the actor (m_iszEntity) walks/runs/teleports to the
 * script's position (m_fMoveTo), idles (m_iszIdle) until BeginSequence, then
 * plays entry → action (m_iszPlay) → post-idle. OnBeginSequence when the
 * action starts, OnScriptEventNN from the action's model events (1003 "NN"),
 * OnEndSequence when it ends, then m_iszNextScript begins.
 */

import { copy, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { BspEntity } from '../../tf2-game/formats/keyvalues';
import type { Entity } from '../../tf2-game/sim/entity';
import { registerSp, SpEntity } from '../entities/base';
import { SpActor } from './actor';

/** SCRIPT_EVENT_FIREEVENT. */
const SCRIPT_EVENT_FIREEVENT = 1003;
const SCRIPT_EVENT_FIRE_INPUT = 1100;

/** Finds the actor a script names (targetname, then classname). */
export function findActor(world: SpEntity['sp'], name: string, caller: Entity | null, activator: Entity | null): SpActor | null {
  if (!name) return null;
  for (const e of world.findAllByName(name, caller, activator, caller)) if (e instanceof SpActor && !e.dead) return e;
  for (const e of world.findAllByClassname(name)) if (e instanceof SpActor && !e.dead) return e;
  return null;
}

const MOVETO_NO = 0;
const MOVETO_WALK = 1;
const MOVETO_RUN = 2;
// 3 = custom move (an ai_goal's movement) is treated as walk.
const MOVETO_INSTANT = 4;
const MOVETO_TURN = 5;

export class ScriptedSequence extends SpEntity {
  actor: SpActor | null = null;
  /** 'idle' (waiting at the mark), 'moving', 'playing', 'post', 'done'. */
  phase: 'none' | 'moving' | 'idle' | 'playing' | 'post' | 'done' = 'none';
  private beginWhenThere = false;
  private ended = false;

  override activate(): void {
    super.activate();
    if (this.spawnflags & 16) this.setThink(() => this.begin(null), this.world.curtime + 0.1);
  }

  private resolveActor(activator: Entity | null): SpActor | null {
    if (this.actor && !this.actor.removed && !this.actor.dead) return this.actor;
    this.actor = findActor(this.sp, this.kvString('m_iszEntity'), this, activator);
    return this.actor;
  }

  /** Brings the actor to the mark (MoveToPosition). */
  moveToPosition(activator: Entity | null, then: (() => void) | null): void {
    const a = this.resolveActor(activator);
    if (!a) {
      this.fireOutput('OnCancelFailedSequence', activator);
      return;
    }
    a.scripted++;
    const mode = this.kvNumber('m_fMoveTo', MOVETO_WALK);
    const yaw = this.angles.y;
    const arrive = (): void => {
      if (mode !== MOVETO_NO) a.idealYaw = yaw;
      this.phase = 'idle';
      const idle = this.kvString('m_iszIdle');
      if (idle) a.playSequence(idle, 1, true);
      then?.();
    };
    const dist = Math.hypot(a.origin.x - this.origin.x, a.origin.y - this.origin.y);
    if (mode === MOVETO_NO || mode === MOVETO_TURN || dist < 4) arrive();
    else if (mode === MOVETO_INSTANT) {
      a.teleportTo(this.origin, yaw);
      arrive();
    } else {
      this.phase = 'moving';
      a.moveTo(this.origin, mode === MOVETO_RUN, (ok) => {
        if (!ok) a.teleportTo(this.origin, yaw);
        arrive();
      }, yaw);
    }
  }

  /** BeginSequence. */
  begin(activator: Entity | null): void {
    if (this.phase === 'playing') return;
    if (this.phase === 'none' || this.phase === 'done') {
      this.ended = false;
      this.moveToPosition(activator, () => this.play(activator));
      return;
    }
    if (this.phase === 'moving') {
      this.beginWhenThere = true;
      return;
    }
    this.play(activator);
  }

  private play(activator: Entity | null): void {
    const a = this.actor;
    if (!a) return;
    if (this.beginWhenThere) this.beginWhenThere = false;
    this.phase = 'playing';
    const entry = this.kvString('m_iszEntry');
    const action = this.kvString('m_iszPlay');
    let t = this.world.curtime;
    if (entry) {
      const d = a.playSequence(entry, 1, false);
      t += d;
    }
    this.setThink(() => {
      this.fireOutput('OnBeginSequence', activator);
      let d = 0;
      if (action) {
        d = a.playSequence(action, 1, !!this.kvBool('m_bLoopActionSequence'));
        this.scheduleEvents(action, d);
      }
      if (this.kvBool('m_bLoopActionSequence')) return;
      this.setThink(() => this.endSequence(), this.world.curtime + Math.max(d, 0.1));
    }, Math.max(t, this.world.curtime));
  }

  private scheduleEvents(sequence: string, duration: number): void {
    const a = this.actor;
    const seq = a?.findSequence(sequence);
    if (!a || !seq) return;
    for (const ev of seq.events) {
      const at = this.world.curtime + ev.cycle * duration;
      if (ev.event === SCRIPT_EVENT_FIREEVENT || ev.name.toUpperCase() === 'SCRIPT_EVENT_FIREEVENT') {
        const n = parseInt(ev.options, 10) || 1;
        this.sp.io.addEventTo(this, 'FireScriptEvent', String(n), at - this.world.curtime, a, this);
      } else if (ev.event === SCRIPT_EVENT_FIRE_INPUT) {
        this.sp.io.addEventTo(a, ev.options, '', at - this.world.curtime, a, a);
      }
    }
  }

  endSequence(): void {
    if (this.ended) return;
    this.ended = true;
    const a = this.actor;
    this.phase = 'post';
    const post = this.kvString('m_iszPostIdle');
    if (a) {
      // The post-action idle holds until the next script (SF 256 "loop in post idle" or not).
      if (post) a.playSequence(post, 1, true);
      else a.playActivity('ACT_IDLE');
      a.scripted = Math.max(0, a.scripted - 1);
    }
    this.fireOutput('OnEndSequence', a);
    const next = this.kvString('m_iszNextScript');
    if (next) for (const e of this.sp.findAllByName(next)) if (e instanceof ScriptedSequence) e.begin(a);
    this.phase = this.spawnflags & 4 ? 'none' : 'done';
  }

  cancel(activator: Entity | null): void {
    if (this.phase === 'none' || this.phase === 'done') return;
    this.setThink(null, -1);
    const a = this.actor;
    if (a) {
      a.goal = null;
      a.scripted = Math.max(0, a.scripted - 1);
      a.playActivity('ACT_IDLE');
    }
    this.phase = this.spawnflags & 4 ? 'none' : 'done';
    this.fireOutput('OnCancelSequence', activator);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'beginsequence':
        this.begin(activator);
        return true;
      case 'movetoposition':
        if (this.phase === 'none' || this.phase === 'done') this.moveToPosition(activator, null);
        return true;
      case 'cancelsequence':
        this.cancel(activator);
        return true;
      case 'firescriptevent': {
        const n = Math.max(1, Math.min(8, parseInt(value, 10) || 1));
        this.fireOutput(`OnScriptEvent${String(n).padStart(2, '0')}`, activator);
        return true;
      }
      case 'scriptplayerdeath':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** aiscripted_schedule: makes an actor walk/run to a goal entity (SDK: CAI_ScriptedSchedule). */
export class AiScriptedSchedule extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'startschedule') {
      const a = findActor(this.sp, this.kvString('m_iszEntity'), this, activator);
      const goal = this.sp.findByName(this.kvString('goalent'), this, activator, caller);
      if (a && goal) {
        const schedule = this.kvNumber('schedule', 1);
        // 1 walk to goal, 2 run to goal, 3 set enemy, 4 walk goal path, 5 run goal path, 6 set enemy to goal and run
        const run = schedule === 2 || schedule === 5 || schedule === 6;
        a.moveTo(goal.origin, run, (ok) => this.fireOutput(ok ? 'OnSucceed' : 'OnFail', a));
      }
      return true;
    }
    if (lc === 'stopschedule') {
      const a = findActor(this.sp, this.kvString('m_iszEntity'), this, activator);
      if (a) a.stopMoving(false);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** ai_goal_actbusy: sends actors to busy hints (SDK: CAI_ActBusyGoal), reduced to walking there. */
export class AiGoalActBusy extends SpEntity {
  private busy = new Set<SpActor>();

  private sendToHint(a: SpActor, hint: Entity | null, teleport: boolean): void {
    const target = hint ?? this.nearestHint(a);
    if (!target) return;
    const arrive = (): void => {
      a.idealYaw = target.angles.y;
      this.busy.add(a);
      this.fireOutput('OnNPCStartedBusy', a);
      target.fireOutput('OnNPCStartedUsing', a);
    };
    if (teleport) {
      a.teleportTo(target.origin, target.angles.y);
      arrive();
    } else a.moveTo(target.origin, false, () => arrive(), target.angles.y);
  }

  private nearestHint(a: SpActor): Entity | null {
    let best: Entity | null = null;
    let bd = Infinity;
    this.sp.forEachEntity((e) => {
      if (e.classname !== 'info_node_hint') return;
      const d = Math.hypot(e.origin.x - a.origin.x, e.origin.y - a.origin.y);
      if (d < bd && d < this.kvNumber('busysearchrange', 2048)) {
        bd = d;
        best = e;
      }
    });
    return best;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'activate') {
      const a = findActor(this.sp, this.kvString('actor'), this, activator);
      if (a) this.sendToHint(a, null, false);
      return true;
    }
    if (lc === 'forcenpctoactbusy') {
      const [npcName, hintName, extra] = value.split(/\s+/);
      const a = findActor(this.sp, npcName ?? '', this, activator);
      const hint = hintName ? this.sp.findByName(hintName) : null;
      if (a) this.sendToHint(a, hint, (extra ?? '').toLowerCase() === 'teleport');
      return true;
    }
    if (lc === 'forcethisnpctoactbusy') {
      const a = findActor(this.sp, value, this, activator);
      if (a) this.sendToHint(a, null, false);
      return true;
    }
    if (lc === 'forcethisnpctoleave') {
      const a = findActor(this.sp, value, this, activator);
      if (a) {
        this.busy.delete(a);
        this.fireOutput('OnNPCLeft', a);
        this.fireOutput('OnNPCFinishedBusy', a);
      }
      return true;
    }
    if (lc === 'deactivate' || lc === 'setbusysearchrange') return true;
    return super.acceptInput(input, value, activator, caller);
  }
}

/** ai_goal_actbusy_queue: actors standing at numbered queue nodes; MoveQueueUp lets the first one go. */
export class AiGoalActBusyQueue extends SpEntity {
  private queue: SpActor[] = [];

  private nodes(): Entity[] {
    const out: Entity[] = [];
    for (let i = 1; i <= 20; i++) {
      const n = this.kvString(`node${String(i).padStart(2, '0')}`);
      if (!n) continue;
      const e = this.sp.findByName(n);
      if (e) out.push(e);
    }
    return out;
  }

  private place(): void {
    const nodes = this.nodes();
    this.queue.forEach((a, i) => {
      const n = nodes[i];
      if (n) a.moveTo(n.origin, false, null, n.angles.y);
    });
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'activate': {
        const name = this.kvString('actor');
        const all = this.sp.findAllByName(name).filter((e): e is SpActor => e instanceof SpActor);
        for (const a of all) if (!this.queue.includes(a)) this.queue.push(a);
        this.place();
        return true;
      }
      case 'forcenpctoactbusy':
      case 'forcethisnpctoactbusy': {
        const a = findActor(this.sp, value.split(/\s+/)[0] ?? '', this, activator);
        if (a && !this.queue.includes(a)) this.queue.push(a);
        this.place();
        return true;
      }
      case 'movequeueup': {
        const first = this.queue.shift();
        if (first) {
          this.fireOutput('OnNPCStartedLeavingQueue', first);
          const leave = this.sp.findByName(this.kvString('leaving_goal'));
          if (leave) first.moveTo(leave.origin, false, () => this.fireOutput('OnNPCLeftQueue', first));
          else this.fireOutput('OnNPCLeftQueue', first);
        }
        this.place();
        return true;
      }
      case 'forcethisnpctoleave': {
        const a = findActor(this.sp, value, this, activator);
        if (a) {
          this.queue = this.queue.filter((q) => q !== a);
          this.fireOutput('OnNPCLeftQueue', a);
          this.place();
        }
        return true;
      }
      case 'playerstartedblocking':
      case 'playerstoppedblocking':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/**
 * ai_goal_police (SDK: CAI_PoliceGoal): a cop guards a point; a player inside
 * the radius gets warnings (OnFirstWarning, OnSecondWarning, OnLastWarning),
 * then — when knock-out is enabled — OnKnockOut; otherwise the cop shoves.
 */
export class AiGoalPolice extends SpEntity {
  knockOut = false;
  private warnings = 0;
  private nextWarn = 0;

  override spawn(): void {
    super.spawn();
    this.knockOut = (this.spawnflags & 2) !== 0;
    this.setThink(this.check, this.world.curtime + 0.5);
  }

  private readonly check = (): void => {
    this.setThink(this.check, this.world.curtime + 0.2);
    const p = this.sp.player;
    if (p.dead) return;
    const r = this.kvNumber('policeradius', 512);
    const target = this.kvString('policetarget') ? this.sp.findByName(this.kvString('policetarget')) : this;
    const c = target ?? this;
    const d = Math.hypot(p.origin.x - c.origin.x, p.origin.y - c.origin.y);
    if (d > r) {
      if (d > r * 1.5) this.warnings = 0;
      return;
    }
    if (this.world.curtime < this.nextWarn) return;
    this.nextWarn = this.world.curtime + 2;
    this.warnings++;
    if (this.warnings === 1) this.fireOutput('OnFirstWarning', p);
    else if (this.warnings === 2) this.fireOutput('OnSecondWarning', p);
    else if (this.warnings === 3) this.fireOutput('OnLastWarning', p);
    else if (this.knockOut) {
      this.fireOutput('OnKnockOut', p);
      this.warnings = 0;
    }
  };

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enableknockout':
        this.knockOut = true;
        return true;
      case 'disableknockout':
        this.knockOut = false;
        return true;
      case 'activate':
      case 'deactivate':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** ai_script_conditions: fires OnConditionsSatisfied when the player/actor conditions hold for RequiredTime. */
export class AiScriptConditions extends SpEntity {
  disabled = true;
  private since = -1;

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled', true);
    this.setThink(this.check, this.world.curtime + 0.2);
  }

  private readonly check = (): void => {
    this.setThink(this.check, this.world.curtime + 0.1);
    if (this.disabled) return;
    const p = this.sp.player;
    const actor = this.kvString('Actor') ? this.sp.findByName(this.kvString('Actor')) : null;
    let ok = true;
    const prox = this.kvNumber('PlayerActorProximity', 0);
    if (actor && prox > 0) ok &&= Math.hypot(p.origin.x - actor.origin.x, p.origin.y - actor.origin.y, p.origin.z - actor.origin.z) <= prox;
    const target = this.kvString('Target') ? this.sp.findByName(this.kvString('Target')) : null;
    const tprox = this.kvNumber('PlayerTargetProximity', 0);
    if (target && tprox > 0) ok &&= Math.hypot(p.origin.x - target.origin.x, p.origin.y - target.origin.y, p.origin.z - target.origin.z) <= tprox;
    if (!ok) {
      this.since = -1;
      return;
    }
    if (this.since < 0) this.since = this.world.curtime;
    if (this.world.curtime - this.since >= this.kvNumber('RequiredTime', 0)) {
      this.fireOutput('OnConditionsSatisfied', p);
      this.disabled = true;
      this.since = -1;
    }
  };

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** npc_maker / npc_template_maker (SDK: CNPCMaker / CTemplateNPCMaker). */
export class NpcMaker extends SpEntity {
  disabled = true;
  maxCount = 1;
  maxLive = 1;
  spawned = 0;
  children: Entity[] = [];

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled', true);
    this.maxCount = this.kvNumber('MaxNPCCount', 1);
    this.maxLive = this.kvNumber('MaxLiveChildren', 1);
    const freq = this.kvNumber('SpawnFrequency', -1);
    if (freq > 0) this.setThink(this.auto, this.world.curtime + freq);
  }

  private readonly auto = (): void => {
    const freq = this.kvNumber('SpawnFrequency', -1);
    if (!this.disabled) this.make();
    if (freq > 0) this.setThink(this.auto, this.world.curtime + freq);
  };

  private spawnPoint(): { pos: Vec3; yaw: number } {
    const group = this.kvString('DestinationGroup');
    if (group) {
      const dests = this.sp.findAllByName(group);
      if (dests.length > 0) {
        const d = dests[Math.floor(this.sp.random() * dests.length) % dests.length];
        return { pos: d.origin, yaw: d.angles.y };
      }
    }
    return { pos: this.origin, yaw: this.angles.y };
  }

  make(): Entity | null {
    this.children = this.children.filter((c) => !c.removed && !(c as SpActor).dead);
    if (this.maxCount >= 0 && this.spawned >= this.maxCount) return null;
    if (this.children.length >= this.maxLive) return null;
    const { pos, yaw } = this.spawnPoint();
    let e: Entity;
    const name = this.kvString('NPCTargetname');
    if (this.classname === 'npc_template_maker') {
      const kv = this.sp.templates.get(this.kvString('TemplateName').toLowerCase());
      if (!kv) return null;
      const props = kv.props.filter(([k]) => !/^(origin|angles|spawnflags)$/i.test(k));
      props.push(['origin', `${pos.x} ${pos.y} ${pos.z}`], ['angles', `0 ${yaw} 0`], ['spawnflags', String((parseInt(kv.get('spawnflags') ?? '0', 10) || 0) & ~2048)]);
      if (name) props.push(['targetname', name]);
      e = this.sp.spawnEntity(kv.classname, undefined, new BspEntity(props));
    } else {
      const cls = this.kvString('NPCType', 'npc_citizen');
      e = this.sp.spawnEntity(cls, (ent) => {
        copy(ent.origin, pos);
        ent.angles.y = yaw;
        if (name) ent.targetname = name;
      });
    }
    this.spawned++;
    this.children.push(e);
    this.fireOutput('OnSpawnNPC', e);
    if (this.maxCount >= 0 && this.spawned >= this.maxCount) this.fireOutput('OnAllSpawned', e);
    return e;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const v = parseFloat(value) || 0;
    switch (input.toLowerCase()) {
      case 'spawn':
        this.make();
        return true;
      case 'enable':
        this.disabled = false;
        if (this.kvNumber('SpawnFrequency', -1) > 0) this.make();
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'toggle':
        this.disabled = !this.disabled;
        return true;
      case 'addmaxchildren':
        this.maxCount += v;
        return true;
      case 'setmaxchildren':
        this.maxCount = v;
        return true;
      case 'setmaxlivechildren':
        this.maxLive = v;
        return true;
      case 'setspawnfrequency':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerSp(ScriptedSequence, 'scripted_sequence', 'scripted_target');
registerSp(AiScriptedSchedule, 'aiscripted_schedule');
registerSp(AiGoalActBusy, 'ai_goal_actbusy');
registerSp(AiGoalActBusyQueue, 'ai_goal_actbusy_queue');
registerSp(AiGoalPolice, 'ai_goal_police');
registerSp(AiScriptConditions, 'ai_script_conditions');
registerSp(NpcMaker, 'npc_maker', 'npc_template_maker');
registerSp(SpEntity, 'info_node', 'info_node_air', 'info_node_hint', 'info_node_air_hint', 'info_node_link');

export { vec3 };
