// ============================================================
// Network Client — Socket.io wrapper (rooms of up to 4 seats)
// ============================================================

import type { Socket } from 'socket.io-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { FighterClass, MatchMode } from '@/lib/kowloon-knockout/game/fighters/types';
import type { WireInput, Snapshot } from './protocol';

const SOCKET_PATH = '/socket/';
/**
 * How long a dropped mid-match client keeps trying to reclaim its seat. The hub
 * holds the seat for KK_RESUME_GRACE_MS (15s, server/socket-server/handlers/
 * kowloon-knockout.ts); past that a reclaim can only fail, so stop and say so.
 */
const RESUME_WINDOW_MS = 15_000;

export interface LobbySeat {
    seat: number;
    className: FighterClass;
    /** Fighter model id (render/fighter/models.ts); absent from an older hub = the default. */
    modelId?: string;
    team: number;
    name: string;
    connected: boolean;
    human: boolean;
}

export interface MatchSeat {
    seat: number;
    className: FighterClass;
    modelId?: string;
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
    private client: RealtimeClient | null = null;
    /** Settles on the first connect (or its failure); `connect()` hands it to every caller. */
    private opening: Promise<void> = Promise.resolve();
    private resumeTimer: ReturnType<typeof setTimeout> | null = null;
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
    get connected(): boolean { return this.client !== null && this.client.socket.connected; }

    /**
     * Connection lifecycle (reconnect tuning, wake signals, protocol version) is
     * `createRealtimeClient`. Reconnection is only ever used to resume a running
     * match, within RESUME_WINDOW_MS; any other drop is surfaced as 'Disconnected'.
     */
    connect(url: string | undefined = import.meta.env.VITE_SOCKET_URL): Promise<void> {
        if (this.client) {
            this.client.reconnectNow();
            return this.opening;
        }

        this.opening = new Promise<void>((resolve, reject) => {
            let everConnected = false;
            // Guests may play: the hub soft-authenticates, so no credential is sent.
            const client = createRealtimeClient({
                name: 'KowloonKnockout',
                url,
                path: SOCKET_PATH,
                auth: () => ({}),
                onConnect: (socket, { isReconnect }) => {
                    if (!isReconnect) { everConnected = true; resolve(); return; }
                    this.clearResumeTimer();
                    if (this.resuming && this.roomCode && this.resumeToken) {
                        socket.emit('kk:resume', { code: this.roomCode, token: this.resumeToken });
                    } else {
                        this.fail('Disconnected');
                    }
                },
                bind: (socket) => this.bindEvents(socket, () => everConnected, reject),
            });
            this.client = client;
        });
        return this.opening;
    }

    private bindEvents(socket: Socket, everConnected: () => boolean, reject: (e: Error) => void): void {
        // Gave up on the first dial: reject, and don't leave a socket retrying behind a dead lobby.
        socket.on('connect_error', () => { if (!everConnected()) { this.teardown(); reject(new Error('Socket.io connection failed')); } });

        socket.on('kk:room_created', (d) => { this._seat = d.seat; this.roomCode = d.code; this.dispatch({ type: 'room_created', code: d.code, seat: d.seat }); });
        socket.on('kk:lobby_update', (d) => {
            this._seat = d.you; this.roomCode = d.code; this.resumeToken = d.resumeToken ?? null;
            this.inMatch = false; this.resuming = false;
            this.dispatch({ type: 'lobby_update', ...d });
        });
        socket.on('kk:lobby_list', (d) => this.dispatch({ type: 'lobby_list', lobbies: d.lobbies }));
        socket.on('kk:match_start', (d) => {
            this._seat = d.you; this.resumeToken = d.resumeToken ?? null; this.inMatch = true;
            this.dispatch({ type: 'match_start', ...d });
        });
        socket.on('kk:resumed', (d) => {
            this._seat = d.you; this.resumeToken = d.resumeToken ?? this.resumeToken; this.inMatch = true; this.resuming = false;
            this.dispatch({ type: 'connection', status: 'live' });
        });
        socket.on('kk:peer_status', (d) => this.dispatch({ type: 'peer_status', seat: d.seat, connected: d.connected }));
        socket.on('kk:input', (d) => this.dispatch({ type: 'input', seat: d.seat, input: d.input }));
        socket.on('kk:snapshot', (d) => this.dispatch({ type: 'snapshot', data: d }));
        socket.on('kk:player_left', (d) => this.dispatch({ type: 'player_left', seat: d.seat }));
        socket.on('kk:error', (d) => { this.inMatch = false; this.resuming = false; this.dispatch({ type: 'error', message: d.message }); });
        socket.on('disconnect', (reason) => {
            if (reason === 'io client disconnect') return; // we hung up on purpose
            if (reason === 'io server disconnect') { this.fail('Disconnected'); return; } // kicked: socket.io will not retry
            if (this.inMatch && this.roomCode && this.resumeToken) {
                this.resuming = true;
                this.clearResumeTimer();
                this.resumeTimer = setTimeout(() => this.fail('Disconnected'), RESUME_WINDOW_MS);
                this.dispatch({ type: 'connection', status: 'reconnecting' });
            } else {
                this.fail('Disconnected');
            }
        });
    }

    private clearResumeTimer(): void {
        if (this.resumeTimer) clearTimeout(this.resumeTimer);
        this.resumeTimer = null;
    }

    /** Release the client. Destroyed rather than just disconnected: the wake signals would otherwise redial a seat we gave up. */
    private teardown(): void {
        this.clearResumeTimer();
        this.client?.destroy();
        this.client = null;
    }

    /** Give up on the connection: tell the UI, and stop socket.io retrying a seat we cannot reclaim. */
    private fail(message: string): void {
        this.inMatch = false;
        this.resuming = false;
        this.teardown();
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
        if (this.client) {
            this.client.emit('kk:leave');
            this.teardown();
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
    createRoom(mode: MatchMode, fighterClass: FighterClass, isPublic: boolean, fighterModel?: string): void {
        this.client?.emit('kk:create_room', { mode, fighterClass, fighterModel, isPublic });
    }
    joinRoom(code: string, fighterClass: FighterClass, fighterModel?: string): void {
        this.client?.emit('kk:join_room', { code, fighterClass, fighterModel });
    }
    setFighter(fighterClass: FighterClass, team: number, fighterModel?: string): void {
        this.client?.emit('kk:set_fighter', { fighterClass, team, fighterModel });
    }
    setConfig(cfg: { mode?: MatchMode; arenaSize?: number; maxRounds?: number; isPublic?: boolean }): void {
        this.client?.emit('kk:set_config', cfg);
    }
    listLobbies(): void {
        this.client?.emit('kk:list_lobbies', {});
    }
    returnToLobby(): void {
        this.client?.emit('kk:return_lobby', {});
    }
    start(): void {
        this.client?.emit('kk:start', {});
    }

    // ── In-match ──
    sendInput(input: WireInput): void {
        this.client?.emit('kk:input', { input });
    }
    sendSnapshot(data: Snapshot): void {
        this.client?.emit('kk:snapshot', data);
    }
}

export const networkClient = new NetworkClient();
