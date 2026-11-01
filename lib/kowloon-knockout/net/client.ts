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
    | { type: 'peer_status'; seat: number; connected: boolean }
    | { type: 'connection'; status: 'reconnecting' | 'live' }
    | { type: 'error'; message: string };

type MessageHandler = (msg: ServerMessage) => void;

export class NetworkClient {
    private socket: Socket | null = null;
    private handlers = new Map<string, MessageHandler[]>();
    private _seat = 0;
    /**
     * What a reclaim needs. The server hands each seat a secret token with
     * `lobby_update` / `match_start`; presenting it with the room code after a
     * drop gets the same seat back (the hub holds seats for 15s mid-match).
     */
    private roomCode: string | null = null;
    private resumeToken: string | null = null;
    /** A match is running, so a drop is worth riding out rather than leaving. */
    private inMatch = false;
    private resuming = false;

    get seat(): number { return this._seat; }
    get connected(): boolean { return this.socket !== null && this.socket.connected; }

    connect(url: string = DEFAULT_URL): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.socket?.connected) { resolve(); return; }

            // Reconnection is bounded (~8s of attempts, inside the hub's 15s seat hold)
            // and only ever used to resume a running match; any other drop is
            // surfaced as 'Disconnected' exactly as before.
            const socket = io(url, {
                path: SOCKET_PATH, timeout: 10000,
                reconnection: true, reconnectionAttempts: 6, reconnectionDelay: 500, reconnectionDelayMax: 2000,
            });
            this.socket = socket;
            let everConnected = false;
            socket.on('connect', () => {
                if (!everConnected) { everConnected = true; resolve(); return; }
                if (this.resuming && this.roomCode && this.resumeToken) {
                    socket.emit('kk:resume', { code: this.roomCode, token: this.resumeToken });
                } else {
                    this.fail('Disconnected');
                }
            });
            socket.on('connect_error', () => { if (!everConnected) reject(new Error('Socket.io connection failed')); });
            socket.io.on('reconnect_failed', () => this.fail('Disconnected'));

            this.socket.on('kk:room_created', (d) => { this._seat = d.seat; this.roomCode = d.code; this.dispatch({ type: 'room_created', code: d.code, seat: d.seat }); });
            this.socket.on('kk:lobby_update', (d) => {
                this._seat = d.you; this.roomCode = d.code; this.resumeToken = d.resumeToken ?? null;
                this.inMatch = false; this.resuming = false;
                this.dispatch({ type: 'lobby_update', ...d });
            });
            this.socket.on('kk:lobby_list', (d) => this.dispatch({ type: 'lobby_list', lobbies: d.lobbies }));
            this.socket.on('kk:match_start', (d) => {
                this._seat = d.you; this.resumeToken = d.resumeToken ?? null; this.inMatch = true;
                this.dispatch({ type: 'match_start', ...d });
            });
            this.socket.on('kk:resumed', (d) => {
                this._seat = d.you; this.resumeToken = d.resumeToken ?? this.resumeToken; this.inMatch = true; this.resuming = false;
                this.dispatch({ type: 'connection', status: 'live' });
            });
            this.socket.on('kk:peer_status', (d) => this.dispatch({ type: 'peer_status', seat: d.seat, connected: d.connected }));
            this.socket.on('kk:input', (d) => this.dispatch({ type: 'input', seat: d.seat, input: d.input }));
            this.socket.on('kk:snapshot', (d) => this.dispatch({ type: 'snapshot', data: d }));
            this.socket.on('kk:player_left', (d) => this.dispatch({ type: 'player_left', seat: d.seat }));
            this.socket.on('kk:error', (d) => { this.inMatch = false; this.resuming = false; this.dispatch({ type: 'error', message: d.message }); });
            this.socket.on('disconnect', (reason) => {
                if (reason === 'io client disconnect') return; // we hung up on purpose
                if (reason === 'io server disconnect') { this.fail('Disconnected'); return; } // kicked: socket.io will not retry
                if (this.inMatch && this.roomCode && this.resumeToken) {
                    this.resuming = true;
                    this.dispatch({ type: 'connection', status: 'reconnecting' });
                } else {
                    this.fail('Disconnected');
                }
            });
        });
    }

    /** Give up on the connection: tell the UI, and stop socket.io retrying a seat we cannot reclaim. */
    private fail(message: string): void {
        this.inMatch = false;
        this.resuming = false;
        this.socket?.disconnect();
        this.dispatch({ type: 'error', message });
    }

    private dispatch(msg: ServerMessage): void {
        const list = this.handlers.get(msg.type);
        if (list) for (const h of [...list]) h(msg);
    }

    disconnect(): void {
        this.inMatch = false;
        this.resuming = false;
        this.roomCode = null;
        this.resumeToken = null;
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
