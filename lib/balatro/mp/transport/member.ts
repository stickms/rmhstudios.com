/**
 * A member's single connection to its host (PLAN §0.1): a DirectConnection
 * (the member answers the host's offer), or the hub relay when no direct
 * path forms (the member starts it: `balatro:p2p:relay:start`).
 *
 * Every envelope arrives from the host. The host-only rule is applied here:
 * a host-only kind that carries `f` was relayed for someone else and is
 * dropped; anything else without `f` came from the host itself.
 */

import { relaySlotOf, type IceServerConfig, type RelayPair } from '../../../shared/p2p';
import { isHostOnly, type Envelope, type WireData, type WireKind } from '../wire';
import { hubRelayPair, readRelay, signalPayload } from './peer-admission';
import type { HubLike, PeerAttempt, PeerConnector, Scheduler } from './types';
import { WireLink, type ConnKind } from './wire-link';

export interface MemberLinkOptions {
  hub: HubLike;
  connector: PeerConnector;
  sched: Scheduler;
  ice: IceServerConfig[];
  myPeerId: string;
  /** `from` is the original sender: `f` when the host relayed it, else the host's own id. */
  onEnvelope(env: Envelope, from: string | null): void;
  onOpen(): void;
  onClose(reason: string): void;
  log?(msg: string): void;
}

export class MemberLink {
  readonly link: WireLink;
  private attempt: PeerAttempt | null = null;
  private relay: RelayPair | null = null;
  private readonly offs: (() => void)[] = [];
  dropped = 0;

  constructor(private readonly o: MemberLinkOptions) {
    this.link = new WireLink({
      sched: o.sched,
      onEnvelope: (env) => this.onEnvelope(env),
      onOpen: () => o.onOpen(),
      onClose: (reason) => o.onClose(reason),
      onDrop: (why, detail) => o.log?.(`drop from host: ${why} ${detail ?? ''}`),
    });
    this.offs.push(
      o.hub.on('balatro:p2p:signal', (s) => {
        if (!this.relay) this.attempt?.handle({ description: s.description, candidate: s.candidate });
      }),
      o.hub.on('balatro:p2p:relay', (bytes) => {
        const f = readRelay(bytes);
        if (!f) return;
        if (!this.relay) this.toRelay();
        this.relay?.deliver(f.reliable, f.payload);
      }),
    );
    this.attempt = o.connector.connect({
      role: 'member',
      ice: o.ice,
      signal: (s) => {
        const p = signalPayload(s);
        if (p) o.hub.emit('balatro:p2p:signal', p);
      },
      onChannels: (pair, kind) => {
        if (!this.relay) this.link.attach(pair, kind);
      },
      onFailed: () => {
        if (!this.relay) this.toRelay();
      },
    });
  }

  private toRelay(): void {
    this.attempt?.close();
    this.attempt = null;
    this.o.hub.emit('balatro:p2p:relay:start', {});
    const pair = hubRelayPair(this.o.hub, relaySlotOf(this.o.myPeerId) ?? 1);
    this.relay = pair;
    this.link.attach(pair, 'relay');
    pair.unreliable.open();
    pair.reliable.open();
    this.o.log?.('on the hub relay');
  }

  private onEnvelope(env: Envelope): void {
    if (isHostOnly(env.k) && env.f !== undefined) {
      this.dropped += 1;
      return;
    }
    this.o.onEnvelope(env, env.f ?? null);
  }

  get kind(): ConnKind | null {
    return this.link.kind;
  }

  send<K extends WireKind>(k: K, d: WireData<K>, extra?: { to?: string }): boolean {
    return this.link.send(k, d, extra);
  }

  close(): void {
    for (const off of this.offs.splice(0)) off();
    this.link.close(); // first: a closing relay channel must not report a link loss
    this.attempt?.close();
    this.attempt = null;
    this.relay?.close();
    this.relay = null;
  }
}
