/**
 * Hosting a peer-to-peer match from this page (docs/tf2-game.md "Peer-to-peer
 * play"): the listen server already runs the match in a worker with the host
 * as its local player (zero transport latency, as a Source listen server);
 * this controller opens it to remote members.
 *
 *   announce on the hub (`tf2:p2p:host`) → the room code (the invite link) →
 *   per join request (account vouched for by the hub): `P2pHostSession.admit`
 *   → a `DirectConnection` (offer, trickled candidates; STUN then TURN with the
 *   credentials the hub minted for this account) → a `PeerLink` on its two
 *   DataChannels → the session plays the member; no path in time → the hub
 *   relays that member (`RelayChannel`s, capped per room and per byte).
 *
 * The room's clock is the listen-server WORKER's (`upkeep()` on each of its
 * `upkeep` messages): link upkeep, the hub digest (`tf2:p2p:update` every 2 s)
 * and the successor choice keep their pace while this tab is in the background
 * — a hidden page's timers are throttled, a worker's are not, and the worker
 * already sends every snapshot without the page's animation frame.
 *
 * **Host migration.** The session names the best successor (direct or TURN,
 * willing, lowest round trip); the hub is told (`tf2:p2p:successor`) and the
 * successor gets every checkpoint the worker writes (every 2 s and on round
 * changes) over its reliable channel. Leaving hands the match over
 * (`stop()`: members are told `migrating`, the hub promotes the successor); a
 * closed tab does the same through the hub after a short grace. A controller
 * can also START as a promoted successor (`startPromoted`): the room is
 * already ours on the hub, the match comes from the checkpoint, and every
 * former member's seat is held for them.
 *
 * Browser only.
 */

import { TF2_S2C, type ChatMessage, type RoomPlayerInfo } from '../../net/events';
import { P2pHostSession, type SeatInfo } from '../../net/p2p/host-session';
import { PeerLink } from '../../net/p2p/link';
import {
  decodeRelay,
  zP2pHosted,
  zP2pJoinRequest,
  zP2pPeerLeft,
  zP2pRelayReady,
  zP2pSignalIn,
  type P2pHostPayload,
  type P2pHostedPayload,
  type P2pJoinRequest,
} from '../../net/p2p/signal';
import type { RoomSummary } from '../../server/match-host';
import { findTf2Map, type Tf2Mode } from '../../data/maps';
import type { ListenConnection, PeerPacket } from './listen-server';
import { LISTEN_PLAYER_ID } from './listen-server';
import { DirectConnection, relayPair, type ChannelPair, type RelayPair } from './webrtc';
import type { PeerConnection } from '../../net/p2p/control';

type Net = typeof import('../../net/client');

export interface P2pHostCallbacks {
  /** The room is announced: its code (the invite link) and the account name the hub knows us by. */
  onHosted?(hosted: P2pHostedPayload): void;
  /** A chat line for the host's own HUD. */
  onChat?(message: ChatMessage): void;
  onSeats?(seats: SeatInfo[]): void;
  /** The hub refused the room (no account, a bad map) — the match cannot be shared. */
  onError?(code: string): void;
}

interface Connecting {
  peerId: string;
  direct: DirectConnection | null;
  relay: RelayPair | null;
  link: PeerLink | null;
}

const UPDATE_INTERVAL_MS = 2_000;
/** How often the successor is chosen again (a better link, someone leaving). */
const SUCCESSOR_INTERVAL_MS = 1_000;

export interface P2pHostOptions {
  /** The local player's id in the match (a promoted host keeps the seat it had as a member). */
  localPlayerId?: number;
}

export class P2pHostController {
  private session: P2pHostSession | null = null;
  private hosted: P2pHostedPayload | null = null;
  private readonly peers = new Map<string, Connecting>();
  private readonly slots = new Map<number, string>();
  private readonly unsubs: Array<() => void> = [];
  private summary: RoomSummary | null = null;
  private lastUpdate = 0;
  private lastSuccessorAt = 0;
  private stopped = false;
  /** Frames that arrive before the room is announced (no members yet: nothing to send). */
  private started = false;
  /** The member named to take over (player id), and its peer id as the hub knows it. */
  private successorPlayer: number | null = null;
  private successorPeer: string | null = null;
  /** Join requests that arrive before the session exists (a promoted host's members ask at once). */
  private readonly waiting: P2pJoinRequest[] = [];
  private readonly localPlayerId: number;
  /** Seats a promoted host holds for its former members (null until its checkpoint is read). */
  private restoredSeats: Array<{ playerId: number; userId?: string; name: string }> | null = null;
  private promoted = false;
  private map: string;
  private mode: Tf2Mode;
  /** Checkpoints sent to successors (diagnostics). */
  checkpointsSent = 0;
  lastCheckpointBytes = 0;

  constructor(
    private readonly net: Net,
    private readonly room: P2pHostPayload,
    private readonly listen: ListenConnection,
    private readonly callbacks: P2pHostCallbacks,
    opts: P2pHostOptions = {},
  ) {
    this.localPlayerId = opts.localPlayerId ?? LISTEN_PLAYER_ID;
    this.map = room.map;
    this.mode = (room.mode ?? 'ctf') as Tf2Mode;
  }

  private subscribe(): void {
    const { net } = this;
    this.unsubs.push(
      net.subscribeTf2(TF2_S2C.P2P_HOSTED, (p) => this.onHosted(p)),
      net.subscribeTf2(TF2_S2C.P2P_JOIN_REQUEST, (p) => this.onJoinRequest(p)),
      net.subscribeTf2(TF2_S2C.P2P_SIGNAL, (p) => this.onSignal(p)),
      net.subscribeTf2(TF2_S2C.P2P_RELAY_READY, (p) => this.onRelayReady(p)),
      net.subscribeTf2(TF2_S2C.P2P_RELAY, (p) => this.onRelay(p)),
      net.subscribeTf2(TF2_S2C.P2P_PEER_LEFT, (p) => {
        const parsed = zP2pPeerLeft.safeParse(p);
        if (!parsed.success) return;
        this.session?.hubLeft(parsed.data.peerId);
        // A connection still being made for a member who went is dropped (its seat is the session's).
        const entry = this.peers.get(parsed.data.peerId);
        if (entry && !entry.link?.isOpen) this.dropPeer(parsed.data.peerId);
      }),
      net.subscribeTf2(TF2_S2C.ERROR, (e: { code?: string; event?: string }) => {
        if (e?.event === 'tf2:p2p:host' && !this.hosted) this.callbacks.onError?.(e.code ?? 'unavailable');
      }),
      net.subscribeTf2('connect', () => {
        // A hub blip: reclaim the room (the DataChannels never needed the hub).
        if (this.hosted && !this.stopped) net.tf2.p2p.host({ ...this.room, map: this.map, mode: this.mode, resume: { code: this.hosted.code, token: this.hosted.token } });
      }),
    );
  }

  /** Announce the room (call once the local match is running). */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.subscribe();
    this.net.tf2.p2p.host(this.room);
  }

  /**
   * Host migration: this page was promoted by the hub (the previous host left). The room is already
   * ours (`hosted`); every human seat in the checkpoint but ours is held for its account, and the
   * former members' join requests (already on their way) are answered once the session exists.
   */
  startPromoted(hosted: P2pHostedPayload): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.promoted = true;
    this.subscribe();
    this.onHosted(hosted);
  }

  /** A promoted host's checkpoint seats are known: the session starts, and the waiting members are answered. */
  seatsRestored(seats: ReadonlyArray<{ playerId: number; userId?: string; name: string }>): void {
    if (this.stopped || this.restoredSeats) return;
    this.restoredSeats = [...seats];
    if (this.hosted) this.onHosted(this.hosted);
  }

  get code(): string | null {
    return this.hosted?.code ?? null;
  }

  /** The account name the hub knows this host by. */
  get hostName(): string | null {
    return this.hosted?.hostName ?? null;
  }

  seats(): SeatInfo[] {
    return this.session?.seatList() ?? [];
  }

  /** The member that takes over if this host leaves (player id), or null. */
  get successor(): number | null {
    return this.successorPlayer;
  }

  /** Every human's connection type by entity (the host's scoreboard column). */
  links(): Map<number, PeerConnection> {
    return new Map((this.session?.peerRows() ?? []).map((r) => [r.entity, r.link]));
  }

  /** Every human's ping and input loss by entity (the host's scoreboard). */
  linkRows(): Map<number, { pingMs?: number; loss?: number }> {
    return new Map((this.session?.peerRows() ?? []).map((r) => [r.entity, { pingMs: r.pingMs, loss: r.loss }]));
  }

  /** Each connected member's link counters (the smoke test, the net graph). */
  linkStats(): Array<{ peerId: string; relayed: boolean; stats: PeerLink['stats'] }> {
    return [...this.peers.values()]
      .filter((p) => p.link?.isOpen)
      .map((p) => ({ peerId: p.peerId, relayed: !!p.relay, stats: { ...p.link!.stats } }));
  }

  /** The listen server's per-tick packets for members. */
  deliver(tick: number, packets: PeerPacket[]): void {
    this.session?.deliver(tick, packets);
  }

  onSummary(summary: RoomSummary): void {
    this.summary = summary;
    this.session?.onSummary(summary);
    // A level change: members joining from now on load the new map.
    if (summary.map !== this.map) {
      const info = findTf2Map(summary.map);
      if (info) {
        this.map = info.name;
        this.mode = info.mode as Tf2Mode;
        this.session?.setMap(this.map, this.mode);
      }
    }
  }

  /** The host's own chat line. */
  chat(text: string, teamOnly: boolean): void {
    if (this.session) this.session.hostChat(text, teamOnly);
    else this.listen.command({ kind: 'chat', text, teamOnly });
  }

  /** A line in everyone's chat from the server (the host's `say` as the room's operator). */
  serverSay(text: string): void {
    this.session?.serverSay(text);
  }

  kick(playerId: number): void {
    const seat = this.session?.kick(playerId);
    if (seat) {
      if (seat.peerId) this.net.tf2.p2p.kick(seat.peerId);
      this.dropPeer(seat.peerId);
    }
  }

  /**
   * Hands the match to another member now (the pause menu's "Make host"): it becomes the successor,
   * gets a fresh checkpoint, and this host leaves. False when that member cannot take it (relayed,
   * opted out, not connected).
   */
  async transfer(playerId: number): Promise<boolean> {
    const seat = this.seats().find((s) => s.playerId === playerId);
    if (!seat || !seat.canHost || seat.droppedAt !== null || (seat.connection !== 'direct' && seat.connection !== 'turn')) return false;
    this.setSuccessor(seat);
    const sent = this.checkpointsSent;
    this.listen.checkpoint();
    // Wait for that checkpoint to be on its way (the worker writes it in a few hundred ms).
    const deadline = performance.now() + 3_000;
    while (this.checkpointsSent === sent && performance.now() < deadline && !this.stopped) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (this.checkpointsSent === sent) return false;
    this.stop();
    return true;
  }

  // ─── The worker's clock ────────────────────────────────────────────────────

  /** The listen-server worker's heartbeat (every ~100 ms, unthrottled in a background tab). */
  upkeep(): void {
    if (this.stopped) return;
    this.session?.update();
    const now = performance.now();
    if (now - this.lastUpdate >= UPDATE_INTERVAL_MS) this.sendUpdate();
    if (now - this.lastSuccessorAt >= SUCCESSOR_INTERVAL_MS) {
      this.lastSuccessorAt = now;
      this.chooseSuccessor();
    }
  }

  /** A packed checkpoint from the worker: to the successor, if there is one. */
  onCheckpoint(data: ArrayBuffer): void {
    if (this.stopped || this.successorPlayer === null || !this.session) return;
    const bytes = new Uint8Array(data);
    if (this.session.sendCheckpoint(this.successorPlayer, bytes)) {
      this.checkpointsSent++;
      this.lastCheckpointBytes = bytes.byteLength;
    }
  }

  private chooseSuccessor(): void {
    const best = this.session?.successor() ?? null;
    // Keep the current one while it still qualifies (no churn between two close round trips).
    const current = this.successorPlayer !== null ? this.seats().find((s) => s.playerId === this.successorPlayer) : undefined;
    const stillOk = current && current.inMatch && current.droppedAt === null && current.canHost && (current.connection === 'direct' || current.connection === 'turn');
    // Still the one — but if it rejoined (a new peer id on the hub), the hub must hear it again.
    if (stillOk) {
      if (current.peerId !== this.successorPeer) this.setSuccessor(current);
      return;
    }
    this.setSuccessor(best);
  }

  private setSuccessor(seat: SeatInfo | null): void {
    const peer = seat?.peerId || null;
    if (peer === this.successorPeer && (seat?.playerId ?? null) === this.successorPlayer) return;
    this.successorPlayer = seat ? seat.playerId : null;
    this.successorPeer = peer;
    if (this.hosted) this.net.tf2.p2p.successor(peer);
    // The new successor needs the match now, not in two seconds.
    if (seat) this.listen.checkpoint();
  }

  // ─── Hub events ────────────────────────────────────────────────────────────

  private onHosted(payload: unknown): void {
    const parsed = zP2pHosted.safeParse(payload);
    if (!parsed.success || this.stopped) return;
    const hosted = parsed.data;
    if (this.hosted && hosted.code !== this.hosted.code) return;
    this.hosted = hosted;
    // A promoted host's session waits for its checkpoint's seats (members' requests wait with it).
    if (!this.session && (!this.promoted || this.restoredSeats)) {
      this.session = new P2pHostSession({
        code: hosted.code,
        map: this.map,
        mode: this.mode,
        name: this.room.name,
        maxPlayers: this.room.maxPlayers,
        hostUserId: hosted.hostUserId,
        hostName: hosted.hostName,
        localPlayerId: this.localPlayerId,
        match: this.listen.peers,
        now: () => performance.now(),
        onLocalChat: (m) => this.callbacks.onChat?.(m),
        onSeatsChanged: () => this.callbacks.onSeats?.(this.seats()),
      });
      if (this.restoredSeats) this.session.restoreSeats(this.restoredSeats);
      if (this.summary) this.session.onSummary(this.summary);
      for (const req of this.waiting.splice(0)) this.answer(req);
    }
    this.callbacks.onHosted?.(hosted);
    this.sendUpdate();
  }

  private onJoinRequest(payload: unknown): void {
    const parsed = zP2pJoinRequest.safeParse(payload);
    if (!parsed.success || this.stopped) return;
    if (!this.session) {
      // A promoted host's members ask before the session is up: answered as soon as it is.
      if (this.waiting.length < 32) this.waiting.push(parsed.data);
      return;
    }
    if (parsed.data.code !== this.hosted?.code) return;
    this.answer(parsed.data);
  }

  private answer(req: P2pJoinRequest): void {
    const session = this.session;
    if (!session || !this.hosted || req.code !== this.hosted.code) return;
    const result = session.admit(req);
    if (!result.accept) {
      this.net.tf2.p2p.admit({ peerId: req.peerId, accept: false, reason: result.reason });
      return;
    }
    // A second request from the same member (it asked again while the first was in flight): start over.
    if (this.peers.has(req.peerId)) this.dropPeer(req.peerId);
    this.net.tf2.p2p.admit({ peerId: req.peerId, accept: true });
    const entry: Connecting = { peerId: req.peerId, direct: null, relay: null, link: null };
    this.peers.set(req.peerId, entry);
    entry.direct = new DirectConnection({
      role: 'host',
      iceServers: this.hosted.ice,
      signal: (s) => this.net.tf2.p2p.signal({ ...s, to: req.peerId }),
      onChannels: (pair, kind) => this.attach(entry, pair, kind),
      onFailed: () => {
        if (!entry.link && this.peers.get(req.peerId) === entry) this.net.tf2.p2p.relayStart(req.peerId);
      },
    });
  }

  private onSignal(payload: unknown): void {
    const parsed = zP2pSignalIn.safeParse(payload);
    if (!parsed.success || parsed.data.code !== this.hosted?.code) return;
    void this.peers.get(parsed.data.from)?.direct?.handle(parsed.data);
  }

  private onRelayReady(payload: unknown): void {
    const parsed = zP2pRelayReady.safeParse(payload);
    if (!parsed.success || parsed.data.code !== this.hosted?.code) return;
    const entry = this.peers.get(parsed.data.peerId);
    if (!entry || entry.relay) return;
    if (entry.link?.isOpen) return; // the direct path won after all
    entry.direct?.close();
    entry.direct = null;
    const pair = relayPair(parsed.data.slot, (packet, reliable) => this.net.tf2.p2p.relay(packet, reliable));
    entry.relay = pair;
    this.slots.set(parsed.data.slot, entry.peerId);
    this.attach(entry, pair, 'relayed');
    pair.unreliable.open();
    pair.reliable.open();
  }

  private onRelay(payload: unknown): void {
    const bytes = payload instanceof ArrayBuffer ? new Uint8Array(payload) : ArrayBuffer.isView(payload) ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength) : null;
    const packet = bytes ? decodeRelay(bytes) : null;
    if (!packet) return;
    const peerId = this.slots.get(packet.slot);
    const entry = peerId ? this.peers.get(peerId) : undefined;
    entry?.relay?.deliver(packet.reliable, packet.payload);
  }

  // ─── Members ───────────────────────────────────────────────────────────────

  private attach(entry: Connecting, pair: ChannelPair, connection: 'direct' | 'turn' | 'relayed'): void {
    const session = this.session;
    if (!session || this.stopped || this.peers.get(entry.peerId) !== entry) return;
    const handlers = session.linkHandlers(entry.peerId);
    const link: PeerLink = new PeerLink({
      unreliable: pair.unreliable,
      reliable: pair.reliable,
      now: () => performance.now(),
      tickNow: () => session.tickNow(),
      onUnreliable: handlers.onUnreliable,
      onReliable: handlers.onReliable,
      onOpen: () => session.attach(entry.peerId, link, connection),
      onClose: () => {
        handlers.onClose();
        if (entry.link === link) this.dropPeer(entry.peerId);
      },
    });
    entry.link = link;
  }

  private dropPeer(peerId: string): void {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    this.peers.delete(peerId);
    entry.direct?.close();
    entry.relay?.close();
    for (const [slot, id] of this.slots) if (id === peerId) this.slots.delete(slot);
    if (entry.link?.isOpen) entry.link.close('local');
  }

  // ─── The browser digest ────────────────────────────────────────────────────

  /** The browser's digest of the match (names, teams, classes, scores, the round, the map). */
  private sendUpdate(): void {
    if (!this.hosted || !this.summary) return;
    this.lastUpdate = performance.now();
    const s = this.summary;
    const players: RoomPlayerInfo[] = s.players.slice(0, 24).map((p) => ({
      name: p.name.slice(0, 64),
      team: Math.max(0, Math.min(3, p.team | 0)),
      cls: Math.max(0, Math.min(9, p.cls | 0)),
      score: Math.max(-1_000_000, Math.min(1_000_000, Math.round(p.score))),
      bot: p.bot,
    }));
    this.net.tf2.p2p.update({
      state: 'running',
      map: this.map,
      players,
      teamScores: [Math.min(10_000, Math.max(0, s.teamScores[0] | 0)), Math.min(10_000, Math.max(0, s.teamScores[1] | 0))],
      round: s.round ? { state: s.round.state.slice(0, 32), timeLeft: s.round.timeLeft === null ? null : Math.min(86_400, Math.max(0, s.round.timeLeft)) } : null,
    });
  }

  /**
   * The host leaves. With a successor that has had a checkpoint, the match moves to it: members are
   * told `migrating` and the hub promotes it. Otherwise members are told the match ended.
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const migrate = this.successorPlayer !== null && this.checkpointsSent > 0;
    this.session?.close(migrate ? 'migrating' : 'host-left');
    if (this.hosted) this.net.tf2.p2p.close(migrate);
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    // Let the goodbyes leave before the connections close.
    const peers = [...this.peers.keys()];
    setTimeout(() => peers.forEach((id) => this.dropPeer(id)), 300);
  }
}
