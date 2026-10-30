/**
 * Timer model scenario tables (TIM-02…TIM-09, A1 §6) per layer: default ante
 * timer, PvP timer, pressure (+plus), no-animation, speedlatro, the Major
 * League display threshold, the animation budget, forgiveness and cues.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOBBY_OPTIONS } from '../../rulesets/options';
import { resolveDef, resolveRuleset } from '../../rulesets/resolve';
import type { LobbyOptions } from '../../types';
import {
  TIMER_CONSTANTS,
  formatTimer,
  isPressable,
  isTicking,
  timerConfigFrom,
  timerInit,
  timerStep,
  timerView,
  type TimerConfig,
  type TimerEmit,
  type TimerInput,
  type TimerModelState,
} from '../timer-model';

const S = 1000;

function cfgFor(
  ruleset: string,
  o: Partial<LobbyOptions> = {},
  cue: TimerConfig['cue'] = 'always',
): TimerConfig {
  const { resolved, options } = resolveRuleset({
    options: { ...DEFAULT_LOBBY_OPTIONS, modifierLayers: [], ruleset, ...o },
  });
  return timerConfigFrom(resolved, options, cue);
}
function cfgLayers(layers: string[], o: Partial<LobbyOptions> = {}): TimerConfig {
  const { resolved, options } = resolveDef(
    { key: 'ruleset_mp_test', short: 'test', layers, extra: true },
    { options: { ...DEFAULT_LOBBY_OPTIONS, modifierLayers: [], ...o } },
  );
  return timerConfigFrom(resolved, options);
}

/** A tiny driver that keeps the state and collects emits. */
class Clock {
  s: TimerModelState;
  emits: TimerEmit[] = [];
  now = 0;
  constructor(cfg: TimerConfig) {
    this.s = timerInit(cfg, 0);
  }
  in(i: TimerInput): TimerEmit[] {
    const r = timerStep(this.s, i);
    this.s = r.state;
    this.emits.push(...r.emits);
    return r.emits;
  }
  wait(ms: number, step = 250): TimerEmit[] {
    const out: TimerEmit[] = [];
    const end = this.now + ms;
    while (this.now < end) {
      this.now = Math.min(end, this.now + step);
      out.push(...this.in({ t: 'tick', now: this.now }));
    }
    return out;
  }
  flags(
    f: Parameters<typeof timerStep>[1] & { t: 'flags' } extends { flags: infer F } ? F : never,
  ) {
    return this.in({ t: 'flags', flags: f });
  }
  get view() {
    return timerView(this.s);
  }
}

describe('config', () => {
  it('derives every field from the resolved ruleset (+ hide-score option, cue setting)', () => {
    expect(cfgFor('ruleset_mp_balanced', { hideScoreUntilPlayed: true }, 'once')).toEqual({
      enabled: true,
      base: 150,
      increment: 60,
      forgiveness: 0,
      pvpBase: 60,
      pvpHandIncrement: 10,
      mode: 'default',
      pressurePlusHand: 0,
      displayThreshold: null,
      hideScoreUntilPlayed: true,
      cue: 'once',
      speedup: 1,
    });
    expect(cfgFor('ruleset_mp_majorleague').displayThreshold).toBe(180);
    expect(cfgFor('ruleset_mp_experimental')).toMatchObject({ mode: 'pressure', base: 300 });
    expect(cfgLayers(['no_animation_timer'])).toMatchObject({ mode: 'no_animation', base: 100 });
    const r = resolveRuleset({
      options: { ...DEFAULT_LOBBY_OPTIONS, modifierLayers: [] },
    }).resolved;
    expect(timerConfigFrom(r).hideScoreUntilPlayed).toBe(false);
  });
});

describe('default ante timer (TIM-02)', () => {
  it('only a ready player may press; press sends start with my value', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    expect(c.view).toMatchObject({
      value: 150,
      pressable: false,
      ticking: false,
      color: 'normal',
      mode: 'ante',
      display: null,
    });
    expect(c.in({ t: 'press' })).toEqual([]);
    c.flags({ ready: true });
    expect(c.view).toMatchObject({ pressable: true, color: 'orange' });
    expect(c.in({ t: 'press' })).toEqual([
      { t: 'send_timer', op: 'start', time: 150, isPvP: false },
    ]);
    expect(c.view).toMatchObject({
      timering: true,
      ticking: true,
      color: 'important',
      pressable: false,
    });
  });
  it('not pressable during the countdown, while timered or at 0', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.flags({ ready: true, countdown: true });
    expect(isPressable(c.s)).toBe(false);
    c.flags({ countdown: false });
    c.in({ t: 'remote', op: 'start', time: 100, isPvP: false });
    expect(isPressable(c.s)).toBe(false);
  });
  it('pressing again (or Unready) pauses and sends the current value', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.flags({ ready: true });
    c.in({ t: 'press' });
    c.wait(10 * S);
    expect(c.in({ t: 'press' })).toEqual([
      { t: 'send_timer', op: 'pause', time: 140, isPvP: false },
    ]);
    c.in({ t: 'press' });
    expect(c.flags({ ready: false })).toEqual([
      { t: 'send_timer', op: 'pause', time: 140, isPvP: false },
    ]);
    expect(c.view.ticking).toBe(false);
  });
  it('the receiver adopts the presser’s value, ticks, and fails at 0 (with a cue)', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    expect(c.in({ t: 'remote', op: 'start', time: 5, isPvP: false })).toEqual([{ t: 'cue' }]);
    expect(c.view).toMatchObject({ value: 5, beingTimered: true, ticking: true });
    expect(c.wait(5 * S)).toEqual([{ t: 'fail_timer' }]);
    expect(c.view).toMatchObject({ value: 0, ticking: false, beingTimered: false });
    expect(c.wait(5 * S)).toEqual([]); // consumed: fails once per cycle
  });
  it('a ready player who is only being timered does not tick', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.flags({ ready: true });
    c.in({ t: 'remote', op: 'start', time: 30, isPvP: false });
    c.wait(10 * S);
    expect(c.s.value).toBe(30);
    expect(isTicking(c.s)).toBe(false);
  });
  it('remote pause adopts the value and stops; the presser loses nothing at 0', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.in({ t: 'remote', op: 'start', time: 50, isPvP: false });
    c.in({ t: 'remote', op: 'pause', time: 42, isPvP: false });
    expect(c.view).toMatchObject({ value: 42, ticking: false });
    const p = new Clock(cfgFor('ruleset_mp_expanded'));
    p.flags({ ready: true });
    p.in({ t: 'remote', op: 'pause', time: 3, isPvP: false });
    p.in({ t: 'press' });
    expect(p.wait(5 * S)).toEqual([]);
    expect(p.s.consumed).toBe(true);
  });
  it('forgiveness: the first N expiries are forgiven (Minor League = 1)', () => {
    const c = new Clock(cfgFor('ruleset_mp_minorleague'));
    expect(c.s.cfg.forgiveness).toBe(1);
    c.in({ t: 'remote', op: 'start', time: 1, isPvP: false });
    expect(c.wait(2 * S)).toEqual([]);
    c.in({ t: 'pvp_end' });
    c.in({ t: 'remote', op: 'start', time: 1, isPvP: false });
    expect(c.wait(2 * S)).toEqual([{ t: 'fail_timer' }]);
  });
  it('a skip adds the increment only when nobody is timering and it is not consumed', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.in({ t: 'skip' });
    expect(c.s.value).toBe(210);
    c.in({ t: 'remote', op: 'start', time: 100, isPvP: false });
    c.in({ t: 'skip' });
    expect(c.s.value).toBe(100);
    const z = new Clock(cfgFor('ruleset_mp_expanded', { timerIncrementSeconds: 0 }));
    z.in({ t: 'skip' });
    expect(z.s.value).toBe(150);
  });
  it('never ticks on a PvP blind; pvp_start refills to the base, pvp_end too', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.in({ t: 'remote', op: 'start', time: 20, isPvP: false });
    c.in({ t: 'pvp_start' });
    expect(c.view).toMatchObject({ value: 150, ticking: false, beingTimered: false });
    expect(c.in({ t: 'remote', op: 'start', time: 3, isPvP: false })).toEqual([]);
    c.flags({ ready: true, handsLeft: 4 });
    expect(c.view.pressable).toBe(false); // no pvp_timer layer
    c.in({ t: 'pvp_end' });
    expect(c.s.value).toBe(150);
  });
  it('stops during disconnect overlays (suspend)', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.in({ t: 'remote', op: 'start', time: 50, isPvP: false });
    c.in({ t: 'suspend', on: true });
    c.wait(10 * S);
    expect(c.s.value).toBe(50);
    expect(c.view.pressable).toBe(false);
    c.in({ t: 'suspend', on: false });
    c.wait(10 * S);
    expect(c.s.value).toBe(40);
  });
  it('wall-clock: one long tick (hidden tab, TIM-09) counts in full', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.in({ t: 'remote', op: 'start', time: 100, isPvP: false });
    c.now = 60 * S;
    c.in({ t: 'tick', now: c.now });
    expect(c.s.value).toBe(40);
  });
  it('ignores non-advancing and first ticks; the timer can be disabled entirely', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    c.s = { ...c.s, now: null };
    c.in({ t: 'remote', op: 'start', time: 100, isPvP: false });
    c.in({ t: 'tick', now: 5000 });
    c.in({ t: 'tick', now: 4000 });
    expect(c.s.value).toBe(100);
    const off = new Clock(cfgFor('ruleset_mp_traditional'));
    off.flags({ ready: true });
    expect(off.in({ t: 'press' })).toEqual([]);
    expect(off.in({ t: 'remote', op: 'start', time: 1, isPvP: false })).toEqual([]);
    expect(off.view.pressable).toBe(false);
  });
  it('rejects a non-finite remote value', () => {
    const c = new Clock(cfgFor('ruleset_mp_expanded'));
    expect(c.in({ t: 'remote', op: 'start', time: NaN, isPvP: false })).toEqual([]);
    expect(c.s.value).toBe(150);
  });
  it('the speedup multiplier applies while timered', () => {
    const c = new Clock({ ...cfgFor('ruleset_mp_expanded'), speedup: 3 });
    c.in({ t: 'remote', op: 'start', time: 30, isPvP: false });
    c.wait(5 * S);
    expect(c.s.value).toBe(15);
  });
});

describe('cue setting', () => {
  it('always / once per ante / off', () => {
    const once = new Clock(cfgFor('ruleset_mp_expanded', {}, 'once'));
    expect(once.in({ t: 'remote', op: 'start', time: 50, isPvP: false })).toEqual([{ t: 'cue' }]);
    once.in({ t: 'remote', op: 'pause', time: 50, isPvP: false });
    expect(once.in({ t: 'remote', op: 'start', time: 50, isPvP: false })).toEqual([]);
    once.in({ t: 'pvp_end' });
    expect(once.in({ t: 'remote', op: 'start', time: 50, isPvP: false })).toEqual([{ t: 'cue' }]);
    const off = new Clock(cfgFor('ruleset_mp_expanded', {}, 'off'));
    expect(off.in({ t: 'remote', op: 'start', time: 50, isPvP: false })).toEqual([]);
  });
});

describe('PvP timer layer (TIM-03)', () => {
  function onPvp(o: Partial<LobbyOptions> = {}) {
    const c = new Clock(cfgFor('ruleset_mp_balanced', o));
    c.in({ t: 'pvp_start' });
    c.flags({ handsLeft: 4 });
    return c;
  }
  it('starts at 60 s; pressable only when strictly ahead, or tied and first', () => {
    const c = onPvp();
    expect(c.view).toMatchObject({ value: 60, mode: 'pvp' });
    c.in({ t: 'score', me: 10, them: 10, first: false });
    expect(c.view.pressable).toBe(false);
    c.in({ t: 'score', me: 10, them: 10, first: true });
    expect(c.view.pressable).toBe(true);
    c.in({ t: 'score', me: 5, them: 10, first: true });
    expect(c.view.pressable).toBe(false);
    c.in({ t: 'score', me: 11, them: 10, first: false });
    expect(c.in({ t: 'press' })).toEqual([{ t: 'send_timer', op: 'start', time: 60, isPvP: true }]);
  });
  it('the presser does not tick; the timered player ticks with hands left', () => {
    const c = onPvp();
    c.in({ t: 'score', me: 11, them: 10, first: false });
    c.in({ t: 'press' });
    c.wait(5 * S);
    expect(c.s.value).toBe(60);
    const v = onPvp();
    v.in({ t: 'score', me: 1, them: 10, first: false });
    expect(v.in({ t: 'remote', op: 'start', time: 60, isPvP: true })).toEqual([{ t: 'cue' }]);
    v.wait(5 * S);
    expect(v.s.value).toBe(55);
  });
  it('receivers ignore a start when out of hands, after the PvP, or off the PvP blind', () => {
    const c = onPvp();
    c.flags({ handsLeft: 0 });
    expect(c.in({ t: 'remote', op: 'start', time: 60, isPvP: true })).toEqual([]);
    const off = new Clock(cfgFor('ruleset_mp_balanced'));
    expect(off.in({ t: 'remote', op: 'start', time: 60, isPvP: true })).toEqual([]);
  });
  it('auto-cancels on every score update', () => {
    const c = onPvp();
    c.in({ t: 'score', me: 1, them: 10, first: false });
    c.in({ t: 'remote', op: 'start', time: 60, isPvP: true });
    c.in({ t: 'score', me: 20, them: 10, first: false });
    expect(c.view.beingTimered).toBe(false);
    c.in({ t: 'press' });
    expect(c.view.timering).toBe(true);
    c.in({ t: 'score', me: 20, them: 30, first: false });
    expect(c.view.timering).toBe(false);
  });
  it('remote pause clears being-timered without touching my clock', () => {
    const c = onPvp();
    c.in({ t: 'score', me: 1, them: 10, first: false });
    c.in({ t: 'remote', op: 'start', time: 33, isPvP: true });
    c.in({ t: 'remote', op: 'pause', time: 33, isPvP: true });
    expect(c.view).toMatchObject({ beingTimered: false, value: 60 });
  });
  it('at 0 → fail_pvp_timer once; the referee’s hand loss adds +10 s', () => {
    const c = onPvp();
    c.in({ t: 'score', me: 1, them: 10, first: false });
    c.in({ t: 'remote', op: 'start', time: 60, isPvP: true });
    expect(c.wait(61 * S)).toEqual([{ t: 'fail_pvp_timer' }]);
    expect(c.view.pressable).toBe(false);
    c.in({ t: 'hand_lost' });
    expect(c.view).toMatchObject({ value: 10, beingTimered: false });
  });
  it('+10 s per own hand on the PvP blind', () => {
    const c = onPvp();
    c.in({ t: 'hand_played' });
    expect(c.s.value).toBe(70);
  });
  it('does not tick in round eval / new round, and pauses in animations via the budget', () => {
    const c = onPvp();
    c.in({ t: 'score', me: 1, them: 10, first: false });
    c.in({ t: 'remote', op: 'start', time: 60, isPvP: true });
    c.flags({ roundEval: true });
    c.wait(5 * S);
    expect(c.s.value).toBe(60);
    c.flags({ roundEval: false, state: 'NEW_ROUND' });
    c.wait(5 * S);
    expect(c.s.value).toBe(60);
    c.flags({ state: 'SELECTING_HAND', animBusy: true });
    c.wait(10 * S);
    expect(c.s.value).toBe(60);
    expect(c.s.animBudget).toBe(30);
  });
  it('hide_score_until_played: no press before the first info (D-02)', () => {
    const c = onPvp({ hideScoreUntilPlayed: true });
    c.in({ t: 'score', me: 10, them: 0, first: true, gotInfo: false });
    expect(c.view.pressable).toBe(false);
    c.in({ t: 'score', me: 10, them: 0, first: true, gotInfo: true });
    expect(c.view.pressable).toBe(true);
  });
  it('NaN scores compare as +inf (§0.9)', () => {
    const c = onPvp();
    c.in({ t: 'score', me: NaN, them: 1e308, first: false });
    expect(c.view.pressable).toBe(true);
  });
});

describe('animation budget (TIM-08)', () => {
  it('draws up to 40 s from the budget, then the timer ticks through animations; refills at 2.5 s/s', () => {
    const c = new Clock(cfgFor('ruleset_mp_balanced'));
    c.in({ t: 'pvp_start' });
    c.flags({ handsLeft: 4, animBusy: true });
    c.in({ t: 'score', me: 0, them: 10, first: false });
    c.in({ t: 'remote', op: 'start', time: 60, isPvP: true });
    c.wait(50 * S);
    expect(c.s.animBudget).toBe(0);
    expect(c.s.value).toBeCloseTo(50);
    c.flags({ animBusy: false });
    c.in({ t: 'remote', op: 'pause', time: 0, isPvP: true });
    c.wait(4 * S);
    expect(c.s.animBudget).toBeCloseTo(10);
    c.wait(100 * S);
    expect(c.s.animBudget).toBe(TIMER_CONSTANTS.ANIM_BUDGET_CAP);
  });
  it('paused game: animations do not draw from the budget', () => {
    const c = new Clock(cfgFor('ruleset_mp_experimental'));
    c.flags({ animBusy: true, paused: true });
    c.wait(10 * S);
    expect(c.s.value).toBe(290);
    expect(c.s.animBudget).toBe(40);
  });
});

describe('pressure timer (TIM-04)', () => {
  it('auto-ticks in normal play (orange), from a ×2 base', () => {
    const c = new Clock(cfgFor('ruleset_mp_experimental'));
    expect(c.s.value).toBe(300);
    c.wait(10 * S);
    expect(c.s.value).toBe(290);
    expect(c.view).toMatchObject({ auto: true, ticking: true, color: 'orange' });
  });
  it('stops once ready unless timered; ×2 speed while timered', () => {
    const c = new Clock(cfgFor('ruleset_mp_experimental'));
    c.flags({ ready: true });
    c.wait(10 * S);
    expect(c.s.value).toBe(300);
    c.in({ t: 'remote', op: 'start', time: 100, isPvP: false });
    c.wait(10 * S);
    expect(c.s.value).toBe(80);
    expect(c.view.auto).toBe(false);
  });
  it('fails at 0 regardless of being timered (subject to forgiveness)', () => {
    const c = new Clock(cfgFor('ruleset_mp_experimental'));
    expect(c.wait(301 * S)).toEqual([{ t: 'fail_timer' }]);
    const f = new Clock(cfgFor('ruleset_mp_experimental', { timerForgiveness: 1 }));
    expect(f.wait(301 * S)).toEqual([]);
    expect(f.s.forgiven).toBe(1);
  });
  it('+increment on an opponent skip when idle; own skips add nothing', () => {
    const c = new Clock(cfgFor('ruleset_mp_experimental'));
    c.in({ t: 'skip' });
    expect(c.s.value).toBe(300);
    c.in({ t: 'opp_skip' });
    expect(c.s.value).toBe(360);
    c.in({ t: 'remote', op: 'start', time: 100, isPvP: false });
    c.in({ t: 'opp_skip' });
    expect(c.s.value).toBe(100);
  });
  it('pressure_timer_plus: +15 s per normal-blind hand; nothing on a PvP blind without pvp_timer', () => {
    const c = new Clock(cfgLayers(['pressure_timer', 'pressure_timer_plus']));
    c.in({ t: 'hand_played' });
    expect(c.s.value).toBe(315);
    c.in({ t: 'pvp_start' });
    c.in({ t: 'hand_played' });
    expect(c.s.value).toBe(300);
    c.wait(10 * S);
    expect(c.s.value).toBe(300);
  });
});

describe('no-animation timer (TIM-05)', () => {
  it('×2/3 base; ticks only while timered, not ready, not during animations', () => {
    const c = new Clock(cfgLayers(['no_animation_timer']));
    expect(c.s.value).toBe(100);
    c.wait(5 * S);
    expect(c.s.value).toBe(100);
    c.in({ t: 'remote', op: 'start', time: 100, isPvP: false });
    c.wait(5 * S);
    expect(c.s.value).toBe(95);
    c.flags({ animBusy: true });
    c.wait(5 * S);
    expect(c.s.value).toBe(95);
    c.flags({ animBusy: false, ready: true });
    c.wait(5 * S);
    expect(c.s.value).toBe(95);
    c.in({ t: 'opp_skip' });
    expect(c.s.value).toBe(95); // timered: no bonus
  });
  it('opponent skip bonus when idle; fail at 0 while timered', () => {
    const c = new Clock(cfgLayers(['no_animation_timer']));
    c.in({ t: 'opp_skip' });
    expect(c.s.value).toBe(160);
    c.in({ t: 'remote', op: 'start', time: 2, isPvP: false });
    expect(c.wait(3 * S)).toEqual([{ t: 'fail_timer' }]);
  });
});

describe('Major League display threshold (TIM-06)', () => {
  it('shows the threshold while above it and unstarted; a press above it is announced at the threshold', () => {
    const c = new Clock({ ...cfgFor('ruleset_mp_majorleague'), base: 240 });
    c.s = { ...c.s, value: 240 };
    expect(c.view.value).toBe(180);
    c.flags({ ready: true });
    expect(c.in({ t: 'press' })).toEqual([]);
    expect(c.view.value).toBe(180);
    expect(c.wait(59 * S)).toEqual([]);
    expect(c.wait(1 * S)).toEqual([{ t: 'send_timer', op: 'start', time: 180, isPvP: false }]);
    expect(c.view.value).toBe(180);
    c.wait(10 * S);
    expect(c.view.value).toBe(170);
  });
  it('a pause before the announcement is silent', () => {
    const c = new Clock({ ...cfgFor('ruleset_mp_majorleague'), base: 240 });
    c.s = { ...c.s, value: 240 };
    c.flags({ ready: true });
    c.in({ t: 'press' });
    c.wait(5 * S);
    expect(c.in({ t: 'press' })).toEqual([]);
  });
  it('with the forced 180 s base the announcement is immediate', () => {
    const c = new Clock(cfgFor('ruleset_mp_majorleague'));
    c.flags({ ready: true });
    expect(c.in({ t: 'press' })).toEqual([
      { t: 'send_timer', op: 'start', time: 180, isPvP: false },
    ]);
  });
});

describe('speedlatro timer (TIM-07)', () => {
  it('a separate 147 s clock (">>"), ticking in the run except while ready or in the countdown', () => {
    const c = new Clock(cfgFor('ruleset_mp_speedlatro'));
    expect(c.view).toMatchObject({ value: 147, mode: 'speedlatro', display: '>>' });
    c.wait(7 * S);
    expect(c.s.value).toBe(140);
    c.flags({ ready: true });
    c.wait(5 * S);
    c.flags({ ready: false, countdown: true });
    c.wait(5 * S);
    expect(c.s.value).toBe(140);
  });
  it('×2 when timered outside PvP', () => {
    const c = new Clock(cfgFor('ruleset_mp_speedlatro'));
    c.in({ t: 'remote', op: 'start', time: 100, isPvP: false });
    c.wait(10 * S);
    expect(c.s.value).toBe(80);
  });
  it('73.5 s at PvP start with a 4 s grace; ticks only while behind with hands; reset at PvP end', () => {
    const c = new Clock(cfgFor('ruleset_mp_speedlatro'));
    c.in({ t: 'pvp_start' });
    c.flags({ handsLeft: 3 });
    c.in({ t: 'score', me: 0, them: 10, first: false });
    c.wait(4 * S);
    expect(c.s.value).toBe(73.5);
    c.wait(3.5 * S);
    expect(c.s.value).toBe(70);
    c.in({ t: 'score', me: 20, them: 10, first: false });
    c.wait(5 * S);
    expect(c.s.value).toBe(70);
    c.in({ t: 'score', me: 0, them: 10, first: false });
    c.flags({ handsLeft: 0 });
    c.wait(5 * S);
    expect(c.s.value).toBe(70);
    c.in({ t: 'pvp_end' });
    expect(c.s.value).toBe(147);
  });
  it('fail_timer once at 0', () => {
    const c = new Clock(cfgFor('ruleset_mp_speedlatro', { timerForgiveness: 3 }));
    expect(c.wait(148 * S)).toEqual([{ t: 'fail_timer' }]);
    expect(c.wait(10 * S)).toEqual([]);
  });
});

describe('formatTimer (TIM-01)', () => {
  it.each([
    [150, '150'],
    [10.2, '11'],
    [10, '10'],
    [9.96, '10'],
    [9.95, '9.9'],
    [9.94, '9.9'],
    [0.04, '0.0'],
    [-3, '0.0'],
  ])('%s → %s', (v, s) => expect(formatTimer(v)).toBe(s));
});

describe('purity', () => {
  it('timerStep never mutates its input state', () => {
    const s = timerInit(cfgFor('ruleset_mp_balanced'), 0);
    const snap = JSON.stringify(s);
    for (const i of [
      { t: 'press' },
      { t: 'flags', flags: { ready: true } },
      { t: 'remote', op: 'start', time: 3, isPvP: false },
      { t: 'tick', now: 5000 },
      { t: 'pvp_start' },
      { t: 'score', me: 1, them: 2, first: true },
    ] as TimerInput[])
      timerStep(s, i);
    expect(JSON.stringify(s)).toBe(snap);
  });
});
