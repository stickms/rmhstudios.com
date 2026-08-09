/**
 * Bum's Rush — client-side room lifecycle (§9.7).
 *
 * All five ways into a game — Quick Play, room code, invite link, party ticket,
 * couch — land in the same {@link RoomView}, because they are the same room.
 * The differences are one emit each, and they are all in this file so no screen
 * has to know which door the player came through.
 *
 * The one behaviour worth stating loudly, because it is the requirement rather
 * than a feature: **Quick Play does not open a lobby.** It seats you and the
 * hub starts the level immediately; whoever arrives next is sketched into a
 * level already in progress (§2.7). Nobody stares at a room code waiting for a
 * stranger. `phase === 'lobby'` exists for private rooms and Showdown setup,
 * not for matchmaking.
 *
 * Plain observable store rather than Zustand: `net/` is imported during SSR and
 * by the hub-facing tests, and a game-local room mirror does not need to be in
 * the site's store tier for one screen to read it.
 */

'use client';

import { BR_C2S, BR_S2C, DEFAULT_ASSISTS, DEFAULT_COSMETICS, NET } from '../constants';
import type { Assists, Cosmetics, RoomMode, RoomView, SeatIndex, ShowdownRoundKind } from '../types';
import { RttWindow } from './migration';
import type {
  BrErrorMsg,
  HostChangedMsg,
  PeerMsg,
  PongMsg,
  ResultAckMsg,
  RoomListEntry,
  SeatAssignmentMsg,
  StartBroadcastMsg,
} from './protocol';
import {
  connectBumsRush,
  detectDevice,
  emitBumsRush,
  getBumsRushSocket,
  getClientKey,
  onBumsRush,
} from './socket';

export interface LobbyState {
  room: RoomView | null;
  /** Seats this client owns, in claim order (couch co-op, §4.6). */
  mySeats: SeatIndex[];
  rooms: RoomListEntry[];
  start: StartBroadcastMsg | null;
  hostChanged: HostChangedMsg | null;
  lastError: BrErrorMsg | null;
  lastResultAck: ResultAckMsg | null;
  /** Median RTT to the hub over the last 30 s — the HUD's postmark stamp. */
  medianRtt: number | null;
  amHost: boolean;
}

const INITIAL: LobbyState = {
  room: null,
  mySeats: [],
  rooms: [],
  start: null,
  hostChanged: null,
  lastError: null,
  lastResultAck: null,
  medianRtt: null,
  amHost: false,
};

export type LobbyListener = (state: LobbyState) => void;

/**
 * The room, as this client sees it.
 *
 * One instance per game mount. Constructing it wires the socket listeners;
 * `dispose()` removes them. It never opens the connection itself — the screen
 * decides when a player has committed to multiplayer, which for the couch path
 * is never.
 */
export class BumsRushLobby {
  private state: LobbyState = INITIAL;
  private readonly listeners = new Set<LobbyListener>();
  private readonly unsubscribes: (() => void)[] = [];
  private readonly rtt = new RttWindow();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** Re-sent on reconnect so the hub can re-attach held seats. */
  private lastCode: string | null = null;
  /** Our own clientId, learned from the first `br:seat`. */
  private selfId: string | null = null;
  private identity: { name: string; cosmetics: Cosmetics } = {
    name: 'Player',
    cosmetics: { ...DEFAULT_COSMETICS },
  };

  constructor() {
    this.bind();
  }

  // ─── Subscription ─────────────────────────────────────────────────────────

  subscribe(listener: LobbyListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): LobbyState {
    return this.state;
  }

  private set(patch: Partial<LobbyState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  dispose(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
    this.listeners.clear();
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  // ─── Wire ─────────────────────────────────────────────────────────────────

  private bind(): void {
    this.unsubscribes.push(
      onBumsRush<RoomView>(BR_S2C.ROOM, (room) => {
        this.lastCode = room.code;
        // Before the first `br:seat` we do not know our own client id, so the
        // room simply renders nobody as "you" rather than guessing.
        const mine = room.seats
          .filter((seat) => this.selfId !== null && seat.clientId === this.selfId)
          .map((seat) => seat.seat);
        this.set({
          room,
          mySeats: mine.length ? mine : this.state.mySeats,
          amHost: this.selfId !== null && room.hostClientId === this.selfId,
        });
      }),
      onBumsRush<SeatAssignmentMsg>(BR_S2C.SEAT, (msg) => {
        this.selfId = msg.clientId;
        this.set({
          mySeats: msg.seats.map((s) => s.seat),
          amHost: this.state.room?.hostClientId === msg.clientId,
        });
      }),
      onBumsRush<RoomListEntry[]>(BR_S2C.ROOM_LIST, (rooms) => {
        this.set({ rooms: Array.isArray(rooms) ? rooms : [] });
      }),
      onBumsRush<StartBroadcastMsg>(BR_S2C.START, (start) => {
        this.set({ start, amHost: start.hostClientId === this.selfId });
      }),
      onBumsRush<HostChangedMsg>(BR_S2C.HOST_CHANGED, (msg) => {
        this.set({ hostChanged: msg, amHost: msg.youAreHost });
      }),
      onBumsRush<PongMsg>(BR_S2C.PONG, (pong) => {
        const now = Date.now();
        this.rtt.push(now - pong.t, now);
        this.set({ medianRtt: this.rtt.median(now) });
      }),
      onBumsRush<BrErrorMsg>(BR_S2C.ERROR, (error) => this.set({ lastError: error })),
      onBumsRush<PeerMsg>(BR_S2C.PEER_JOINED, () => {
        /* The `br:room` that follows carries the truth; this is for the toast. */
      }),
      onBumsRush<PeerMsg>(BR_S2C.PEER_LEFT, () => {
        /* Likewise — seats stay held for the grace period, so nothing is removed here. */
      }),
      onBumsRush<{ reason?: string }>(BR_S2C.KICKED, () => {
        this.lastCode = null;
        this.set({ room: null, mySeats: [], start: null, amHost: false });
      }),
    );
  }

  // ─── The five doors (§9.7) ────────────────────────────────────────────────

  async connect(identity: { name: string; cosmetics: Cosmetics }): Promise<void> {
    this.identity = identity;
    await connectBumsRush();
    this.startPinging();
  }

  /** Door 1 — Quick Play. Lands IN a level, never in a lobby. */
  quickPlay(options: { mode: RoomMode; minPlayers?: number; levelId?: string }): void {
    emitBumsRush(
      BR_C2S.QUICK_PLAY,
      {
        mode: options.mode,
        minPlayers: options.minPlayers ?? 1,
        levelId: options.levelId,
        ...this.credentials(),
      },
      true,
    );
  }

  /** Door 2/3 — a room code, typed or arriving from `?room=` in the link. */
  joinRoom(code: string, ticket?: string): void {
    emitBumsRush(
      BR_C2S.JOIN_ROOM,
      { code: code.trim().toUpperCase(), ticket, ...this.credentials() },
      true,
    );
  }

  /**
   * Door 4 — a party ticket.
   *
   * The ticket arrives on `party:ticket` and is handed to us through ROUTER
   * STATE, never the URL: it is a bearer secret, and `lib/party/types.ts` is
   * explicit that putting one in a URL is how it leaks into history, referrers
   * and screenshots. A room CODE in a URL is fine — it grants nothing a
   * stranger could not ask for.
   */
  redeemPartyTicket(msg: { roomId: string; token: string }): void {
    this.joinRoom(msg.roomId, msg.token);
  }

  createRoom(options: {
    mode: RoomMode;
    private: boolean;
    levelId?: string;
    ranked?: boolean;
    teams?: boolean;
  }): void {
    emitBumsRush(BR_C2S.CREATE_ROOM, { ...options, ...this.credentials() }, true);
  }

  listRooms(mode: RoomMode): void {
    emitBumsRush(BR_C2S.LIST_ROOMS, { mode });
  }

  /**
   * Door 5 — couch. A second pad presses a button and claims a seat on THIS
   * client; a room caps at four seats however they are distributed, so "two on
   * the sofa and two online" needs no special case (§9.2).
   */
  claimSeat(localIndex: number, cosmetics?: Cosmetics, name?: string): void {
    emitBumsRush(BR_C2S.CLAIM_SEAT, { localIndex, cosmetics, name }, true);
  }

  releaseSeat(seatIndex: SeatIndex): void {
    emitBumsRush(BR_C2S.RELEASE_SEAT, { seatIndex }, true);
  }

  // ─── Room controls ────────────────────────────────────────────────────────

  setCosmetics(seatIndex: SeatIndex, cosmetics: Cosmetics): void {
    emitBumsRush(BR_C2S.SET_COSMETICS, { seatIndex, ...cosmetics }, true);
  }

  setAssists(seatIndex: SeatIndex, assists: Assists = { ...DEFAULT_ASSISTS }): void {
    emitBumsRush(BR_C2S.SET_ASSISTS, { seatIndex, assists }, true);
  }

  setReady(seatIndex: SeatIndex, ready: boolean): void {
    emitBumsRush(BR_C2S.READY, { seatIndex, ready }, true);
  }

  selectLevel(levelId: string): void {
    emitBumsRush(BR_C2S.SELECT_LEVEL, { levelId }, true);
  }

  start(levelId?: string, roundKind?: ShowdownRoundKind): void {
    emitBumsRush(BR_C2S.START, { levelId, roundKind }, true);
  }

  handoffHost(toClientId: string): void {
    emitBumsRush(BR_C2S.HOST_HANDOFF, { toClientId }, true);
  }

  /**
   * Send a sealed result and wait for the hub's verdict (§9.8).
   *
   * The verdict comes back on the socket.io **acknowledgement** for `br:result`
   * rather than on a new server→client event, because §9.3's S2C catalog does
   * not have one and this answer is only ever for the one socket that asked.
   *
   * The hub bound-checks; it does not persist. Persistence is `/api/bums-rush/*`
   * on the web tier (§10.3), where the session lives — which is also what makes
   * a signed-out player's local save and a signed-in player's row the same code
   * path rather than two.
   */
  reportResult(envelope: unknown): Promise<ResultAckMsg | null> {
    const socket = getBumsRushSocket();
    if (!socket) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ack: ResultAckMsg | null) => {
        if (settled) return;
        settled = true;
        if (ack) this.set({ lastResultAck: ack });
        resolve(ack);
      };
      // A result that never gets an answer must not hang the results card.
      const timer = setTimeout(() => done(null), 5_000);
      socket.emit(BR_C2S.RESULT, envelope, (ack: ResultAckMsg | null) => {
        clearTimeout(timer);
        done(ack ?? null);
      });
    });
  }

  leave(): void {
    this.lastCode = null;
    emitBumsRush(BR_C2S.LEAVE, {}, true);
    this.set({ room: null, mySeats: [], start: null, amHost: false });
  }

  // ─── RTT probe (§9.5's postmark) ──────────────────────────────────────────

  /**
   * One probe a second.
   *
   * Enough to have a usable 30-sample median at election time (§9.6) and to
   * move the postmark stamp when the connection actually changes; far below the
   * 120/60 s cap, so a reconnect burst cannot rate-limit the room's own health
   * signal.
   */
  private startPinging(): void {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      emitBumsRush(BR_C2S.PING, { t: Date.now() });
    }, 1000);
    if (typeof this.pingTimer === 'object' && 'unref' in this.pingTimer) {
      (this.pingTimer as { unref(): void }).unref();
    }
  }

  /** Everything the hub needs to seat us, on every door. */
  private credentials() {
    return {
      name: this.identity.name,
      cosmetics: this.identity.cosmetics,
      device: detectDevice(),
      clientKey: getClientKey(),
    };
  }

  /** Re-join after a drop; the hub matches the held seats on `clientKey`. */
  rejoin(): void {
    if (!this.lastCode) return;
    this.joinRoom(this.lastCode);
  }
}

/** Seats a room still has free — the number Quick Play matches on. */
export function freeSeats(room: RoomView | null): number {
  if (!room) return NET.MAX_SEATS;
  return Math.max(0, NET.MAX_SEATS - room.seats.length);
}
