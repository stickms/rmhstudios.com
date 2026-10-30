/**
 * The browser's half of a peer-to-peer transport: an `RTCPeerConnection` per
 * host ↔ member pair carrying two negotiated DataChannels, and the hub-relay
 * stand-in used when no direct path exists. Extracted from the TF2 transport
 * (lib/tf2-game/client/net/webrtc.ts wraps it with TF2's env and test hooks).
 *
 *   - Both channels are `negotiated` with fixed ids (0 `unreliable`:
 *     `ordered: false, maxRetransmits: 0`; 1 `reliable`: ordered), so each side
 *     creates them itself and there is no `ondatachannel` race.
 *   - The host makes the offer; candidates trickle through the hub, queued
 *     until the remote description is set.
 *   - ICE tries host and STUN candidates (direct), then TURN (short-lived
 *     credentials the hub minted for the account), and when no pair connects
 *     within `DIRECT_TIMEOUT_MS` (8 s; `TURN_TIMEOUT_MS` 12 s with a TURN
 *     server: an allocation takes round trips) or the connection fails,
 *     `onFailed` tells the owner to ask for the hub relay; both sides then
 *     swap in `RelayChannel`s. The link above never knows the difference.
 *     The connection is labelled from the selected candidate pair: `direct`,
 *     or `turn` when a `relay` candidate carries it on either side.
 *
 * This module reads no globals and no env: the owner resolves the ICE list
 * (`./ice.ts` resolveIceServers) and passes its app's test hooks.
 *
 * Browser only (DataChannelAdapter, DirectConnection); RelayChannel and
 * relayPair are environment-agnostic.
 */

import type { ChannelLike, ChannelPair } from './channel';
import { hasTurn, type IceServerConfig } from './ice';
import { encodeRelay } from './relay';

export type { ChannelPair } from './channel';

export const DIRECT_TIMEOUT_MS = 8_000;
/** With a TURN server to try, the wait before the hub relay is longer (an allocation takes round trips). */
export const TURN_TIMEOUT_MS = 12_000;

/** Test-only knobs an app reads from its own global and passes in. */
export interface P2pTestHooks {
  /** Overrides the ICE servers (the owner applies it when resolving). */
  iceServers?: IceServerConfig[];
  /** Drop every local candidate (a direct path can never form). */
  blockCandidates?: boolean;
  /** Only TURN candidates (iceTransportPolicy 'relay'): proves the TURN path in a test. */
  relayOnly?: boolean;
  directTimeoutMs?: number;
}

export interface SessionDescriptionLike {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface IceCandidateLike {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** One outgoing signal: exactly one of a description or a candidate (null = end of candidates). */
export interface SignalOut {
  description?: SessionDescriptionLike;
  candidate?: IceCandidateLike | null;
}

/** Messages held while nobody listens yet (the other side may send the moment the channel opens). */
const EARLY_MESSAGES_MAX = 512;

/**
 * An `RTCDataChannel` as a `ChannelLike` (binary in, `Uint8Array` out). Messages that arrive
 * before a listener is set — the other side sends the moment its end opens, while this end is
 * still labelling the connection — are held and handed over when one is.
 */
export class DataChannelAdapter implements ChannelLike {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  private listener: ((data: Uint8Array) => void) | null = null;
  private early: Uint8Array[] = [];
  private draining = false;

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
 * One direction-agnostic "channel" over the hub relay: sends go out as relay
 * frames (`./relay.ts`) with the member's slot and the reliable flag; whoever
 * owns the pair hands incoming payloads to `deliver`. Reliable packets ride
 * socket.io's ordered stream; unreliable ones may be dropped by the hub.
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
  /** The resolved ICE servers (hub list, env or defaults: `./ice.ts`). */
  iceServers: IceServerConfig[];
  /** This app's test hooks (blockCandidates, relayOnly, directTimeoutMs); default none. */
  hooks?: P2pTestHooks;
  /**
   * Whether to signal the end of candidates (`candidate: null`). Default true; an app whose hub
   * contract has no null candidate (Balatro) passes false.
   */
  endOfCandidates?: boolean;
  /** Sends one signal to the other side (through the hub). */
  signal: (s: SignalOut) => void;
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
    const hooks = opts.hooks ?? {};
    this.blockCandidates = hooks.blockCandidates === true;
    const servers = opts.iceServers;
    const endOfCandidates = opts.endOfCandidates !== false;
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
      if (!c && !endOfCandidates) return;
      opts.signal({
        candidate: c
          ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment }
          : null,
      });
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed' && !this.done) this.fail('failed');
    };
    this.timer = setTimeout(() => this.fail('timeout'), hooks.directTimeoutMs ?? (hasTurn(servers) ? TURN_TIMEOUT_MS : DIRECT_TIMEOUT_MS));
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
  async handle(signal: { description?: SessionDescriptionLike; candidate?: IceCandidateLike | null }): Promise<void> {
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
