/**
 * Logic and rules entities (SDK: server/logicentities.cpp, server/logicauto.cpp,
 * server/tf/entity_roundwin.cpp, server/maprules.cpp, shared/tf/tf_gamerules.cpp):
 *
 * - logic_case, logic_compare, logic_branch, logic_multicompare,
 *   math_counter, math_remap, logic_timer — the map's arithmetic and branching.
 * - game_round_win (CTeamplayRoundWin), game_end (CGameEnd).
 * - tf_gamerules (CTFGameRulesProxy, replacing the core proxy): respawn wave
 *   inputs with the SDK's original-value bookkeeping, KOTH clock inputs,
 *   goal strings / roles, SetStalemateOnTimelimit, SetCTFCaptureBonusTime,
 *   SetRequiredObserverTarget, PlayVO*.
 * - tf_logic_koth (CKothLogic): creates the two team round timers at round
 *   spawn and locks the point until unlock_point seconds into the round.
 * - tf_logic_arena (CArenaLogic), tf_logic_competitive (inert outside
 *   competitive), logic_auto (the core one, honouring "globalstate").
 * - game_text / game_text_tf: HUD events.
 */

import { TEAM_UNASSIGNED, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { type Entity, PointEntity } from '../entity';
import { registerEntityClass } from '../entity-registry';
import { LogicAuto, TFGameRulesProxy } from '../logic';
import {
  GR_STATE_GAME_OVER,
  GR_STATE_STALEMATE,
  GR_STATE_TEAM_WIN,
  WINREASON_DEFEND_UNTIL_TIME_LIMIT,
  WINREASON_STALEMATE,
} from '../rules';
import { MapEntity, atof, atoi, formatFloat, type ThinkContext } from './base';
import {
  addTeamRespawnWaveTime,
  objectives,
  setTeamRespawnWaveTime,
  shouldScorePerRound,
} from './objectives';
import { TeamRoundTimer } from './round-timer';

/** MAX_LOGIC_CASES. */
const MAX_LOGIC_CASES = 16;

// ─── logic_case ────────────────────────────────────────────────────────────

export class LogicCase extends MapEntity {
  readonly cases = new Array<string>(MAX_LOGIC_CASES).fill('');

  override keyValue(key: string, value: string): boolean {
    const m = /^case(\d\d)$/.exec(key);
    if (m) {
      const i = atoi(m[1]) - 1;
      if (i >= 0 && i < MAX_LOGIC_CASES) this.cases[i] = value;
      return true;
    }
    return super.keyValue(key, value);
  }

  /** SDK: CLogicCase::InputValue — case-insensitive string match, else OnDefault. */
  inValue(value: string, activator: Entity | null): void {
    const v = value.toLowerCase();
    for (let i = 0; i < MAX_LOGIC_CASES; i++) {
      const c = this.cases[i];
      if (c !== '' && c.toLowerCase() === v) {
        this.fireOutput(`OnCase${String(i + 1).padStart(2, '0')}`, activator);
        return;
      }
    }
    this.fireOutput('OnDefault', activator, value);
  }

  /** SDK: CLogicCase::InputPickRandom(Shuffle) — deterministic via the world stream. */
  pickRandom(activator: Entity | null): void {
    const connected: number[] = [];
    for (let i = 0; i < MAX_LOGIC_CASES; i++) {
      const o = this.outputs.get(`oncase${String(i + 1).padStart(2, '0')}`);
      if (o && o.connected) connected.push(i);
    }
    if (connected.length === 0) return;
    const i = connected[this.world.random.randomInt(0, connected.length - 1)];
    this.fireOutput(`OnCase${String(i + 1).padStart(2, '0')}`, activator);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'invalue':
        this.inValue(value, activator);
        return true;
      case 'pickrandom':
      case 'pickrandomshuffle':
        this.pickRandom(activator);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── logic_compare ─────────────────────────────────────────────────────────

export class LogicCompare extends MapEntity {
  inValue = 0;
  compareValue = 0;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'initialvalue':
        this.inValue = atof(value);
        return true;
      case 'comparevalue':
        this.compareValue = atof(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CLogicCompare::DoCompare. */
  private doCompare(activator: Entity | null, value: number): void {
    const s = formatFloat(value);
    if (value === this.compareValue) this.fireOutput('OnEqualTo', activator, s);
    else {
      this.fireOutput('OnNotEqualTo', activator, s);
      if (value > this.compareValue) this.fireOutput('OnGreaterThan', activator, s);
      else this.fireOutput('OnLessThan', activator, s);
    }
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'setvalue':
        this.inValue = atof(value);
        return true;
      case 'setvaluecompare':
        this.inValue = atof(value);
        this.doCompare(activator, this.inValue);
        return true;
      case 'setcomparevalue':
        this.compareValue = atof(value);
        return true;
      case 'compare':
        this.doCompare(activator, this.inValue);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── logic_branch ──────────────────────────────────────────────────────────

export class LogicBranch extends MapEntity {
  value = false;

  override keyValue(key: string, value: string): boolean {
    if (key === 'initialvalue') {
      this.value = atoi(value) !== 0;
      return true;
    }
    return super.keyValue(key, value);
  }

  private test(activator: Entity | null): void {
    this.fireOutput(this.value ? 'OnTrue' : 'OnFalse', activator);
  }

  private update(v: boolean, activator: Entity | null): void {
    if (this.value !== v) {
      this.value = v;
      // CLogicBranch::UpdateValue notifies logic_branch_listeners; none in these maps.
    }
    void activator;
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'setvalue':
        this.update(atoi(value) !== 0, activator);
        return true;
      case 'setvaluetest':
        this.update(atoi(value) !== 0, activator);
        this.test(activator);
        return true;
      case 'toggle':
        this.update(!this.value, activator);
        return true;
      case 'toggletest':
        this.update(!this.value, activator);
        this.test(activator);
        return true;
      case 'test':
        this.test(activator);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── logic_multicompare ────────────────────────────────────────────────────

/** logic_multicompare (CLogicCompareInteger): fires OnEqual when every input value matched. */
export class LogicMultiCompare extends MapEntity {
  private readonly values: number[] = [];
  private shouldCompareToValue = false;
  private compareValue = 0;

  override keyValue(key: string, value: string): boolean {
    if (key === 'integervalue') {
      this.compareValue = atoi(value);
      this.shouldCompareToValue = true;
      return true;
    }
    if (key === 'shouldcomparetovalue') {
      this.shouldCompareToValue = atoi(value) !== 0;
      return true;
    }
    return super.keyValue(key, value);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'invalue':
        if (this.values.length < 32) this.values.push(atoi(value));
        return true;
      case 'compareintegers': {
        let equal = this.values.length > 0;
        const ref = this.shouldCompareToValue ? this.compareValue : this.values[0];
        for (const v of this.values) if (v !== ref) equal = false;
        this.fireOutput(equal ? 'OnEqual' : 'OnNotEqual', activator);
        this.values.length = 0;
        return true;
      }
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── math_counter ──────────────────────────────────────────────────────────

export class MathCounter extends MapEntity {
  value = 0;
  min = 0;
  max = 0;
  disabled = false;
  private hitMin = false;
  private hitMax = false;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'startvalue':
        this.value = atoi(value);
        return true;
      case 'min':
        this.min = atof(value);
        return true;
      case 'max':
        this.max = atof(value);
        return true;
      case 'startdisabled':
        this.disabled = atoi(value) !== 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CMathCounter::Spawn. */
  override spawn(): void {
    super.spawn();
    if (this.min > this.max) {
      const t = this.max;
      this.max = this.min;
      this.min = t;
    }
    if (this.min !== 0 || this.max !== 0)
      this.value = Math.max(this.min, Math.min(this.max, this.value));
  }

  /** SDK: CMathCounter::UpdateOutValue. */
  private update(activator: Entity | null, v: number): void {
    let nv = v;
    if (this.min !== 0 || this.max !== 0) {
      if (nv >= this.max) {
        if (!this.hitMax) {
          this.hitMax = true;
          this.fireOutput('OnHitMax', activator);
        }
      } else this.hitMax = false;
      if (nv <= this.min) {
        if (!this.hitMin) {
          this.hitMin = true;
          this.fireOutput('OnHitMin', activator);
        }
      } else this.hitMin = false;
      nv = Math.max(this.min, Math.min(this.max, nv));
    }
    this.value = nv;
    this.fireOutput('OutValue', activator, formatFloat(nv));
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    const v = atof(value);
    switch (input.toLowerCase()) {
      case 'add':
        if (!this.disabled) this.update(activator, this.value + v);
        return true;
      case 'subtract':
        if (!this.disabled) this.update(activator, this.value - v);
        return true;
      case 'multiply':
        if (!this.disabled) this.update(activator, this.value * v);
        return true;
      case 'divide':
        if (!this.disabled) this.update(activator, v !== 0 ? this.value / v : this.value);
        return true;
      case 'setvalue':
        if (!this.disabled) this.update(activator, v);
        return true;
      case 'setvaluenofire':
        if (!this.disabled)
          this.value =
            this.min !== 0 || this.max !== 0 ? Math.max(this.min, Math.min(this.max, v)) : v;
        return true;
      case 'sethitmax':
        this.max = v;
        if (this.max < this.min) this.min = this.max;
        this.update(activator, this.value);
        return true;
      case 'sethitmin':
        this.min = v;
        if (this.max < this.min) this.max = this.min;
        this.update(activator, this.value);
        return true;
      case 'getvalue':
        this.fireOutput('OnGetValue', activator, formatFloat(this.value));
        return true;
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

// ─── math_remap ────────────────────────────────────────────────────────────

const SF_MATH_REMAP_IGNORE_OUT_OF_RANGE = 1;
const SF_MATH_REMAP_CLAMP_OUTPUT_TO_RANGE = 2;

export class MathRemap extends MapEntity {
  inMin = 0;
  inMax = 1;
  out1 = 0;
  out2 = 1;
  enabled = true;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'in1':
        this.inMin = atof(value);
        return true;
      case 'in2':
        this.inMax = atof(value);
        return true;
      case 'out1':
        this.out1 = atof(value);
        return true;
      case 'out2':
        this.out2 = atof(value);
        return true;
      case 'startdisabled':
        this.enabled = atoi(value) === 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CMathRemap::InputValue. */
  inValue(v: number, activator: Entity | null): void {
    const clamped = Math.max(this.inMin, Math.min(this.inMax, v));
    if (clamped === v || !(this.spawnflags & SF_MATH_REMAP_IGNORE_OUT_OF_RANGE)) {
      let r = this.out1 + ((v - this.inMin) * (this.out2 - this.out1)) / (this.inMax - this.inMin);
      if (this.spawnflags & SF_MATH_REMAP_CLAMP_OUTPUT_TO_RANGE) {
        const lo = Math.min(this.out1, this.out2);
        const hi = Math.max(this.out1, this.out2);
        r = Math.max(lo, Math.min(hi, r));
      }
      if (this.enabled) this.fireOutput('OutValue', activator, formatFloat(Math.fround(r)));
    }
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'invalue':
        this.inValue(atof(value), activator);
        return true;
      case 'enable':
        this.enabled = true;
        return true;
      case 'disable':
        this.enabled = false;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── logic_timer ───────────────────────────────────────────────────────────

const SF_TIMER_UPDOWN = 1;

/** logic_timer (CTimerEntity): OnTimer every RefireTime (or a random LowerRandomBound…UpperRandomBound). */
export class LogicTimer extends MapEntity {
  refireTime = 0;
  lowerRandom = 0;
  upperRandom = 0;
  useRandomTime = false;
  disabled = false;
  upDownState = false;
  private readonly timerCtx: ThinkContext;

  constructor(classname: string) {
    super(classname);
    this.timerCtx = this.context(() => this.fire());
  }

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'refiretime':
        this.refireTime = atof(value);
        return true;
      case 'lowerrandombound':
        this.lowerRandom = atof(value);
        return true;
      case 'upperrandombound':
        this.upperRandom = atof(value);
        return true;
      case 'userandomtime':
        this.useRandomTime = atoi(value) !== 0;
        return true;
      case 'startdisabled':
        this.disabled = atoi(value) !== 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    if (!this.useRandomTime && this.refireTime < 0.01) this.refireTime = 0.01;
    if (!this.disabled) this.reset();
  }

  private interval(): number {
    if (this.useRandomTime)
      return this.world.random.randomFloat(this.lowerRandom, this.upperRandom);
    return this.refireTime;
  }

  private reset(): void {
    this.setContextThink(this.timerCtx, this.world.curtime + this.interval());
  }

  private fire(): void {
    if (this.disabled) return;
    if (this.spawnflags & SF_TIMER_UPDOWN) {
      this.fireOutput(this.upDownState ? 'OnTimerHigh' : 'OnTimerLow', this);
      this.upDownState = !this.upDownState;
    } else this.fireOutput('OnTimer', this);
    this.reset();
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        this.reset();
        return true;
      case 'disable':
        this.disabled = true;
        this.setContextThink(this.timerCtx, -1);
        return true;
      case 'toggle':
        return this.acceptInput(this.disabled ? 'Enable' : 'Disable', value, activator, caller);
      case 'firetimer':
        this.fireOutput('OnTimer', activator);
        this.reset();
        return true;
      case 'refiretime':
        this.refireTime = atof(value);
        this.reset();
        return true;
      case 'resettimer':
        this.reset();
        return true;
      case 'lowerrandombound':
        this.lowerRandom = atof(value);
        return true;
      case 'upperrandombound':
        this.upperRandom = atof(value);
        return true;
      case 'addtotimer':
        if (this.timerCtx.at >= 0)
          this.setContextThink(this.timerCtx, this.timerCtx.at + atof(value));
        return true;
      case 'subtractfromtimer':
        if (this.timerCtx.at >= 0)
          this.setContextThink(
            this.timerCtx,
            Math.max(this.world.curtime, this.timerCtx.at - atof(value)),
          );
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── game_round_win / game_end ─────────────────────────────────────────────

export class GameRoundWin extends MapEntity {
  forceMapReset = false;
  switchTeamsOnWin = false;
  winReason = WINREASON_DEFEND_UNTIL_TIME_LIMIT;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'force_map_reset':
        this.forceMapReset = atoi(value) !== 0;
        return true;
      case 'switch_teams':
        this.switchTeamsOnWin = atoi(value) !== 0;
        return true;
      case 'win_reason':
        this.winReason = atoi(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CTeamplayRoundWin::RoundWin. */
  roundWin(): void {
    const rules = this.world.rules;
    const team = this.team;
    if (team > 1) {
      rules.setWinningTeam(
        team,
        this.winReason,
        this.forceMapReset,
        this.forceMapReset && this.switchTeamsOnWin,
        !shouldScorePerRound(this.world),
      );
      const m = objectives(this.world).master();
      if (m && !this.forceMapReset) m.roundEndPending = true;
    } else rules.setStalemate(WINREASON_STALEMATE, this.forceMapReset);
    this.fireOutput('OnRoundWin', this);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'roundwin':
        this.roundWin();
        return true;
      case 'setteam':
        this.changeTeam(atoi(value));
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** game_end (CGameEnd): ends the match. A looping room starts a fresh game after the bonus round. */
export class GameEnd extends MapEntity {
  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    if (input.toLowerCase() === 'endgame') {
      const rules = this.world.rules;
      rules.gameOver = true;
      if (rules.state !== GR_STATE_TEAM_WIN && !rules.options.loopForever)
        rules.transition(GR_STATE_GAME_OVER);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

// ─── tf_gamerules ──────────────────────────────────────────────────────────

/** CTFGameRulesProxy with the objective inputs (overrides the core proxy registration). */
export class TFGameRulesProxyEx extends TFGameRulesProxy {
  override spawn(): void {
    super.spawn();
    const o = objectives(this.world);
    if (this.kv && this.kv.has('ctf_overtime'))
      o.ctfOvertimeAllowed = this.kvBool('ctf_overtime', true);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    const world = this.world;
    const o = objectives(world);
    const v = atof(value);
    switch (input.toLowerCase()) {
      case 'setredteamrespawnwavetime':
        setTeamRespawnWaveTime(world, TF_TEAM_RED, v);
        return true;
      case 'setblueteamrespawnwavetime':
        setTeamRespawnWaveTime(world, TF_TEAM_BLUE, v);
        return true;
      case 'addredteamrespawnwavetime':
        addTeamRespawnWaveTime(world, TF_TEAM_RED, v);
        return true;
      case 'addblueteamrespawnwavetime':
        addTeamRespawnWaveTime(world, TF_TEAM_BLUE, v);
        return true;
      case 'setredkothclockactive':
        o.kothTimers[TF_TEAM_BLUE]?.pauseTimer();
        o.kothTimers[TF_TEAM_RED]?.resumeTimer();
        return true;
      case 'setbluekothclockactive':
        o.kothTimers[TF_TEAM_BLUE]?.resumeTimer();
        o.kothTimers[TF_TEAM_RED]?.pauseTimer();
        return true;
      case 'setredteamgoalstring':
        o.teamGoal[TF_TEAM_RED] = value;
        return true;
      case 'setblueteamgoalstring':
        o.teamGoal[TF_TEAM_BLUE] = value;
        return true;
      case 'setredteamrole':
        o.teamRole[TF_TEAM_RED] = atoi(value);
        return true;
      case 'setblueteamrole':
        o.teamRole[TF_TEAM_BLUE] = atoi(value);
        return true;
      case 'setstalemateontimelimit':
        o.stalemateOnTimelimit = atoi(value) !== 0;
        return true;
      case 'setctfcapturebonustime':
        o.ctfCaptureBonusTime = v;
        return true;
      case 'setrequiredobservertarget': {
        const e = value ? world.findByName(value) : null;
        o.requiredObserverTarget = e ? e.id : -1;
        return true;
      }
      case 'playvo':
        if (value) world.emitSound(value);
        return true;
      case 'playvored':
        if (value) world.events.push({ type: 'sound', name: value, channel: 0, team: TF_TEAM_RED });
        return true;
      case 'playvoblue':
        if (value)
          world.events.push({ type: 'sound', name: value, channel: 0, team: TF_TEAM_BLUE });
        return true;
      case 'setroundrespawnfreezeenabled':
      case 'handlemapevent':
      case 'setcustomupgradesfile':
      case 'setmapforcedtruceduringbossfight':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── tf_logic_koth ─────────────────────────────────────────────────────────

export class KothLogic extends MapEntity {
  timerInitialLength = 180;
  timeToUnlockPoint = 30;
  redTimer: TeamRoundTimer | null = null;
  blueTimer: TeamRoundTimer | null = null;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'timer_length':
        this.timerInitialLength = atoi(value);
        return true;
      case 'unlock_point':
        this.timeToUnlockPoint = atoi(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CKothLogic::InputRoundSpawn — the two team timers. */
  private roundSpawn(): void {
    const world = this.world;
    const o = objectives(world);
    if (!o.isKoth) return;
    const make = (team: number, name: string): TeamRoundTimer => {
      const t = world.spawnEntity('team_round_timer', (e) => {
        e.targetname = name;
      }) as TeamRoundTimer;
      t.kothTeam = team;
      t.showInHud = true;
      t.setTimeRemaining(this.timerInitialLength);
      t.pauseTimer();
      o.kothTimers[team] = t;
      return t;
    };
    this.blueTimer = make(TF_TEAM_BLUE, 'zz_blue_koth_timer');
    this.redTimer = make(TF_TEAM_RED, 'zz_red_koth_timer');
  }

  /** SDK: CKothLogic::InputRoundActivate — lock every point, unlock after unlock_point seconds. */
  private roundActivate(): void {
    const o = objectives(this.world);
    if (!o.isKoth) return;
    const m = o.master();
    if (!m) return;
    const v = String(this.timeToUnlockPoint);
    for (const p of m.controlPoints) {
      p.acceptInput('SetLocked', v, null, null);
      if (this.timeToUnlockPoint > 0) p.acceptInput('SetUnlockTime', v, null, null);
    }
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
      case 'roundactivate':
        this.roundActivate();
        return true;
      case 'setredtimer':
        if (objectives(this.world).isKoth) this.redTimer?.setTimeRemaining(atoi(value));
        return true;
      case 'setbluetimer':
        if (objectives(this.world).isKoth) this.blueTimer?.setTimeRemaining(atoi(value));
        return true;
      case 'addredtimer':
        if (objectives(this.world).isKoth) this.redTimer?.addTimerSeconds(atoi(value));
        return true;
      case 'addbluetimer':
        if (objectives(this.world).isKoth) this.blueTimer?.addTimerSeconds(atoi(value));
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── tf_logic_arena ────────────────────────────────────────────────────────

export class ArenaLogic extends MapEntity {
  timeToEnableCapPoint = 60;
  private firedOutput = false;
  private readonly arenaThink: ThinkContext;

  constructor(classname: string) {
    super(classname);
    this.arenaThink = this.context(() => this.arenaLogicThink());
  }

  override keyValue(key: string, value: string): boolean {
    if (key === 'capenabledelay') {
      this.timeToEnableCapPoint = atof(value);
      return true;
    }
    return super.keyValue(key, value);
  }

  override spawn(): void {
    super.spawn();
    this.setContextThink(this.arenaThink, this.world.curtime);
  }

  /** SDK: CArenaLogic::ArenaLogicThink. */
  private arenaLogicThink(): void {
    const world = this.world;
    this.setContextThink(this.arenaThink, world.curtime + 0.1);
    if (world.rules.state !== GR_STATE_STALEMATE) return;
    if (objectives(world).arenaCapEnableTime <= world.curtime && !this.firedOutput) {
      this.firedOutput = true;
      this.fireOutput('OnCapEnabled', this);
    }
  }

  /** CTFGameRules::SetupOnStalemateStart's arena branch. */
  onArenaRoundStart(): void {
    const world = this.world;
    this.firedOutput = false;
    this.fireOutput('OnArenaRoundStart', this);
    objectives(world).arenaCapEnableTime = world.curtime + this.timeToEnableCapPoint;
    world.emitSound('Announcer.AM_RoundStartRandom');
  }
}

// ─── logic_auto with globalstate ───────────────────────────────────────────

/** logic_auto honouring "globalstate": no global state is ever on here, so those never fire (e.g. is_console). */
export class LogicAutoEx extends LogicAuto {
  override activate(): void {
    if (this.kvString('globalstate') !== '') {
      // CLogicAuto::Think: if (!m_globalstate || GlobalEntity_GetState(m_globalstate) == GLOBAL_ON) …
      this.setThink(null, -1);
      return;
    }
    super.activate();
  }
}

// ─── game_text / game_text_tf ──────────────────────────────────────────────

const SF_ENVTEXT_ALLPLAYERS = 0x0001;

/** game_text (CGameText): Display shows `message` for holdtime to the activator, or everyone. */
export class GameText extends MapEntity {
  message = '';

  override keyValue(key: string, value: string): boolean {
    if (key === 'message') {
      this.message = value;
      return true;
    }
    return super.keyValue(key, value);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'display': {
        const msg = this.message.replace(/\\n/g, '\n');
        const hold =
          this.kvNumber('holdtime', 2) + this.kvNumber('fadein', 0) + this.kvNumber('fadeout', 0);
        const all = (this.spawnflags & SF_ENVTEXT_ALLPLAYERS) !== 0;
        if (all || !activator || !activator.isPlayer())
          this.world.events.push({ type: 'hud', kind: 'text', key: msg, holdTime: hold });
        else
          this.world.events.push({
            type: 'hud',
            kind: 'text',
            key: msg,
            holdTime: hold,
            to: activator.id,
          });
        return true;
      }
      case 'settext':
        this.message = value;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** game_text_tf (CTFHudNotify): an announcement panel for a team (display_to_team) or everyone. */
export class GameTextTF extends MapEntity {
  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    if (input.toLowerCase() === 'display') {
      const team = this.kvNumber('display_to_team', 0);
      const msg = this.kvString('message');
      const icon = this.kvString('icon');
      if (team === TF_TEAM_RED || team === TF_TEAM_BLUE)
        this.world.events.push({ type: 'hud', kind: 'announce', key: msg, params: [icon], team });
      else this.world.events.push({ type: 'hud', kind: 'announce', key: msg, params: [icon] });
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** tf_logic_competitive: its outputs fire only in competitive matches (not hosted here). */
export class CompetitiveLogic extends MapEntity {}

void TEAM_UNASSIGNED;
void PointEntity;

registerEntityClass('logic_case', LogicCase);
registerEntityClass('logic_compare', LogicCompare);
registerEntityClass('logic_branch', LogicBranch);
registerEntityClass('logic_multicompare', LogicMultiCompare);
registerEntityClass('math_counter', MathCounter);
registerEntityClass('math_remap', MathRemap);
registerEntityClass('logic_timer', LogicTimer);
registerEntityClass('game_round_win', GameRoundWin);
registerEntityClass('game_end', GameEnd);
registerEntityClass('tf_logic_koth', KothLogic);
registerEntityClass('tf_logic_arena', ArenaLogic);
registerEntityClass('tf_logic_competitive', CompetitiveLogic);
registerEntityClass('game_text', GameText);
registerEntityClass('game_text_tf', GameTextTF);

/** Re-registers the classes that override core registrations. */
export function registerLogicOverrides(): void {
  registerEntityClass('tf_gamerules', TFGameRulesProxyEx);
  registerEntityClass('logic_auto', LogicAutoEx);
}
registerLogicOverrides();
