import type { LocalCommand } from '../store';
import { TICK_MS, stepWorld, type Command, type World } from '../world';
import { HostSession } from './host';
import {
  decodeFrame,
  encodeJson,
  type HostMessage,
  type Link,
  type TickCommand,
} from './protocol';

interface Pending {
  seq: number;
  cmd: LocalCommand;
}

const clone = (w: World): World => structuredClone(w);

/**
 * The other side of a host. It keeps a CONFIRMED replica (advanced only by the host's ordered ticks, so it is
 * always a true past state of the host's world) and a VIEW (the replica plus this peer's not-yet-acknowledged
 * commands replayed on top, so its own actions show instantly — client-side prediction). When the host
 * acknowledges a command the replica catches up and the prediction is dropped; if the host refused it, the view
 * simply converges to the truth. If this peer is the named successor and the host vanishes, `promote()` turns its
 * replica into the new host.
 */
export class PeerSession {
  readonly myId: string;
  private link: Link;
  private confirmed: World | null = null;
  private _view: World | null = null;
  private pending: Pending[] = [];
  private nextSeq = 0;
  private acks: Record<string, number> = {};
  private awaitingSnapshot = true;
  /** Who the host says takes over if it leaves. */
  successor: string | null = null;
  /** True once the link to the host has closed. */
  hostLost = false;
  onChange: (() => void) | null = null;
  readonly stats = { resyncs: 0, protocolErrors: 0 };

  constructor(myId: string, link: Link) {
    this.myId = myId;
    this.link = link;
    this.attach(link);
  }

  private attach(link: Link) {
    this.link = link;
    link.onmessage = (data) => this.receive(data);
    link.onclose = () => {
      if (this.link === link) this.hostLost = true;
    };
  }

  /** The world to draw: what the host has confirmed, plus this peer's own pending commands. */
  get view(): World | null {
    return this._view;
  }

  get ready(): boolean {
    return this.confirmed !== null && !this.awaitingSnapshot;
  }

  /** Issue a command: shown immediately here, ordered by the host. */
  send(cmd: LocalCommand): void {
    if (cmd.type === 'join') return;
    const item: Pending = { seq: this.nextSeq++, cmd };
    this.pending.push(item);
    if (this.link.open) this.link.send(encodeJson({ t: 'cmd', seq: item.seq, cmd }));
    this.rebuildView();
    this.onChange?.();
  }

  private rebuildView() {
    if (!this.confirmed) return;
    const v = clone(this.confirmed);
    for (const p of this.pending) stepWorld(v, 0, [{ ...p.cmd, playerId: this.myId } as Command]);
    this._view = v;
  }

  private receive(data: Uint8Array) {
    const frame = decodeFrame(data);
    if (frame.kind === 'snapshot') {
      this.confirmed = frame.world;
      this.acks = frame.acks;
      this.awaitingSnapshot = false;
      this.dropAcked();
      this.rebuildView();
      this.onChange?.();
      return;
    }
    if (frame.kind !== 'json' || !frame.value || typeof frame.value !== 'object') {
      this.stats.protocolErrors++;
      return;
    }
    const msg = frame.value as HostMessage;
    if (msg.t === 'welcome') {
      this.successor = msg.successor;
    } else if (msg.t === 'successor') {
      this.successor = msg.id;
    } else if (msg.t === 'tick') {
      this.applyTick(msg);
    } else {
      this.stats.protocolErrors++;
    }
  }

  private applyTick(msg: Extract<HostMessage, { t: 'tick' }>) {
    const w = this.confirmed;
    if (!w || this.awaitingSnapshot) return; // ticks before the snapshot are not for us
    if (msg.n <= w.tick) return; // a duplicate
    if (msg.n !== w.tick + 1) {
      // We missed one: our replica is no longer a true past state. Ask for a fresh one and wait.
      this.awaitingSnapshot = true;
      this.stats.resyncs++;
      if (this.link.open) this.link.send(encodeJson({ t: 'resync' }));
      return;
    }
    const cmds = msg.cmds.map((c: TickCommand) => ({ ...c.cmd, playerId: c.p }) as Command);
    stepWorld(w, TICK_MS, cmds);
    this.acks = { ...this.acks, ...msg.acks };
    this.dropAcked();
    this.rebuildView();
    this.onChange?.();
  }

  private dropAcked() {
    const acked = this.acks[this.myId] ?? -1;
    this.pending = this.pending.filter((p) => p.seq > acked);
  }

  /** The host is gone and a new one is reachable: talk to it instead, and replay what it has not seen. */
  rebind(link: Link): void {
    this.hostLost = false;
    this.awaitingSnapshot = true;
    this.attach(link);
    for (const p of this.pending) if (link.open) link.send(encodeJson({ t: 'cmd', seq: p.seq, cmd: p.cmd }));
  }

  /**
   * Become the host, from our replica. Everything the old host had confirmed to us survives; the acks we know
   * carry over, so a peer re-sending a command the old host already applied is not applied twice.
   */
  promote(): HostSession {
    if (!this.confirmed) throw new Error('no replica to promote');
    this.link.onmessage = null;
    this.link.onclose = null;
    return new HostSession(clone(this.confirmed), this.myId, this.acks);
  }
}
