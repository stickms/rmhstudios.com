import type { LocalCommand } from '../store';
import { TICK_MS, stepWorld, type Command, type World, type WorldEvent } from '../world';
import {
  MAX_PEER_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  decodeFrame,
  encodeJson,
  encodeSnapshot,
  peerMessageSchema,
  type HostMessage,
  type Link,
  type TickCommand,
} from './protocol';

/** A peer may issue this many commands a second; the bucket refills continuously and holds one second's worth. */
export const PEER_COMMANDS_PER_SECOND = 60;
const MAX_QUEUED_PER_PEER = 120;

interface PeerState {
  id: string;
  link: Link;
  joinOrder: number;
  /** Highest command seq applied for this peer; later duplicates (a resend after migration) are dropped. */
  lastSeq: number;
  tokens: number;
  queue: { seq: number; cmd: LocalCommand }[];
  needsSnapshot: boolean;
}

/**
 * The authoritative side. It owns the world, orders every command (peers' and its own) into 50 ms ticks, and
 * tells everyone the same thing at the same time. It never trusts a peer: messages are size-capped and parsed,
 * the sender's identity comes from `addPeer` (vouched by the signaling hub), and a flood is rate-limited.
 */
export class HostSession {
  readonly world: World;
  readonly hostId: string;
  /** Called with the events of every tick (for the host's own UI). */
  onEvents: ((events: readonly WorldEvent[]) => void) | null = null;
  private readonly peers = new Map<string, PeerState>();
  private joinCounter = 0;
  private readonly own: LocalCommand[] = [];
  private readonly acks: Record<string, number> = {};
  /** Counters a UI or a test can read. */
  readonly stats = { rateLimited: 0, rejectedFrames: 0 };

  constructor(world: World, hostId: string, knownAcks: Record<string, number> = {}) {
    this.world = world;
    this.hostId = hostId;
    Object.assign(this.acks, knownAcks);
    if (!world.players[hostId]) this.own.push({ type: 'join' });
  }

  /** The peer that takes over if this host disappears: the longest-connected one. */
  successor(): string | null {
    let best: PeerState | null = null;
    for (const p of this.peers.values()) if (p.link.open && (!best || p.joinOrder < best.joinOrder)) best = p;
    return best?.id ?? null;
  }

  /** The host's own command (the player hosting plays too). */
  submit(cmd: LocalCommand): void {
    this.own.push(cmd);
  }

  /** Admit a peer. `playerId` is the hub-vouched account id — never something the peer claims. */
  addPeer(playerId: string, link: Link): void {
    this.removePeer(playerId);
    const peer: PeerState = {
      id: playerId,
      link,
      joinOrder: this.joinCounter++,
      lastSeq: this.acks[playerId] ?? -1,
      tokens: PEER_COMMANDS_PER_SECOND,
      queue: [],
      needsSnapshot: false,
    };
    this.peers.set(playerId, peer);
    link.onmessage = (data) => this.receive(peer, data);
    link.onclose = () => {
      if (this.peers.get(playerId) === peer) this.peers.delete(playerId);
      this.broadcastSuccessor();
    };
    this.send(peer, { t: 'welcome', v: PROTOCOL_VERSION, you: playerId, successor: this.successor() });
    peer.link.send(encodeSnapshot(this.world, this.acks));
    // The peer joins the world through the same ordered stream everyone else sees.
    peer.queue.push({ seq: -1, cmd: { type: 'join' } });
    this.broadcastSuccessor();
  }

  removePeer(playerId: string): void {
    const p = this.peers.get(playerId);
    if (!p) return;
    this.peers.delete(playerId);
    p.link.onmessage = null;
    p.link.onclose = null;
    p.link.close();
    this.broadcastSuccessor();
  }

  peerIds(): string[] {
    return [...this.peers.keys()];
  }

  private send(peer: PeerState, msg: HostMessage): void {
    if (peer.link.open) peer.link.send(encodeJson(msg));
  }

  private broadcastSuccessor(): void {
    const id = this.successor();
    for (const p of this.peers.values()) this.send(p, { t: 'successor', id });
  }

  private receive(peer: PeerState, data: Uint8Array): void {
    const frame = decodeFrame(data, { maxJsonBytes: MAX_PEER_MESSAGE_BYTES });
    if (frame.kind !== 'json') {
      this.stats.rejectedFrames++;
      return;
    }
    const parsed = peerMessageSchema.safeParse(frame.value);
    if (!parsed.success) {
      this.stats.rejectedFrames++;
      return;
    }
    const msg = parsed.data;
    if (msg.t === 'resync') {
      peer.needsSnapshot = true;
      return;
    }
    if (peer.tokens < 1 || peer.queue.length >= MAX_QUEUED_PER_PEER) {
      this.stats.rateLimited++;
      return;
    }
    peer.tokens -= 1;
    // A peer cannot make itself exist or speak for someone else: its join is the host's doing, not its message.
    if (msg.cmd.type === 'join') {
      this.stats.rejectedFrames++;
      return;
    }
    peer.queue.push({ seq: msg.seq, cmd: msg.cmd });
  }

  /** Run one tick: order the queued commands, advance the world, tell everyone. */
  step(): WorldEvent[] {
    const ordered: TickCommand[] = [];
    for (const cmd of this.own.splice(0)) ordered.push({ p: this.hostId, cmd });
    for (const peer of this.peers.values()) {
      peer.tokens = Math.min(PEER_COMMANDS_PER_SECOND, peer.tokens + (PEER_COMMANDS_PER_SECOND * TICK_MS) / 1000);
      for (const item of peer.queue.splice(0)) {
        if (item.seq >= 0) {
          if (item.seq <= peer.lastSeq) continue; // already applied (a resend after migration)
          peer.lastSeq = item.seq;
          this.acks[peer.id] = item.seq;
        }
        ordered.push({ p: peer.id, cmd: item.cmd });
      }
    }
    const events = stepWorld(
      this.world,
      TICK_MS,
      ordered.map((c) => ({ ...c.cmd, playerId: c.p }) as Command),
    );
    const msg: HostMessage = { t: 'tick', n: this.world.tick, cmds: ordered, acks: { ...this.acks } };
    for (const peer of this.peers.values()) {
      if (peer.needsSnapshot) {
        peer.needsSnapshot = false;
        peer.link.send(encodeSnapshot(this.world, this.acks));
      } else {
        this.send(peer, msg);
      }
    }
    this.onEvents?.(events);
    return events;
  }
}
