/**
 * The lobby and transport of a Hearthworks multiplayer session: everything between the hub's signalling
 * events and the session core (`HostSession` / `PeerSession`), with every outside dependency injected
 * (`HubLike`, `PeerConnector`, `Scheduler`) so the whole flow runs in Node on fake channels and a fake clock.
 *
 * Host flow:   create room → the hub vouches each joiner (`join-request`) → admit → a `DirectConnection`
 *              (the host offers) per member → its channels become a `Link` → `HostSession.addPeer(accountId, link)`.
 * Member flow: join → `admitted` → `DirectConnection` (the member answers) → `Link` → `PeerSession`.
 * Fallback:    when no direct or TURN path forms the member asks the hub for the relay (`relay:start`); the
 *              host moves that member's link to the relay on its first relayed frame. Same `Link`, same session.
 * Migration:   the host keeps naming `HostSession.successor()` to the hub. When the host goes, the hub promotes
 *              the successor (`promote` → `PeerSession.promote()` → a new `HostSession`), tells the others
 *              (`host-changed`) and the new host admits them again; each member `PeerSession.rebind`s to it.
 *
 * The hub carries signalling only. No command, tick or world byte ever touches it except as an opaque,
 * byte-budgeted relay frame for a member whose direct path failed.
 */

import { relayPair, type RelayPair, type SignalOut } from '@/lib/shared/p2p/webrtc';
import { decodeRelay, relaySlotOf } from '@/lib/shared/p2p/relay';
import { resolveIceServers } from '@/lib/shared/p2p/ice';
import type { IceServerConfig } from '@/lib/shared/p2p/ice-core';
import type { PeerAttempt, PeerConnector, Scheduler } from '@/lib/shared/p2p/connector';
import { realScheduler } from '@/lib/shared/p2p/connector';
import type { World } from '../world';
import { channelPairToLink, type ChannelLink, type ConnKind } from './channel-link';
import {
  HW_LIMITS,
  type HwC2SEvent,
  type HwC2SPayload,
  type HwRoomEntry,
  type HwRosterEntry,
  type HwS2CEvent,
  type HwS2CPayload,
} from './events';
import { HostSession } from './host';
import { LOCAL_PLAYER_ID, rekeyPlayer } from './identity';
import { PeerSession } from './peer';

/* ─── The seams ──────────────────────────────────────────────────────────── */

export type HubStatus = 'connected' | 'connecting' | 'offline';

export interface HubLike {
  readonly status: HubStatus;
  emit<K extends HwC2SEvent>(event: K, data: HwC2SPayload<K>): void;
  /** S2C events, already validated against the shared schemas. */
  on<K extends HwS2CEvent>(event: K, fn: (d: HwS2CPayload<K>) => void): () => void;
  /** Status changes; `reconnect` is true for a connect after an earlier one. */
  onStatus(fn: (s: HubStatus, info: { reconnect: boolean }) => void): () => void;
  /** The signed-in account: its id is this player's id in the world (the hub vouches for the same one). */
  account(): Promise<{ id: string; name: string } | null>;
  destroy(): void;
}

export interface ConnectorOptions {
  hub: HubLike;
  peers: PeerConnector;
  sched?: Scheduler;
  log?: (msg: string) => void;
}

/* ─── State the UI reads ─────────────────────────────────────────────────── */

export type LobbyPhase =
  | 'idle'
  /** Asked the hub for a room or a seat; nothing confirmed yet. */
  | 'starting'
  | 'hosting'
  /** A member waiting to be admitted and for its link to the host to open. */
  | 'joining'
  | 'member'
  /** The host went (or the link broke): waiting for the hub to name a new one, or retrying. */
  | 'migrating'
  | 'closed';

export type LobbyError =
  | 'auth-required'
  | 'not-found'
  | 'full'
  | 'kicked'
  | 'refused'
  | 'host-closed'
  | 'host-lost'
  | 'relay-overflow'
  | 'room-limit'
  | 'rate-limited'
  | 'offline'
  | 'timeout'
  | 'lost'
  | 'invalid'
  /** The room is locked and no password was given. */
  | 'password-required'
  | 'wrong-password'
  /** The host speaks a newer protocol than this build: reload to update. */
  | 'incompatible';

export interface LobbyPlayer {
  id: string;
  name: string;
  host: boolean;
  successor: boolean;
  you: boolean;
  /** How this player reaches the host (the host's own row: null). */
  conn: ConnKind | null;
}

export interface LobbyState {
  phase: LobbyPhase;
  role: 'host' | 'member' | null;
  code: string | null;
  roomName: string | null;
  /** The room asks for a password (known to the host, and to a member who got in with one). */
  locked: boolean;
  error: LobbyError | null;
  /** This player's account id (its id in the world). */
  me: string | null;
  players: LobbyPlayer[];
  /** The latest public room list. */
  rooms: HwRoomEntry[];
}

export type LobbySession = { kind: 'host'; host: HostSession } | { kind: 'member'; peer: PeerSession } | null;

export interface HostRoomOptions {
  name: string;
  maxPlayers: number;
  /** The world to share; the hosting player's offline seat is re-keyed to the account. */
  world: World;
  private?: boolean;
  /** Lock the room: joiners need this (`HW_LIMITS.PASSWORD_MIN`…`PASSWORD_MAX` characters). */
  password?: string;
}

/** A hub answer or a link must show up within these, or the attempt is given up. */
export const START_TIMEOUT_MS = 10_000;
export const CONNECT_TIMEOUT_MS = 45_000;
/** A member that lost its host waits this long (> the hub's migrate grace) for `host-changed` before re-joining. */
export const REJOIN_AFTER_MS = 3_000;
export const MAX_REJOINS = 3;
const TICK_MS = 250;

const emptyState = (): LobbyState => ({
  phase: 'idle',
  role: null,
  code: null,
  roomName: null,
  locked: false,
  error: null,
  me: null,
  players: [],
  rooms: [],
});

/** A DirectConnection signal → the hub payload, or null when it cannot travel (null candidate, oversize). */
export function signalPayload(s: SignalOut, to?: string): HwC2SPayload<'hearthworks:p2p:signal'> | null {
  if (s.description) {
    if (s.description.sdp.length > HW_LIMITS.SDP_MAX_LENGTH || s.description.sdp.length === 0) return null;
    return { ...(to ? { to } : {}), description: { type: s.description.type, sdp: s.description.sdp } };
  }
  const c = s.candidate;
  if (!c || c.candidate.length > HW_LIMITS.CANDIDATE_MAX_LENGTH) return null;
  const mid = c.sdpMid ?? null;
  const line = c.sdpMLineIndex ?? null;
  return {
    ...(to ? { to } : {}),
    candidate: {
      candidate: c.candidate,
      sdpMid: mid === null ? null : String(mid).slice(0, 64),
      sdpMLineIndex: line === null || line < 0 || line > 64 ? null : line,
    },
  };
}

/** The host's record of one admitted (or being-admitted) member. */
interface HostMember {
  peerId: string;
  userId: string;
  name: string;
  attempt: PeerAttempt | null;
  relay: RelayPair | null;
  link: ChannelLink | null;
}

export class HearthworksConnector {
  private readonly hub: HubLike;
  private readonly peers: PeerConnector;
  private readonly sched: Scheduler;
  private readonly log: (msg: string) => void;
  private st: LobbyState = emptyState();
  private readonly listeners = new Set<() => void>();
  private readonly sessionListeners = new Set<(s: LobbySession) => void>();
  private readonly offs: (() => void)[] = [];
  private stopTick: (() => void) | null = null;
  private cancelDeadline: (() => void) | null = null;
  private cancelRejoin: (() => void) | null = null;
  private destroyed = false;

  private me: { id: string; name: string } | null = null;
  private token = '';
  private myPeerId = '';
  private ice: IceServerConfig[] = [];
  private roster: HwRosterEntry[] = [];
  private pendingHost: HostRoomOptions | null = null;

  private host: HostSession | null = null;
  private readonly members = new Map<string, HostMember>();
  private namedSuccessor: string | null = null;

  private peer: PeerSession | null = null;
  private hostPeerId = '';
  private memberAttempt: PeerAttempt | null = null;
  private memberRelay: RelayPair | null = null;
  private memberLink: ChannelLink | null = null;
  private connGen = 0;
  private rejoins = 0;
  private code: string | null = null;
  /** The room's password, kept in this tab's memory only: re-sent when the hub needs it again (a hub restart, a rejoin). */
  private password: string | null = null;
  /** True once a host / join request has gone to the hub (so giving up has to say so). */
  private hubEngaged = false;
  private maxPlayers: number = HW_LIMITS.MAX_PLAYERS;

  constructor(opts: ConnectorOptions) {
    this.hub = opts.hub;
    this.peers = opts.peers;
    this.sched = opts.sched ?? realScheduler();
    this.log = opts.log ?? (() => {});
    this.bindHub();
  }

  /* ── Observation ──────────────────────────────────────────────────────── */

  get state(): LobbyState {
    return this.st;
  }

  get session(): LobbySession {
    if (this.host) return { kind: 'host', host: this.host };
    if (this.peer) return { kind: 'member', peer: this.peer };
    return null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Told whenever the session object changes: a host or peer appeared, was replaced (promotion) or went. */
  onSession(fn: (s: LobbySession) => void): () => void {
    this.sessionListeners.add(fn);
    return () => void this.sessionListeners.delete(fn);
  }

  private set(patch: Partial<LobbyState>): void {
    this.st = { ...this.st, ...patch };
    for (const fn of [...this.listeners]) fn();
  }

  private announceSession(): void {
    const s = this.session;
    for (const fn of [...this.sessionListeners]) fn(s);
  }

  /* ── Public actions ───────────────────────────────────────────────────── */

  /** Refresh the public room list. */
  refreshRooms(): void {
    this.hub.emit('hearthworks:p2p:list', {});
  }

  /** Host the given world: ask the hub for a room; the session starts when the hub confirms it. */
  async hostRoom(opts: HostRoomOptions): Promise<void> {
    if (!this.canStart()) return;
    this.set({ phase: 'starting', role: 'host', error: null, code: null });
    const me = await this.hub.account();
    if (!me) return this.fail('auth-required');
    if (this.destroyed || this.st.phase !== 'starting') return;
    this.me = me;
    this.pendingHost = opts;
    this.password = opts.password || null;
    this.set({ me: me.id, roomName: opts.name, locked: !!opts.password });
    this.armDeadline(START_TIMEOUT_MS, 'offline');
    this.hubEngaged = true;
    this.hub.emit('hearthworks:p2p:host', {
      name: opts.name,
      maxPlayers: opts.maxPlayers,
      world: { seed: opts.world.seed, size: opts.world.size },
      ...(opts.private ? { private: true } : {}),
      ...(opts.password ? { password: opts.password } : {}),
    });
  }

  /** Join a room by its code (and its password, if it has one). */
  async joinRoom(code: string, password?: string): Promise<void> {
    if (!this.canStart()) return;
    this.set({ phase: 'starting', role: 'member', error: null, code });
    const me = await this.hub.account();
    if (!me) return this.fail('auth-required');
    if (this.destroyed || this.st.phase !== 'starting') return;
    this.me = me;
    this.code = code;
    this.password = password || null;
    this.rejoins = 0;
    this.set({ me: me.id, locked: !!password });
    this.armDeadline(START_TIMEOUT_MS, 'offline');
    this.hubEngaged = true;
    this.hub.emit('hearthworks:p2p:join', this.joinPayload(code));
  }

  private joinPayload(code: string): HwC2SPayload<'hearthworks:p2p:join'> {
    return this.password ? { code, password: this.password } : { code };
  }

  /** Host only: remove a player (it cannot come back to this room). */
  kick(playerId: string): void {
    const m = [...this.members.values()].find((x) => x.userId === playerId);
    if (!m || !this.host) return;
    this.hub.emit('hearthworks:p2p:kick', { peerId: m.peerId });
    this.dropMember(m, 'kicked');
  }

  /** Leave: a member goes; a host hands the world to its successor (or closes the room when alone). */
  leave(): void {
    if (this.st.phase === 'idle' || this.st.phase === 'closed') {
      this.reset(null);
      return;
    }
    if (this.hub.status === 'connected') this.hub.emit('hearthworks:p2p:leave', {});
    this.reset(null);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.leave();
    this.destroyed = true;
    for (const off of this.offs.splice(0)) off();
    this.listeners.clear();
    this.sessionListeners.clear();
  }

  private canStart(): boolean {
    if (this.destroyed) return false;
    if (this.st.phase === 'closed') this.reset(null);
    return this.st.phase === 'idle';
  }

  /* ── Teardown ─────────────────────────────────────────────────────────── */

  private fail(error: LobbyError): void {
    // Giving up must also tell the hub, or this socket stays on the room's books as a member (or a host) that
    // nobody is running: a room can be promoted to a tab that has already walked away.
    if (this.hub.status === 'connected' && this.hubEngaged) this.hub.emit('hearthworks:p2p:leave', {});
    this.reset(error);
  }

  /** Back to nothing (with the reason, if the session ended rather than was left). */
  private reset(error: LobbyError | null): void {
    this.cancelDeadline?.();
    this.cancelDeadline = null;
    this.cancelRejoin?.();
    this.cancelRejoin = null;
    this.stopTick?.();
    this.stopTick = null;
    this.closeMemberConn();
    for (const m of [...this.members.values()]) this.dropMember(m, 'stopped', false);
    const hadSession = this.host !== null || this.peer !== null;
    this.host = null;
    this.peer = null;
    this.pendingHost = null;
    this.roster = [];
    this.code = null;
    this.namedSuccessor = null;
    this.token = '';
    this.password = null;
    this.hubEngaged = false;
    const rooms = this.st.rooms;
    this.st = { ...emptyState(), rooms, phase: error ? 'closed' : 'idle', error };
    for (const fn of [...this.listeners]) fn();
    if (hadSession) this.announceSession();
  }

  private armDeadline(ms: number, error: LobbyError): void {
    this.cancelDeadline?.();
    this.cancelDeadline = this.sched.after(ms, () => {
      this.cancelDeadline = null;
      this.log(`gave up: ${error}`);
      this.fail(error);
    });
  }

  private clearDeadline(): void {
    this.cancelDeadline?.();
    this.cancelDeadline = null;
  }

  /* ── The hub ──────────────────────────────────────────────────────────── */

  private bindHub(): void {
    const on = this.hub.on.bind(this.hub);
    this.offs.push(
      on('hearthworks:p2p:rooms', (d) => this.set({ rooms: d.rooms })),
      on('hearthworks:p2p:hosted', (d) => this.onHosted(d)),
      on('hearthworks:p2p:join-request', (d) => this.onJoinRequest(d)),
      on('hearthworks:p2p:joining', (d) => this.onJoining(d)),
      on('hearthworks:p2p:admitted', (d) => this.onAdmitted(d)),
      on('hearthworks:p2p:rejected', (d) => this.onRejected(d)),
      on('hearthworks:p2p:signal', (d) => this.onSignal(d)),
      on('hearthworks:p2p:relay', (bytes) => this.onRelayFrame(bytes)),
      on('hearthworks:p2p:member-left', (d) => this.onMemberLeft(d)),
      on('hearthworks:p2p:roster', (d) => this.onRoster(d)),
      on('hearthworks:p2p:host-changed', (d) => this.onHostChanged(d)),
      on('hearthworks:p2p:promote', (d) => this.onPromote(d)),
      on('hearthworks:p2p:closed', (d) => this.onClosed(d)),
      on('hearthworks:p2p:error', (d) => this.onHubError(d)),
      this.hub.onStatus((s, info) => {
        if (s === 'connected' && info.reconnect) this.onHubReconnected();
      }),
    );
  }

  private onHubError(d: HwS2CPayload<'hearthworks:p2p:error'>): void {
    this.log(`hub refused ${d.event}: ${d.code}`);
    if (d.event !== 'hearthworks:p2p:host' && d.event !== 'hearthworks:p2p:join') return;
    const phase = this.st.phase;
    if (phase === 'idle' || phase === 'closed') return;
    // A refused first request ends the attempt. A refused re-request (after a hub blip, or while recovering
    // a lost host) means the room is gone from the hub's side.
    const established = phase === 'hosting' || phase === 'member' || phase === 'migrating';
    if (established && (d.code === 'not-found' || d.code === 'not-host')) this.fail(this.st.role === 'host' ? 'lost' : 'host-lost');
    else this.fail(d.code === 'not-host' ? 'lost' : d.code);
  }

  /** The hub's socket came back after a drop: it forgot us, so ask for our place again. */
  private onHubReconnected(): void {
    if (this.st.role === 'host' && this.host && this.code && this.pendingHost) {
      const o = this.pendingHost;
      this.hub.emit('hearthworks:p2p:host', {
        name: o.name,
        maxPlayers: o.maxPlayers,
        world: { seed: o.world.seed, size: o.world.size },
        ...(o.private ? { private: true } : {}),
        ...(this.password ? { password: this.password } : {}),
        resume: { code: this.code, token: this.token },
      });
    } else if (this.st.role === 'member' && this.code && (this.st.phase === 'member' || this.st.phase === 'migrating' || this.st.phase === 'joining')) {
      this.hub.emit('hearthworks:p2p:join', this.joinPayload(this.code));
    }
  }

  /* ── Host ─────────────────────────────────────────────────────────────── */

  private onHosted(d: HwS2CPayload<'hearthworks:p2p:hosted'>): void {
    this.token = d.token;
    this.myPeerId = d.peerId;
    this.ice = resolveIceServers(d.ice);
    if (this.host) {
      // A resume after a hub blip: the room is ours again.
      this.code = d.code;
      return;
    }
    if (this.st.phase !== 'starting' || !this.pendingHost || !this.me) return;
    this.clearDeadline();
    const world = this.pendingHost.world;
    rekeyPlayer(world, LOCAL_PLAYER_ID, this.me.id);
    this.host = new HostSession(world, this.me.id);
    this.code = d.code;
    this.set({ phase: 'hosting', code: d.code });
    this.startTick();
    this.announceSession();
  }

  private onJoinRequest(req: HwS2CPayload<'hearthworks:p2p:join-request'>): void {
    if (!this.host || this.st.role !== 'host') return; // only a host admits
    if (req.userId === this.me?.id) return;
    this.admitMember(req);
  }

  private admitMember(req: HwS2CPayload<'hearthworks:p2p:join-request'>): void {
    // The same account again (a rejoin): the old connection goes, the new one replaces it.
    for (const old of [...this.members.values()]) if (old.peerId === req.peerId || old.userId === req.userId) this.dropMember(old, 'replaced', false);
    const m: HostMember = { peerId: req.peerId, userId: req.userId, name: req.name, attempt: null, relay: null, link: null };
    this.members.set(m.peerId, m);
    this.hub.emit('hearthworks:p2p:admit', { peerId: m.peerId, accept: true });
    m.attempt = this.peers.connect({
      role: 'host',
      ice: this.ice,
      signal: (s) => {
        const p = signalPayload(s, m.peerId);
        if (p) this.hub.emit('hearthworks:p2p:signal', p);
      },
      onChannels: (pair, kind) => {
        if (m.relay || this.members.get(m.peerId) !== m) return;
        this.attachHostLink(m, channelPairToLink(pair, kind, this.sched));
      },
      onFailed: () => {
        // No direct path: the member falls back too, and its first relayed frame moves this link to the
        // relay (onRelayFrame). Not before: the hub relays only for a member that asked.
        if (this.members.get(m.peerId) !== m || m.relay) return;
        m.attempt?.close();
        m.attempt = null;
        this.log(`member ${m.userId}: no direct path; waiting for its relay`);
      },
    });
  }

  private attachHostLink(m: HostMember, link: ChannelLink): void {
    m.link?.close();
    m.link = link;
    link.onopen = () => {
      if (this.members.get(m.peerId) !== m || m.link !== link || !this.host) return;
      // The hub vouched for this id at join time; the host stamps it on everything the peer sends.
      this.host.addPeer(m.userId, link);
      this.refreshPlayers();
    };
  }

  private onRelayFrame(bytes: Uint8Array): void {
    const frame = decodeRelay(bytes);
    if (!frame) return;
    if (this.st.role === 'host') {
      const m = [...this.members.values()].find((x) => relaySlotOf(x.peerId) === frame.slot);
      if (!m) return;
      if (!m.relay) this.hostToRelay(m, frame.slot);
      m.relay?.deliver(frame.reliable, frame.payload);
    } else {
      this.memberRelay?.deliver(frame.reliable, frame.payload);
    }
  }

  private hostToRelay(m: HostMember, slot: number): void {
    m.attempt?.close();
    m.attempt = null;
    m.link?.close();
    const pair = relayPair(slot, (packet) => {
      this.hub.emit('hearthworks:p2p:relay', packet as Uint8Array<ArrayBuffer>);
      return true;
    });
    m.relay = pair;
    this.attachHostLink(m, channelPairToLink(pair, 'relay', this.sched));
    pair.unreliable.open();
    pair.reliable.open();
    this.log(`member ${m.userId} on the hub relay`);
  }

  private onMemberLeft(d: HwS2CPayload<'hearthworks:p2p:member-left'>): void {
    const m = this.members.get(d.peerId);
    if (!m) return;
    // The hub losing a member's SOCKET does not mean the player is gone: its DataChannels may be fine, and
    // their own keepalive decides. A member that left or was kicked is gone for sure.
    if (d.reason === 'disconnected' && m.link?.open && !m.relay) return;
    this.dropMember(m, d.reason);
  }

  private dropMember(m: HostMember, why: string, refresh = true): void {
    if (this.members.get(m.peerId) !== m) return;
    this.members.delete(m.peerId);
    m.attempt?.close();
    m.attempt = null;
    m.relay?.close();
    m.link?.close();
    // Only close the session's link for that player if it is still this member's.
    if (this.host && why !== 'replaced') this.host.removePeer(m.userId);
    this.log(`member ${m.userId} dropped (${why})`);
    if (refresh) this.refreshPlayers();
  }

  /* ── Member ───────────────────────────────────────────────────────────── */

  private onJoining(d: HwS2CPayload<'hearthworks:p2p:joining'>): void {
    if (this.st.role !== 'member' || d.code !== this.code) return;
    this.myPeerId = d.peerId;
    this.hostPeerId = '';
    this.maxPlayers = d.maxPlayers;
    if (this.st.phase === 'starting') {
      this.set({ phase: 'joining', roomName: d.name });
      this.armDeadline(CONNECT_TIMEOUT_MS, 'timeout');
    }
  }

  private onAdmitted(d: HwS2CPayload<'hearthworks:p2p:admitted'>): void {
    if (this.st.role !== 'member' || d.code !== this.code) return;
    this.hostPeerId = d.hostPeerId;
    this.ice = resolveIceServers(d.ice);
    this.cancelRejoin?.();
    this.cancelRejoin = null;
    // Admitted by a NEW host after a migration: the link to it has to open, or the member gives up cleanly
    // instead of sitting in 'migrating' for good (cleared when the link opens).
    if (this.st.phase === 'migrating') this.armDeadline(CONNECT_TIMEOUT_MS, 'lost');
    this.startMemberConn();
  }

  private startMemberConn(): void {
    this.closeMemberConn();
    const gen = ++this.connGen;
    this.memberAttempt = this.peers.connect({
      role: 'member',
      ice: this.ice,
      signal: (s) => {
        const p = signalPayload(s);
        if (p) this.hub.emit('hearthworks:p2p:signal', p);
      },
      onChannels: (pair, kind) => {
        if (gen !== this.connGen || this.memberRelay) return;
        this.attachMemberLink(channelPairToLink(pair, kind, this.sched), gen);
      },
      onFailed: () => {
        if (gen === this.connGen && !this.memberRelay) this.memberToRelay(gen);
      },
    });
  }

  private memberToRelay(gen: number): void {
    this.memberAttempt?.close();
    this.memberAttempt = null;
    const slot = relaySlotOf(this.myPeerId);
    if (slot === null) return;
    this.hub.emit('hearthworks:p2p:relay:start', {});
    const pair = relayPair(slot, (packet) => {
      this.hub.emit('hearthworks:p2p:relay', packet as Uint8Array<ArrayBuffer>);
      return true;
    });
    this.memberRelay = pair;
    this.attachMemberLink(channelPairToLink(pair, 'relay', this.sched), gen);
    pair.unreliable.open();
    pair.reliable.open();
    this.log('on the hub relay');
  }

  private attachMemberLink(link: ChannelLink, gen: number): void {
    this.memberLink?.close();
    this.memberLink = link;
    link.onopen = () => {
      if (gen !== this.connGen || this.memberLink !== link) return;
      this.clearDeadline();
      this.rejoins = 0;
      if (!this.peer) {
        if (!this.me) return;
        this.peer = new PeerSession(this.me.id, link);
      } else {
        this.peer.rebind(link);
      }
      this.set({ phase: 'member' });
      this.startTick();
      this.refreshPlayers();
      this.announceSession();
    };
  }

  private closeMemberConn(): void {
    this.connGen++;
    this.memberAttempt?.close();
    this.memberAttempt = null;
    this.memberRelay?.close();
    this.memberRelay = null;
    this.memberLink?.close();
    this.memberLink = null;
  }

  private onSignal(d: HwS2CPayload<'hearthworks:p2p:signal'>): void {
    const s = { description: d.description, candidate: d.candidate };
    if (this.st.role === 'host') {
      const m = this.members.get(d.from);
      if (m && !m.relay) m.attempt?.handle(s);
    } else if (this.st.role === 'member' && d.from === this.hostPeerId && !this.memberRelay) {
      this.memberAttempt?.handle(s);
    }
  }

  private onRejected(d: HwS2CPayload<'hearthworks:p2p:rejected'>): void {
    if (this.st.role !== 'member' || d.code !== this.code) return;
    const reason = d.reason;
    this.fail(reason === 'kicked' ? 'kicked' : reason === 'relay-overflow' ? 'relay-overflow' : reason === 'full' ? 'full' : 'refused');
  }

  /** The host is not reachable any more: wait for the hub to name a new one, then re-join. */
  private beginRecovery(): void {
    if (this.st.phase === 'migrating' || !this.code) return;
    this.closeMemberConn();
    this.set({ phase: 'migrating' });
    // Tell the hub the host went quiet: if the host's socket is still open (a frozen tab, a dead network) the hub
    // would otherwise wait out its own heartbeat, up to 45 s, longer than a member keeps trying.
    if (this.hub.status === 'connected') this.hub.emit('hearthworks:p2p:host-silent', {});
    this.armRejoin();
  }

  private armRejoin(): void {
    this.cancelRejoin?.();
    this.cancelRejoin = this.sched.after(REJOIN_AFTER_MS, () => {
      this.cancelRejoin = null;
      if (this.st.phase !== 'migrating' || !this.code) return;
      if (this.rejoins >= MAX_REJOINS) {
        this.fail('lost');
        return;
      }
      this.rejoins++;
      this.hub.emit('hearthworks:p2p:join', this.joinPayload(this.code));
      this.armRejoin();
    });
  }

  private onHostChanged(d: HwS2CPayload<'hearthworks:p2p:host-changed'>): void {
    if (this.st.role !== 'member' || d.code !== this.code) return;
    this.hostPeerId = d.hostPeerId;
    this.roster = [
      ...this.roster.filter((p) => p.id === d.hostUserId).map((p) => ({ ...p, host: true })),
      ...this.roster.filter((p) => !p.host && p.id !== d.hostUserId),
    ];
    // Our link to the old host is dead weight whether or not it still answers.
    this.closeMemberConn();
    this.rejoins = 0;
    this.set({ phase: 'migrating' });
    this.cancelRejoin?.();
    this.cancelRejoin = null;
    // The new host admits us (`admitted` → startMemberConn); if that never comes, try asking again.
    this.armRejoin();
  }

  private onPromote(d: HwS2CPayload<'hearthworks:p2p:promote'>): void {
    if (this.st.role !== 'member' || d.code !== this.code || !this.peer || !this.me) return;
    if (!this.peer.ready) {
      // Never got a world to carry on with: step aside rather than hold a room we cannot run.
      this.hub.emit('hearthworks:p2p:leave', {});
      this.fail('lost');
      return;
    }
    this.closeMemberConn();
    this.cancelRejoin?.();
    this.cancelRejoin = null;
    this.clearDeadline();
    const hs = this.peer.promote();
    this.peer = null;
    this.host = hs;
    this.token = d.token;
    this.myPeerId = d.peerId;
    this.ice = resolveIceServers(d.ice);
    this.namedSuccessor = null;
    this.pendingHost = { name: this.st.roomName ?? '', maxPlayers: this.maxPlayers, world: hs.world, ...(this.password ? { password: this.password } : {}) };
    // Until the hub's next roster: this player is the host now, the old host is not in the room.
    this.roster = [{ id: this.me.id, name: this.me.name, host: true }, ...this.roster.filter((p) => !p.host && p.id !== this.me?.id)];
    this.set({ role: 'host', phase: 'hosting' });
    this.refreshPlayers();
    this.announceSession();
    // The hub now sends one join request per remaining member; each is admitted in `onJoinRequest`.
  }

  private onClosed(d: HwS2CPayload<'hearthworks:p2p:closed'>): void {
    if (d.code !== this.code) return;
    this.fail(d.reason);
  }

  /* ── Roster and the periodic tick ─────────────────────────────────────── */

  private onRoster(d: HwS2CPayload<'hearthworks:p2p:roster'>): void {
    if (d.code !== this.code) return;
    this.roster = d.players;
    this.refreshPlayers();
  }

  private startTick(): void {
    if (this.stopTick) return;
    this.stopTick = this.sched.every(TICK_MS, () => this.tick());
  }

  /** Housekeeping the session core does not do: tell the hub who would take over, notice a lost host. */
  tick(): void {
    if (this.st.phase === 'hosting' && this.host) {
      const userId = this.host.successor();
      const m = userId ? [...this.members.values()].find((x) => x.userId === userId) : undefined;
      const peerId = m?.peerId ?? null;
      if (peerId !== this.namedSuccessor && this.hub.status === 'connected') {
        this.namedSuccessor = peerId;
        this.hub.emit('hearthworks:p2p:successor', { peerId });
      }
    } else if (this.st.phase === 'member' && this.peer) {
      this.peer.update();
      if (this.peer.incompatible) this.fail('incompatible');
      else if (this.peer.hostLost) this.beginRecovery();
    }
    this.refreshPlayers();
  }

  private refreshPlayers(): void {
    const me = this.me?.id ?? null;
    const successor = this.host ? this.host.successor() : (this.peer?.successor ?? null);
    const hostOpen = this.memberLink?.open ? this.memberLink.kind : null;
    const base: HwRosterEntry[] = this.roster.length > 0 ? this.roster : this.fallbackRoster();
    const players: LobbyPlayer[] = base.map((p) => {
      let conn: ConnKind | null = null;
      if (this.host) {
        const m = [...this.members.values()].find((x) => x.userId === p.id);
        conn = m?.link?.open ? m.link.kind : null;
      } else if (p.host) {
        conn = hostOpen;
      }
      return { id: p.id, name: p.name, host: p.host, successor: !p.host && p.id === successor, you: p.id === me, conn };
    });
    const prev = this.st.players;
    if (prev.length === players.length && prev.every((q, i) => JSON.stringify(q) === JSON.stringify(players[i]))) return;
    this.set({ players });
  }

  private fallbackRoster(): HwRosterEntry[] {
    if (!this.me) return [];
    return this.host ? [{ id: this.me.id, name: this.me.name, host: true }] : [];
  }
}
