/**
 * Keeps the session's hub emits in the order the player acted.
 *
 * A host's deliberate Leave sends its hub `leave` only after LEAVE_DRAIN_MS
 * (lobby-host.ts: the forfeit, its checkpoint and the `bye` go out over P2P
 * before the hub promotes a successor). Anything the player does meanwhile —
 * Create, Join, the Seat-held prompt — used to reach the hub FIRST, while the
 * old room still held this account's seat, and was refused with `seat-held`
 * (the e2e suite's "Return to Lobby, Leave, Create").
 *
 * `HubGate` wraps the runtime's HubLike. `after(ms, fn)` runs `fn` (which
 * emits on the inner hub) after `ms`, and every `emit` made through the gate
 * in the meantime waits in a queue and goes out right after it, in order.
 * Socket.io keeps one socket's events in order, so the hub then always sees
 * `leave` before the next role's first event. Listeners pass straight through.
 *
 * Browser-free (MP chunk).
 */

import type { BalatroC2SEvent, BalatroS2CEvent, BalatroS2CPayload } from '../../net/events';
import type { HubLike, HubOut, HubStatus, Scheduler } from '../transport/types';

type Queued = () => void;

export class HubGate implements HubLike {
  /** Deferred sends not yet run (each holds the queue). */
  private holds = 0;
  private readonly queue: Queued[] = [];

  constructor(
    private readonly inner: HubLike,
    private readonly sched: Scheduler,
  ) {}

  get status(): HubStatus {
    return this.inner.status;
  }

  /** True while a deferred send is pending (later emits wait for it). */
  get holding(): boolean {
    return this.holds > 0;
  }

  emit<K extends BalatroC2SEvent>(event: K, data: HubOut<K>): void {
    if (this.holds > 0) {
      this.queue.push(() => this.inner.emit(event, data));
      return;
    }
    this.inner.emit(event, data);
  }

  /**
   * Run `send` after `ms`, holding every later emit until it has run. `send`
   * emits on `direct` (the inner hub), so it is never queued behind itself.
   */
  after(ms: number, send: (direct: HubLike) => void): void {
    this.holds += 1;
    this.sched.after(ms, () => {
      try {
        send(this.inner);
      } finally {
        this.holds -= 1;
        while (this.holds === 0 && this.queue.length > 0) this.queue.shift()?.();
      }
    });
  }

  on<K extends BalatroS2CEvent>(event: K, fn: (d: BalatroS2CPayload<K>) => void): () => void {
    return this.inner.on(event, fn);
  }

  onStatus(fn: (s: HubStatus, info: { reconnect: boolean; reason?: string }) => void): () => void {
    return this.inner.onStatus(fn);
  }

  account(): Promise<{ id: string; name: string; avatarUrl: string | null } | null> {
    return this.inner.account();
  }

  destroy(): void {
    this.inner.destroy();
  }
}
