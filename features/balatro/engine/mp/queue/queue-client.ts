/**
 * Balatro multiplayer — the casual queue as one player sees it (MM-01,
 * MM-06, PR-05; WS12).
 *
 * Holds the queue view Lua draws (`queue_view`: idle / searching / matched /
 * cancelled, the mode and the head count) and turns intents into hub events:
 * `find` (solo, `balatro:queue:join`), `findParty` (the party host,
 * `balatro:party:queue`) and `cancel` (`balatro:queue:leave`). The hub answers
 * with `balatro:queue:status`; a refusal is a `balatro:p2p:error` naming the
 * queue event. The hub cancels a ticket whose socket drops, so a hub that goes
 * offline mid-search ends the search here too.
 *
 * `matched` is reported through `onMatched`: the host learns its role at
 * once; a member learns it first without a code and then again with the code
 * of the room the host made. Browser-free, zod-free (MP chunk; the hub client
 * already validated every payload).
 */

import type { BalatroS2CPayload, QueueMode } from '../../net/events';
import type { HubLike } from '../transport/types';

export type QueueState = 'idle' | 'searching' | 'matched' | 'cancelled';

export interface QueueView {
  state: QueueState;
  queueMode: QueueMode;
  waiting?: number;
}

export interface QueueMatched {
  queueMode: QueueMode;
  role: 'host' | 'member';
  /** The casual room's code (members, once the host made it). */
  code?: string;
  /** Players matched together, the host included. */
  waiting: number;
}

export interface QueueClientDeps {
  hub: HubLike;
  contentHash: string;
  onView(v: QueueView): void;
  onMatched(m: QueueMatched): void;
  /** A refusal (`seat-held`, `not-host`, `full`, `offline`, …) for Lua's `lobby_error`. */
  onError(code: string): void;
}

const QUEUE_EVENTS = new Set(['balatro:queue:join', 'balatro:queue:leave', 'balatro:party:queue']);

export class QueueClient {
  private v: QueueView = { state: 'idle', queueMode: 'pvp_nemesis' };
  private readonly offs: (() => void)[] = [];
  private stopped = false;

  constructor(private readonly deps: QueueClientDeps) {
    const hub = deps.hub;
    this.offs.push(
      hub.on('balatro:queue:status', (d) => this.onStatus(d)),
      hub.on('balatro:p2p:error', (d) => {
        if (!QUEUE_EVENTS.has(d.event)) return;
        if (this.v.state === 'searching') this.setView({ state: 'cancelled', queueMode: this.v.queueMode });
        deps.onError(d.code);
      }),
      hub.onStatus((s) => {
        // The hub drops a ticket with its socket: the search is over.
        if (s !== 'connected' && this.v.state === 'searching') {
          this.setView({ state: 'cancelled', queueMode: this.v.queueMode });
          deps.onError('offline');
        }
      }),
    );
  }

  get view(): QueueView {
    return this.v;
  }

  /** Searching (PR-05: Practice refuses to start meanwhile). */
  isQueued(): boolean {
    return this.v.state === 'searching';
  }

  find(queueMode: QueueMode): boolean {
    if (!this.ready()) return false;
    this.deps.hub.emit('balatro:queue:join', { queueMode, contentHash: this.deps.contentHash });
    this.setView({ state: 'searching', queueMode });
    return true;
  }

  /** The party host queues its party (`code` = its party room). */
  findParty(code: string, queueMode: QueueMode): boolean {
    if (!this.ready()) return false;
    this.deps.hub.emit('balatro:party:queue', { code, queueMode });
    this.setView({ state: 'searching', queueMode });
    return true;
  }

  cancel(): void {
    if (this.stopped) return;
    this.deps.hub.emit('balatro:queue:leave', {});
    if (this.v.state === 'searching') this.setView({ state: 'cancelled', queueMode: this.v.queueMode });
  }

  /** Back to idle (the match lobby took over, or the player left it). */
  reset(): void {
    if (this.v.state !== 'idle') this.setView({ state: 'idle', queueMode: this.v.queueMode });
  }

  stop(): void {
    if (this.stopped) return;
    if (this.v.state === 'searching') this.deps.hub.emit('balatro:queue:leave', {});
    this.stopped = true;
    for (const off of this.offs.splice(0)) off();
  }

  private ready(): boolean {
    if (this.stopped) return false;
    if (this.deps.hub.status !== 'connected') {
      this.deps.onError('offline');
      return false;
    }
    return true;
  }

  private onStatus(d: BalatroS2CPayload<'balatro:queue:status'>): void {
    if (this.stopped) return;
    switch (d.state) {
      case 'searching':
        // A party member learns of the search from the hub alone (its host queued).
        this.setView({ state: 'searching', queueMode: d.queueMode, waiting: d.waiting });
        return;
      case 'cancelled':
        this.setView({ state: 'cancelled', queueMode: d.queueMode });
        return;
      case 'matched': {
        const waiting = d.waiting ?? 2;
        this.setView({ state: 'matched', queueMode: d.queueMode, waiting });
        const m: QueueMatched = { queueMode: d.queueMode, role: d.role ?? 'member', waiting };
        if (d.code) m.code = d.code;
        this.deps.onMatched(m);
        return;
      }
    }
  }

  private setView(v: QueueView): void {
    const same = v.state === this.v.state && v.queueMode === this.v.queueMode && v.waiting === this.v.waiting;
    this.v = v;
    if (!same) this.deps.onView(v);
  }
}
