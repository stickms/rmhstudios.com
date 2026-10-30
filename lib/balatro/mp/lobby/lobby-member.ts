/**
 * A lobby member (or spectator): joins through the hub, connects to the host
 * over one P2P link (transport/member.ts), mirrors the host's versioned lobby
 * state to Lua and forwards Lua's lobby intents and game traffic.
 *
 * - Trust (R-10, REF-18): only the current host's link is listened to;
 *   host-only kinds relayed with `f` are dropped (member.ts); `lobby` and
 *   checkpoint versions only move forward; outcomes are deduplicated by `hs`
 *   in the MatchClient.
 * - Joining a running match: `welcome` carries the match; a player whose Lua
 *   run is not this match (a reload) restores its IndexedDB snapshot (`rejoin`)
 *   — otherwise the run is live (network drop, host migration) and only the
 *   missed outcomes are applied.
 * - Link loss: game events queue (and are sent after the next welcome), the
 *   timer is suspended, and after `RECONNECT_AFTER_MS` the member asks the hub
 *   to join again, unless the hub announced a new host first (then the new
 *   host's admission reconnects it).
 */

import type { IceServerConfig } from '../../../shared/p2p/ice-core';
import type { Envelope, PeerKind, WireData } from '../wire';
import { PEER_KINDS, resolveHubIce, WIRE_PROTOCOL } from '../wire-codec';
import type { BalatroS2CPayload } from '../../net/events';
import { MemberLink } from '../transport/member';
import type { GameEvent, Id, LobbyState, RefCheckpoint, Team } from '../types';
import { startBlock } from './lobby-reducer';
import type { HostIntent, Role, RoleCtx } from './context';

export const RECONNECT_AFTER_MS = 3_000;
export const PENDING_GAME_MAX = 256;

const PEER_SET: ReadonlySet<string> = new Set(PEER_KINDS);

export interface JoinOptions {
  code: string;
  role: 'player' | 'spectator';
  /** Set when this peer holds a seat in `runId` but its Lua run is gone (reload). */
  rejoinRunId: string | null;
}

export class LobbyMember implements Role {
  readonly kind = 'member' as const;
  code: string | null;
  private myPeerId: string | null = null;
  private hostId: Id | null = null;
  private link: MemberLink | null = null;
  private state: LobbyState | null = null;
  private welcomed = false;
  private readonly offs: (() => void)[] = [];
  private pendingGame: GameEvent[] = [];
  private reconnectTimer: (() => void) | null = null;
  private stopped = false;
  private leaving = false;
  private rejoinRunId: string | null;
  readonly role: 'player' | 'spectator';

  constructor(
    private readonly ctx: RoleCtx,
    opts: JoinOptions,
  ) {
    this.code = opts.code;
    this.role = opts.role;
    this.rejoinRunId = opts.rejoinRunId;
    const hub = ctx.deps.hub;
    this.offs.push(
      hub.on('balatro:p2p:joining', (d) => {
        if (d.code !== this.code) return;
        this.myPeerId = d.peerId;
        this.hostId = d.hostUserId;
      }),
      hub.on('balatro:p2p:admitted', (d) => {
        if (d.code === this.code) this.connect(d.hostPeerId, resolveHubIce(d.ice));
      }),
      hub.on('balatro:p2p:rejected', (d) => {
        if (d.code === this.code) this.end(d.reason);
      }),
      hub.on('balatro:p2p:error', (d) => this.onHubError(d)),
      hub.on('balatro:p2p:closed', (d) => {
        if (d.code === this.code) this.end(d.reason);
      }),
      hub.on('balatro:p2p:host-changed', (d) => {
        if (d.code !== this.code) return;
        this.hostId = d.hostUserId;
        this.cancelReconnect();
        // The new host re-admits us (the hub re-sends our join request); drop the dead link.
        this.dropLink();
        this.ctx.deps.bridge.send('host_changed', { hostId: d.hostUserId });
      }),
      hub.on('balatro:p2p:promote', (d) => {
        if (d.code !== this.code || !this.state) return;
        const lobby = this.state;
        this.stop();
        this.ctx.promoted(d, lobby);
      }),
      hub.onStatus((s, info) => {
        // Our hub socket came back: a relayed link needs the hub, so join again; a direct one does not.
        if (s === 'connected' && info.reconnect && !this.stopped && !this.leaving) {
          if (!this.link?.link.isOpen || this.link.kind === 'relay') this.rejoin();
        }
      }),
    );
    this.join();
  }

  private join(): void {
    if (!this.code) return;
    this.ctx.deps.hub.emit('balatro:p2p:join', { code: this.code, contentHash: this.ctx.deps.contentHash, role: this.role });
  }

  private rejoin(): void {
    this.dropLink();
    this.join();
  }

  private onHubError(d: BalatroS2CPayload<'balatro:p2p:error'>): void {
    if (d.event !== 'balatro:p2p:join' || this.welcomed) return;
    this.end(d.code === 'seat-held' && d.heldCode ? `seat-held:${d.heldCode}` : d.code);
  }

  private connect(hostPeerId: string, ice: IceServerConfig[]): void {
    if (this.stopped || !this.myPeerId) return;
    this.dropLink();
    this.ctx.deps.log(`[mp member] admitted; host peer ${hostPeerId}`);
    this.link = new MemberLink({
      hub: this.ctx.deps.hub,
      connector: this.ctx.deps.connector,
      sched: this.ctx.deps.sched,
      ice,
      myPeerId: this.myPeerId,
      onEnvelope: (env, from) => this.onEnvelope(env, from),
      onOpen: () => this.hello(),
      onClose: () => this.onLinkLost(),
      log: (m) => this.ctx.deps.log(`[mp member] ${m}`),
    });
  }

  private dropLink(): void {
    this.welcomed = false;
    const l = this.link;
    this.link = null;
    l?.close();
  }

  private hello(): void {
    if (!this.link) return;
    const live = this.ctx.client();
    const runId = this.rejoinRunId;
    this.link.send('hello', {
      contentHash: this.ctx.deps.contentHash,
      protocol: WIRE_PROTOCOL,
      info: { avatarJoker: this.ctx.settings.avatarJoker, blindCol: this.ctx.settings.blindCol, lang: this.ctx.lang.slice(0, 16) },
      // Only a peer whose run is gone asks for the rejoin resync; a live run just reconnects.
      rejoin: runId && !(live && live.match.runId === runId) ? { runId } : null,
    });
  }

  private onLinkLost(): void {
    if (this.stopped || this.leaving) return;
    this.welcomed = false;
    this.ctx.client()?.suspend(true);
    this.cancelReconnect();
    this.reconnectTimer = this.ctx.deps.sched.after(RECONNECT_AFTER_MS, () => {
      this.reconnectTimer = null;
      if (!this.stopped && !this.link?.link.isOpen) this.rejoin();
    });
  }

  private cancelReconnect(): void {
    this.reconnectTimer?.();
    this.reconnectTimer = null;
  }

  /* ─── From the host ─── */

  private onEnvelope(env: Envelope, f: string | null): void {
    if (this.stopped) return;
    const from = f ?? this.hostId ?? '';
    const bridge = this.ctx.deps.bridge;
    switch (env.k) {
      case 'welcome':
        return this.onWelcome(env.d as WireData<'welcome'>);
      case 'lobby': {
        const d = env.d as WireData<'lobby'>;
        this.applyLobby(d.state);
        return;
      }
      case 'start_game': {
        const match = env.d as WireData<'start_game'>;
        if (this.role === 'player' && match.roster.some((r) => r.id === this.ctx.me)) this.ctx.beginMatch(match, 'start');
        else if (this.role === 'spectator') this.ctx.replayTap()?.spectate(match);
        return;
      }
      case 'reseed':
        return;
      case 'log':
        this.ctx.replayTap()?.peerLog(from, env.d as WireData<'log'>);
        return;
      case 'outcome': {
        const d = env.d as WireData<'outcome'>;
        const c = this.ctx.client();
        if (c) c.outcome(d.o, d.hs);
        else if (this.role === 'spectator') bridge.send('outcome', d);
        return;
      }
      case 'checkpoint': {
        const d = env.d as WireData<'checkpoint'>;
        this.ctx.holdCheckpoint(d.blob);
        this.applyLobby(d.lobby);
        return;
      }
      case 'presence': {
        const d = env.d as WireData<'presence'>;
        bridge.send('presence', d);
        const c = this.ctx.client();
        if (c && d.id === c.routing.target) c.suspend(d.status === 'away');
        return;
      }
      case 'host_changed':
        bridge.send('host_changed', { hostId: (env.d as WireData<'host_changed'>).hostId });
        return;
      case 'setup':
        bridge.send('setup_view', (env.d as WireData<'setup'>).step);
        return;
      case 'chat': {
        const d = env.d as WireData<'chat'>;
        const name = (this.state?.players.find((p) => p.id === from)?.name ?? (d.system ? 'System' : 'Player')).slice(0, 64);
        const line = this.ctx.chat.receive(from, name, d.text, d.system === true && f === null, this.ctx.me);
        if (line) bridge.send('chat_line', line);
        return;
      }
      case 'bye': {
        const d = env.d as WireData<'bye'>;
        if (d.reason === 'version-mismatch' || d.reason === 'kicked') this.end(d.reason);
        return;
      }
      default:
        if (PEER_SET.has(env.k)) this.ctx.client()?.peerIn(env.k as PeerKind, from, env.d as never);
    }
  }

  private applyLobby(state: LobbyState): boolean {
    if (this.state && state.version <= this.state.version) return false;
    this.state = state;
    this.hostId = state.hostId;
    this.ctx.view(state, false, startBlock(state));
    return true;
  }

  private onWelcome(d: WireData<'welcome'>): void {
    this.welcomed = true;
    this.state = null; // a welcome is a full snapshot, whatever version we held
    this.applyLobby(d.lobby);
    const c0 = this.ctx.client();
    if (d.checkpoint) this.ctx.holdCheckpoint(d.checkpoint as RefCheckpoint);
    const match = d.match;
    if (match && this.role === 'player' && match.roster.some((r) => r.id === this.ctx.me)) {
      if (c0 && c0.match.runId === match.runId) {
        this.ctx.beginMatch(match, 'live');
      } else if (!d.lobby.forfeited[this.ctx.me]) {
        this.ctx.beginMatch(match, 'rejoin');
      }
      const c = this.ctx.client();
      if (c) {
        for (const [id, lives] of Object.entries(d.lives)) c.routing.lives[id] = lives;
        for (const [id, results] of Object.entries(d.tail)) {
          if (results.length) this.ctx.deps.bridge.send('tail', { id, results });
        }
        c.suspend(false);
      }
    }
    if (match && this.role === 'spectator') this.ctx.replayTap()?.spectate(match);
    this.rejoinRunId = null;
    // What Lua reported while the link was down.
    const pending = this.pendingGame.splice(0);
    for (const e of pending) this.link?.send('game', { e });
  }

  /* ─── Role API ─── */

  lobby(): LobbyState | null {
    return this.state;
  }

  sendGame(e: GameEvent): void {
    if (this.role !== 'player') return;
    if (this.link?.link.isOpen && this.welcomed && this.link.send('game', { e })) return;
    this.pendingGame.push(e);
    if (this.pendingGame.length > PENDING_GAME_MAX) this.pendingGame.shift();
  }

  sendPeer<K extends PeerKind>(kind: K, d: WireData<K>, to: '*' | Id): void {
    if (this.role !== 'player' || !this.welcomed) return;
    this.link?.send(kind, d, to === '*' ? {} : { to });
  }

  chat(text: string): void {
    const clean = this.ctx.chat.prepareOwn(text);
    if (!clean || !this.link || !this.welcomed) return;
    if (!this.link.send('chat', { text: clean })) return;
    const name = this.state?.players.find((p) => p.id === this.ctx.me)?.name ?? this.ctx.name;
    this.ctx.deps.bridge.send('chat_line', this.ctx.chat.ownLine(this.ctx.me, name, clean));
  }

  ready(on: boolean): void {
    this.link?.send('ready', { ready: on });
  }

  setTeam(team: Team): void {
    this.link?.send('set_team', { team });
  }

  playerInfo(): void {
    this.link?.send('player_info', {
      avatarJoker: this.ctx.settings.avatarJoker,
      blindCol: this.ctx.settings.blindCol,
      lang: this.ctx.lang.slice(0, 16),
    });
  }

  vote(stepId: string, option: string): void {
    this.link?.send('vote_cast', { stepId, option });
  }

  draft(stepId: string, key: string): void {
    this.link?.send('draft_choose', { stepId, key });
  }

  hostIntent(_i: HostIntent): void {
    /* members cannot change the lobby */
  }

  /** After a rejoin restore the run is live: `player_info` tells the host we caught up. */
  caughtUp(): void {
    this.playerInfo();
  }

  leave(): void {
    if (this.stopped) return;
    this.leaving = true;
    const c = this.ctx.client();
    if (c && !c.result) c.luaEvent({ t: 'forfeit' });
    this.link?.send('leave', {});
    this.ctx.deps.hub.emit('balatro:p2p:leave', {});
    // Give the leave a moment on the wire before the link goes.
    const link = this.link;
    this.link = null;
    this.ctx.deps.sched.after(500, () => link?.close());
    this.end('left');
  }

  private end(why: string): void {
    if (this.stopped) return;
    this.stop();
    this.ctx.roleEnded(why);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.cancelReconnect();
    for (const off of this.offs.splice(0)) off();
    this.dropLink();
  }
}
