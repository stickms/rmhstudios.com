/**
 * Balatro multiplayer — a matchmade (casual) lobby, from both seats (MM-02,
 * MM-03/04/05, D-32; WS12).
 *
 * **Host** (`CasualHost`, on the elected host's LobbyHost): waits for the
 * matched players to arrive and auto-ready, runs the setup driver
 * (setup/host-driver.ts: ruleset vote → trap vote → draft, published through
 * `publishSetup`, fed by `onSetupInput`), writes the results into the lobby
 * (ruleset, trap cards, deck and stake) and auto-starts. Players who never
 * arrive are left out after `GATHER_MS`; a lobby that never reaches two
 * players is given up after `ABANDON_MS`.
 *
 * **Member** (`autoReady`): READY is re-sent 6× at 1.2 s (a lost first
 * `ready` must not stall the auto-start).
 *
 * Polls the host's lobby state (it has no change event) on the session
 * scheduler. Browser-free, zod-free (MP chunk).
 */

import { SetupHostDriver, type SetupResult } from '../setup/host-driver';
import type { SetupInput } from '../lobby/lobby-host';
import type { HostIntent } from '../lobby/context';
import type { Id, LobbyState, SetupView } from '../types';
import type { Scheduler } from '../transport/types';

export const CASUAL_TIMING = {
  POLL_MS: 250,
  /** Start setup with whoever is here (≥2, all ready) after this long. */
  GATHER_MS: 20_000,
  /** Give up a lobby that never reaches two players. */
  ABANDON_MS: 45_000,
  /** Stop retrying START after this long past the end of setup. */
  START_RETRY_MS: 15_000,
  AUTO_READY_TIMES: 6,
  AUTO_READY_EVERY_MS: 1_200,
} as const;

/** The slice of LobbyHost the casual host drives. */
export interface CasualLobbyHost {
  lobby(): LobbyState | null;
  onSetupInput: ((i: SetupInput) => void) | null;
  publishSetup(view: LobbyState['setup']): void;
  hostIntent(i: HostIntent): void;
}

export type CasualPhase = 'gather' | 'setup' | 'starting' | 'started' | 'ended';

export interface CasualHostDeps {
  sched: Pick<Scheduler, 'now' | 'after' | 'every'>;
  randomInt(): number;
  log?(msg: string): void;
  /** The lobby was given up (`no-players`) or the host role went away (`gone`). */
  onEnd(why: 'no-players' | 'gone' | 'started'): void;
}

function seatedIds(s: LobbyState): Id[] {
  return s.players
    .filter((p) => p.role === 'player')
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => p.id);
}

function connectedIds(s: LobbyState): Id[] {
  return s.players.filter((p) => p.role === 'player' && p.connected && !p.away).map((p) => p.id);
}

function allReady(s: LobbyState): boolean {
  return s.players.filter((p) => p.role === 'player').every((p) => p.id === s.hostId || (p.ready && p.connected && !p.away));
}

export class CasualHost {
  phase: CasualPhase = 'gather';
  private driver: SetupHostDriver | null = null;
  private readonly openedAt: number;
  private setupDoneAt = 0;
  private stopPoll: (() => void) | null = null;

  constructor(
    private readonly host: CasualLobbyHost,
    private readonly deps: CasualHostDeps,
    /** Players the hub matched together, the host included. */
    private readonly expected: number,
  ) {
    this.openedAt = deps.sched.now();
    host.onSetupInput = (i) => this.driver?.input(i);
    this.stopPoll = deps.sched.every(CASUAL_TIMING.POLL_MS, () => this.poll());
  }

  /** One step of the controller (also run by the poll). */
  poll(): void {
    if (this.phase === 'ended' || this.phase === 'started') return;
    const s = this.host.lobby();
    if (!s) return this.end('gone');
    if (s.started) {
      this.phase = 'started';
      this.end('started');
      return;
    }
    const now = this.deps.sched.now();
    switch (this.phase) {
      case 'gather': {
        const seated = seatedIds(s);
        const waited = now - this.openedAt;
        const ready = seated.length >= 2 && allReady(s);
        if (ready && (seated.length >= this.expected || waited >= CASUAL_TIMING.GATHER_MS)) this.beginSetup(s);
        else if (seated.length < 2 && waited >= CASUAL_TIMING.ABANDON_MS) this.end('no-players');
        return;
      }
      case 'setup':
        this.driver?.presence(connectedIds(s));
        return;
      case 'starting':
        if (now - this.setupDoneAt > CASUAL_TIMING.START_RETRY_MS) {
          this.deps.log?.('[mp casual] the lobby never became startable');
          return;
        }
        this.host.hostIntent({ t: 'start' });
        return;
    }
  }

  private beginSetup(s: LobbyState): void {
    this.phase = 'setup';
    const players = seatedIds(s);
    this.driver = new SetupHostDriver(
      {
        now: () => this.deps.sched.now(),
        after: (ms, fn) => this.deps.sched.after(ms, fn),
        randomInt: () => this.deps.randomInt(),
        publish: (view: SetupView) => this.host.publishSetup(view),
        done: (r) => this.applyResult(r),
      },
      {
        kind: 'casual',
        queueMode: s.queueMode,
        players,
        connected: connectedIds(s),
        defaultRuleset: s.options.ruleset,
      },
    );
    this.driver.start();
  }

  private applyResult(r: SetupResult): void {
    this.phase = 'starting';
    this.setupDoneAt = this.deps.sched.now();
    const h = this.host;
    h.hostIntent({ t: 'set_option', key: 'ruleset', value: r.ruleset });
    if (r.trapCards !== null) h.hostIntent({ t: 'set_option', key: 'trapCards', value: r.trapCards });
    h.hostIntent({ t: 'set_deck', deck: r.deck, stake: r.stake, mpStake: null, challenge: null });
    h.hostIntent({ t: 'start' });
    if (h.lobby()?.started) {
      this.phase = 'started';
      this.end('started');
    }
  }

  private end(why: 'no-players' | 'gone' | 'started'): void {
    const wasEnded = this.phase === 'ended';
    if (why !== 'started') this.phase = 'ended';
    this.stop();
    if (!wasEnded) this.deps.onEnd(why);
  }

  stop(): void {
    this.stopPoll?.();
    this.stopPoll = null;
    this.driver?.stop();
    if (this.host.onSetupInput) this.host.onSetupInput = null;
  }
}

/** MM-02: a matched member re-sends READY 6× at 1.2 s. Returns a cancel function. */
export function autoReady(sched: Pick<Scheduler, 'after'>, send: () => boolean): () => void {
  let left: number = CASUAL_TIMING.AUTO_READY_TIMES;
  let cancel: (() => void) | null = null;
  const fire = () => {
    cancel = null;
    if (!send()) return;
    left -= 1;
    if (left > 0) cancel = sched.after(CASUAL_TIMING.AUTO_READY_EVERY_MS, fire);
  };
  fire();
  return () => {
    cancel?.();
    cancel = null;
  };
}
