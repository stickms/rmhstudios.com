/**
 * NeonDriftway multiplayer client.
 * Follows the same singleton + pub/sub pattern as MultiplayerFactory (Slice It).
 * All socket events are prefixed with `ndw:`.
 *
 * The connection itself (reconnect tuning, wake signals, protocol version) is
 * `createRealtimeClient`. The hub keys a seat by socket id and a reconnect mints
 * a new one, so `onConnect` re-joins the lobby the player was waiting in.
 */

import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';

export type NDWEvent =
    | 'ndw:lobbyState'
    | 'ndw:startCountdown'
    | 'ndw:gameStarted'
    | 'ndw:playerUpdate'
    | 'ndw:scoreUpdate'
    | 'ndw:slowdownApplied'
    | 'ndw:gameOver'
    | 'ndw:playerDisconnected';

type Listener = (data: any) => void;

class NDWMultiplayerClient {
    private static instance: NDWMultiplayerClient;
    private client: RealtimeClient | null = null;
    /** The lobby to re-join on a reconnect; cleared once the race starts or the player leaves. */
    private lobby: { roomId: string; playerName: string } | null = null;
    private listeners: Map<string, Listener[]> = new Map();

    private constructor() { }

    static getInstance(): NDWMultiplayerClient {
        if (!NDWMultiplayerClient.instance) {
            NDWMultiplayerClient.instance = new NDWMultiplayerClient();
        }
        return NDWMultiplayerClient.instance;
    }

    // ── Connection ──

    connect(): void {
        if (this.client) {
            this.client.reconnectNow();
            return;
        }

        this.client = createRealtimeClient({
            name: 'NeonDriftway',
            url: import.meta.env.VITE_SOCKET_URL,
            path: '/socket/',
            // Guests may race: the hub soft-authenticates and names an
            // anonymous socket itself, so no credential is sent.
            auth: () => ({}),
            onConnect: (socket, { isReconnect }) => {
                console.log('[NDW] Connected:', socket.id);
                // The seat is keyed by socket id and that id just changed. A race
                // already under way refuses late joiners, so only a lobby is re-joined.
                if (isReconnect && this.lobby) socket.emit('ndw:joinLobby', this.lobby);
            },
            bind: (socket) => {
                socket.on('connect_error', (err) => {
                    console.error('[NDW] Connection error:', err.message);
                });

                // Listen for all NDW events from server and relay locally
                const events: NDWEvent[] = [
                    'ndw:lobbyState',
                    'ndw:startCountdown',
                    'ndw:gameStarted',
                    'ndw:playerUpdate',
                    'ndw:scoreUpdate',
                    'ndw:slowdownApplied',
                    'ndw:gameOver',
                    'ndw:playerDisconnected',
                ];

                for (const evt of events) {
                    socket.on(evt, (data: any) => {
                        if (evt === 'ndw:startCountdown' || evt === 'ndw:gameStarted') this.lobby = null;
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
    }

    // ── Actions (client → server) ──

    joinLobby(roomId: string, playerName: string): void {
        this.lobby = { roomId, playerName };
        this.client?.emit('ndw:joinLobby', { roomId, playerName }, { queue: true });
    }

    leaveLobby(roomId: string): void {
        this.lobby = null;
        this.client?.emit('ndw:leaveLobby', { roomId }, { queue: true });
    }

    toggleReady(roomId: string): void {
        this.client?.emit('ndw:toggleReady', { roomId }, { queue: true });
    }

    startGame(roomId: string, levelId: number): void {
        this.client?.emit('ndw:startGame', { roomId, levelId }, { queue: true });
    }

    /** Send position snapshot (10 Hz) */
    sendPlayerUpdate(roomId: string, data: {
        x: number;
        speed: number;
        distance: number;
        score: number;
        lane: number;
    }): void {
        this.client?.emit('ndw:playerUpdate', { roomId, ...data });
    }

    /** Send score update (2 Hz) */
    sendScoreUpdate(roomId: string, score: number): void {
        this.client?.emit('ndw:scoreUpdate', { roomId, score });
    }

    /** Use ability — server picks random target */
    sendAbilityUsed(roomId: string): void {
        this.client?.emit('ndw:abilityUsed', { roomId });
    }

    /** Notify game finished */
    sendPlayerFinished(roomId: string, finalScore: number): void {
        this.client?.emit('ndw:playerFinished', { roomId, finalScore }, { queue: true });
    }

    // ── Event system (pub/sub) ──

    on(event: string, callback: Listener): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(callback);
    }

    off(event: string, callback: Listener): void {
        const list = this.listeners.get(event);
        if (list) {
            this.listeners.set(event, list.filter((cb) => cb !== callback));
        }
    }

    private emitLocal(event: string, data: any): void {
        const list = this.listeners.get(event);
        if (list) {
            for (const cb of list) cb(data);
        }
    }

    getSocketId(): string | undefined {
        return this.client?.socket.id;
    }

    isConnected(): boolean {
        return this.client?.socket.connected ?? false;
    }
}

export { NDWMultiplayerClient };
