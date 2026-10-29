/**
 * The browser's half of the peer-to-peer transport: an `RTCPeerConnection`
 * per host ↔ member pair carrying the two DataChannels `PeerLink`
 * (net/p2p/link.ts) runs on, and the hub-relay stand-in used when no direct
 * path exists.
 *
 *   - Both channels are `negotiated` with fixed ids (0 `unreliable`:
 *     `ordered: false, maxRetransmits: 0`; 1 `reliable`: ordered), so each side
 *     creates them itself and there is no `ondatachannel` race.
 *   - The host makes the offer; candidates trickle through the hub
 *     (`tf2:p2p:signal`), queued until the remote description is set.
 *   - ICE tries, in order: host and STUN candidates (direct), then TURN — the
 *     hub hands each account short-lived TURN credentials with its room
 *     (lib/call/ice.ts minting; no static credential is ever in the bundle) —
 *     and only then, when no pair connects within `DIRECT_TIMEOUT_MS` (8 s,
 *     `TURN_TIMEOUT_MS` 12 s when a TURN server is configured: an allocation
 *     takes a few round trips), the hub relay (`tf2:p2p:relay:start`); both
 *     sides then swap in `RelayChannel`s and close the peer connection. The
 *     link above never knows the difference. The connection is labelled from
 *     the selected candidate pair: Direct, TURN (a `relay` candidate) or
 *     Relayed (the hub).
 *
 * Test hooks (`globalThis.__tf2P2pTest`, read once per connection; the
 * real-browser smoke sets them with an init script): `iceServers` overrides
 * the configured servers, `blockCandidates` drops every local candidate (so a
 * direct path can never form), `relayOnly` gathers only TURN candidates,
 * `directTimeoutMs` shortens the wait.
 *
 * Browser only.
 */

import type { ChannelLike } from '../../net/p2p/link';
import { parseIceServers, type IceServerConfig } from '../../net/p2p/ice';
import { encodeRelay, zIceServers, type IceCandidateLike, type P2pSignalIn, type P2pSignalOut, type SessionDescriptionLike } from '../../net/p2p/signal';

export const DIRECT_TIMEOUT_MS = 8_000;
/** With a TURN server to try, the wait before the hub relay is longer (an allocation takes round trips). */
export const TURN_TIMEOUT_MS = 12_000;

export interface P2pTestHooks {
  iceServers?: IceServerConfig[];
  blockCandidates?: boolean;
  /** Only TURN candidates (iceTransportPolicy 'relay'): proves the TURN path in a test. */
  relayOnly?: boolean;
  directTimeoutMs?: number;
}

function testHooks(): P2pTestHooks {
  const hooks = (globalThis as { __tf2P2pTest?: P2pTestHooks }).__tf2P2pTest;
  return hooks && typeof hooks === 'object' ? hooks : {};
}

/**
 * The ICE servers to use: the test override; else the hub's list for this account (STUN, then TURN
 * with a short-lived credential), checked again here; else `VITE_TF2_ICE_SERVERS` (net/p2p/ice.ts)
 * or the default public STUN servers.
 */
export function tf2IceServers(fromHub?: unknown): IceServerConfig[] {
  const hooks = testHooks();
  if (Array.isArray(hooks.iceServers)) return hooks.iceServers;
  const hub = fromHub === undefined ? null : zIceServers.safeParse(fromHub);
  if (hub?.success && hub.data.length > 0) return hub.data;
  return parseIceServers(import.meta.env.VITE_TF2_ICE_SERVERS);
}

/** Whether a list has a TURN server (the wait before the hub relay is longer then). */
export function hasTurnServer(servers: readonly IceServerConfig[]): boolean {
  return servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(u)));
}

/** Messages held while nobody listens yet (the other side may send the moment the channel opens). */
const EARLY_MESSAGES_MAX = 512;

/**
 * An `RTCDataChannel` as the link's `ChannelLike` (binary in, `Uint8Array` out). Messages that arrive
 * before a listener is set — the other side sends its first reliable batch the moment its end opens,
 * while this end is still labelling the connection — are held and handed over when one is.
 */
export class DataChannelAdapter implements ChannelLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  private listener: ((data: Uint8Array) => void) | null = null;
  private early: Uint8Array[] = [];

  get onmessage(): ((data: Uint8Array) => void) | null {
    return this.listener;
  }

  set onmessage(fn: ((data: Uint8Array) => void) | null) {
    this.listener = fn;
    if (!fn || this.early.length === 0 || this.draining) return;
    // Handed over once whoever set the listener has finished constructing (in order: anything that
    // arrives meanwhile queues behind the held messages).
    this.draining = true;
    queueMicrotask(() => {
      this.draining = false;
      const held = this.early;
      this.early = [];
      for (const m of held) this.listener?.(m);
    });
  }

  private draining = false;

  constructor(private readonly dc: RTCDataChannel) {
    dc.binaryType = 'arraybuffer';
    dc.onmessage = (e) => {
      const d = e.data;
      if (!(d instanceof ArrayBuffer)) return;
      const m = new Uint8Array(d);
      if (this.listener && !this.draining) this.listener(m);
      else if (this.early.length < EARLY_MESSAGES_MAX) this.early.push(m);
    };
    dc.onopen = () => this.onopen?.();
    dc.onclose = () => this.onclose?.();
    dc.onbufferedamountlow = () => this.onbufferedamountlow?.();
  }

  get readyState(): ChannelLike['readyState'] {
    return this.dc.readyState;
  }

  get bufferedAmount(): number {
    return this.dc.bufferedAmount;
  }

  get bufferedAmountLowThreshold(): number {
    return this.dc.bufferedAmountLowThreshold;
  }

  set bufferedAmountLowThreshold(v: number) {
    this.dc.bufferedAmountLowThreshold = v;
  }

  send(data: Uint8Array): void {
    this.dc.send(data as Uint8Array<ArrayBuffer>);
  }

  close(): void {
    this.dc.close();
  }
}

/**
 * One direction-agnostic "channel" over the hub relay: sends go out as
 * `tf2:p2p:relay` packets with the member's slot and the reliable flag;
 * whoever owns the pair hands incoming payloads to `deliver`. Reliable
 * packets ride socket.io's ordered stream; unreliable ones are volatile.
 */
export class RelayChannel implements ChannelLike {
  readyState: ChannelLike['readyState'] = 'connecting';
  readonly bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  onmessage: ((data: Uint8Array) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;

  constructor(
    private readonly slot: number,
    private readonly reliable: boolean,
    private readonly sendRelay: (packet: Uint8Array, reliable: boolean) => boolean,
  ) {}

  open(): void {
    if (this.readyState !== 'connecting') return;
    this.readyState = 'open';
    this.onopen?.();
  }

  send(data: Uint8Array): void {
    if (this.readyState !== 'open') throw new Error('relay channel is not open');
    this.sendRelay(encodeRelay(this.slot, this.reliable, data), this.reliable);
  }

  deliver(data: Uint8Array): void {
    if (this.readyState === 'open') this.onmessage?.(data);
  }

  close(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
  }
}

export interface ChannelPair {
  unreliable: ChannelLike;
  reliable: ChannelLike;
}

export interface RelayPair extends ChannelPair {
  unreliable: RelayChannel;
  reliable: RelayChannel;
  deliver(reliable: boolean, payload: Uint8Array): void;
  close(): void;
}

export function relayPair(slot: number, sendRelay: (packet: Uint8Array, reliable: boolean) => boolean): RelayPair {
  const unreliable = new RelayChannel(slot, false, sendRelay);
  const reliable = new RelayChannel(slot, true, sendRelay);
  return {
    unreliable,
    reliable,
    deliver: (isReliable, payload) => (isReliable ? reliable : unreliable).deliver(payload),
    close: () => {
      unreliable.close();
      reliable.close();
    },
  };
}

export interface DirectConnectionOptions {
  role: 'host' | 'member';
  /** This account's ICE servers from the hub (STUN, TURN); undefined: the configured ones. */
  iceServers?: unknown;
  /** Sends one signal to the other side (through the hub). */
  signal: (s: Omit<P2pSignalOut, 'to'>) => void;
  /** Both channels open: hand them to a link. `turn` when a TURN server carries the pair. */
  onChannels: (pair: ChannelPair, kind: 'direct' | 'turn') => void;
  /** No direct or TURN path in time (or the connection failed): ask for the hub relay. */
  onFailed: (why: 'timeout' | 'failed') => void;
}

/** The direct WebRTC path for one host ↔ member pair. */
export class DirectConnection {
  private readonly pc: RTCPeerConnection;
  private readonly u: DataChannelAdapter;
  private readonly r: DataChannelAdapter;
  private readonly pending: IceCandidateLike[] = [];
  private remoteSet = false;
  private done = false;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly blockCandidates: boolean;

  constructor(private readonly opts: DirectConnectionOptions) {
    const hooks = testHooks();
    this.blockCandidates = hooks.blockCandidates === true;
    const servers = tf2IceServers(opts.iceServers);
    this.pc = new RTCPeerConnection({
      iceServers: servers as RTCIceServer[],
      iceTransportPolicy: hooks.relayOnly ? 'relay' : 'all',
    });
    this.u = new DataChannelAdapter(this.pc.createDataChannel('unreliable', { ordered: false, maxRetransmits: 0, negotiated: true, id: 0 }));
    this.r = new DataChannelAdapter(this.pc.createDataChannel('reliable', { ordered: true, negotiated: true, id: 1 }));
    let open = 0;
    const onOpen = () => {
      open++;
      if (open === 2 && !this.done) {
        this.done = true;
        clearTimeout(this.timer);
        // The label (Direct / TURN) from the selected pair; the stats answer within a frame or two.
        const pair = { unreliable: this.u, reliable: this.r };
        void Promise.race([this.candidateType(), new Promise<null>((r) => setTimeout(() => r(null), 500))]).then((type) =>
          opts.onChannels(pair, type === 'relay' ? 'turn' : 'direct'),
        );
      }
    };
    this.u.onopen = onOpen;
    this.r.onopen = onOpen;
    this.pc.onicecandidate = (e) => {
      if (this.blockCandidates && e.candidate) return;
      const c = e.candidate;
      opts.signal({
        candidate: c
          ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment }
          : null,
      });
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed' && !this.done) this.fail('failed');
    };
    this.timer = setTimeout(() => this.fail('timeout'), hooks.directTimeoutMs ?? (hasTurnServer(servers) ? TURN_TIMEOUT_MS : DIRECT_TIMEOUT_MS));
    if (opts.role === 'host') void this.offer();
  }

  /**
   * The connection type of the selected pair: `relay` when a TURN server carries it on EITHER side (a
   * member behind TURN reaches a host's direct candidate through its relay: both ends say TURN).
   */
  async candidateType(): Promise<string | null> {
    try {
      const stats = await this.pc.getStats();
      let pairId: string | null = null;
      stats.forEach((s) => {
        if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId as string;
      });
      if (!pairId) return null;
      const pair = stats.get(pairId) as { localCandidateId?: string; remoteCandidateId?: string } | undefined;
      const type = (id?: string) => (id ? (stats.get(id) as { candidateType?: string } | undefined)?.candidateType : undefined);
      const local = type(pair?.localCandidateId);
      const remote = type(pair?.remoteCandidateId);
      return local === 'relay' || remote === 'relay' ? 'relay' : (local ?? null);
    } catch {
      return null;
    }
  }

  private fail(why: 'timeout' | 'failed'): void {
    if (this.done) return;
    this.done = true;
    clearTimeout(this.timer);
    this.opts.onFailed(why);
  }

  private async offer(): Promise<void> {
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.opts.signal({ description: { type: 'offer', sdp: offer.sdp ?? '' } });
    } catch {
      this.fail('failed');
    }
  }

  /** A signal from the other side (already schema-checked). */
  async handle(signal: Pick<P2pSignalIn, 'description' | 'candidate'>): Promise<void> {
    try {
      if (signal.description) await this.onDescription(signal.description);
      else if (signal.candidate !== undefined) await this.onCandidate(signal.candidate);
    } catch {
      /* a bad signal: the timeout decides */
    }
  }

  private async onDescription(d: SessionDescriptionLike): Promise<void> {
    if (this.opts.role === 'host' && d.type !== 'answer') return;
    if (this.opts.role === 'member' && d.type !== 'offer') return;
    await this.pc.setRemoteDescription({ type: d.type, sdp: d.sdp });
    this.remoteSet = true;
    for (const c of this.pending.splice(0)) await this.pc.addIceCandidate(c);
    if (d.type === 'offer') {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.opts.signal({ description: { type: 'answer', sdp: answer.sdp ?? '' } });
    }
  }

  private async onCandidate(c: IceCandidateLike | null): Promise<void> {
    if (!c) return;
    if (!this.remoteSet) {
      this.pending.push(c);
      return;
    }
    await this.pc.addIceCandidate(c);
  }

  /** Close the peer connection (the relay took over, or the session ended). */
  close(): void {
    this.done = true;
    clearTimeout(this.timer);
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    try {
      this.pc.close();
    } catch {
      /* closed */
    }
  }
}
