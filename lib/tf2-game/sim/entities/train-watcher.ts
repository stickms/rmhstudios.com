/**
 * Payload (SDK: server/team_train_watcher.cpp CTeamTrainWatcher,
 * server/tf/tf_obj_dispenser.cpp CObjectCartDispenser):
 *
 * - team_train_watcher: follows the cart along its path_tracks — progress
 *   (0…1 to the goal), the HUD speed level, the checkpoint alerts and the
 *   final alarm — and, with handle_train_movement, drives the cart itself:
 *   0.55 / 0.77 / 1.0 of its max speed for 1 / 2 / 3+ capture value on the
 *   cart (a scout counts 2, see GetCaptureValueForPlayer), full speed down
 *   hills, rolling back down uphill sections, and receding at 0.1 speed when
 *   nobody has pushed for tf_escort_recede_time (30 s; 5 s in overtime).
 *   Maps without handle_train_movement (pl_badwater) do the same through
 *   their own I/O (math_remap → logic_case → SetSpeedDirAccel and
 *   OnTrainStartRecede).
 * - mapobj_cart_dispenser + dispenser_touch_trigger: the cart's level 1
 *   dispenser — 10 hp/s healing without overheal (CTFPlayerShared::Heal with
 *   a dispenser source), 20 % ammo and up to 40 metal a second to teammates
 *   in its trigger.
 */

import { TEAM_UNASSIGNED, TF_TEAM_BLUE } from '../../core/constants';
import { type Entity, EF_NODRAW } from '../entity';
import { registerEntityClass } from '../entity-registry';
import type { NetRecord, NetSchema } from '../net-schema';
import type { Player } from '../player';
import { GR_STATE_RND_RUNNING } from '../rules';
import { TF_COND } from '../conditions';
import { BaseTrigger, SF_TRIGGER_ALLOW_CLIENTS } from '../triggers';
import { TF_AMMO } from '../../data/classes';
import {
  ContextThinks,
  MapEntity,
  atof,
  atoi,
  inputBool,
  stopSound,
  type ThinkContext,
} from './base';
import { NET_TRAIN_WATCHER } from './net';
import {
  objectives,
  track,
  untrack,
  TF_ESCORT_RECEDE_TIME,
  TF_ESCORT_RECEDE_TIME_OVERTIME,
} from './objectives';
import {
  FuncTrackTrain,
  HILL_TYPE_DOWNHILL,
  HILL_TYPE_NONE,
  HILL_TYPE_UPHILL,
  PathTrack,
} from './movers';
import { TriggerAreaCapture, type TeamControlPoint } from './control-points';

/** TEAM_TRAIN_ALERT_DISTANCE: the announcer's checkpoint warning. */
export const TEAM_TRAIN_ALERT_DISTANCE = 750;
/** TEAM_TRAIN_ALARM_DISTANCE: the looping alarm at the last point. */
export const TEAM_TRAIN_ALARM_DISTANCE = 200;
const TEAM_TRAIN_ALERT = 'Announcer.Cart.Warning';
const TEAM_TRAIN_FINAL_ALERT = 'Announcer.Cart.FinalWarning';
const TEAM_TRAIN_ALARM = 'Cart.Warning';
const TEAM_TRAIN_ALARM_SINGLE = 'Cart.WarningSingle';
const TW_THINK_INTERVAL = 0.1;
const TW_ALARM_THINK_INTERVAL = 8.0;
/** MAX_ALARM_TIME_NO_RECEDE. */
const MAX_ALARM_TIME_NO_RECEDE = 18;
const MAX_CP_LINKS = 8;

interface CPLink {
  pathTrack: PathTrack;
  cp: TeamControlPoint;
  distanceFromStart: number;
  alertPlayed: boolean;
}

export class TeamTrainWatcher extends MapEntity {
  disabled = false;
  trainName = '';
  startNodeName = '';
  goalNodeName = '';
  readonly linkedPathTrackNames = new Array<string>(MAX_CP_LINKS).fill('');
  readonly linkedCPNames = new Array<string>(MAX_CP_LINKS).fill('');
  trainCanRecede = true;
  handleTrainMovement = false;
  readonly speedLevels = [0, 0, 0];
  sparkName = '';
  speedForwardModifier = 1;
  trainRecedeTime = 0;

  train: FuncTrackTrain | null = null;
  startNode: PathTrack | null = null;
  goalNode: PathTrack | null = null;
  areaCap: TriggerAreaCapture | null = null;
  readonly cpLinks: CPLink[] = [];
  totalPathDistance = 0;
  /** m_flTotalProgress (0…1). */
  totalProgress = 0;
  trainSpeedLevel = 0;
  recedeTime = 0;
  recedeStartTime = 0;
  recedeTotalTime = 0;
  waitingToRecede = false;
  capBlocked = false;
  numCappers = 0;
  currentHillType = HILL_TYPE_NONE;
  /** The SetSpeedDirAccel value we last gave the train (handle_train_movement). */
  currentSpeed = 0;
  receding = false;
  trainDistanceFromStart = 0;
  alarm = false;
  private alarmPlaying = false;
  private alarmPlayed = false;
  private alarmEndTime = -1;
  private readonly watcherThink: ThinkContext;
  private readonly alarmThink: ThinkContext;

  constructor(classname: string) {
    super(classname);
    this.team = TF_TEAM_BLUE;
    this.watcherThink = this.context(() => this.watcherThinkFn());
    this.alarmThink = this.context(() => this.watcherAlarmThink());
  }

  override keyValue(key: string, value: string): boolean {
    const m = /^linked_(pathtrack|cp)_(\d+)$/.exec(key);
    if (m) {
      const i = atoi(m[2]) - 1;
      if (i >= 0 && i < MAX_CP_LINKS) {
        if (m[1] === 'pathtrack') this.linkedPathTrackNames[i] = value;
        else this.linkedCPNames[i] = value;
      }
      return true;
    }
    switch (key) {
      case 'train':
        this.trainName = value;
        return true;
      case 'start_node':
        this.startNodeName = value;
        return true;
      case 'goal_node':
        this.goalNodeName = value;
        return true;
      case 'train_can_recede':
        this.trainCanRecede = atoi(value) !== 0;
        return true;
      case 'handle_train_movement':
        this.handleTrainMovement = atoi(value) !== 0;
        return true;
      case 'hud_min_speed_level_1':
        this.speedLevels[0] = atof(value);
        return true;
      case 'hud_min_speed_level_2':
        this.speedLevels[1] = atof(value);
        return true;
      case 'hud_min_speed_level_3':
        this.speedLevels[2] = atof(value);
        return true;
      case 'startdisabled':
        this.disabled = atoi(value) !== 0;
        return true;
      case 'env_spark_name':
        this.sparkName = value;
        return true;
      case 'speed_forward_modifier':
        this.speedForwardModifier = atof(value);
        return true;
      case 'train_recede_time':
        this.trainRecedeTime = atoi(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    track(objectives(this.world).watchers, this);
  }

  override onRemove(): void {
    this.stopCaptureAlarm();
    untrack(objectives(this.world).watchers, this);
    super.onRemove();
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  /** SDK: CTeamTrainWatcher::WatcherActivate. */
  watcherActivate(): void {
    const world = this.world;
    this.recedeTime = 0;
    this.waitingToRecede = false;
    this.capBlocked = false;
    this.areaCap = null;
    this.trainDistanceFromStart = 0;
    this.alarmPlayed = false;
    this.stopCaptureAlarm();
    const t = this.trainName ? world.findByName(this.trainName) : null;
    this.train = t instanceof FuncTrackTrain ? t : null;
    if (this.handleTrainMovement && this.train) {
      for (const area of objectives(world).areas) {
        if (area.parent === this.train.id) {
          area.trainWatcher = this;
          break;
        }
      }
    }
    this.cpLinks.length = 0;
    for (let i = 0; i < MAX_CP_LINKS; i++) {
      const pt = this.linkedPathTrackNames[i]
        ? world.findByName(this.linkedPathTrackNames[i])
        : null;
      const cpName = this.linkedCPNames[i];
      const cp = cpName
        ? objectives(world).points.find(
            (p) => !p.removed && p.targetnameLower === cpName.toLowerCase(),
          )
        : null;
      if (pt instanceof PathTrack && cp)
        this.cpLinks.push({ pathTrack: pt, cp, distanceFromStart: 0, alertPlayed: false });
    }
    const s = this.startNodeName ? world.findByName(this.startNodeName) : null;
    this.startNode = s instanceof PathTrack ? s : null;
    const g = this.goalNodeName ? world.findByName(this.goalNodeName) : null;
    this.goalNode = g instanceof PathTrack ? g : null;
    this.totalPathDistance = 0;
    if (this.startNode && this.goalNode) {
      let prev: PathTrack = this.startNode;
      let node = this.startNode.getNext();
      let guard = 0;
      while (node && guard++ < 4096) {
        const dx = node.origin.x - prev.origin.x;
        const dy = node.origin.y - prev.origin.y;
        const dz = node.origin.z - prev.origin.z;
        this.totalPathDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
        for (const l of this.cpLinks) {
          if (l.pathTrack === node) {
            l.distanceFromStart = this.totalPathDistance;
            break;
          }
        }
        if (node === this.goalNode) break;
        prev = node;
        node = node.getNext();
      }
    }
    if (this.totalPathDistance > 0)
      for (const l of this.cpLinks)
        l.cp.trackDistance = l.distanceFromStart / this.totalPathDistance;
    this.internalSetSpeedForwardModifier(this.speedForwardModifier);
    this.setContextThink(this.watcherThink, world.curtime + TW_THINK_INTERVAL);
  }

  /** Called by path_track's InPass ("path_track_passed"). SDK: CTeamTrainWatcher::FireGameEvent. */
  onPathTrackPassed(node: PathTrack): void {
    if (this.disabled || !this.handleTrainMovement) return;
    let handle = false;
    let n = this.startNode;
    let guard = 0;
    while (n && guard++ < 4096) {
      if (n === node) {
        handle = true;
        break;
      }
      n = n.getNext();
    }
    if (!handle) return;
    if (this.receding) {
      const prev = node.getPrevious();
      if (prev && prev.isDisabled()) return;
    }
    let hillType = node.hillType();
    let update = this.currentHillType !== hillType;
    if (!update && this.currentHillType !== HILL_TYPE_NONE) {
      const nextNode = this.currentSpeed < 0 ? node.getPrevious() : node.getNext();
      if (nextNode && this.currentHillType !== nextNode.hillType()) {
        update = true;
        hillType = HILL_TYPE_NONE;
      }
    }
    if (update) {
      this.currentHillType = hillType;
      this.handleTrainMovement2(false);
    }
  }

  /** SDK: CTeamTrainWatcher::HandleSparks. */
  private handleSparks(on: boolean): void {
    if (this.disabled || !this.handleTrainMovement || !this.sparkName) return;
    for (const e of this.world.findAllByName(this.sparkName))
      e.acceptInput(on ? 'StartSpark' : 'StopSpark', '', this, this);
  }

  /** SDK: CTeamTrainWatcher::HandleTrainMovement. */
  handleTrainMovement2(startReceding: boolean): void {
    if (this.disabled || !this.handleTrainMovement || !this.train) return;
    let speed = 0;
    if (startReceding) {
      speed = -0.1;
      this.receding = true;
    } else if (this.numCappers > 0) {
      this.receding = false;
      if (this.currentHillType === HILL_TYPE_DOWNHILL) speed = 1;
      else speed = this.numCappers === 1 ? 0.55 : this.numCappers === 2 ? 0.77 : 1;
    } else if (this.numCappers === -1) {
      if (this.currentHillType === HILL_TYPE_DOWNHILL) speed = 1;
    } else if (this.currentSpeed > 0) {
      if (this.currentHillType === HILL_TYPE_DOWNHILL) speed = 1;
    } else if (this.currentHillType === HILL_TYPE_UPHILL) speed = -1;
    else if (this.receding) speed = -0.1;
    if (this.currentSpeed !== speed) {
      if (speed >= 0) this.receding = false;
      this.currentSpeed = speed;
      this.train.setSpeedDirAccel(speed);
      this.handleSparks(speed < 0);
    }
  }

  private internalSetSpeedForwardModifier(m: number): void {
    if (this.disabled || !this.handleTrainMovement) return;
    this.speedForwardModifier = Math.max(0, Math.min(1, Math.abs(m)));
    this.train?.setSpeedForwardModifier(this.speedForwardModifier);
  }

  /** SDK: CTeamTrainWatcher::InternalSetNumTrainCappers. */
  internalSetNumTrainCappers(n: number, trigger: Entity | null): void {
    if (this.disabled) return;
    this.numCappers = n;
    if (trigger instanceof TriggerAreaCapture) {
      this.capBlocked = trigger.isBlocked();
      this.areaCap = trigger;
    }
    if (n <= 0 && !this.capBlocked && this.trainCanRecede) {
      if (!this.waitingToRecede) {
        this.waitingToRecede = true;
        if (this.world.rules.inOvertime) this.recedeTotalTime = TF_ESCORT_RECEDE_TIME_OVERTIME;
        else
          this.recedeTotalTime =
            this.trainRecedeTime > 0 ? this.trainRecedeTime : TF_ESCORT_RECEDE_TIME;
        this.recedeStartTime = this.world.curtime;
        this.recedeTime = this.recedeStartTime + this.recedeTotalTime;
      }
    } else {
      this.waitingToRecede = false;
      this.recedeTime = 0;
    }
    this.handleTrainMovement2(false);
  }

  /** SDK: CTeamTrainWatcher::SetNumTrainCappers (from the cart's capture area). */
  setNumTrainCappers(n: number, trigger: Entity): void {
    if (this.disabled || !this.handleTrainMovement) return;
    this.internalSetNumTrainCappers(n, trigger);
  }

  /** SDK: CTeamTrainWatcher::InputOnStartOvertime. */
  onStartOvertime(): void {
    if (!this.waitingToRecede) return;
    const remaining = this.recedeTime - this.world.curtime;
    if (remaining > TF_ESCORT_RECEDE_TIME_OVERTIME) {
      this.recedeTotalTime = TF_ESCORT_RECEDE_TIME_OVERTIME;
      this.recedeStartTime = this.world.curtime;
      this.recedeTime = this.recedeStartTime + this.recedeTotalTime;
    }
  }

  /** SDK: CTeamTrainWatcher::TimerMayExpire. */
  timerMayExpire(): boolean {
    if (this.disabled) return true;
    if (this.waitingToRecede) return false;
    if (this.capBlocked) return false;
    return true;
  }

  private stopCaptureAlarm(): void {
    if (this.alarmPlaying) {
      const cp = this.cpLinks.length > 0 ? this.cpLinks[this.cpLinks.length - 1].cp : null;
      stopSound(this.world, cp ? cp.id : this.id, TEAM_TRAIN_ALARM, 6);
      this.alarmPlaying = false;
      this.alarmEndTime = -1;
    }
    this.setContextThink(this.alarmThink, -1);
  }

  private startCaptureAlarm(cp: TeamControlPoint): void {
    this.stopCaptureAlarm();
    this.world.emitSound(TEAM_TRAIN_ALARM, { entity: cp.id, channel: 6 });
    this.alarmPlaying = true;
    this.alarmEndTime = this.world.curtime + MAX_ALARM_TIME_NO_RECEDE;
  }

  private watcherAlarmThink(): void {
    const cp = this.cpLinks.length > 0 ? this.cpLinks[this.cpLinks.length - 1].cp : null;
    if (cp) this.world.emitSound(TEAM_TRAIN_ALARM_SINGLE, { entity: cp.id });
    this.setContextThink(this.alarmThink, this.world.curtime + TW_ALARM_THINK_INTERVAL);
  }

  /** SDK: CTeamTrainWatcher::WatcherThink. */
  private watcherThinkFn(): void {
    const world = this.world;
    const rules = world.rules;
    if (this.waitingToRecede && this.recedeTime < world.curtime) {
      this.waitingToRecede = false;
      if (!rules.inOvertime) {
        this.fireOutput('OnTrainStartRecede', this);
        this.handleTrainMovement2(true);
      }
    }
    const disableAlarm = rules.state !== GR_STATE_RND_RUNNING;
    if (disableAlarm) this.stopCaptureAlarm();
    const train = this.train && !this.train.removed ? this.train : null;
    if (train) {
      const old = this.trainSpeedLevel;
      const speed = train.getDesiredSpeed();
      if (speed < 0) this.trainSpeedLevel = train.getCurrentSpeed() === 0 ? 0 : -1;
      else if (speed > this.speedLevels[2]) this.trainSpeedLevel = 3;
      else if (speed > this.speedLevels[1]) this.trainSpeedLevel = 2;
      else if (speed > this.speedLevels[0]) this.trainSpeedLevel = 1;
      else this.trainSpeedLevel = 0;
      if (
        this.trainSpeedLevel !== old &&
        this.handleTrainMovement &&
        this.trainSpeedLevel === 0 &&
        old !== 0
      )
        this.handleSparks(false);

      let node = train.path ? train.path.getNext() : null;
      if (speed < 0) node = train.path;
      if (node) {
        let dx = node.origin.x - train.origin.x;
        let dy = node.origin.y - train.origin.y;
        let dz = node.origin.z - train.origin.z;
        let toGoal = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (node !== this.goalNode) {
          let prev = node;
          let n = node.getNext();
          let guard = 0;
          while (n && guard++ < 4096) {
            dx = n.origin.x - prev.origin.x;
            dy = n.origin.y - prev.origin.y;
            dz = n.origin.z - prev.origin.z;
            toGoal += Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (n === this.goalNode) break;
            prev = n;
            n = n.getNext();
          }
        }
        if (this.totalPathDistance <= 0) this.totalPathDistance = 1;
        this.totalProgress = Math.max(0, Math.min(1, 1 - toGoal / this.totalPathDistance));
        this.trainDistanceFromStart = this.totalPathDistance - toGoal;

        for (const link of this.cpLinks) {
          if (this.trainDistanceFromStart < link.distanceFromStart - TEAM_TRAIN_ALERT_DISTANCE) {
            if (
              this.trainDistanceFromStart <
                link.distanceFromStart - TEAM_TRAIN_ALERT_DISTANCE * 2 ||
              !this.trainCanRecede
            ) {
              link.alertPlayed = false;
            }
          } else if (this.trainDistanceFromStart < link.distanceFromStart && !link.alertPlayed) {
            link.alertPlayed = true;
            this.playCaptureAlert(link.cp);
          }
        }

        if (toGoal <= TEAM_TRAIN_ALARM_DISTANCE) {
          this.alarm = true;
          if (!disableAlarm) {
            if (!this.alarmPlaying) {
              if (this.cpLinks.length > 0 && !this.alarmPlayed) {
                this.startCaptureAlarm(this.cpLinks[this.cpLinks.length - 1].cp);
                this.alarmPlayed = true;
              }
            } else if (
              !this.trainCanRecede &&
              this.alarmEndTime > 0 &&
              this.alarmEndTime < world.curtime
            ) {
              this.stopCaptureAlarm();
              this.setContextThink(this.alarmThink, world.curtime + TW_ALARM_THINK_INTERVAL);
            }
          }
        } else {
          this.alarm = false;
          this.stopCaptureAlarm();
          this.alarmPlayed = false;
        }
      }
    }
    this.setContextThink(this.watcherThink, world.curtime + TW_THINK_INTERVAL);
  }

  /** SDK: CTFGameRules::PlayTrainCaptureAlert. */
  private playCaptureAlert(cp: TeamControlPoint): void {
    const world = this.world;
    if (world.rules.state !== GR_STATE_RND_RUNNING) return;
    const o = objectives(world);
    let final = false;
    const master = o.master();
    if (master) {
      if (!master.playingMiniRounds()) {
        for (let t = 2; t < 4; t++)
          if (cp.canCap[t] && master.wouldNewCPOwnerWinGame(cp, t)) final = true;
      } else if (master.numPlayableControlPointRounds() === 1) {
        const r = master.getCurrentRound();
        if (r)
          for (let t = 2; t < 4; t++)
            if (cp.canCap[t] && r.wouldNewCPOwnerWinGame(cp, t)) final = true;
      }
    }
    world.emitSound(final ? TEAM_TRAIN_FINAL_ALERT : TEAM_TRAIN_ALERT, { entity: cp.id });
  }

  /** The cart's distance along the track (GetTrainDistanceAlongTrack). */
  getTrainDistanceAlongTrack(): number {
    return this.trainDistanceFromStart;
  }

  /** SDK: CTeamTrainWatcher::IsTrainAtStart. */
  isTrainAtStart(): boolean {
    return this.trainDistanceFromStart < TEAM_TRAIN_ALARM_DISTANCE;
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'roundactivate':
        this.stopCaptureAlarm();
        if (!this.disabled) this.watcherActivate();
        return true;
      case 'setnumtraincappers':
        this.internalSetNumTrainCappers(atoi(value), caller);
        return true;
      case 'onstartovertime':
        this.onStartOvertime();
        return true;
      case 'enable':
        this.stopCaptureAlarm();
        this.disabled = false;
        this.watcherActivate();
        return true;
      case 'disable':
        this.stopCaptureAlarm();
        this.disabled = true;
        this.setContextThink(this.watcherThink, -1);
        this.waitingToRecede = false;
        if (this.handleTrainMovement) {
          this.currentSpeed = 0;
          this.train?.setSpeedDirAccel(0);
          this.handleSparks(false);
        }
        return true;
      case 'setspeedforwardmodifier':
        this.internalSetSpeedForwardModifier(atof(value));
        return true;
      case 'settrainrecedetime': {
        const s = atoi(value);
        this.trainRecedeTime = s >= 0 ? s : 0;
        return true;
      }
      case 'settrainrecedetimeandupdate': {
        const s = atoi(value);
        this.trainRecedeTime = s >= 0 ? s : 0;
        if (this.recedeTime > 0) {
          this.recedeTotalTime =
            this.trainRecedeTime > 0 ? this.trainRecedeTime : TF_ESCORT_RECEDE_TIME;
          this.recedeStartTime = this.world.curtime;
          this.recedeTime = this.recedeStartTime + this.recedeTotalTime;
        }
        return true;
      }
      case 'settraincanrecede':
        this.trainCanRecede = inputBool(value);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return this.disabled ? null : NET_TRAIN_WATCHER;
  }

  override writeNet(out: NetRecord): void {
    out.team = this.team;
    out.disabled = this.disabled;
    out.progress = this.totalProgress;
    out.speedLevel = this.trainSpeedLevel;
    out.recedeTime = this.recedeTime;
    out.numCappers = this.numCappers;
    out.train = this.train && !this.train.removed ? this.train.id : -1;
    out.alarm = this.alarm;
    out.trainDistance = this.trainDistanceFromStart;
    out.totalDistance = this.totalPathDistance;
  }
}

// ─── The cart dispenser ────────────────────────────────────────────────────

/** g_flDispenserHealRates / g_flDispenserAmmoRates by level. */
const DISPENSER_HEAL_RATES = [0, 10, 15, 20];
const DISPENSER_AMMO_RATES = [0, 0.2, 0.3, 0.4];
/** DISPENSER_DROP_METAL. */
const DISPENSER_DROP_METAL = 40;
/** DISPENSER_MAX_METAL_AMMO. */
const DISPENSER_MAX_METAL_AMMO = 400;
/** CObjectDispenser::GetDispenserRadius without an owner. */
const DISPENSER_RADIUS = 64;

/** dispenser_touch_trigger (CDispenserTouchTrigger): the volume a dispenser heals in. */
export class DispenserTouchTrigger extends BaseTrigger {
  override spawn(): void {
    super.spawn();
    this.spawnflags |= SF_TRIGGER_ALLOW_CLIENTS;
  }
}

/** mapobj_cart_dispenser (CObjectCartDispenser): an invisible, invulnerable level 1 dispenser riding the cart. */
export class CartDispenser extends MapEntity {
  level = 1;
  disabled = false;
  touchTrigger: BaseTrigger | null = null;
  metal = 25;
  private nextAmmoDispense = 0;
  private readonly healing: Player[] = [];
  private readonly dispenseThink: ThinkContext;
  private readonly refillThink: ThinkContext;
  private readonly scratch: Player[] = [];

  constructor(classname: string) {
    super(classname);
    this.dispenseThink = this.context(() => this.dispenseThinkFn());
    this.refillThink = this.context(() => this.refillThinkFn());
  }

  override spawn(): void {
    super.spawn();
    this.effects |= EF_NODRAW;
  }

  /** SDK: CObjectDispenser::OnGoActive (map-placed: active at once). */
  override activate(): void {
    super.activate();
    const name = this.kvString('touch_trigger');
    const t = name ? this.world.findByName(name) : null;
    if (t instanceof BaseTrigger) this.touchTrigger = t;
    else {
      this.touchTrigger = this.world.spawnEntity('dispenser_touch_trigger', (e) => {
        e.origin.x = this.origin.x;
        e.origin.y = this.origin.y;
        e.origin.z = this.origin.z;
        e.mins.x = e.mins.y = e.mins.z = -DISPENSER_RADIUS;
        e.maxs.x = e.maxs.y = e.maxs.z = DISPENSER_RADIUS;
      }) as BaseTrigger;
      const parent = this.world.entity(this.parent);
      if (parent) this.touchTrigger.setParent(parent);
    }
    this.metal = 25;
    this.setContextThink(this.refillThink, this.world.curtime + 3);
    this.setContextThink(this.dispenseThink, this.world.curtime + 0.1);
    this.nextAmmoDispense = this.world.curtime + 0.5;
  }

  override onRemove(): void {
    this.resetHealingTargets();
    super.onRemove();
  }

  /** SDK: CObjectDispenser::CouldHealTarget (cart dispensers ignore line of sight). */
  private couldHealTarget(p: Player): boolean {
    if (!p.alive) return false;
    let team = p.team;
    if (team !== this.team && p.cond.has(TF_COND.DISGUISED)) team = p.disguiseTeam;
    return team === this.team;
  }

  private startHealing(p: Player): void {
    if (this.healing.includes(p)) return;
    this.healing.push(p);
    // Heal(this, rate, overheal bonus 1.0 = no overheal, dispenser).
    p.addHealer(this.id, DISPENSER_HEAL_RATES[this.level], 1.0, true);
  }

  private stopHealing(p: Player): void {
    const i = this.healing.indexOf(p);
    if (i < 0) return;
    this.healing.splice(i, 1);
    if (!p.removed) p.removeHealer(this.id);
  }

  private resetHealingTargets(): void {
    for (let i = this.healing.length - 1; i >= 0; i--) this.stopHealing(this.healing[i]);
  }

  /** SDK: CObjectDispenser::DispenseAmmo (+ the cart's DispenseMetal that never spends its stock). */
  private dispenseAmmo(p: Player): boolean {
    const rate = DISPENSER_AMMO_RATES[this.level];
    let got = 0;
    got += p.giveAmmo(Math.trunc(p.maxAmmo[TF_AMMO.primary] * rate), TF_AMMO.primary);
    got += p.giveAmmo(Math.trunc(p.maxAmmo[TF_AMMO.secondary] * rate), TF_AMMO.secondary);
    got += p.giveAmmo(Math.min(this.metal, DISPENSER_DROP_METAL), TF_AMMO.metal);
    if (got > 0) this.world.emitSound('BaseCombatCharacter.AmmoPickup', { entity: this.id });
    return got > 0;
  }

  /** SDK: CObjectDispenser::DispenseThink. */
  private dispenseThinkFn(): void {
    const world = this.world;
    if (this.disabled) {
      this.resetHealingTargets();
      this.setContextThink(this.dispenseThink, world.curtime + 0.1);
      return;
    }
    const trig = this.touchTrigger && !this.touchTrigger.removed ? this.touchTrigger : null;
    const touching = this.scratch;
    touching.length = 0;
    if (trig) for (const e of trig.touching) if (e.isPlayer()) touching.push(e as Player);
    // Stop healing anyone who left or died.
    for (let i = this.healing.length - 1; i >= 0; i--) {
      const p = this.healing[i];
      if (p.removed || !touching.includes(p) || !this.couldHealTarget(p)) this.stopHealing(p);
    }
    const dispenseAmmo = this.nextAmmoDispense <= world.curtime;
    let received = false;
    for (const p of touching) {
      const valid = this.couldHealTarget(p);
      if (valid && !this.healing.includes(p)) this.startHealing(p);
      if (dispenseAmmo && valid && this.dispenseAmmo(p)) received = true;
    }
    if (dispenseAmmo) this.nextAmmoDispense = world.curtime + (received ? 1.0 : 0.1);
    this.setContextThink(this.dispenseThink, world.curtime + 0.1);
  }

  /** SDK: CObjectDispenser::RefillThink. */
  private refillThinkFn(): void {
    this.setContextThink(this.refillThink, this.world.curtime + 6);
    if (this.disabled) return;
    if (this.metal < DISPENSER_MAX_METAL_AMMO) {
      this.metal = Math.min(
        this.metal + DISPENSER_MAX_METAL_AMMO * 0.1 + (this.level - 1) * 10,
        DISPENSER_MAX_METAL_AMMO,
      );
    }
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'setdispenserlevel': {
        const l = atoi(value);
        if (l >= 1 && l <= 3) {
          this.level = l;
          for (const p of this.healing) p.addHealer(this.id, DISPENSER_HEAL_RATES[l], 1.0, true);
        }
        return true;
      }
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'firehalloweenbonus':
        for (const p of this.healing) p.cond.add(TF_COND.CRITBOOSTED_CTF_CAPTURE, atoi(value));
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

void TEAM_UNASSIGNED;
void ContextThinks;

registerEntityClass('team_train_watcher', TeamTrainWatcher);
registerEntityClass('mapobj_cart_dispenser', CartDispenser);
registerEntityClass('dispenser_touch_trigger', DispenserTouchTrigger);
