// ============================================================
// BREAKPOINT — RoomClient: socket.io lobby + match relay
// Singleton + pub/sub, following the project's NDW/Slice-It pattern.
// All events are prefixed `ro:` and mirror the server handler.
// ============================================================
import { io, type Socket } from 'socket.io-client';
import { ensureTrailingSlash } from '@/lib/url';
import type {
  NetPlayerState, NetMatchState, WorldFx, Vec3, Team, MatchMode,
} from '../types';

const SOCKET_URL = ensureTrailingSlash(import.meta.env.VITE_SOCKET_URL || 'http://localhost:7001');

export interface RoomPlayer {
  id: string; name: string; agentId: string | null; team: Team; ready: boolean; isHost: boolean;
}
export interface RoomState {
  id: string; name: string; mode: MatchMode; state: 'lobby' | 'playing'; hostId: string;
  isPublic: boolean; cpuPerSide: number; players: RoomPlayer[];
}
export interface StartPayload {
  mode: MatchMode; hostId: string; cpuPerSide: number;
  players: { id: string; name: string; agentId: string; team: Team; isHost: boolean }[];
}

type Handler = (data: unknown) => void;

class RoomClient {
  private static _i: RoomClient;
  static get(): RoomClient { return (this._i ??= new RoomClient()); }

  private socket: Socket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  connected = false;

  get id(): string { return this.socket?.id ?? ''; }

  connect(): Promise<void> {
    if (this.socket?.connected) { this.connected = true; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      this.socket = io(SOCKET_URL, { path: '/socket/', transports: ['websocket'], reconnectionAttempts: 4 });
      const events = ['ro:roomList', 'ro:lobby', 'ro:start', 'ro:player', 'ro:match', 'ro:hit', 'ro:death', 'ro:bhit', 'ro:fx', 'ro:spike', 'ro:buy', 'ro:ability', 'ro:playerLeft', 'ro:error', 'ro:returnLobby'];
      for (const ev of events) {
        this.socket.on(ev, (data: unknown) => this.emitLocal(ev, data));
      }
      this.socket.on('connect', () => { this.connected = true; resolve(); });
      this.socket.on('connect_error', (e) => { this.connected = false; reject(e); });
      // safety timeout
      setTimeout(() => { if (!this.connected) reject(new Error('timeout')); }, 6000);
    });
  }

  disconnect() {
    try { this.socket?.emit('ro:leave'); } catch { /* ignore */ }
    this.socket?.disconnect();
    this.socket = null; this.connected = false; this.handlers.clear();
  }

  // ── pub/sub ──
  on(event: string, cb: Handler): () => void {
    const key = event.startsWith('ro:') ? event : `ro:${event}`;
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(cb);
    return () => this.handlers.get(key)?.delete(cb);
  }
  private emitLocal(event: string, data: unknown) {
    this.handlers.get(event)?.forEach((cb) => { try { cb(data); } catch { /* ignore */ } });
  }

  // ── lobby ──
  join(name: string, agentId: string) { this.socket?.emit('ro:join', { name, agentId }); }
  selectTeam(team: Team) { this.socket?.emit('ro:selectTeam', { team }); }
  selectAgent(agentId: string) { this.socket?.emit('ro:selectAgent', { agentId }); }
  ready(ready: boolean) { this.socket?.emit('ro:ready', { ready }); }
  setMode(mode: MatchMode) { this.socket?.emit('ro:setMode', { mode }); }
  start() { this.socket?.emit('ro:start'); }
  returnLobby() { this.socket?.emit('ro:returnLobby'); }
  leave() { this.socket?.emit('ro:leave'); }

  // ── match relay ──
  sendPlayer(state: NetPlayerState) { this.socket?.emit('ro:player', { state }); }
  sendMatch(state: NetMatchState) { this.socket?.emit('ro:match', { state }); }
  sendHit(target: string, dmg: number, head: boolean, weapon: string) { this.socket?.emit('ro:hit', { target, dmg, head, weapon }); }
  sendBhit(target: string, dmg: number, head: boolean, weapon: string) { this.socket?.emit('ro:bhit', { target, dmg, head, weapon }); }
  sendDeath(killer: string, weapon: string, head: boolean) { this.socket?.emit('ro:death', { killer, weapon, head }); }
  sendFx(fx: WorldFx) { this.socket?.emit('ro:fx', { fx }); }
  sendSpike(type: 'plant' | 'defuse', active: boolean, pos: Vec3 | null) { this.socket?.emit('ro:spike', { type, active, pos }); }
  sendBuy(buyKind: string, id: string, value: number, cost: number, max: number) { this.socket?.emit('ro:buy', { buyKind, id, value, cost, max }); }
  sendAbility(slot: string) { this.socket?.emit('ro:ability', { slot }); }

  // ── room browser ──
  listRooms() { this.socket?.emit('ro:listRooms'); }
  quickJoin(name: string, agentId: string) { this.socket?.emit('ro:quickJoin', { name, agentId }); }
  createRoom(opts: { name: string; agentId: string; roomName: string; isPublic: boolean; password: string | null; mode: MatchMode }) { this.socket?.emit('ro:createRoom', opts); }
  joinRoom(id: string, name: string, agentId: string, password: string | null) { this.socket?.emit('ro:joinRoom', { id, name, agentId, password }); }
  setCpu(count: number) { this.socket?.emit('ro:setCpu', { count }); }
}

export const roomClient = RoomClient.get();
