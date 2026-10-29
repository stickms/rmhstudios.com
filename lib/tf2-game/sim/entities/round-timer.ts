/**
 * team_round_timer (SDK: shared/teamplay_round_timer.cpp, CTeamRoundTimer):
 * the setup countdown and the round clock. Setup (RT_STATE_SETUP) runs
 * RoundTimerSetupThink and puts the rules in setup; when it reaches zero it
 * fires OnSetupFinished and switches to RT_STATE_NORMAL with the stored round
 * time. RoundTimerThink fires OnXMinRemain / OnXSecRemain once each and
 * OnFinished at zero — unless the rules say the timer may not expire yet
 * (TimerMayExpire: a capture in progress, a stolen flag, a cart waiting to
 * roll back), which holds it at zero in overtime. Time added on capture goes
 * through AddTimerSeconds (capped by max_length). The timer pauses itself
 * while the round has been won.
 */

import { TEAM_UNASSIGNED } from '../../core/constants';
import type { Entity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import type { NetRecord, NetSchema } from '../net-schema';
import { GR_STATE_RND_RUNNING, GR_STATE_TEAM_WIN } from '../rules';
import { MapEntity, atoi, type ThinkContext } from './base';
import { NET_ROUND_TIMER } from './net';
import { objectives, timerMayExpire, track, untrack } from './objectives';

export const RT_STATE_SETUP = 0;
export const RT_STATE_NORMAL = 1;

/** Think interval of both timer thinks. */
const ROUND_TIMER_THINK_INTERVAL = 0.05;

// Announcer sounds (CTeamRoundTimer::GetTimeWarningSound / SendTimeWarning, played client side in the SDK).
const ROUND_TIMER_TIME_ADDED = 'Announcer.TimeAdded';
const ROUND_TIMER_TIME_ADDED_LOSER = 'Announcer.TimeAddedForEnemy';
const ROUND_TIMER_TIME_ADDED_WINNER = 'Announcer.TimeAwardedForTeam';

/** One "OnXRemain" threshold. */
interface Warning {
  seconds: number;
  output: string;
  /** Also fired by the setup think. */
  setup: boolean;
}

const WARNINGS: readonly Warning[] = [
  { seconds: 300, output: 'On5MinRemain', setup: false },
  { seconds: 240, output: 'On4MinRemain', setup: false },
  { seconds: 180, output: 'On3MinRemain', setup: false },
  { seconds: 120, output: 'On2MinRemain', setup: false },
  { seconds: 60, output: 'On1MinRemain', setup: true },
  { seconds: 30, output: 'On30SecRemain', setup: true },
  { seconds: 10, output: 'On10SecRemain', setup: true },
  { seconds: 5, output: 'On5SecRemain', setup: true },
  { seconds: 4, output: 'On4SecRemain', setup: true },
  { seconds: 3, output: 'On3SecRemain', setup: true },
  { seconds: 2, output: 'On2SecRemain', setup: true },
  { seconds: 1, output: 'On1SecRemain', setup: true },
];

export class TeamRoundTimer extends MapEntity {
  timerPaused = false;
  /** m_flTimeRemaining (valid while paused). */
  timeRemaining = 0;
  /** m_flTimerEndTime (valid while running). */
  timerEndTime = 0;
  timerMaxLength = 0;
  disabled = false;
  showInHud = false;
  timerLength = 0;
  timerInitialLength = 0;
  autoCountdown = true;
  setupTimeLength = 0;
  timerState = RT_STATE_NORMAL;
  startPaused = true;
  showTimeRemaining = true;
  resetTimeOnRoundStart = false;
  /** Set on the two KOTH team timers. */
  kothTeam = 0;
  private timeToUseAfterSetupFinished = 0;
  private pauseDueToWin = false;
  private fireFinished = true;
  /** m_bFire5MinRemain … m_bFire1SecRemain, in WARNINGS order. */
  private readonly fireWarning = new Array<boolean>(WARNINGS.length).fill(true);
  private lastTime = 0;
  private readonly setupThink: ThinkContext;
  private readonly normalThink: ThinkContext;

  constructor(classname: string) {
    super(classname);
    this.setupThink = this.context(() => this.roundTimerSetupThink());
    this.normalThink = this.context(() => this.roundTimerThink());
  }

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'timer_length':
        this.timerInitialLength = atoi(value);
        return true;
      case 'max_length':
        this.timerMaxLength = atoi(value);
        return true;
      case 'show_in_hud':
        this.showInHud = atoi(value) !== 0;
        return true;
      case 'startdisabled':
        this.disabled = atoi(value) !== 0;
        return true;
      case 'auto_countdown':
        this.autoCountdown = atoi(value) !== 0;
        return true;
      case 'setup_length':
        this.setupTimeLength = atoi(value);
        return true;
      case 'reset_time':
        this.resetTimeOnRoundStart = atoi(value) !== 0;
        return true;
      case 'start_paused':
        this.startPaused = atoi(value) !== 0;
        return true;
      case 'show_time_remaining':
        this.showTimeRemaining = atoi(value) !== 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CTeamRoundTimer::Spawn. */
  override spawn(): void {
    super.spawn();
    track(objectives(this.world).timers, this);
    let time: number;
    if (this.setupTimeLength > 0) {
      time = this.setupTimeLength;
      this.setState(RT_STATE_SETUP);
    } else {
      time = this.timerInitialLength;
      this.setState(RT_STATE_NORMAL);
    }
    this.timeToUseAfterSetupFinished = this.timerInitialLength;
    if (this.disabled) {
      // Initialise the data before actually becoming disabled.
      this.disabled = false;
      this.pauseTimer();
      this.setTimeRemaining(time);
      this.disabled = true;
    } else {
      this.pauseTimer();
      this.setTimeRemaining(time);
    }
    this.timerLength = time;
  }

  /** SDK: CTeamRoundTimer::Activate. */
  override activate(): void {
    super.activate();
    if (this.showInHud) this.setActiveTimer(this);
  }

  override onRemove(): void {
    const o = objectives(this.world);
    untrack(o.timers, this);
    if (o.timerInHud === this) o.timerInHud = null;
    for (let t = 0; t < 4; t++) if (o.kothTimers[t] === this) o.kothTimers[t] = null;
    super.onRemove();
  }

  /** SDK: CTeamRoundTimer::GetTimeRemaining. */
  getTimeRemaining(): number {
    const t = this.timerPaused ? this.timeRemaining : this.timerEndTime - this.world.curtime;
    return t < 0 ? 0 : t;
  }

  getTimerMaxLength(): number {
    if (this.timerState === RT_STATE_SETUP) return this.setupTimeLength;
    return this.timerMaxLength ? this.timerMaxLength : this.timerLength;
  }

  /** SDK: CTeamRoundTimer::SetState. */
  setState(state: number, fireOutput = true): void {
    this.timerState = state;
    const rules = this.world.rules;
    if (state === RT_STATE_SETUP) {
      rules.setSetup(true);
      this.setContextThink(this.setupThink, this.world.curtime + ROUND_TIMER_THINK_INTERVAL);
      this.setContextThink(this.normalThink, -1);
      if (fireOutput) this.fireOutput('OnSetupStart', this);
    } else {
      rules.setSetup(false);
      this.setContextThink(this.normalThink, this.world.curtime + ROUND_TIMER_THINK_INTERVAL);
      this.setContextThink(this.setupThink, -1);
      if (fireOutput) this.fireOutput('OnRoundStart', this);
    }
  }

  /** SDK: CTeamRoundTimer::SetTimeRemaining. */
  setTimeRemaining(seconds: number): void {
    if (this.disabled) return;
    const s = this.timerMaxLength > 0 ? Math.min(seconds, this.timerMaxLength) : seconds;
    this.timeRemaining = s;
    this.timerEndTime = this.world.curtime + s;
    this.timerLength = s;
    this.calculateOutputMessages();
  }

  /** SDK: CTeamRoundTimer::CalculateOutputMessages — arm every threshold still ahead. */
  private calculateOutputMessages(): void {
    const t = this.getTimeRemaining();
    this.fireFinished = t > 0;
    for (let i = 0; i < WARNINGS.length; i++) this.fireWarning[i] = t >= WARNINGS[i].seconds;
  }

  /** SDK: CTeamRoundTimer::PauseTimer. */
  pauseTimer(): void {
    if (this.disabled) return;
    if (!this.timerPaused) {
      this.timerPaused = true;
      this.timeRemaining = this.timerEndTime - this.world.curtime;
    }
    this.pauseDueToWin = false;
  }

  /** SDK: CTeamRoundTimer::ResumeTimer. */
  resumeTimer(): void {
    if (this.disabled) return;
    if (this.timerPaused) {
      this.timerPaused = false;
      this.timerEndTime = this.world.curtime + this.timeRemaining;
    }
  }

  /** SDK: CTeamRoundTimer::AddTimerSeconds. */
  addTimerSeconds(secondsToAdd: number, teamResponsible = TEAM_UNASSIGNED): void {
    if (this.disabled) return;
    const rules = this.world.rules;
    if (rules.inStalemate()) return;
    if (rules.state !== GR_STATE_RND_RUNNING && rules.state !== GR_STATE_TEAM_WIN) return;
    let add = secondsToAdd;
    if (this.timerMaxLength > 0 && this.getTimeRemaining() + add > this.timerMaxLength) {
      add = this.timerMaxLength - this.getTimeRemaining();
    }
    if (this.timerPaused) this.timeRemaining += add;
    else this.timerEndTime += add;
    this.timerLength += add;
    this.calculateOutputMessages();
    const o = objectives(this.world);
    if (o.timerInHud === this || o.isKoth) {
      if (!rules.inStalemate() && rules.state !== GR_STATE_TEAM_WIN && !o.isKoth) {
        if (teamResponsible >= 2) {
          for (const team of [2, 3]) {
            this.world.events.push({
              type: 'sound',
              name:
                team === teamResponsible
                  ? ROUND_TIMER_TIME_ADDED_WINNER
                  : ROUND_TIMER_TIME_ADDED_LOSER,
              channel: 0,
              team,
            });
          }
        } else this.world.emitSound(ROUND_TIMER_TIME_ADDED);
      }
      if (this.showInHud)
        this.world.events.push({ type: 'round', kind: 'timer', state: rules.state, time: add });
    }
  }

  /** SDK: CTeamRoundTimer::SetActiveTimer — one timer shows in the HUD. */
  setActiveTimer(newlyActive: TeamRoundTimer | null): void {
    const o = objectives(this.world);
    let chosen: TeamRoundTimer | null = newlyActive;
    for (const t of o.timers) {
      if (t === newlyActive || t.removed) continue;
      if (!t.disabled && t.showInHud) {
        if (chosen) t.showInHud = false;
        else chosen = t;
      }
    }
    o.timerInHud = chosen;
  }

  /** SDK: CTeamRoundTimer::RoundTimerSetupThink. */
  private roundTimerSetupThink(): void {
    const world = this.world;
    const rules = world.rules;
    const lastTime = this.lastTime;
    this.lastTime = this.getTimeRemaining();
    if (this.disabled || this.timerPaused) {
      this.setContextThink(this.setupThink, world.curtime + ROUND_TIMER_THINK_INTERVAL);
      return;
    }
    const t = this.getTimeRemaining();
    rules.setOvertime(false);
    if (this.lastTime > 0 && Math.floor(lastTime) !== Math.floor(t) && this.showInHud) {
      world.events.push({ type: 'round', kind: 'timer', state: rules.state, time: Math.floor(t) });
    }
    if (t <= 0 && this.fireFinished) {
      this.fireOutput('OnSetupFinished', this);
      this.fireFinished = false;
      this.setState(RT_STATE_NORMAL);
      this.setTimeRemaining(this.timeToUseAfterSetupFinished);
      return;
    }
    this.fireNextWarning(t, true);
    this.setContextThink(this.setupThink, world.curtime + ROUND_TIMER_THINK_INTERVAL);
  }

  /** SDK: CTeamRoundTimer::RoundTimerThink. */
  private roundTimerThink(): void {
    const world = this.world;
    const rules = world.rules;
    if (this.disabled || this.timerPaused) {
      this.setContextThink(this.normalThink, world.curtime + ROUND_TIMER_THINK_INTERVAL);
      return;
    }
    if (rules.state === GR_STATE_TEAM_WIN) {
      if (!this.timerPaused) {
        this.pauseTimer();
        this.pauseDueToWin = true;
      }
      this.setContextThink(this.normalThink, world.curtime + ROUND_TIMER_THINK_INTERVAL);
      return;
    } else if (this.pauseDueToWin) {
      this.resumeTimer();
      this.pauseDueToWin = false;
    }
    const t = this.getTimeRemaining();
    if (t > 0 && this.showInHud) rules.setOvertime(false);
    if (t <= 0 && this.fireFinished) {
      if (!timerMayExpire(world)) {
        this.timerEndTime = world.curtime;
        // Entering overtime also tells the train watchers (the modes relay SetOvertime's InputOnStartOvertime).
        if (this.showInHud && !rules.inOvertime) rules.setOvertime(true);
        this.setContextThink(this.normalThink, world.curtime + ROUND_TIMER_THINK_INTERVAL);
        return;
      }
      this.fireOutput('OnFinished', this);
      this.fireFinished = false;
    } else {
      this.fireNextWarning(t, false);
    }
    this.setContextThink(this.normalThink, world.curtime + ROUND_TIMER_THINK_INTERVAL);
  }

  /** The if/else-if chain of the think functions: at most one threshold per think. */
  private fireNextWarning(t: number, setup: boolean): void {
    for (let i = 0; i < WARNINGS.length; i++) {
      const w = WARNINGS[i];
      if (setup && !w.setup) continue;
      if (t <= w.seconds && this.fireWarning[i]) {
        this.fireOutput(w.output, this);
        this.fireWarning[i] = false;
        return;
      }
    }
  }

  /** SDK: CTeamRoundTimer::InputRoundSpawn. */
  roundSpawn(): void {
    if (!this.resetTimeOnRoundStart && this.timerState === RT_STATE_NORMAL) {
      this.timeToUseAfterSetupFinished = Math.trunc(this.getTimeRemaining());
    } else {
      this.timeToUseAfterSetupFinished = this.timerInitialLength;
    }
    if (this.setupTimeLength > 0) {
      this.setState(RT_STATE_SETUP);
      this.setTimeRemaining(this.setupTimeLength);
    } else {
      this.setState(RT_STATE_NORMAL);
      this.setTimeRemaining(this.timeToUseAfterSetupFinished);
    }
    if (!this.startPaused) this.resumeTimer();
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'roundspawn':
        this.roundSpawn();
        return true;
      case 'pause':
        this.pauseTimer();
        return true;
      case 'resume':
        this.resumeTimer();
        return true;
      case 'settime':
        this.setTimeRemaining(atoi(value));
        return true;
      case 'addtime':
        this.addTimerSeconds(atoi(value));
        return true;
      case 'addteamtime': {
        const parts = value.trim().split(/\s+/);
        const team = atoi(parts[0]);
        const seconds = atoi(parts[1]);
        if (seconds !== 0) this.addTimerSeconds(seconds, team);
        return true;
      }
      case 'restart':
        this.setTimeRemaining(this.timerInitialLength);
        return true;
      case 'setmaxtime': {
        this.timerMaxLength = atoi(value);
        if (this.timerMaxLength > 0 && this.getTimeRemaining() > this.timerMaxLength)
          this.setTimeRemaining(this.timerMaxLength);
        return true;
      }
      case 'showinhud': {
        const show = atoi(value);
        if (this.showInHud && !show) {
          if (objectives(this.world).timerInHud === this) objectives(this.world).timerInHud = null;
          this.setActiveTimer(null);
        } else if (show === 1) {
          this.setActiveTimer(this);
          this.setState(this.timerState, false);
        }
        this.showInHud = show === 1;
        return true;
      }
      case 'autocountdown':
        this.autoCountdown = atoi(value) === 1;
        return true;
      case 'setsetuptime': {
        const s = atoi(value);
        if (s >= 0) this.setupTimeLength = s;
        if (!this.disabled && this.timerState === RT_STATE_SETUP)
          this.setTimeRemaining(this.setupTimeLength);
        return true;
      }
      case 'enable':
        this.disabled = false;
        this.resumeTimer();
        if (this.showInHud) this.setActiveTimer(this);
        return true;
      case 'disable':
        this.pauseTimer();
        this.disabled = true;
        if (this.showInHud) this.setActiveTimer(null);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return NET_ROUND_TIMER;
  }

  override writeNet(out: NetRecord): void {
    out.paused = this.timerPaused;
    out.timeRemaining = this.timeRemaining;
    out.endTime = this.timerEndTime;
    out.maxLength = this.timerMaxLength;
    out.disabled = this.disabled;
    out.showInHud = this.showInHud;
    out.timerLength = this.timerLength;
    out.initialLength = this.timerInitialLength;
    out.autoCountdown = this.autoCountdown;
    out.setupLength = this.setupTimeLength;
    out.state = this.timerState;
    out.startPaused = this.startPaused;
    out.showTimeRemaining = this.showTimeRemaining;
    out.kothTeam = this.kothTeam;
    out.active = objectives(this.world).timerInHud === this;
  }
}

registerEntityClass('team_round_timer', TeamRoundTimer);
