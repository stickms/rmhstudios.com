// ============================================================
// Network Client — Socket.io wrapper (rooms of up to 4 seats)
// ============================================================

import { io, Socket } from 'socket.io-client';
import { ensureTrailingSlash } from '@/lib/url';
import type { FighterClass, MatchMode } from '@/lib/kowloon-knockout/game/fighters/types';
import type { WireInput, Snapshot } from './protocol';

const DEFAULT_URL = ensureTrailingSlash(import.meta.env.VITE_SOCKET_URL || 'http://localhost:7001');
const SOCKET_PATH = '/socket/';

export interface LobbySeat {
    seat: number;
    className: FighterClass;
    team: number;
    name: string;
    connected: boolean;
    human: boolean;
}

export interface MatchSeat {
    seat: number;
    className: FighterClass;
    team: number;
    kind: 'human-local' | 'remote' | 'ai';
    name: string;
}

export interface LobbyListing {
    code: string;
    mode: MatchMode;
    arenaSize: number;
    players: number;
    host: FighterClass;
}

export type ServerMessage =
    | { type: 'room_created'; code: string; seat: number }
    | { type: 'lobby_update'; you: number; hostSeat: number; code: string; isPublic: boolean; mode: MatchMode; arenaSize: number; maxRounds: number; seats: LobbySeat[] }
    | { type: 'lobby_list'; lobbies: LobbyListing[] }
    | { type: 'match_start'; you: number; mode: MatchMode; maxRounds: number; aiDifficulty: number; seats: MatchSeat[] }
    | { type: 'input'; seat: number; input: WireInput }
    | { type: 'snapshot'; data: Snapshot }
    | { type: 'player_left'; seat: number }
    | { type: 'error'; message: string };

type MessageHandler = (msg: ServerMessage) => void;

class NetworkClient {
    private socket: Socket | null = null;
    private handlers = new Map<string, MessageHandler[]>();
    private _seat = 0;

    get seat(): number { return this._seat; }
    get connected(): boolean { return this.socket !== null && this.socket.connected; }

    connect(url: string = DEFAULT_URL): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.socket?.connected) { resolve(); return; }

            this.socket = io(url, { path: SOCKET_PATH, reconnection: false, timeout: 10000 });
            this.socket.on('connect', () => resolve());
            this.socket.on('connect_error', () => reject(new Error('Socket.io connection failed')));

            this.socket.on('kk:room_created', (d) => { this._seat = d.seat; this.dispatch({ type: 'room_created', code: d.code, seat: d.seat }); });
            this.socket.on('kk:lobby_update', (d) => { this._seat = d.you; this.dispatch({ type: 'lobby_update', ...d }); });
            this.socket.on('kk:lobby_list', (d) => this.dispatch({ type: 'lobby_list', lobbies: d.lobbies }));
            this.socket.on('kk:match_start', (d) => { this._seat = d.you; this.dispatch({ type: 'match_start', ...d }); });
            this.socket.on('kk:input', (d) => this.dispatch({ type: 'input', seat: d.seat, input: d.input }));
            this.socket.on('kk:snapshot', (d) => this.dispatch({ type: 'snapshot', data: d }));
            this.socket.on('kk:player_left', (d) => this.dispatch({ type: 'player_left', seat: d.seat }));
            this.socket.on('kk:error', (d) => this.dispatch({ type: 'error', message: d.message }));
            this.socket.on('disconnect', () => this.dispatch({ type: 'error', message: 'Disconnected' }));
        });
    }

    private dispatch(msg: ServerMessage): void {
        const list = this.handlers.get(msg.type);
        if (list) for (const h of [...list]) h(msg);
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.emit('kk:leave');
            this.socket.disconnect();
            this.socket = null;
        }
    }

    on(type: ServerMessage['type'], handler: MessageHandler): void {
        const existing = this.handlers.get(type) || [];
        existing.push(handler);
        this.handlers.set(type, existing);
    }
    off(type: ServerMessage['type'], handler: MessageHandler): void {
        const existing = this.handlers.get(type);
        if (existing) this.handlers.set(type, existing.filter(h => h !== handler));
    }
    clearHandlers(): void { this.handlers.clear(); }

    // ── Lobby ──
    createRoom(mode: MatchMode, fighterClass: FighterClass, isPublic: boolean): void {
        this.socket?.emit('kk:create_room', { mode, fighterClass, isPublic });
    }
    joinRoom(code: string, fighterClass: FighterClass): void {
        this.socket?.emit('kk:join_room', { code, fighterClass });
    }
    setFighter(fighterClass: FighterClass, team: number): void {
        this.socket?.emit('kk:set_fighter', { fighterClass, team });
    }
    setConfig(cfg: { mode?: MatchMode; arenaSize?: number; maxRounds?: number; isPublic?: boolean }): void {
        this.socket?.emit('kk:set_config', cfg);
    }
    listLobbies(): void {
        this.socket?.emit('kk:list_lobbies', {});
    }
    returnToLobby(): void {
        this.socket?.emit('kk:return_lobby', {});
    }
    start(): void {
        this.socket?.emit('kk:start', {});
    }

    // ── In-match ──
    sendInput(input: WireInput): void {
        this.socket?.emit('kk:input', { input });
    }
    sendSnapshot(data: Snapshot): void {
        this.socket?.emit('kk:snapshot', data);
    }
}

export const networkClient = new NetworkClient();
