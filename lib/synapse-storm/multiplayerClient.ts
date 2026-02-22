/**
 * Socket.io client for Synapse Storm multiplayer.
 * Manages connection, lobby state, match state, and reconnection.
 */

import { io, Socket } from 'socket.io-client';

export interface SSPlayer {
    id: string;
    userId: string;
    displayName: string;
    isReady: boolean;
    isHost: boolean;
}

export interface SSLeaderboardEntry {
    userId: string;
    displayName: string;
    score: number;
    maxCombo: number;
    puzzlesSolved: number;
    puzzlesMissed: number;
    finished: boolean;
}

export interface SSLobbyState {
    lobbyId: string;
    code: string;
    status: 'WAITING' | 'IN_MATCH' | 'CLOSED';
    players: SSPlayer[];
    hostUserId: string;
}

export interface SSMatchState {
    matchId: string;
    seed: number;
    startAt: number; // unix timestamp ms
    status: 'COUNTDOWN' | 'RUNNING' | 'FINISHED';
    leaderboard: SSLeaderboardEntry[];
    countdownEndsAt?: number;
}

export type SSConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type SSEventHandler = {
    onConnectionChange?: (status: SSConnectionStatus) => void;
    onLobbyUpdate?: (lobby: SSLobbyState) => void;
    onMatchStart?: (match: SSMatchState) => void;
    onMatchCountdown?: (countdownEndsAt: number) => void;
    onLeaderboardUpdate?: (leaderboard: SSLeaderboardEntry[]) => void;
    onMatchFinished?: (leaderboard: SSLeaderboardEntry[]) => void;
    onTimeSync?: (serverTime: number) => void;
    onError?: (message: string) => void;
    onReturnToLobby?: () => void;
};

const SOCKET_URL = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:7001`
    : 'http://localhost:7001';

const STORAGE_KEY_USER_ID = 'ss_mp_userId';
const STORAGE_KEY_DISPLAY_NAME = 'ss_mp_displayName';
const STORAGE_KEY_LOBBY_CODE = 'ss_mp_lobbyCode';

export function getStoredUserId(): string {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem(STORAGE_KEY_USER_ID);
    if (!id) {
        id = 'guest-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem(STORAGE_KEY_USER_ID, id);
    }
    return id;
}

export function getStoredDisplayName(): string {
    if (typeof window === 'undefined') return 'Player';
    return localStorage.getItem(STORAGE_KEY_DISPLAY_NAME) || '';
}

export function setStoredDisplayName(name: string): void {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY_DISPLAY_NAME, name);
}

export function getStoredLobbyCode(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY_LOBBY_CODE);
}

export function setStoredLobbyCode(code: string | null): void {
    if (typeof window === 'undefined') return;
    if (code) localStorage.setItem(STORAGE_KEY_LOBBY_CODE, code);
    else localStorage.removeItem(STORAGE_KEY_LOBBY_CODE);
}

export class SynapseStormMultiplayerClient {
    private socket: Socket | null = null;
    private handlers: SSEventHandler = {};
    private userId: string = '';
    private displayName: string = '';
    private lobbyCode: string | null = null;
    private serverTimeOffset = 0;
    private _connectionStatus: SSConnectionStatus = 'disconnected';

    get connectionStatus(): SSConnectionStatus { return this._connectionStatus; }

    setHandlers(handlers: SSEventHandler): void {
        this.handlers = handlers;
    }

    getServerTime(): number {
        return Date.now() + this.serverTimeOffset;
    }

    connect(userId: string, displayName: string): void {
        if (this.socket?.connected) return;

        this.userId = userId;
        this.displayName = displayName;
        this._connectionStatus = 'connecting';
        this.handlers.onConnectionChange?.('connecting');

        this.socket = io(SOCKET_URL, {
            path: '/socket/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        this.socket.on('connect', () => {
            this._connectionStatus = 'connected';
            this.handlers.onConnectionChange?.('connected');

            // Request time sync
            this.socket?.emit('ss:timeSync', { clientTime: Date.now() });

            // Auto-rejoin lobby if we have one stored
            const storedCode = getStoredLobbyCode();
            if (storedCode && this.lobbyCode === storedCode) {
                this.joinLobby(storedCode);
            }
        });

        this.socket.on('disconnect', () => {
            this._connectionStatus = 'disconnected';
            this.handlers.onConnectionChange?.('disconnected');
        });

        this.socket.on('reconnect_attempt', () => {
            this._connectionStatus = 'reconnecting';
            this.handlers.onConnectionChange?.('reconnecting');
        });

        this.socket.on('reconnect', () => {
            this._connectionStatus = 'connected';
            this.handlers.onConnectionChange?.('connected');
            // Re-join lobby
            if (this.lobbyCode) {
                this.joinLobby(this.lobbyCode);
            }
        });

        // ─── Event listeners ───

        this.socket.on('ss:lobbyUpdate', (data: SSLobbyState) => {
            this.handlers.onLobbyUpdate?.(data);
        });

        this.socket.on('ss:countdown', (data: { countdownEndsAt: number }) => {
            this.handlers.onMatchCountdown?.(data.countdownEndsAt);
        });

        this.socket.on('ss:matchStart', (data: SSMatchState) => {
            this.handlers.onMatchStart?.(data);
        });

        this.socket.on('ss:leaderboardUpdate', (data: { leaderboard: SSLeaderboardEntry[] }) => {
            this.handlers.onLeaderboardUpdate?.(data.leaderboard);
        });

        this.socket.on('ss:matchFinished', (data: { leaderboard: SSLeaderboardEntry[] }) => {
            this.handlers.onMatchFinished?.(data.leaderboard);
        });

        this.socket.on('ss:timeSync', (data: { serverTime: number; clientTime: number }) => {
            const now = Date.now();
            const roundTrip = now - data.clientTime;
            this.serverTimeOffset = data.serverTime - now + roundTrip / 2;
            this.handlers.onTimeSync?.(data.serverTime);
        });

        this.socket.on('ss:error', (data: { message: string }) => {
            this.handlers.onError?.(data.message);
        });

        this.socket.on('ss:returnToLobby', () => {
            this.handlers.onReturnToLobby?.();
        });
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
        this._connectionStatus = 'disconnected';
        this.lobbyCode = null;
        setStoredLobbyCode(null);
    }

    createLobby(): void {
        this.socket?.emit('ss:createLobby', {
            userId: this.userId,
            displayName: this.displayName,
        });
    }

    joinLobby(code: string): void {
        this.lobbyCode = code;
        setStoredLobbyCode(code);
        this.socket?.emit('ss:joinLobby', {
            code,
            userId: this.userId,
            displayName: this.displayName,
        });
    }

    leaveLobby(): void {
        this.socket?.emit('ss:leaveLobby', {
            code: this.lobbyCode,
            userId: this.userId,
        });
        this.lobbyCode = null;
        setStoredLobbyCode(null);
    }

    toggleReady(): void {
        this.socket?.emit('ss:toggleReady', {
            code: this.lobbyCode,
            userId: this.userId,
        });
    }

    startMatch(): void {
        this.socket?.emit('ss:startMatch', {
            code: this.lobbyCode,
            userId: this.userId,
        });
    }

    sendScoreUpdate(data: {
        matchId: string;
        score: number;
        maxCombo: number;
        puzzlesSolved: number;
        puzzlesMissed: number;
    }): void {
        this.socket?.emit('ss:scoreUpdate', {
            ...data,
            userId: this.userId,
            displayName: this.displayName,
        });
    }

    finishMatch(data: {
        matchId: string;
        score: number;
        maxCombo: number;
        puzzlesSolved: number;
        puzzlesMissed: number;
    }): void {
        this.socket?.emit('ss:finishMatch', {
            ...data,
            userId: this.userId,
            displayName: this.displayName,
        });
    }

    returnToLobby(): void {
        this.socket?.emit('ss:returnToLobby', {
            code: this.lobbyCode,
            userId: this.userId,
        });
    }
}

let _clientInstance: SynapseStormMultiplayerClient | null = null;

export function getMultiplayerClient(): SynapseStormMultiplayerClient {
    if (!_clientInstance) {
        _clientInstance = new SynapseStormMultiplayerClient();
    }
    return _clientInstance;
}
