/**
 * VELUM 2099 multiplayer client.
 *
 * Singleton + pub/sub socket wrapper mirroring the Neon Driftway client. All
 * socket events are prefixed with `velum:`. The shared world is fully
 * deterministic (seeded by chunk coordinates) so only lightweight per-player
 * driving state is exchanged.
 */

import { io, Socket } from 'socket.io-client';
import { ensureTrailingSlash } from '@/lib/url';

const SOCKET_URL = ensureTrailingSlash(import.meta.env.VITE_SOCKET_URL || 'http://localhost:7001');

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
    private socket: Socket | null = null;
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
        if (this.socket?.connected) return;

        this.socket = io(SOCKET_URL, {
            path: '/socket/',
            transports: ['websocket'],
            reconnectionAttempts: 5,
        });

        this.socket.on('connect', () => {
            this.emitLocal('velum:connected', { id: this.socket?.id });
        });
        this.socket.on('connect_error', (err) => {
            this.emitLocal('velum:error', { code: 'CONNECT', message: err.message });
        });
        this.socket.on('disconnect', (reason) => {
            this.emitLocal('velum:disconnected', { reason });
        });

        for (const evt of ALL_EVENTS) {
            this.socket.on(evt, (data: any) => this.emitLocal(evt, data));
        }
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // ── Actions (client → server) ──

    createLobby(playerName: string): void {
        this.socket?.emit('velum:createLobby', { playerName });
    }

    joinLobby(roomId: string, playerName: string): void {
        this.socket?.emit('velum:joinLobby', { roomId, playerName });
    }

    toggleReady(roomId: string): void {
        this.socket?.emit('velum:toggleReady', { roomId });
    }

    startGame(roomId: string): void {
        this.socket?.emit('velum:startGame', { roomId });
    }

    leaveLobby(roomId: string): void {
        this.socket?.emit('velum:leaveLobby', { roomId });
    }

    sendChat(roomId: string, text: string): void {
        this.socket?.emit('velum:chat', { roomId, text });
    }

    /** Send a driving-state snapshot (≈15 Hz). */
    sendPlayerState(roomId: string, data: {
        x: number; y: number; z: number; ry: number; speed: number; drifting: boolean;
    }): void {
        this.socket?.emit('velum:playerState', { roomId, ...data });
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
        return this.socket?.id;
    }

    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }
}

export { VelumMultiplayerClient };
