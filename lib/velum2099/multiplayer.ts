/**
 * VELUM 2099 multiplayer client.
 *
 * Singleton + pub/sub socket wrapper mirroring the Neon Driftway client. All
 * socket events are prefixed with `velum:`. The shared world is fully
 * deterministic (seeded by chunk coordinates) so only lightweight per-player
 * driving state is exchanged.
 *
 * The connection itself (reconnect tuning, wake signals, protocol version) is
 * `createRealtimeClient`. The hub keys a seat by socket id and a reconnect mints
 * a new one, so `onConnect` re-joins the lobby the player was last in.
 */

import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';

export type VelumEvent =
    | 'velum:lobbyCreated'
    | 'velum:joined'
    | 'velum:lobbyState'
    | 'velum:gameStarted'
    | 'velum:playerState'
    | 'velum:playerLeft'
    | 'velum:chat'
    | 'velum:error';

export interface VelumLobbyPlayer {
    id: string;
    name: string;
    ready: boolean;
    isHost: boolean;
    colorIndex: number;
}

export interface VelumLobbyState {
    roomId: string;
    status: 'WAITING' | 'PLAYING';
    hostId: string;
    players: VelumLobbyPlayer[];
}

export interface VelumRemoteState {
    id: string;
    name: string;
    colorIndex: number;
    x: number; y: number; z: number; ry: number;
    speed: number; drifting: boolean;
}

export interface VelumChatMessage {
    id: string;
    name: string;
    colorIndex: number;
    text: string;
    ts: number;
}

type Listener = (data: any) => void;

const ALL_EVENTS: VelumEvent[] = [
    'velum:lobbyCreated',
    'velum:joined',
    'velum:lobbyState',
    'velum:gameStarted',
    'velum:playerState',
    'velum:playerLeft',
    'velum:chat',
    'velum:error',
];

class VelumMultiplayerClient {
    private static instance: VelumMultiplayerClient;
    private client: RealtimeClient | null = null;
    /** The lobby to re-join on a reconnect, and the name it was joined with. */
    private lobby: { roomId: string; playerName: string } | null = null;
    /** The name of the join/create in flight, remembered once the hub confirms the seat. */
    private pendingName: string | null = null;
    private listeners: Map<string, Listener[]> = new Map();

    private constructor() { }

    static getInstance(): VelumMultiplayerClient {
        if (!VelumMultiplayerClient.instance) {
            VelumMultiplayerClient.instance = new VelumMultiplayerClient();
        }
        return VelumMultiplayerClient.instance;
    }

    // ── Connection ──

    connect(): void {
        if (this.client) {
            this.client.reconnectNow();
            return;
        }

        this.client = createRealtimeClient({
            name: 'Velum',
            url: import.meta.env.VITE_SOCKET_URL,
            path: '/socket/',
            // Guests may cruise: the hub soft-authenticates and names an
            // anonymous socket itself, so no credential is sent.
            auth: () => ({}),
            onConnect: (socket, { isReconnect }) => {
                // The seat is keyed by socket id and that id just changed.
                if (isReconnect && this.lobby) socket.emit('velum:joinLobby', this.lobby);
            },
            bind: (socket) => {
                socket.on('connect', () => {
                    this.emitLocal('velum:connected', { id: socket.id });
                });
                socket.on('connect_error', (err) => {
                    this.emitLocal('velum:error', { code: 'CONNECT', message: err.message });
                });
                socket.on('disconnect', (reason) => {
                    this.emitLocal('velum:disconnected', { reason });
                });

                for (const evt of ALL_EVENTS) {
                    socket.on(evt, (data: any) => {
                        if (evt === 'velum:joined' && typeof data?.roomId === 'string' && this.pendingName !== null) {
                            this.lobby = { roomId: data.roomId, playerName: this.pendingName };
                        } else if (evt === 'velum:error' && data?.code === 'NOT_FOUND') {
                            this.lobby = null;
                        }
                        this.emitLocal(evt, data);
                    });
                }
            },
        });
    }

    disconnect(): void {
        this.client?.destroy();
        this.client = null;
        this.lobby = null;
        this.pendingName = null;
    }

    // ── Actions (client → server) ──

    createLobby(playerName: string): void {
        this.pendingName = playerName;
        this.client?.emit('velum:createLobby', { playerName }, { queue: true });
    }

    joinLobby(roomId: string, playerName: string): void {
        this.pendingName = playerName;
        this.client?.emit('velum:joinLobby', { roomId, playerName }, { queue: true });
    }

    toggleReady(roomId: string): void {
        this.client?.emit('velum:toggleReady', { roomId }, { queue: true });
    }

    startGame(roomId: string): void {
        this.client?.emit('velum:startGame', { roomId }, { queue: true });
    }

    leaveLobby(roomId: string): void {
        this.lobby = null;
        this.pendingName = null;
        this.client?.emit('velum:leaveLobby', { roomId }, { queue: true });
    }

    sendChat(roomId: string, text: string): void {
        this.client?.emit('velum:chat', { roomId, text }, { queue: true });
    }

    /** Send a driving-state snapshot (≈15 Hz). */
    sendPlayerState(roomId: string, data: {
        x: number; y: number; z: number; ry: number; speed: number; drifting: boolean;
    }): void {
        this.client?.emit('velum:playerState', { roomId, ...data });
    }

    // ── Event system (pub/sub) ──

    on(event: string, callback: Listener): void {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event)!.push(callback);
    }

    off(event: string, callback: Listener): void {
        const list = this.listeners.get(event);
        if (list) this.listeners.set(event, list.filter((cb) => cb !== callback));
    }

    private emitLocal(event: string, data: any): void {
        const list = this.listeners.get(event);
        if (list) for (const cb of list) cb(data);
    }

    getSocketId(): string | undefined {
        return this.client?.socket.id;
    }

    isConnected(): boolean {
        return this.client?.socket.connected ?? false;
    }
}

export { VelumMultiplayerClient };
