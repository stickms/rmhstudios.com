/**
 * Balatro multiplayer — the casual-lobby setup driver on the lobby host
 * (MM-03/04/05, D-32, A1 §1.5–1.6; WS12).
 *
 * Runs WS4's pure machines (votes.ts, draft.ts) on the host's clock, in the
 * order `setupPlan` gives for the lobby (casual only; Small World skips the
 * votes): ruleset vote → trap vote (only after Balanced/Expanded) → deck +
 * stake draft. Every change is published as a SetupView (the host's
 * `publishSetup` broadcasts `setup` and folds it into the lobby state), and
 * the machine is woken at each `wakeAt` (deadline, roll, reveal, turn
 * timeout). Casts and picks arrive through `input` (LobbyHost.onSetupInput);
 * a step id the driver did not open is ignored, so a late cast from an
 * earlier step cannot leak into the next.
 *
 * Seeds: one raw CSPRNG value per step from `randomInt` (host only; the
 * machines mix it). Browser-free and zod-free (it is in the MP chunk).
 */

import { openDraft, draftCandidates, draftStep, draftView, type DraftState } from './draft';
import {
  openVote,
  rulesetVoteOptions,
  setupPlan,
  trapVoteApplies,
  TRAP_OPTIONS,
  voteStep,
  voteView,
  type SetupStepKind,
  type VoteState,
} from './votes';
import type { Id, QueueMode, SetupView } from '../types';

export interface SetupResult {
  ruleset: string;
  /** null = the step did not run (keep the ruleset's default). */
  trapCards: boolean | null;
  deck: string;
  stake: number;
}

export interface SetupDriverDeps {
  now(): number;
  after(ms: number, fn: () => void): () => void;
  /** A raw host seed (CSPRNG). */
  randomInt(): number;
  publish(view: SetupView): void;
  done(result: SetupResult): void;
}

export interface SetupDriverOptions {
  kind: 'private' | 'casual' | 'party';
  queueMode: QueueMode;
  /** Seated players, in join order. */
  players: readonly Id[];
  connected?: readonly Id[];
  /** Ruleset used when no vote runs (Small World). */
  defaultRuleset?: string;
  voteWindowMs?: number;
  maxStake?: number;
}

const SMALL_WORLD = 'ruleset_mp_smallworld';

type Running =
  | { kind: 'ruleset_vote' | 'trap_vote'; state: VoteState }
  | { kind: 'draft'; state: DraftState };

export class SetupHostDriver {
  private readonly steps: SetupStepKind[];
  private stepIdx = -1;
  private running: Running | null = null;
  private cancelWake: (() => void) | null = null;
  private connected: Id[];
  private stopped = false;
  private finished = false;
  private nonce = 0;
  readonly result: SetupResult;

  constructor(
    private readonly deps: SetupDriverDeps,
    private readonly opts: SetupDriverOptions,
  ) {
    this.steps = setupPlan(opts.kind, opts.queueMode);
    this.connected = [...(opts.connected ?? opts.players)];
    const ruleset = opts.defaultRuleset ?? (opts.queueMode === 'pvp_smallworld' ? SMALL_WORLD : 'ruleset_mp_balanced');
    this.result = { ruleset, trapCards: null, deck: 'b_red', stake: 1 };
  }

  get done(): boolean {
    return this.finished;
  }

  /** The step on screen, or null. */
  view(): SetupView | null {
    const r = this.running;
    if (!r) return null;
    const at = this.deps.now();
    return r.kind === 'draft' ? draftView(r.state, at) : voteView(r.state, at);
  }

  start(): void {
    if (this.stepIdx >= 0 || this.stopped) return;
    this.next();
  }

  /** A cast (votes) or a ban/pick (draft) from a seated player. */
  input(i: { from: Id; kind: 'vote' | 'draft'; stepId: string; value: string }): void {
    const r = this.running;
    if (!r || this.stopped || r.state.stepId !== i.stepId) return;
    if (!this.opts.players.includes(i.from)) return;
    const at = this.deps.now();
    if (r.kind === 'draft') {
      if (i.kind !== 'draft') return;
      this.applyDraft(draftStep(r.state, { t: 'choose', at, from: i.from, key: i.value }));
    } else {
      if (i.kind !== 'vote') return;
      this.applyVote(r.kind, voteStep(r.state, { t: 'cast', at, from: i.from, option: i.value }));
    }
  }

  /** Who is connected now (votes close early once every connected voter voted; D-11). */
  presence(connected: readonly Id[]): void {
    const next = [...connected].sort();
    if (next.join('\n') === [...this.connected].sort().join('\n')) return;
    this.connected = [...connected];
    const r = this.running;
    if (!r || r.kind === 'draft' || this.stopped) return;
    this.applyVote(r.kind, voteStep(r.state, { t: 'presence', at: this.deps.now(), connected: this.connected }));
  }

  stop(): void {
    this.stopped = true;
    this.cancelWake?.();
    this.cancelWake = null;
  }

  /* ─── Steps ─── */

  private stepId(kind: SetupStepKind): string {
    this.nonce += 1;
    const short = kind === 'ruleset_vote' ? 'rv' : kind === 'trap_vote' ? 'tv' : 'dr';
    return `${short}${this.nonce}-${(this.deps.randomInt() >>> 0).toString(36)}`.slice(0, 32);
  }

  private next(): void {
    if (this.stopped) return;
    this.stepIdx += 1;
    const kind = this.steps[this.stepIdx];
    const at = this.deps.now();
    if (kind === undefined) {
      this.finish();
      return;
    }
    if (kind === 'trap_vote' && !trapVoteApplies(this.result.ruleset)) {
      this.next();
      return;
    }
    if (kind === 'draft') {
      const state = openDraft({
        stepId: this.stepId(kind),
        players: this.opts.players,
        candidates: draftCandidates(this.result.ruleset),
        at,
        rngState: this.deps.randomInt(),
        maxStake: this.opts.maxStake,
      });
      this.running = { kind, state };
      this.applyDraft(draftStep(state, { t: 'tick', at }));
      return;
    }
    const state = openVote({
      stepId: this.stepId(kind),
      kind,
      options: kind === 'ruleset_vote' ? rulesetVoteOptions() : [...TRAP_OPTIONS],
      voters: this.opts.players,
      connected: this.connected,
      at,
      windowMs: this.opts.voteWindowMs,
      rngState: this.deps.randomInt(),
    });
    this.running = { kind, state };
    this.applyVote(kind, voteStep(state, { t: 'tick', at }));
  }

  private applyVote(kind: 'ruleset_vote' | 'trap_vote', step: ReturnType<typeof voteStep>): void {
    this.running = { kind, state: step.state };
    this.deps.publish(step.view);
    if (step.result !== null) {
      if (kind === 'ruleset_vote') this.result.ruleset = step.result;
      else this.result.trapCards = step.result === 'traps_on';
      this.cancelWake?.();
      this.cancelWake = null;
      this.next();
      return;
    }
    this.arm(step.wakeAt);
  }

  private applyDraft(step: ReturnType<typeof draftStep>): void {
    this.running = { kind: 'draft', state: step.state };
    this.deps.publish(step.view);
    if (step.result) {
      this.result.deck = step.result.deck;
      this.result.stake = step.result.stake;
      this.cancelWake?.();
      this.cancelWake = null;
      this.next();
      return;
    }
    this.arm(step.wakeAt);
  }

  private arm(wakeAt: number | null): void {
    this.cancelWake?.();
    this.cancelWake = null;
    if (wakeAt === null || this.stopped) return;
    const ms = Math.max(0, wakeAt - this.deps.now());
    this.cancelWake = this.deps.after(ms, () => {
      this.cancelWake = null;
      this.tick();
    });
  }

  private tick(): void {
    const r = this.running;
    if (!r || this.stopped) return;
    const at = this.deps.now();
    if (r.kind === 'draft') this.applyDraft(draftStep(r.state, { t: 'tick', at }));
    else this.applyVote(r.kind, voteStep(r.state, { t: 'tick', at }));
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.cancelWake?.();
    this.cancelWake = null;
    this.deps.done({ ...this.result });
  }
}
