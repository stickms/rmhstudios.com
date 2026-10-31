/**
 * The host's side of the star (PLAN §0.1): one WireLink per admitted member,
 * each on a DirectConnection (the host makes the offer) or, failing that, the
 * hub relay — which the member starts, so the host's link moves to it on the
 * member's first relayed frame, never on the host's own timeout. Identity
 * comes only from the hub's join request (userId, name, avatar) — a member's
 * claimed `f` is never trusted (TF2 pattern).
 *
 * This module only moves envelopes; what they mean is lobby-host.ts's job.
 */

import type { Envelope, WireData, WireKind } from '../wire';
import { relaySlotOf } from '../../../shared/p2p/relay';
import type { RelayPair } from '../../../shared/p2p/webrtc';
import type { BalatroS2CPayload } from '../../net/events';
import { hubRelayPair, readRelay, signalPayload } from './peer-admission';
import type { HubLike, PeerAttempt, PeerConnector, Scheduler } from './types';
import { WireLink, type ConnKind } from './wire-link';
import type { IceServerConfig } from '../../../shared/p2p/ice-core';

export interface StarMember {
  peerId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: 'player' | 'spectator';
  rejoin: boolean;
  link: WireLink;
  attempt: PeerAttempt | null;
  relay: RelayPair | null;
  /** Set once the link opened at least once. */
  opened: boolean;
}

export interface HostStarOptions {
  hub: HubLike;
  connector: PeerConnector;
  sched: Scheduler;
  ice: () => IceServerConfig[];
  onEnvelope(m: StarMember, env: Envelope): void;
  onOpen(m: StarMember): void;
  onClose(m: StarMember, reason: string): void;
  log?(msg: string): void;
}

export class HostStar {
  readonly members = new Map<string, StarMember>();
  private readonly offs: (() => void)[] = [];
  private stopped = false;

  constructor(private readonly o: HostStarOptions) {
    this.offs.push(
      o.hub.on('balatro:p2p:signal', (s) => {
        const m = this.members.get(s.from);
        if (!m || m.relay) return;
        m.attempt?.handle({ description: s.description, candidate: s.candidate });
      }),
      o.hub.on('balatro:p2p:relay', (bytes) => {
        const f = readRelay(bytes);
        if (!f) return;
        const m = this.bySlot(f.slot);
        if (!m) return;
        if (!m.relay) this.toRelay(m);
        m.relay?.deliver(f.reliable, f.payload);
      }),
    );
  }

  private bySlot(slot: number): StarMember | undefined {
    for (const m of this.members.values()) if (relaySlotOf(m.peerId) === slot) return m;
    return undefined;
  }

  /** Admit a join request: tell the hub, then open the direct path (host offers). */
  admit(req: BalatroS2CPayload<'balatro:p2p:join-request'>): StarMember {
    this.drop(req.peerId, 'replaced');
    const m: StarMember = {
      peerId: req.peerId,
      userId: req.userId,
      name: req.name,
      avatarUrl: req.avatarUrl,
      role: req.role,
      rejoin: req.rejoin,
      attempt: null,
      relay: null,
      opened: false,
      link: null as unknown as WireLink,
    };
    m.link = new WireLink({
      sched: this.o.sched,
      onEnvelope: (env) => this.o.onEnvelope(m, env),
      onOpen: () => {
        m.opened = true;
        this.o.onOpen(m);
      },
      onClose: (reason) => {
        this.o.log?.(`member ${m.userId} link closed (${reason})`);
        if (this.members.get(m.peerId) === m) this.o.onClose(m, reason);
      },
      onDrop: (why, detail) => this.o.log?.(`drop from ${m.userId}: ${why} ${detail ?? ''}`),
    });
    this.members.set(m.peerId, m);
    this.o.hub.emit('balatro:p2p:admit', { peerId: m.peerId, accept: true });
    m.attempt = this.o.connector.connect({
      role: 'host',
      ice: this.o.ice(),
      signal: (s) => {
        const p = signalPayload(s, m.peerId);
        if (p) this.o.hub.emit('balatro:p2p:signal', p);
      },
      onChannels: (pair, kind) => {
        if (m.relay || this.members.get(m.peerId) !== m) return;
        m.link.attach(pair, kind);
      },
      onFailed: () => {
        // No direct path: the member falls back too, and its first relayed frame moves this
        // link to the relay (the hub's relay handler above). Not before: the hub relays only
        // for a member that asked (relay:start), so a relay link opened now would hear nothing
        // until the member's own timer fires — seconds later on a starved page — and would time
        // out first, leaving a dead link that every rejoin repeated (E2E-15 on CI).
        if (this.members.get(m.peerId) !== m || m.relay) return;
        m.attempt?.close();
        m.attempt = null;
        this.o.log?.(`member ${m.userId}: no direct path; waiting for its relay`);
      },
    });
    return m;
  }

  /** Refuse a join request. */
  refuse(peerId: string, reason: 'full' | 'started' | 'version-mismatch' | 'host-refused'): void {
    this.o.hub.emit('balatro:p2p:admit', { peerId, accept: false, reason });
  }

  private toRelay(m: StarMember): void {
    const slot = relaySlotOf(m.peerId);
    if (slot === null) return;
    m.attempt?.close();
    m.attempt = null;
    const pair = hubRelayPair(this.o.hub, slot);
    m.relay = pair;
    m.link.attach(pair, 'relay');
    pair.unreliable.open();
    pair.reliable.open();
    this.o.log?.(`member ${m.userId} on the hub relay`);
  }

  connKind(m: StarMember): ConnKind {
    return m.link.kind ?? 'direct';
  }

  send<K extends WireKind>(peerId: string, k: K, d: WireData<K>, extra?: { f?: string; to?: string }): boolean {
    return this.members.get(peerId)?.link.send(k, d, extra) ?? false;
  }

  /** Every member (players and spectators) except `exceptPeer`. */
  broadcast<K extends WireKind>(k: K, d: WireData<K>, extra?: { f?: string; to?: string }, exceptPeer?: string): void {
    for (const m of this.members.values()) if (m.peerId !== exceptPeer) m.link.send(k, d, extra);
  }

  byUser(userId: string): StarMember | undefined {
    let found: StarMember | undefined;
    for (const m of this.members.values()) if (m.userId === userId) found = m;
    return found;
  }

  /** Forget a member and close its connection. */
  drop(peerId: string, why = 'dropped'): void {
    const m = this.members.get(peerId);
    if (!m) return;
    this.members.delete(peerId);
    m.link.close();
    m.attempt?.close();
    m.relay?.close();
    this.o.log?.(`member ${m.userId} dropped (${why})`);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const id of [...this.members.keys()]) this.drop(id, 'stopped');
    for (const off of this.offs.splice(0)) off();
  }
}
