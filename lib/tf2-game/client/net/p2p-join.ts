/**
 * Joining a peer-to-peer match (docs/tf2-game.md "Peer-to-peer play"): ask
 * the hub to join the room by code (it vouches for our account to the host),
 * wait for the host to admit us, answer its WebRTC offer (STUN, then TURN with
 * the credentials the hub minted for us), and play over the two DataChannels
 * through `P2pPeerClient` — the same callbacks the game has over the hub. No
 * path in time → the hub relays us.
 *
 * A link that drops (not a goodbye from the host) rejoins by code for up to
 * 30 s: the host kept our seat.
 *
 * **Host migration.** When the host leaves, the match goes on in another
 * member's browser:
 *   - the host may have named US its successor — we then hold its newest
 *     checkpoint, and when the hub says `promoted` the game client starts the
 *     match from it (`onPromoted`) and this controller steps aside;
 *   - otherwise the hub says `migrating` (or the host's goodbye does): we drop
 *     the old link, wait for the new host to admit us again (the hub asks it on
 *     our behalf), connect, and resync on our old seat (`onMigrating`).
 *
 * Browser only.
 */

import { TF2_S2C, type ChatMessage, type ErrorPayload, type JoinedPayload } from '../../net/events';
import type { ClockEstimate } from '../../net/clock';
import type { MatchCommand } from '../../server/match-host';
import type { PeerRow } from '../../net/p2p/control';
import { P2pPeerClient, type PeerEndReason } from '../../net/p2p/peer-client';
import {
  decodeRelay,
  P2P_LIMITS,
  zP2pAdmitted,
  zP2pClosed,
  zP2pMigrating,
  zP2pPromoted,
  zP2pRelayReady,
  zP2pSignalIn,
  type P2pAdmittedPayload,
  type P2pCloseReason,
  type P2pHostedPayload,
} from '../../net/p2p/signal';
import type { LinkStats } from '../../net/p2p/link';
import { DirectConnection, relayPair, type ChannelPair, type RelayPair } from './webrtc';

type Net = typeof import('../../net/client');

/** Why the session is over, for the player. */
export type P2pJoinEnd =
  | 'host-left'
  | 'kicked'
  | 'refused'
  | 'full'
  | 'no-such-room'
  | 'auth-required'
  | 'connection-lost'
  | 'relay-full'
  | 'server-error'
  | 'locked'
  | 'password';

/** How we reach the host: directly, through a TURN server, or through the games hub. */
export type P2pConnectionType = 'direct' | 'turn' | 'relayed';

export interface P2pJoinCallbacks {
  onAdmitted?(info: P2pAdmittedPayload): void;
  onConnection?(type: P2pConnectionType): void;
  onJoined?(info: JoinedPayload): void;
  onSnapshot?(data: Uint8Array): void;
  onEvents?(data: Uint8Array): void;
  onChat?(message: ChatMessage): void;
  onPeers?(rows: PeerRow[]): void;
  onClock?(estimate: ClockEstimate): void;
  /** Reconnecting after a dropped link (the seat is held). */
  onReconnecting?(): void;
  /** The match is moving to a new host (its account name): the next `joined` is a fresh start on our seat. */
  onMigrating?(host: string): void;
  /**
   * The hub made US the host (the previous one left): start the match from `checkpoint` (null when
   * none ever arrived — the match cannot go on). This controller has stepped aside.
   */
  onPromoted?(hosted: P2pHostedPayload, previousHost: string, checkpoint: Uint8Array | null): void;
  onEnded?(reason: P2pJoinEnd): void;
}

export interface P2pJoinOptions {
  /** Join as a spectator (part of the join request). */
  spectate?: boolean;
  /** May this browser take the match over if the host leaves (default true). */
  canHost?: boolean;
  password?: string;
}

/** After the host's goodbye `migrating` (or its link dying while we are the successor), how long to wait for the hub. */
const MIGRATION_WAIT_MS = P2P_LIMITS.MIGRATE_GRACE_MS + 6_000;
/** A dropped link asks again after this (long enough for the hub to decide on a migration first). */
const REJOIN_DELAY_MS = P2P_LIMITS.MIGRATE_GRACE_MS + 1_000;

export class P2pJoinController {
  private client: P2pPeerClient | null = null;
  private direct: DirectConnection | null = null;
  private relay: RelayPair | null = null;
  private admitted: P2pAdmittedPayload | null = null;
  private readonly unsubs: Array<() => void> = [];
  private upkeep: ReturnType<typeof setInterval> | null = null;
  private ended = false;
  private everJoined = false;
  private rejoinUntil = 0;
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private migrationTimer: ReturnType<typeof setTimeout> | null = null;
  private connection: P2pConnectionType | null = null;
  /** When the host admitted us, and how long the link then took to open (ms; diagnostics). */
  private admittedAt = 0;
  private connectMs: number | null = null;
  /** The newest migration checkpoint the host sent us (we are its successor), and when. */
  private checkpoint: Uint8Array | null = null;
  private checkpointAt = 0;
  /** Host migrations lived through (diagnostics). */
  migrations = 0;

  constructor(
    private readonly net: Net,
    readonly code: string,
    private readonly cb: P2pJoinCallbacks,
    private readonly opts: P2pJoinOptions = {},
  ) {}

  start(): void {
    const { net } = this;
    this.unsubs.push(
      net.subscribeTf2(TF2_S2C.P2P_ADMITTED, (p) => this.onAdmitted(p)),
      net.subscribeTf2(TF2_S2C.P2P_SIGNAL, (p) => {
        const parsed = zP2pSignalIn.safeParse(p);
        if (parsed.success && parsed.data.code === this.code && parsed.data.from === 'host') void this.direct?.handle(parsed.data);
      }),
      net.subscribeTf2(TF2_S2C.P2P_RELAY_READY, (p) => this.onRelayReady(p)),
      net.subscribeTf2(TF2_S2C.P2P_RELAY, (p) => {
        const bytes = p instanceof ArrayBuffer ? new Uint8Array(p) : ArrayBuffer.isView(p) ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength) : null;
        const packet = bytes ? decodeRelay(bytes) : null;
        if (packet) this.relay?.deliver(packet.reliable, packet.payload);
      }),
      net.subscribeTf2(TF2_S2C.P2P_CLOSED, (p) => {
        const parsed = zP2pClosed.safeParse(p);
        if (!parsed.success || parsed.data.code !== this.code) return;
        this.onHubClosed(parsed.data.reason);
      }),
      net.subscribeTf2(TF2_S2C.P2P_MIGRATING, (p) => {
        const parsed = zP2pMigrating.safeParse(p);
        if (!parsed.success || parsed.data.code !== this.code || this.ended) return;
        this.onMigrating(parsed.data.host);
      }),
      net.subscribeTf2(TF2_S2C.P2P_PROMOTED, (p) => {
        const parsed = zP2pPromoted.safeParse(p);
        if (!parsed.success || parsed.data.hosted.code !== this.code || this.ended) return;
        this.onPromoted(parsed.data.hosted, parsed.data.previousHost);
      }),
      net.subscribeTf2('connect', () => {
        // A hub blip ends our membership there. A direct link does not need it; anything
        // still connecting (or riding the relay) asks again — the host keeps our seat.
        if (this.ended || !this.admitted || this.connection === 'direct' || this.connection === 'turn') return;
        this.askToJoin();
      }),
      net.subscribeTf2(TF2_S2C.ERROR, (e: ErrorPayload) => {
        if (e?.event !== 'tf2:p2p:join' && e?.event !== 'tf2:p2p:relay:start') return;
        if (e.event === 'tf2:p2p:relay:start') {
          if (!this.client?.link.isOpen) this.end('relay-full');
          return;
        }
        if (e.code === 'rate-limited') return;
        const map: Record<string, P2pJoinEnd> = {
          'no-such-room': this.everJoined ? 'host-left' : 'no-such-room',
          'room-full': 'full',
          kicked: 'kicked',
          'auth-required': 'auth-required',
          locked: 'locked',
          password: 'password',
        };
        this.end(map[e.code] ?? 'refused');
      }),
    );
    this.upkeep = setInterval(() => this.client?.update(), 100);
    this.askToJoin();
  }

  private askToJoin(): void {
    this.net.tf2.p2p.join(this.code, {
      ...(this.opts.spectate && !this.everJoined ? { spectate: true } : {}),
      canHost: this.opts.canHost !== false,
      ...(this.opts.password ? { password: this.opts.password } : {}),
    });
  }

  get stats(): LinkStats | null {
    return this.client?.stats ?? null;
  }

  get connectionType(): P2pConnectionType | null {
    return this.connection;
  }

  /** Admission → open link, ms (direct, TURN, or the relay fallback after the timeout). */
  get connectTimeMs(): number | null {
    return this.connectMs;
  }

  /** The newest checkpoint's size and age (we are the successor), for diagnostics. */
  get checkpointInfo(): { bytes: number; ageMs: number } | null {
    return this.checkpoint ? { bytes: this.checkpoint.byteLength, ageMs: performance.now() - this.checkpointAt } : null;
  }

  pingMs(): number | null {
    return this.client?.clock()?.rttMs ?? null;
  }

  sendInput(packet: Uint8Array): void {
    this.client?.sendInput(packet);
  }

  command(cmd: MatchCommand): void {
    this.client?.command(cmd);
  }

  chat(text: string, teamOnly: boolean): void {
    this.client?.chat(text, teamOnly);
  }

  // ─── Connecting ────────────────────────────────────────────────────────────

  private onAdmitted(payload: unknown): void {
    const parsed = zP2pAdmitted.safeParse(payload);
    if (!parsed.success || parsed.data.code !== this.code || this.ended) return;
    this.clearTimers();
    this.admitted = parsed.data;
    this.admittedAt = performance.now();
    this.connectMs = null;
    this.cb.onAdmitted?.(parsed.data);
    this.teardownConnection();
    let relayAsked = false;
    this.direct = new DirectConnection({
      role: 'member',
      iceServers: parsed.data.ice,
      signal: (s) => this.net.tf2.p2p.signal(s),
      onChannels: (pair, kind) => this.connect(pair, kind),
      onFailed: () => {
        // The host asks for the relay too; whoever is first, the hub answers both.
        if (!relayAsked && !this.client?.link.isOpen) {
          relayAsked = true;
          setTimeout(() => {
            if (!this.relay && !this.client?.link.isOpen && !this.ended) this.net.tf2.p2p.relayStart();
          }, 1500);
        }
      },
    });
  }

  private onRelayReady(payload: unknown): void {
    const parsed = zP2pRelayReady.safeParse(payload);
    if (!parsed.success || parsed.data.code !== this.code || parsed.data.peerId !== this.admitted?.peerId) return;
    if (this.relay || this.client?.link.isOpen) return;
    this.direct?.close();
    this.direct = null;
    const pair = relayPair(parsed.data.slot, (packet, reliable) => this.net.tf2.p2p.relay(packet, reliable));
    this.relay = pair;
    this.connect(pair, 'relayed');
    pair.unreliable.open();
    pair.reliable.open();
  }

  private connect(pair: ChannelPair, type: P2pConnectionType): void {
    if (this.ended) return;
    this.client?.close();
    this.connection = type;
    this.connectMs = performance.now() - this.admittedAt;
    this.cb.onConnection?.(type);
    this.client = new P2pPeerClient({
      unreliable: pair.unreliable,
      reliable: pair.reliable,
      now: () => performance.now(),
      handlers: {
        onJoined: (info) => {
          this.everJoined = true;
          this.rejoinUntil = 0;
          this.cb.onJoined?.(info);
        },
        onSnapshot: (d) => this.cb.onSnapshot?.(d),
        onEvents: (d) => this.cb.onEvents?.(d),
        onChat: (m) => this.cb.onChat?.(m),
        onPeers: (rows) => this.cb.onPeers?.(rows),
        onClock: (e) => this.cb.onClock?.(e),
        onCheckpoint: (data) => {
          this.checkpoint = data;
          this.checkpointAt = performance.now();
        },
        onEnded: (reason) => this.onLinkEnded(reason),
      },
    });
  }

  private onLinkEnded(reason: PeerEndReason): void {
    if (this.ended) return;
    if (reason === 'host-left') return this.end('host-left');
    if (reason === 'kicked') return this.end('kicked');
    if (reason === 'server-error' || reason === 'map-failed') return this.end('server-error');
    this.teardownConnection();
    if (reason === 'migrating' || this.checkpoint) {
      // The host is handing over (or we are its successor and its link died): the hub decides who
      // hosts next — wait for `promoted` / `migrating` rather than knocking on the old host's door.
      this.cb.onReconnecting?.();
      this.waitForMigration();
      return;
    }
    // The link dropped: the host holds our seat for 30 s — ask again (after the hub's migration grace).
    if (!this.rejoinUntil) this.rejoinUntil = performance.now() + P2P_LIMITS.SEAT_GRACE_MS;
    if (performance.now() > this.rejoinUntil) return this.end('connection-lost');
    this.cb.onReconnecting?.();
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = setTimeout(() => {
      this.rejoinTimer = null;
      if (!this.ended && !this.client) this.askToJoin();
    }, REJOIN_DELAY_MS);
  }

  private waitForMigration(): void {
    if (this.migrationTimer) return;
    this.migrationTimer = setTimeout(() => {
      this.migrationTimer = null;
      // Nobody took over in time: knock on the room's door again (it may still be there).
      if (!this.ended && !this.client) this.askToJoin();
    }, MIGRATION_WAIT_MS);
  }

  /** The hub: the match moves to `host`; it will admit us again. */
  private onMigrating(host: string): void {
    this.migrations++;
    this.clearTimers();
    this.teardownConnection();
    this.admitted = null;
    this.cb.onMigrating?.(host);
    // If the new host never admits us, ask again ourselves.
    this.waitForMigration();
  }

  /** The hub: we are the host now. The game client takes it from here (with our checkpoint). */
  private onPromoted(hosted: P2pHostedPayload, previousHost: string): void {
    this.migrations++;
    const checkpoint = this.checkpoint;
    // Step aside without telling the hub anything: our membership already became the room.
    this.ended = true;
    this.stopTimers();
    this.teardownConnection();
    this.cb.onPromoted?.(hosted, previousHost, checkpoint);
  }

  private onHubClosed(reason: P2pCloseReason): void {
    // While connected directly, only a kick or the host's goodbye ends us (they come over the link too).
    if (reason === 'kicked') return this.end('kicked');
    if (reason === 'refused' || reason === 'full') return this.end(reason);
    if (reason === 'relay-overflow') return this.end('connection-lost');
    if (!this.client?.link.isOpen) this.end('host-left');
  }

  private teardownConnection(): void {
    this.direct?.close();
    this.direct = null;
    this.relay?.close();
    this.relay = null;
    const c = this.client;
    this.client = null;
    this.connection = null;
    c?.close();
  }

  private clearTimers(): void {
    if (this.rejoinTimer) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = null;
    if (this.migrationTimer) clearTimeout(this.migrationTimer);
    this.migrationTimer = null;
  }

  private end(reason: P2pJoinEnd): void {
    if (this.ended) return;
    this.ended = true;
    this.stopTimers();
    this.teardownConnection();
    this.cb.onEnded?.(reason);
  }

  private stopTimers(): void {
    this.clearTimers();
    if (this.upkeep) clearInterval(this.upkeep);
    this.upkeep = null;
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
  }

  /** Leave on purpose: the host releases the seat at once. */
  stop(): void {
    if (this.ended) return;
    this.ended = true;
    this.stopTimers();
    this.client?.leave();
    this.net.tf2.p2p.leave();
    const direct = this.direct;
    const relay = this.relay;
    setTimeout(() => {
      direct?.close();
      relay?.close();
    }, 300);
  }
}
