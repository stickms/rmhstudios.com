/**
 * NeonDriftway multiplayer client.
 * Follows the same singleton + pub/sub pattern as MultiplayerFactory (Slice It).
 * All socket events are prefixed with `ndw:`.
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:7001';

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
    private socket: Socket | null = null;
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
        if (this.socket?.connected) return;

        this.socket = io(SOCKET_URL, {
            path: '/socket/',
            transports: ['websocket'],
            reconnectionAttempts: 5,
        });

        this.socket.on('connect', () => {
            console.log('[NDW] Connected:', this.socket?.id);
        });

        this.socket.on('connect_error', (err) => {
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
            this.socket.on(evt, (data: any) => {
                this.emitLocal(evt, data);
            });
        }
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // ── Actions (client → server) ──

    joinLobby(roomId: string, playerName: string): void {
        this.socket?.emit('ndw:joinLobby', { roomId, playerName });
    }

    leaveLobby(roomId: string): void {
        this.socket?.emit('ndw:leaveLobby', { roomId });
    }

    toggleReady(roomId: string): void {
        this.socket?.emit('ndw:toggleReady', { roomId });
    }

    startGame(roomId: string, levelId: number): void {
        this.socket?.emit('ndw:startGame', { roomId, levelId });
    }

    /** Send position snapshot (10 Hz) */
    sendPlayerUpdate(roomId: string, data: {
        x: number;
        speed: number;
        distance: number;
        score: number;
        lane: number;
    }): void {
        this.socket?.emit('ndw:playerUpdate', { roomId, ...data });
    }

    /** Send score update (2 Hz) */
    sendScoreUpdate(roomId: string, score: number): void {
        this.socket?.emit('ndw:scoreUpdate', { roomId, score });
    }

    /** Use ability — server picks random target */
    sendAbilityUsed(roomId: string): void {
        this.socket?.emit('ndw:abilityUsed', { roomId });
    }

    /** Notify game finished */
    sendPlayerFinished(roomId: string, finalScore: number): void {
        this.socket?.emit('ndw:playerFinished', { roomId, finalScore });
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
        return this.socket?.id;
    }

    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }
}

export { NDWMultiplayerClient };
