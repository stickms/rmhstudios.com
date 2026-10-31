/**
 * Balatro multiplayer — the timer model (TIM-02…TIM-09, A1 §6).
 *
 *     timerStep(state, input) → { state, view, emits }
 *
 * A PURE machine; every peer runs its own (clocks are local, peers exchange
 * `time` values — §0.2). The driver (WS5) feeds it wall-clock ticks from
 * `performance.now()` (so a hidden tab keeps counting, TIM-09), Lua flags,
 * HUD presses, the opponent's `timer` wire messages and referee outcomes;
 * it sends `send_timer` emits over the wire, forwards `fail_*` to the
 * referee as game events and the view to Lua as `timer_state`.
 *
 * Modes (from `ResolvedRuleset.timer.mode`, plus the `pvp_timer` layer via
 * `pvpBase`):
 * - default ante timer (§6.2): only a *ready* player may press; the pressed
 *   opponent adopts the presser's value; both clocks tick while pressed,
 *   except a ready player who is only being timered; at 0 a timered player
 *   is forgiven (`forgiveness` per match) or fails (`fail_timer`); an own
 *   skip adds `increment` when nobody is timering.
 * - PvP timer (§6.3, `pvpBase` non-null, during a PvP blind only): press
 *   only when ahead (or tied and first, and — with hide-score — after the
 *   first info); every score update auto-cancels the side that is no longer
 *   behind/ahead; ticks only while being timered with hands left; at 0 →
 *   `fail_pvp_timer`; the referee's `timer_hand_lost` adds `pvpHandIncrement`.
 *   Each own hand on the PvP blind adds `pvpHandIncrement`.
 * - pressure (§6.4): auto-ticks in normal play (not while ready, not on
 *   PvP); ×2 speed while timered; fails at 0 regardless; +increment on an
 *   opponent's skip; +`pressurePlusHand` per own normal-blind hand.
 * - no_animation (§6.5): ticks only while being timered and not ready, and
 *   never during animations; +increment on an opponent's skip.
 * - speedlatro (§6.6): its own 147 s clock (">>"); 73.5 s at PvP start with
 *   a 4 s grace; on PvP it ticks only while behind; ×2 when timered outside
 *   PvP; `fail_timer` once per cycle at 0.
 * - Animation budget (§6.7) for pvp/pressure: while ticking during a
 *   non-interactive animation (and not paused) time is drawn from a 40 s
 *   budget first, refilled at 2.5 s per real second.
 * - `timer_display_threshold` (§6.5, Major League): above the threshold and
 *   unstarted the display shows the threshold; a press above it is only
 *   announced when the clock falls to it (with the threshold value).
 *
 * - Score Preview cost (M03, the mod's layer `preview_calculate_cost`): a
 *   calculation outside PvP costs 3.5 s under pressure / no_animation (free
 *   otherwise), only while nobody is timering, not consumed, and only above
 *   max(10 s, cost) — it never kills the clock.
 *
 * Reconstruction: the PvP timer's receiver does not adopt the presser's
 * value (each player's PvP clock is their own budget, +10 s per own hand);
 * the ante timer's receiver does (TIM-02).
 */

import type { LobbyOptions, ResolvedRuleset } from '../types';

export const TIMER_CONSTANTS = {
  SPEEDLATRO_BASE: 147,
  SPEEDLATRO_PVP: 73.5,
  SPEEDLATRO_GRACE: 4,
  ANIM_BUDGET_CAP: 40,
  ANIM_BUDGET_REFILL_PER_S: 2.5,
  PRESSURE_SPEEDUP: 2,
  SPEEDLATRO_SPEEDUP: 2,
  /** TIM-01: whole seconds above this, one decimal at or below. */
  DECIMAL_BELOW: 9.95,
  /** M03: a Score Preview calculation's cost (pressure / no_animation) and the floor it keeps. */
  PREVIEW_COST: 3.5,
  PREVIEW_FLOOR: 10,
} as const;

export type CueMode = 'always' | 'once' | 'off';

export interface TimerConfig {
  enabled: boolean;
  /** Effective ante-timer base (layer multiplier applied). */
  base: number;
  increment: number;
  forgiveness: number;
  pvpBase: number | null;
  pvpHandIncrement: number;
  mode: ResolvedRuleset['timer']['mode'];
  pressurePlusHand: number;
  displayThreshold: number | null;
  hideScoreUntilPlayed: boolean;
  cue: CueMode;
  /** `timer_speedup_multiplier` for the default ante timer while timered. */
  speedup: number;
}

export function timerConfigFrom(
  resolved: ResolvedRuleset,
  options?: Pick<LobbyOptions, 'hideScoreUntilPlayed'>,
  cue: CueMode = 'always',
): TimerConfig {
  const t = resolved.timer;
  return {
    enabled: t.enabled,
    base: t.base,
    increment: t.increment,
    forgiveness: t.forgiveness,
    pvpBase: t.pvpBase,
    pvpHandIncrement: t.pvpHandIncrement,
    mode: t.mode,
    pressurePlusHand: t.pressurePlusHand,
    displayThreshold: resolved.flags.timerDisplayThreshold,
    hideScoreUntilPlayed: options?.hideScoreUntilPlayed ?? false,
    cue,
    speedup: 1,
  };
}

export interface TimerFlags {
  ready: boolean;
  countdown: boolean;
  animBusy: boolean;
  paused: boolean;
  roundEval: boolean;
  newRound: boolean;
  handsLeft: number;
}

export interface TimerModelState {
  cfg: TimerConfig;
  value: number;
  /** Last tick time (ms), null before the first tick. */
  now: number | null;
  timering: boolean;
  beingTimered: boolean;
  consumed: boolean;
  forgiven: number;
  onPvp: boolean;
  pvpEnded: boolean;
  awaitingHandLost: boolean;
  /** A press above the display threshold that has not been announced yet. */
  pendingAnnounce: boolean;
  animBudget: number;
  cuedThisCycle: boolean;
  suspended: boolean;
  grace: number;
  flags: TimerFlags;
  score: { me: number; them: number; first: boolean; gotInfo: boolean };
}

export type TimerInput =
  | { t: 'tick'; now: number }
  | { t: 'flags'; flags: Partial<TimerFlags> & { state?: string } }
  | { t: 'press' }
  | { t: 'remote'; op: 'start' | 'pause'; time: number; isPvP: boolean }
  | { t: 'skip' }
  | { t: 'opp_skip' }
  | { t: 'hand_played' }
  /** A Score Preview calculation (M03). */
  | { t: 'preview' }
  | { t: 'pvp_start' }
  | { t: 'pvp_end' }
  | { t: 'score'; me: number; them: number; first: boolean; gotInfo?: boolean }
  /** The referee confirmed my PvP-timer hand loss (`timer_hand_lost` for me). */
  | { t: 'hand_lost' }
  /** Disconnect / reconnect overlays stop the clock (TIM-02). */
  | { t: 'suspend'; on: boolean };

export type TimerEmit =
  | { t: 'send_timer'; op: 'start' | 'pause'; time: number; isPvP: boolean }
  | { t: 'fail_timer' }
  | { t: 'fail_pvp_timer' }
  | { t: 'cue' };

export interface TimerView {
  value: number;
  mode: 'ante' | 'pvp' | 'speedlatro';
  ticking: boolean;
  beingTimered: boolean;
  timering: boolean;
  pressable: boolean;
  auto: boolean;
  color: 'normal' | 'orange' | 'important';
  display: '>>' | null;
}

export interface TimerStep {
  state: TimerModelState;
  view: TimerView;
  emits: TimerEmit[];
}

export function timerInit(cfg: TimerConfig, now: number | null = null): TimerModelState {
  return {
    cfg: { ...cfg },
    value: cfg.mode === 'speedlatro' ? TIMER_CONSTANTS.SPEEDLATRO_BASE : cfg.base,
    now,
    timering: false,
    beingTimered: false,
    consumed: false,
    forgiven: 0,
    onPvp: false,
    pvpEnded: false,
    awaitingHandLost: false,
    pendingAnnounce: false,
    animBudget: TIMER_CONSTANTS.ANIM_BUDGET_CAP,
    cuedThisCycle: false,
    suspended: false,
    grace: 0,
    flags: {
      ready: false,
      countdown: false,
      animBusy: false,
      paused: false,
      roundEval: false,
      newRound: false,
      handsLeft: 0,
    },
    score: { me: 0, them: 0, first: false, gotInfo: false },
  };
}

/* ─── Derived predicates ─────────────────────────────────────────────────── */

function pvpTimerActive(s: TimerModelState): boolean {
  return s.onPvp && s.cfg.pvpBase !== null && s.cfg.mode !== 'speedlatro';
}

function ahead(s: TimerModelState): boolean {
  return s.score.me > s.score.them || (s.score.me === s.score.them && s.score.first);
}

export function isTicking(s: TimerModelState): boolean {
  const c = s.cfg;
  const f = s.flags;
  if (!c.enabled || s.suspended || s.value <= 0 || f.countdown) return false;
  if (c.mode === 'speedlatro') {
    if (s.consumed) return false;
    if (s.onPvp) return f.handsLeft > 0 && s.score.me < s.score.them && s.grace <= 0;
    return !f.ready;
  }
  if (s.onPvp) {
    if (!pvpTimerActive(s)) return false;
    return s.beingTimered && f.handsLeft > 0 && !f.roundEval && !f.newRound && !s.pvpEnded;
  }
  if (s.consumed) return false;
  switch (c.mode) {
    case 'pressure':
      return !f.ready || s.beingTimered;
    case 'no_animation':
      return s.beingTimered && !f.ready && !f.animBusy;
    default:
      return (s.timering || s.beingTimered) && !(f.ready && s.beingTimered && !s.timering);
  }
}

function speedOf(s: TimerModelState): number {
  if (!s.beingTimered || s.onPvp) return 1;
  if (s.cfg.mode === 'pressure') return TIMER_CONSTANTS.PRESSURE_SPEEDUP;
  if (s.cfg.mode === 'speedlatro') return TIMER_CONSTANTS.SPEEDLATRO_SPEEDUP;
  if (s.cfg.mode === 'default') return s.cfg.speedup;
  return 1;
}

function usesAnimBudget(s: TimerModelState): boolean {
  return pvpTimerActive(s) || (!s.onPvp && s.cfg.mode === 'pressure');
}

export function isPressable(s: TimerModelState): boolean {
  const c = s.cfg;
  const f = s.flags;
  if (!c.enabled || s.suspended || s.value <= 0 || s.beingTimered || s.timering || f.countdown)
    return false;
  if (s.onPvp) {
    if (!pvpTimerActive(s)) return false;
    if (s.pvpEnded || f.roundEval || f.newRound || s.awaitingHandLost) return false;
    if (c.hideScoreUntilPlayed && !s.score.gotInfo) return false;
    return ahead(s);
  }
  return f.ready && !s.consumed;
}

function isAuto(s: TimerModelState): boolean {
  return !s.onPvp && s.cfg.mode === 'pressure' && !s.beingTimered && isTicking(s);
}

export function timerView(s: TimerModelState): TimerView {
  const ticking = isTicking(s);
  const pressable = isPressable(s);
  const auto = isAuto(s);
  const th = s.cfg.displayThreshold;
  const value =
    th !== null && !s.onPvp && s.value > th && (!s.timering || s.pendingAnnounce) && !s.beingTimered
      ? th
      : s.value;
  return {
    value: Math.max(0, value),
    mode: s.cfg.mode === 'speedlatro' ? 'speedlatro' : pvpTimerActive(s) ? 'pvp' : 'ante',
    ticking,
    beingTimered: s.beingTimered,
    timering: s.timering,
    pressable,
    auto,
    color: auto ? 'orange' : ticking ? 'important' : pressable ? 'orange' : 'normal',
    display: s.cfg.mode === 'speedlatro' ? '>>' : null,
  };
}

/** TIM-01 text: whole seconds above 9.95, one decimal at or below. */
export function formatTimer(value: number): string {
  const v = Math.max(0, value);
  return v > TIMER_CONSTANTS.DECIMAL_BELOW ? String(Math.ceil(v - 1e-9)) : v.toFixed(1);
}

/* ─── The step ───────────────────────────────────────────────────────────── */

function expire(s: TimerModelState, emits: TimerEmit[]): void {
  s.value = 0;
  if (pvpTimerActive(s)) {
    if (s.beingTimered) {
      s.beingTimered = false;
      s.awaitingHandLost = true;
      emits.push({ t: 'fail_pvp_timer' });
    }
    return;
  }
  const timered = s.beingTimered;
  s.consumed = true;
  s.timering = false;
  s.beingTimered = false;
  s.pendingAnnounce = false;
  const fails = s.cfg.mode === 'pressure' || s.cfg.mode === 'speedlatro' || timered;
  if (!fails) return;
  if (s.cfg.mode !== 'speedlatro' && s.forgiven < s.cfg.forgiveness) {
    s.forgiven += 1;
    return;
  }
  emits.push({ t: 'fail_timer' });
}

function tick(s: TimerModelState, now: number, emits: TimerEmit[]): void {
  const prev = s.now;
  s.now = now;
  if (prev === null) return;
  let dt = (now - prev) / 1000;
  if (!(dt > 0)) return;
  if (s.cfg.mode === 'speedlatro' && s.onPvp && s.grace > 0) {
    const g = Math.min(s.grace, dt);
    s.grace -= g;
    dt -= g;
  }
  const ticking = isTicking(s);
  const drawing = ticking && usesAnimBudget(s) && s.flags.animBusy && !s.flags.paused;
  if (!drawing) {
    s.animBudget = Math.min(
      TIMER_CONSTANTS.ANIM_BUDGET_CAP,
      s.animBudget + TIMER_CONSTANTS.ANIM_BUDGET_REFILL_PER_S * dt,
    );
  }
  if (!ticking || dt <= 0) return;
  let amount = dt * speedOf(s);
  if (drawing) {
    const take = Math.min(s.animBudget, amount);
    s.animBudget -= take;
    amount -= take;
  }
  s.value -= amount;
  const th = s.cfg.displayThreshold;
  if (s.pendingAnnounce && th !== null && s.value <= th) {
    s.pendingAnnounce = false;
    emits.push({ t: 'send_timer', op: 'start', time: th, isPvP: false });
  }
  if (s.value <= 1e-9) expire(s, emits);
}

function cue(s: TimerModelState, emits: TimerEmit[]): void {
  if (s.cfg.cue === 'off') return;
  if (s.cfg.cue === 'once' && s.cuedThisCycle) return;
  s.cuedThisCycle = true;
  emits.push({ t: 'cue' });
}

function pause(s: TimerModelState, emits: TimerEmit[]): void {
  s.timering = false;
  if (s.pendingAnnounce) {
    s.pendingAnnounce = false;
    return;
  }
  emits.push({ t: 'send_timer', op: 'pause', time: s.value, isPvP: s.onPvp });
}

export function timerStep(state: TimerModelState, input: TimerInput): TimerStep {
  const s: TimerModelState = {
    ...state,
    cfg: { ...state.cfg },
    flags: { ...state.flags },
    score: { ...state.score },
  };
  const emits: TimerEmit[] = [];
  switch (input.t) {
    case 'tick':
      tick(s, input.now, emits);
      break;
    case 'flags': {
      const wasReady = s.flags.ready;
      const { state: gameState, ...rest } = input.flags;
      for (const [k, v] of Object.entries(rest) as [keyof TimerFlags, unknown][]) {
        if (v !== undefined) (s.flags as unknown as Record<string, unknown>)[k] = v;
      }
      if (gameState !== undefined) s.flags.newRound = gameState === 'NEW_ROUND';
      // Unready pauses my own press (A1 §4.3).
      if (wasReady && !s.flags.ready && s.timering && !s.onPvp) pause(s, emits);
      break;
    }
    case 'press':
      if (!s.cfg.enabled) break;
      if (s.timering) pause(s, emits);
      else if (isPressable(s)) {
        s.timering = true;
        const th = s.cfg.displayThreshold;
        if (!s.onPvp && th !== null && s.value > th) s.pendingAnnounce = true;
        else emits.push({ t: 'send_timer', op: 'start', time: s.value, isPvP: s.onPvp });
      }
      break;
    case 'remote': {
      if (!s.cfg.enabled) break;
      if (input.isPvP) {
        if (!pvpTimerActive(s) || s.pvpEnded) break;
        if (input.op === 'start') {
          if (s.flags.handsLeft <= 0) break;
          s.beingTimered = true;
          cue(s, emits);
        } else s.beingTimered = false;
        break;
      }
      if (s.onPvp) break;
      if (!Number.isFinite(input.time)) break;
      s.value = Math.max(0, input.time);
      if (input.op === 'start') {
        s.beingTimered = true;
        if (s.value > 0) s.consumed = false;
        cue(s, emits);
      } else s.beingTimered = false;
      break;
    }
    case 'skip':
      if (
        s.cfg.mode === 'default' &&
        !s.timering &&
        !s.beingTimered &&
        !s.consumed &&
        s.cfg.increment > 0
      )
        s.value += s.cfg.increment;
      break;
    case 'opp_skip':
      if (
        (s.cfg.mode === 'pressure' || s.cfg.mode === 'no_animation') &&
        !s.timering &&
        !s.beingTimered
      )
        s.value += s.cfg.increment;
      break;
    case 'hand_played':
      if (pvpTimerActive(s)) s.value += s.cfg.pvpHandIncrement;
      else if (!s.onPvp && s.cfg.mode === 'pressure') s.value += s.cfg.pressurePlusHand;
      break;
    case 'preview': {
      const cost =
        s.cfg.mode === 'pressure' || s.cfg.mode === 'no_animation' ? TIMER_CONSTANTS.PREVIEW_COST : 0;
      if (
        cost > 0 &&
        s.cfg.enabled &&
        !s.onPvp &&
        !s.timering &&
        !s.beingTimered &&
        !s.consumed &&
        s.value > Math.max(TIMER_CONSTANTS.PREVIEW_FLOOR, cost)
      )
        s.value -= cost;
      break;
    }
    case 'pvp_start':
      s.onPvp = true;
      s.pvpEnded = false;
      s.timering = false;
      s.beingTimered = false;
      s.pendingAnnounce = false;
      s.awaitingHandLost = false;
      s.consumed = false;
      s.score = { me: 0, them: 0, first: s.score.first, gotInfo: false };
      if (s.cfg.mode === 'speedlatro') {
        s.value = TIMER_CONSTANTS.SPEEDLATRO_PVP;
        s.grace = TIMER_CONSTANTS.SPEEDLATRO_GRACE;
      } else s.value = s.cfg.pvpBase ?? s.cfg.base;
      break;
    case 'pvp_end':
      s.onPvp = false;
      s.pvpEnded = false;
      s.timering = false;
      s.beingTimered = false;
      s.pendingAnnounce = false;
      s.awaitingHandLost = false;
      s.consumed = false;
      s.cuedThisCycle = false;
      s.grace = 0;
      s.value = s.cfg.mode === 'speedlatro' ? TIMER_CONSTANTS.SPEEDLATRO_BASE : s.cfg.base;
      break;
    case 'score':
      s.score = {
        me: Number.isNaN(input.me) ? Infinity : input.me,
        them: Number.isNaN(input.them) ? Infinity : input.them,
        first: input.first,
        gotInfo: input.gotInfo ?? true,
      };
      if (pvpTimerActive(s)) {
        if (ahead(s)) s.beingTimered = false;
        else s.timering = false;
      }
      break;
    case 'hand_lost':
      s.awaitingHandLost = false;
      s.timering = false;
      s.beingTimered = false;
      s.value = Math.max(0, s.value) + s.cfg.pvpHandIncrement;
      break;
    case 'suspend':
      s.suspended = input.on;
      break;
  }
  return { state: s, view: timerView(s), emits };
}
