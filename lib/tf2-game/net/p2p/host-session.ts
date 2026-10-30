/**
 * `P2pHostSession` — the room manager of a peer-to-peer match, running in the
 * host's page: the role `server/socket-server/handlers/tf2-game.ts` plays for a
 * hub room, for members connected over `PeerLink`s instead of sockets.
 *
 *   - **Seats** by account. The hub vouches for who is asking (`admit` gets
 *     the hub-verified user id and name); a member never names itself. A seat
 *     is a player id in the host's match. A member whose link drops keeps the
 *     seat for `SEAT_GRACE_MS` (30 s): rejoining by code with the same account
 *     gets the same player back (`resync`), with team, class and score.
 *   - **Validation, exactly as the hub does it:** input packets are opaque but
 *     length-capped and rate-limited per member (the hub's `tf2:input` rule);
 *     every command is parsed with the hub's schemas (`control.ts`) and
 *     rate-limited per kind with the hub's numbers; chat is cleaned and capped.
 *     The match itself still applies its command budget (Tf2MatchHost).
 *   - **Routing** the listen server's per-player packets to each member's
 *     link (reliable batches on the ordered channel, snapshots on the
 *     unreliable one), chat to everyone (team chat by the team the match
 *     last reported), and the connection type of every human for the scoreboard.
 *   - **Kick** (refused for the rest of the room's life) and a clean end for
 *     everyone when the host leaves (`close`) — unless the match migrates: the
 *     session names the best **successor** (`successor()`: a member that may
 *     host, on a direct or TURN link, lowest round trip first), and a session
 *     that starts from a checkpoint (`restoreSeats`) holds every member's seat
 *     for them to reclaim with their account.
 *
 * The host is authoritative and trusted by its members (docs/tf2-game.md
 * "Peer-to-peer play").
 *
 * Environment-agnostic (the page's main thread, Vitest).
 */

import { TEAM_UNASSIGNED, TICK_INTERVAL } from '../../core/constants';
import type { MatchCommand, PlayerInfo, RoomSummary } from '../../server/match-host';
import { TF2_LIMITS, type ChatMessage, type JoinedPayload } from '../events';
import type { Tf2Mode } from '../../data/maps';
import {
  toMatchCommand,
  zPeerToHost,
  type HostCloseReason,
  type HostToPeer,
  type PeerConnection,
  type PeerRow,
} from './control';
import type { PeerLink } from './link';
import { P2P_LIMITS, type P2pJoinRequest, type P2pRefusal } from './signal';
import { decodeControl, encodeControl, tagged, TAG_CHECKPOINT, TAG_CONTROL, TAG_EVENTS, TAG_INPUT, TAG_SNAPSHOT } from './wire';

/** What the session drives: the listen server's remote-player API (listen-server.ts `peers`). */
export interface HostMatchPort {
  add(playerId: number, info: PlayerInfo): void;
  remove(playerId: number): void;
  input(playerId: number, packet: Uint8Array): void;
  command(playerId: number, cmd: MatchCommand): void;
  resync(playerId: number): void;
}

/**
 * Per member, per kind, per minute — the hub's `SOCKET_RATE_LIMITS` for the
 * same events (server/socket-server/config.ts), so a member can do over a
 * DataChannel exactly what it could do over the hub.
 */
export const PEER_RATE_LIMITS: Readonly<Record<string, number>> = {
  input: 5000,
  chat: 40,
  team: 30,
  class: 60,
  voice: 60,
  extra: 120,
  loadout: 20,
};
const RATE_WINDOW_MS = 60_000;

export interface P2pHostSessionOptions {
  code: string;
  map: string;
  mode: Tf2Mode;
  name: string;
  maxPlayers: number;
  hostUserId: string;
  hostName: string;
  /** The host's own player id in the listen server (LISTEN_PLAYER_ID). */
  localPlayerId: number;
  match: HostMatchPort;
  now: () => number;
  seatGraceMs?: number;
  /** A chat line for the host's own HUD (the hub would have delivered it). */
  onLocalChat?: (message: ChatMessage) => void;
  /** Seats changed (joined, dropped, rejoined, left, kicked). */
  onSeatsChanged?: () => void;
  /** Diagnostics. */
  log?: (message: string, data?: Record<string, unknown>) => void;
}

export interface SeatInfo {
  playerId: number;
  userId: string;
  name: string;
  peerId: string;
  connection: PeerConnection | null;
  /** In the match (false while the first connection is still being made). */
  inMatch: boolean;
  /** When the link dropped (the seat is held until the grace runs out), or null. */
  droppedAt: number | null;
  /** The host's round trip to this member (ms), null before the first. */
  pingMs: number | null;
  /** Share of this member's input lost on the way (0…1). */
  loss: number;
  /** May take the match over if the host leaves. */
  canHost: boolean;
}

interface Seat extends Omit<SeatInfo, 'pingMs' | 'loss'> {
  link: PeerLink | null;
  counters: Map<string, { count: number; windowStart: number }>;
  badPackets: number;
  /** Joined as a spectator (the join request said so). */
  spectate: boolean;
}

/** How often the connection rows (with each member's ping and loss) go out again. */
const PEERS_INTERVAL_MS = 2_000;

/** What `admit` decided; the page tells the hub. */
export type AdmitResult = { accept: true; playerId: number; rejoin: boolean } | { accept: false; reason: P2pRefusal };

export interface HostSessionStats {
  /** Packets that failed validation (all members). */
  rejected: number;
  rateLimited: number;
}

export class P2pHostSession {
  readonly stats: HostSessionStats = { rejected: 0, rateLimited: 0 };
  private readonly seats = new Map<string, Seat>();
  private readonly kicked = new Set<string>();
  private nextPlayerId: number;
  private teams = new Map<number, number>();
  /** hub player id → entity id, from the match's summaries (the scoreboard keys by entity). */
  private entities = new Map<number, number>();
  private lastTick = 0;
  private lastTickAt = 0;
  private closed = false;
  private readonly seatGraceMs: number;
  private lastPeersAt = 0;
  private map: string;
  private mode: Tf2Mode;

  constructor(private readonly opts: P2pHostSessionOptions) {
    this.map = opts.map;
    this.mode = opts.mode;
    this.nextPlayerId = opts.localPlayerId + 1;
    this.seatGraceMs = opts.seatGraceMs ?? P2P_LIMITS.SEAT_GRACE_MS;
    this.lastTickAt = opts.now();
  }

  /** Seats, for the host's player list and kick menu. */
  seatList(): SeatInfo[] {
    return [...this.seats.values()].map(({ playerId, userId, name, peerId, connection, inMatch, droppedAt, canHost, link }) => ({
      playerId,
      userId,
      name,
      peerId,
      connection,
      inMatch,
      droppedAt,
      canHost,
      pingMs: link?.isOpen ? link.stats.rttMs : null,
      loss: link?.isOpen ? link.stats.trafficLoss : 0,
    }));
  }

  /**
   * Host migration: the member best placed to take the match over — connected on a direct or TURN
   * link (a checkpoint is too big for the hub relay's budget), willing to host, lowest round trip
   * first. Null when nobody qualifies.
   */
  successor(): SeatInfo | null {
    let best: SeatInfo | null = null;
    for (const s of this.seatList()) {
      if (!s.inMatch || s.droppedAt !== null || !s.canHost) continue;
      if (s.connection !== 'direct' && s.connection !== 'turn') continue;
      if (!best || (s.pingMs ?? Infinity) < (best.pingMs ?? Infinity)) best = s;
    }
    return best;
  }

  /** Sends the successor a packed migration checkpoint (reliable, in order with the match's stream). False without a link. */
  sendCheckpoint(playerId: number, packed: Uint8Array): boolean {
    const link = this.linkOf(playerId);
    if (!link) return false;
    link.sendReliable(tagged(TAG_CHECKPOINT, packed));
    return true;
  }

  /** The open link to a member (the host sends its successor checkpoints on it), or null. */
  linkOf(playerId: number): PeerLink | null {
    const link = this.seatByPlayer(playerId)?.link ?? null;
    return link?.isOpen ? link : null;
  }

  /**
   * A session that starts from a migration checkpoint: every human seat but the host's own is held
   * for its account (they reconnect through the hub, which asks for them) — the seat keeps its
   * player, team, class and score; one nobody reclaims within the grace is released.
   */
  restoreSeats(seats: ReadonlyArray<{ playerId: number; userId?: string; name: string }>): void {
    const now = this.opts.now();
    for (const s of seats) {
      if (s.playerId === this.opts.localPlayerId || !s.userId || s.userId === this.opts.hostUserId) continue;
      this.seats.set(s.userId, {
        playerId: s.playerId,
        userId: s.userId,
        name: s.name,
        peerId: '',
        connection: null,
        inMatch: true,
        droppedAt: now,
        link: null,
        counters: new Map(),
        badPackets: 0,
        spectate: false,
        canHost: true,
      });
      this.nextPlayerId = Math.max(this.nextPlayerId, s.playerId + 1);
    }
    this.opts.onSeatsChanged?.();
  }

  /** Humans in the match, the host included (connected or holding a seat). */
  get humanCount(): number {
    return 1 + this.seats.size;
  }

  // ─── The match's clock ─────────────────────────────────────────────────────

  /** The match tick now, estimated from the last frame (the hub's `estimatedTick`). */
  tickNow(): number {
    return this.lastTick + Math.max(0, Math.floor((this.opts.now() - this.lastTickAt) / (TICK_INTERVAL * 1000)));
  }

  // ─── Joining ───────────────────────────────────────────────────────────────

  /** A join request the hub relayed (its account fields are the hub's, never the member's). */
  admit(req: P2pJoinRequest): AdmitResult {
    if (this.closed) return { accept: false, reason: 'refused' };
    if (this.kicked.has(req.userId)) return { accept: false, reason: 'kicked' };
    if (req.userId === this.opts.hostUserId) return { accept: false, reason: 'refused' };
    const held = this.seatByUser(req.userId);
    if (held) {
      // The same account again: a rejoin (or a second tab, which takes the seat over).
      if (held.link) {
        const old = held.link;
        held.link = null;
        old.close('local');
      }
      held.peerId = req.peerId;
      held.name = req.name || held.name;
      held.connection = null;
      held.canHost = req.canHost !== false;
      this.opts.onSeatsChanged?.();
      return { accept: true, playerId: held.playerId, rejoin: held.inMatch };
    }
    if (this.humanCount >= Math.min(this.opts.maxPlayers, TF2_LIMITS.P2P_MAX_PLAYERS)) {
      return { accept: false, reason: 'full' };
    }
    const seat: Seat = {
      playerId: this.nextPlayerId++,
      userId: req.userId,
      name: req.name,
      peerId: req.peerId,
      connection: null,
      inMatch: false,
      droppedAt: null,
      link: null,
      counters: new Map(),
      badPackets: 0,
      spectate: req.spectate === true,
      canHost: req.canHost !== false,
    };
    // A seat that never connects is released after the same grace as a dropped one.
    seat.droppedAt = this.opts.now();
    this.seats.set(req.userId, seat);
    this.opts.onSeatsChanged?.();
    return { accept: true, playerId: seat.playerId, rejoin: false };
  }

  /** The member's link is open (direct, TURN, or through the hub's relay): it plays from here on. */
  attach(peerId: string, link: PeerLink, connection: Exclude<PeerConnection, 'host'>): boolean {
    const seat = this.seatByPeer(peerId);
    if (!seat || this.closed) {
      link.close('local');
      return false;
    }
    const old = seat.link;
    seat.link = link;
    if (old && old !== link) old.close('local');
    seat.connection = connection;
    seat.droppedAt = null;
    if (!seat.inMatch) {
      seat.inMatch = true;
      // Joining as a spectator is part of the join (the match seats them there; no team switch after).
      this.opts.match.add(seat.playerId, { name: seat.name, userId: seat.userId, ...(seat.spectate ? { spectate: true } : {}) });
    } else {
      this.opts.match.resync(seat.playerId);
    }
    const info: JoinedPayload = {
      code: this.opts.code,
      playerId: seat.playerId,
      map: this.map,
      mode: this.mode,
      name: this.opts.name,
      maxPlayers: this.opts.maxPlayers,
      serverTick: this.tickNow(),
      tickInterval: TICK_INTERVAL,
    };
    this.send(seat, { t: 'joined', info });
    this.broadcastPeers();
    this.opts.onSeatsChanged?.();
    return true;
  }

  /** The handlers a member's link reports to (wire them when creating it). */
  linkHandlers(peerId: string): {
    onUnreliable: (m: Uint8Array) => void;
    onReliable: (m: Uint8Array) => void;
    onClose: () => void;
  } {
    return {
      onUnreliable: (m) => this.onUnreliable(peerId, m),
      onReliable: (m) => this.onReliable(peerId, m),
      onClose: () => this.onLinkClosed(peerId),
    };
  }

  /** The hub says this member's hub connection is gone (a relayed member then is too). */
  hubLeft(peerId: string): void {
    const seat = this.seatByPeer(peerId);
    if (!seat) return;
    if (seat.connection === 'relayed' || !seat.link) seat.link?.close('closed');
  }

  /** Remove a member and refuse its account for the rest of the room's life. */
  kick(playerIdOrPeer: number | string): SeatInfo | null {
    const seat =
      typeof playerIdOrPeer === 'number'
        ? [...this.seats.values()].find((s) => s.playerId === playerIdOrPeer)
        : this.seatByPeer(playerIdOrPeer);
    if (!seat) return null;
    this.kicked.add(seat.userId);
    if (seat.link) this.send(seat, { t: 'closed', reason: 'kicked' });
    this.release(seat);
    return { ...seat, pingMs: null, loss: 0 };
  }

  // ─── From members ──────────────────────────────────────────────────────────

  private allow(seat: Seat, kind: string): boolean {
    const max = PEER_RATE_LIMITS[kind];
    if (!max) return false;
    const now = this.opts.now();
    let c = seat.counters.get(kind);
    if (!c || now - c.windowStart >= RATE_WINDOW_MS) {
      c = { count: 0, windowStart: now };
      seat.counters.set(kind, c);
    }
    if (c.count >= max) {
      this.stats.rateLimited++;
      return false;
    }
    c.count++;
    return true;
  }

  private bad(seat: Seat): void {
    seat.badPackets++;
    this.stats.rejected++;
  }

  private onUnreliable(peerId: string, message: Uint8Array): void {
    const seat = this.seatByPeer(peerId);
    if (!seat || !seat.inMatch || !seat.link) return;
    if (message[0] !== TAG_INPUT) {
      this.bad(seat);
      return;
    }
    const body = message.subarray(1);
    if (body.byteLength === 0 || body.byteLength > TF2_LIMITS.INPUT_MAX_BYTES) {
      this.bad(seat);
      return;
    }
    // Silent drops past the rate, as the hub does (answering a flood doubles it).
    if (!this.allow(seat, 'input')) return;
    this.opts.match.input(seat.playerId, body);
  }

  private onReliable(peerId: string, message: Uint8Array): void {
    const seat = this.seatByPeer(peerId);
    if (!seat || !seat.inMatch || !seat.link) return;
    if (message[0] !== TAG_CONTROL) {
      this.bad(seat);
      return;
    }
    const parsed = zPeerToHost.safeParse(decodeControl(message));
    if (!parsed.success) {
      this.bad(seat);
      return;
    }
    const msg = parsed.data;
    if (msg.t === 'leave') {
      this.release(seat);
      return;
    }
    const cmd = toMatchCommand(msg.cmd);
    if (!this.allow(seat, cmd.kind)) return;
    if (cmd.kind === 'chat') {
      const text = cleanChat(cmd.text);
      if (!text) return;
      this.chat(seat.playerId, seat.name, text, cmd.teamOnly);
      this.opts.match.command(seat.playerId, { kind: 'chat', text, teamOnly: cmd.teamOnly });
      return;
    }
    this.opts.match.command(seat.playerId, cmd);
  }

  /** The match moved to another map (`changelevel`): members joining from now on load it. */
  setMap(map: string, mode: Tf2Mode): void {
    this.map = map;
    this.mode = mode;
  }

  /** A line from the server (the host's `say` as operator): everyone's chat, no speaker. */
  serverSay(text: string): void {
    const clean = cleanChat(text);
    if (!clean) return;
    const message: ChatMessage = { from: 0, name: 'Console', text: clean, teamOnly: false, team: TEAM_UNASSIGNED, at: Date.now() };
    this.opts.onLocalChat?.(message);
    for (const s of this.seats.values()) if (s.link) this.send(s, { t: 'chat', message });
  }

  /** The host's own chat line (its HUD sends it here instead of to a hub). */
  hostChat(text: string, teamOnly: boolean): void {
    const clean = cleanChat(text);
    if (!clean) return;
    this.chat(this.opts.localPlayerId, this.opts.hostName, clean, teamOnly);
    this.opts.match.command(this.opts.localPlayerId, { kind: 'chat', text: clean, teamOnly });
  }

  private chat(from: number, name: string, text: string, teamOnly: boolean): void {
    const team = this.teams.get(from) ?? TEAM_UNASSIGNED;
    const message: ChatMessage = { from, name, text, teamOnly, team, at: Date.now() };
    const hear = (playerId: number) => !teamOnly || (this.teams.get(playerId) ?? TEAM_UNASSIGNED) === team;
    if (hear(this.opts.localPlayerId)) this.opts.onLocalChat?.(message);
    for (const s of this.seats.values()) if (s.link && hear(s.playerId)) this.send(s, { t: 'chat', message });
  }

  // ─── From the match ────────────────────────────────────────────────────────

  /** One tick's packets for remote players (the listen server's `peer-frame`). */
  deliver(tick: number, packets: ReadonlyArray<{ to: number | 'all'; reliable: boolean; data: ArrayBuffer | Uint8Array }>): void {
    this.lastTick = tick;
    this.lastTickAt = this.opts.now();
    for (const p of packets) {
      const data = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data);
      // Reliable batches go out tagged; snapshots get the link's sequence header (loss and choke).
      const message = p.reliable ? tagged(TAG_EVENTS, data) : data;
      if (p.to === 'all') {
        for (const s of this.seats.values()) this.sendPacket(s, message, p.reliable);
      } else {
        const seat = this.seatByPlayer(p.to);
        if (seat) this.sendPacket(seat, message, p.reliable);
      }
    }
  }

  private sendPacket(seat: Seat, message: Uint8Array, reliable: boolean): void {
    const link = seat.link;
    if (!link || !link.isOpen) return;
    if (reliable) link.sendReliable(message);
    else link.sendSequenced(TAG_SNAPSHOT, message);
  }

  /** The match's digest: teams for chat routing, entity ids for the connection column. */
  onSummary(summary: RoomSummary): void {
    this.teams = new Map();
    const entities = new Map<number, number>();
    for (const p of summary.players) {
      if (p.bot) continue;
      this.teams.set(p.id, p.team);
      if (p.entity !== undefined) entities.set(p.id, p.entity);
    }
    const changed = entities.size !== this.entities.size || [...entities].some(([k, v]) => this.entities.get(k) !== v);
    this.entities = entities;
    if (changed) this.broadcastPeers();
  }

  /** Every human's connection type, ping and input loss, keyed by entity (the scoreboard's column). */
  peerRows(): PeerRow[] {
    const rows: PeerRow[] = [];
    const hostEntity = this.entities.get(this.opts.localPlayerId);
    if (hostEntity !== undefined) rows.push({ entity: hostEntity, link: 'host', pingMs: 0, loss: 0 });
    for (const s of this.seats.values()) {
      const entity = this.entities.get(s.playerId);
      if (entity === undefined || !s.connection) continue;
      const st = s.link?.isOpen ? s.link.stats : null;
      rows.push({
        entity,
        link: s.connection,
        ...(st && st.rttMs !== null ? { pingMs: Math.round(st.rttMs) } : {}),
        ...(st ? { loss: Math.round(st.trafficLoss * 1000) / 1000 } : {}),
      });
    }
    return rows;
  }

  private broadcastPeers(): void {
    const peers = this.peerRows();
    for (const s of this.seats.values()) if (s.link) this.send(s, { t: 'peers', peers });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Link upkeep and the seat grace. Call a few times a second. */
  update(): void {
    const now = this.opts.now();
    for (const seat of [...this.seats.values()]) {
      seat.link?.update();
      if (seat.droppedAt !== null && !seat.link && now - seat.droppedAt > this.seatGraceMs) this.release(seat);
    }
    // Pings and loss change: the rows go out again every couple of seconds.
    if (now - this.lastPeersAt >= PEERS_INTERVAL_MS) {
      this.lastPeersAt = now;
      this.broadcastPeers();
    }
  }

  private onLinkClosed(peerId: string): void {
    const seat = this.seatByPeer(peerId);
    if (!seat || !seat.link || seat.link.isOpen) return;
    seat.link = null;
    seat.connection = null;
    seat.droppedAt = this.opts.now();
    this.opts.log?.('p2p: member dropped (seat held)', { playerId: seat.playerId });
    this.broadcastPeers();
    this.opts.onSeatsChanged?.();
  }

  private release(seat: Seat): void {
    if (this.seats.get(seat.userId) !== seat) return;
    this.seats.delete(seat.userId);
    const link = seat.link;
    seat.link = null;
    link?.close('local');
    if (seat.inMatch) this.opts.match.remove(seat.playerId);
    this.entities.delete(seat.playerId);
    this.broadcastPeers();
    this.opts.onSeatsChanged?.();
  }

  /**
   * The host leaves: every member is told why — the match is over (`host-left`), or it moves to the
   * successor (`migrating`: members wait to be admitted by the new host).
   */
  close(reason: HostCloseReason = 'host-left'): void {
    if (this.closed) return;
    this.closed = true;
    for (const seat of this.seats.values()) {
      if (seat.link) {
        this.send(seat, { t: 'closed', reason });
        // Give the goodbye a moment to leave before the channel closes.
        const link = seat.link;
        seat.link = null;
        setTimeoutSafe(() => link.close('local'), 250);
      }
    }
    this.seats.clear();
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private send(seat: Seat, message: HostToPeer): void {
    seat.link?.sendReliable(encodeControl(message));
  }

  private seatByUser(userId: string): Seat | undefined {
    return this.seats.get(userId);
  }

  private seatByPeer(peerId: string): Seat | undefined {
    for (const s of this.seats.values()) if (s.peerId === peerId) return s;
    return undefined;
  }

  private seatByPlayer(playerId: number): Seat | undefined {
    for (const s of this.seats.values()) if (s.playerId === playerId) return s;
    return undefined;
  }
}

/** Chat is rendered as text by React; strip control characters and cap it, nothing more (the hub's rule). */
export function cleanChat(raw: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, TF2_LIMITS.CHAT_MAX_LENGTH);
}

function setTimeoutSafe(fn: () => void, ms: number): void {
  if (typeof setTimeout === 'function') setTimeout(fn, ms);
  else fn();
}
