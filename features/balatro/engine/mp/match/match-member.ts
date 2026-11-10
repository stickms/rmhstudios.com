/**
 * Every player's match controller (the host runs one too, on loopback):
 * the bridge between Lua's game and the match.
 *
 * - **Outcomes** from the host are applied once each, deduplicated by `hs`
 *   (a re-sent `win`, a migration resync), folded into the routing state and
 *   handed to Lua (`outcome`, plus `vote_progress`).
 * - **Lua → match:** `ev` → a `game` event for the referee; `peer` → routed
 *   per §3.b to the current target(s) (routing.ts); `flags` and `timer_input`
 *   → the timer model.
 * - **Timers** (PLAN §0.2: clocks are local): WS4's pure timer model runs
 *   here on the monotonic clock (so a hidden tab keeps counting, TIM-09). Its
 *   `send_timer` emits go to the target as `timer` peer messages, `fail_*`
 *   go to the referee, the view goes to Lua as `timer_state` when it changes,
 *   cues as `timer_cue`. Referee outcomes drive it: `start_blind` (PvP start,
 *   who was first), `end_pvp`, `timer_hand_lost` for me; the opponent's
 *   `nemesis_info` and my own hands feed the PvP-timer score rule.
 * - **Result watchdog** (REF-14): once my lives reach 0 a `result_request`
 *   goes out every 5 s until a final result arrives (the host re-sends the
 *   last outcome to me).
 */

import { parseScore } from '../referee/score';
import {
  timerConfigFrom,
  timerInit,
  timerStep,
  timerView,
  type CueMode,
  type TimerEmit,
  type TimerFlags,
  type TimerModelState,
  type TimerView,
} from '../timer/timer-model';
import type { BridgeFlags } from '../bridge-protocol';
import type { GameEvent, Id, RefMsg, StartedMatch } from '../types';
import type { PeerKind, WireData } from '../wire';
import type { BridgeLike, Scheduler } from '../transport/types';
import { Routing } from './routing';

export const TIMER_TICK_MS = 100;
export const RESULT_WATCHDOG_MS = 5_000;
export const RESULT_WATCHDOG_TRIES = 6;

export type ResultKind = 'win' | 'lose' | 'draw';

export interface MatchClientOptions {
  sched: Scheduler;
  bridge: BridgeLike;
  match: StartedMatch;
  me: Id;
  cue?: CueMode;
  /** To the referee (host: direct; member: a `game` envelope). */
  sendGame(e: GameEvent): void;
  /** One peer message to one destination ('*' = everyone). */
  sendPeer<K extends PeerKind>(kind: K, d: WireData<K>, to: '*' | Id): void;
  /** The match ended for me. */
  onResult?(kind: ResultKind, msg: RefMsg): void;
  /** Every relayed peer message, after Lua got it (end-screen data). */
  onPeer?(kind: PeerKind, from: Id, d: unknown): void;
  log?(msg: string): void;
}

export class MatchClient {
  readonly routing: Routing;
  lastHs = -1;
  result: ResultKind | null = null;
  private timer: TimerModelState | null = null;
  private lastView = '';
  private stopTimer: (() => void) | null = null;
  private firstPlayer: Id | '' = '';
  private myScore = 0;
  private theirScore = 0;
  private gotInfo = false;
  private watchdog: (() => void) | null = null;
  private watchdogTries = 0;
  private stopped = false;
  /** Latest display sync per sender (handed over when the target changes). */
  readonly lastInfo = new Map<Id, WireData<'nemesis_info'>>();

  constructor(private readonly o: MatchClientOptions) {
    this.routing = new Routing(o.me, o.match.roster.map((r) => r.id));
    const cfg = timerConfigFrom(o.match.resolved, o.match.options, o.cue ?? 'always');
    if (cfg.enabled && !o.match.shape.practice) {
      this.timer = timerInit(cfg, o.sched.mono());
      this.stopTimer = o.sched.every(TIMER_TICK_MS, () => this.timerInput({ t: 'tick', now: o.sched.mono() }));
      this.pushView(true);
    }
  }

  get me(): Id {
    return this.o.me;
  }

  get match(): StartedMatch {
    return this.o.match;
  }

  /* ─── Timers ─── */

  private timerInput(input: Parameters<typeof timerStep>[1]): void {
    if (!this.timer || this.stopped) return;
    const step = timerStep(this.timer, input);
    this.timer = step.state;
    for (const e of step.emits) this.onTimerEmit(e);
    this.pushView(false, step.view);
  }

  private pushView(force: boolean, view?: TimerView): void {
    if (!this.timer) return;
    const v = view ?? timerView(this.timer);
    const key = JSON.stringify({ ...v, value: Math.round(v.value * 10) / 10 });
    if (!force && key === this.lastView) return;
    this.lastView = key;
    this.o.bridge.send('timer_state', { ...v, value: Math.max(0, v.value) });
  }

  private onTimerEmit(e: TimerEmit): void {
    switch (e.t) {
      case 'send_timer': {
        const route = this.routing.route('timer', {});
        const d = { op: e.op, time: e.time, isPvP: e.isPvP };
        if (route === '*') this.o.sendPeer('timer', d, '*');
        else for (const id of route) this.o.sendPeer('timer', d, id);
        break;
      }
      case 'fail_timer':
        this.o.sendGame({ t: 'fail_timer' });
        break;
      case 'fail_pvp_timer':
        this.o.sendGame({ t: 'fail_pvp_timer' });
        break;
      case 'cue':
        this.o.bridge.send('timer_cue', {});
        break;
    }
  }

  private pushScore(): void {
    this.timerInput({
      t: 'score',
      me: this.myScore,
      them: this.theirScore,
      first: this.firstPlayer === this.o.me,
      gotInfo: this.gotInfo,
    });
  }

  /** Disconnect overlays stop the clock (TIM-02). */
  suspend(on: boolean): void {
    this.timerInput({ t: 'suspend', on });
  }

  /** Re-send what Lua shows (after a hidden tab came back). */
  refresh(): void {
    this.pushView(true);
  }

  /* ─── From the host ─── */

  /** One numbered outcome; false when it was a duplicate. */
  outcome(o: RefMsg, hs: number): boolean {
    if (this.stopped || hs <= this.lastHs) return false;
    this.lastHs = hs;
    const before = this.routing.target;
    this.routing.apply(o);
    this.o.bridge.send('outcome', { o, hs });
    if (o.t === 'vote_progress') this.o.bridge.send('vote_progress', { kind: o.kind, k: o.k, n: o.n });
    if (this.routing.target && this.routing.target !== before) {
      // The new target's latest display sync, so the HUD is not blank until its next hand.
      const info = this.lastInfo.get(this.routing.target);
      if (info) this.o.bridge.send('peer', { k: 'nemesis_info', from: this.routing.target, d: info });
    }
    this.onOutcome(o);
    return true;
  }

  private onOutcome(o: RefMsg): void {
    const me = this.o.me;
    switch (o.t) {
      case 'start_blind':
        if (o.starting_hands[me] === undefined) break;
        this.firstPlayer = o.first_player;
        this.myScore = 0;
        this.theirScore = 0;
        this.gotInfo = false;
        this.timerInput({ t: 'pvp_start' });
        this.pushScore();
        break;
      case 'end_pvp':
        this.timerInput({ t: 'pvp_end' });
        break;
      case 'timer_hand_lost':
        if (o.player_id === me) this.timerInput({ t: 'hand_lost' });
        break;
      case 'player_lives':
        if ((o.player_id === me || o.player_id === '*all*') && o.lives === 0) this.armWatchdog();
        break;
      case 'death_pending':
      case 'eliminated':
        if (o.t === 'eliminated' && o.player_id === me) this.finish('lose', o);
        break;
      case 'win':
        this.finish(this.winKind(o), o);
        break;
      case 'player_won':
        this.finish(o.player_id === me ? 'win' : 'lose', o);
        break;
      default:
        break;
    }
  }

  private winKind(o: Extract<RefMsg, { t: 'win' }>): ResultKind {
    const me = this.o.me;
    if (o.places) {
      const place = o.places[me];
      const firsts = Object.values(o.places).filter((p) => p === 1).length;
      if (place === 1) return firsts === 1 ? 'win' : 'draw';
      return 'lose';
    }
    if (o.draw) return 'draw';
    if (o.winner_team_id) return this.routing.teams[me] === o.winner_team_id ? 'win' : 'lose';
    return o.winner_id === me ? 'win' : 'lose';
  }

  private finish(kind: ResultKind, msg: RefMsg): void {
    this.disarmWatchdog();
    // An eliminated player still learns the final standings; history counts the first verdict.
    if (this.result) return;
    this.result = kind;
    this.o.onResult?.(kind, msg);
  }

  private armWatchdog(): void {
    if (this.watchdog || this.result) return;
    this.watchdogTries = 0;
    const fire = () => {
      this.watchdog = null;
      if (this.result || this.stopped || this.watchdogTries >= RESULT_WATCHDOG_TRIES) return;
      this.watchdogTries += 1;
      this.o.sendGame({ t: 'result_request' });
      this.watchdog = this.o.sched.after(RESULT_WATCHDOG_MS, fire);
    };
    this.watchdog = this.o.sched.after(RESULT_WATCHDOG_MS, fire);
  }

  private disarmWatchdog(): void {
    this.watchdog?.();
    this.watchdog = null;
  }

  /** A relayed peer message (the host already stamped who it is from). */
  peerIn<K extends PeerKind>(kind: K, from: Id, d: WireData<K>): void {
    if (this.stopped || from === this.o.me) return;
    if (kind === 'deck_req' || kind === 'stats_req') this.routing.noteRequest(kind, from);
    if (kind === 'nemesis_info') {
      const info = d as WireData<'nemesis_info'>;
      this.lastInfo.set(from, info);
      if (from === this.routing.target) {
        this.theirScore = parseScore(info.score);
        this.gotInfo = true;
        this.pushScore();
      }
    }
    if (kind === 'timer') {
      const t = d as WireData<'timer'>;
      this.timerInput({ t: 'remote', op: t.op, time: t.time, isPvP: t.isPvP });
    }
    this.o.bridge.send('peer', { k: kind, from, d } as never);
    this.o.onPeer?.(kind, from, d);
  }

  /* ─── From Lua ─── */

  luaEvent(e: GameEvent): void {
    if (this.stopped) return;
    if ((e.t === 'play_hand' || e.t === 'skip') && this.timer?.onPvp) {
      this.myScore = parseScore(e.score);
      this.pushScore();
    }
    this.o.sendGame(e);
  }

  luaPeer<K extends PeerKind>(kind: K, d: WireData<K>): void {
    if (this.stopped) return;
    const route = this.routing.route(kind, d as Record<string, unknown>);
    if (route === '*') this.o.sendPeer(kind, d, '*');
    else for (const id of route) if (id !== this.o.me) this.o.sendPeer(kind, d, id);
  }

  luaFlags(f: BridgeFlags): void {
    const flags: Partial<TimerFlags> & { state?: string } = {
      ready: f.ready,
      countdown: f.countdown,
      animBusy: f.animBusy,
      paused: f.paused,
      roundEval: f.roundEval,
      handsLeft: f.handsLeft,
      state: f.state,
    };
    this.timerInput({ t: 'flags', flags });
  }

  luaTimerInput(op: 'press' | 'skip' | 'hand_played' | 'opp_skip' | 'preview'): void {
    this.timerInput({ t: op });
  }

  stop(): void {
    this.stopped = true;
    this.stopTimer?.();
    this.stopTimer = null;
    this.disarmWatchdog();
  }
}
