/**
 * Socket.io client for Synapse Storm multiplayer.
 * Manages connection, lobby state, match state, and reconnection.
 */

import type { Socket } from 'socket.io-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { authClient } from '@/lib/auth-client';

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

/** The shared client's six states, folded onto the four this game's UI knows. */
function toConnectionStatus(status: RealtimeStatus): SSConnectionStatus {
    if (status === 'connecting' || status === 'connected' || status === 'reconnecting') return status;
    return 'disconnected';
}

const STORAGE_KEY_USER_ID = 'ss_mp_userId';
const STORAGE_KEY_DISPLAY_NAME = 'ss_mp_displayName';
const STORAGE_KEY_LOBBY_CODE = 'ss_mp_lobbyCode';

/** Storage can throw (Safari private mode, blocked site data); never let it break multiplayer. */
function readStore(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStore(key: string, value: string | null): void {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        /* convenience only */
    }
}

let memoryUserId = '';

export function getStoredUserId(): string {
    if (typeof window === 'undefined') return '';
    let id = readStore(STORAGE_KEY_USER_ID) || memoryUserId;
    if (!id) {
        id = 'guest-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        writeStore(STORAGE_KEY_USER_ID, id);
    }
    memoryUserId = id;
    return id;
}

export function getStoredDisplayName(): string {
    if (typeof window === 'undefined') return 'Player';
    return readStore(STORAGE_KEY_DISPLAY_NAME) || '';
}

export function setStoredDisplayName(name: string): void {
    if (typeof window !== 'undefined') writeStore(STORAGE_KEY_DISPLAY_NAME, name);
}

export function getStoredLobbyCode(): string | null {
    if (typeof window === 'undefined') return null;
    return readStore(STORAGE_KEY_LOBBY_CODE);
}

export function setStoredLobbyCode(code: string | null): void {
    if (typeof window === 'undefined') return;
    writeStore(STORAGE_KEY_LOBBY_CODE, code || null);
}

export class SynapseStormMultiplayerClient {
    private client: RealtimeClient | null = null;
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
        this.userId = userId;
        this.displayName = displayName;
        if (this.client) {
            this.client.reconnectNow();
            return;
        }

        // The session token is what the hub's soft auth seats a signed-in player by;
        // without it every player was a guest and no match was recorded to an account.
        // Signed out (or a failed session read) still connects, as a guest.
        this.client = createRealtimeClient({
            name: 'SynapseStorm',
            url: import.meta.env.VITE_SOCKET_URL,
            path: '/socket/',
            auth: async () => {
                const session = await authClient.getSession().catch(() => null);
                const token = session?.data?.session?.token;
                return token ? { token } : {};
            },
            onStatus: (status) => {
                this._connectionStatus = toConnectionStatus(status);
                this.handlers.onConnectionChange?.(this._connectionStatus);
            },
            onConnect: (socket) => {
                // Request time sync
                socket.emit('ss:timeSync', { clientTime: Date.now() });

                // The server keyed the seat by socket id and that id just changed: re-join the lobby.
                if (this.lobbyCode) this.joinLobby(this.lobbyCode);
            },
            bind: (socket) => this.bindEvents(socket),
        });
    }

    private bindEvents(socket: Socket): void {
        // ─── Event listeners ───

        socket.on('ss:lobbyUpdate', (data: SSLobbyState) => {
            if (data.code && !this.lobbyCode) {
                this.lobbyCode = data.code;
                setStoredLobbyCode(data.code);
            }
            this.handlers.onLobbyUpdate?.(data);
        });

        socket.on('ss:countdown', (data: { countdownEndsAt: number }) => {
            this.handlers.onMatchCountdown?.(data.countdownEndsAt);
        });

        socket.on('ss:matchStart', (data: SSMatchState) => {
            this.handlers.onMatchStart?.(data);
        });

        socket.on('ss:leaderboardUpdate', (data: { leaderboard: SSLeaderboardEntry[] }) => {
            this.handlers.onLeaderboardUpdate?.(data.leaderboard);
        });

        socket.on('ss:matchFinished', (data: { leaderboard: SSLeaderboardEntry[] }) => {
            this.handlers.onMatchFinished?.(data.leaderboard);
        });

        socket.on('ss:timeSync', (data: { serverTime: number; clientTime: number }) => {
            const now = Date.now();
            const roundTrip = now - data.clientTime;
            this.serverTimeOffset = data.serverTime - now + roundTrip / 2;
            this.handlers.onTimeSync?.(data.serverTime);
        });

        socket.on('ss:error', (data: { message: string }) => {
            this.handlers.onError?.(data.message);
        });

        socket.on('ss:returnToLobby', () => {
            this.handlers.onReturnToLobby?.();
        });
    }

    disconnect(): void {
        this.client?.destroy();
        this.client = null;
        this._connectionStatus = 'disconnected';
        this.lobbyCode = null;
        setStoredLobbyCode(null);
    }

    createLobby(): void {
        this.client?.emit('ss:createLobby', {
            userId: this.userId,
            displayName: this.displayName,
        }, { queue: true });
    }

    joinLobby(code: string): void {
        this.lobbyCode = code;
        setStoredLobbyCode(code);
        this.client?.emit('ss:joinLobby', {
            code,
            userId: this.userId,
            displayName: this.displayName,
        }, { queue: true });
    }

    leaveLobby(): void {
        this.client?.emit('ss:leaveLobby', {
            code: this.lobbyCode,
            userId: this.userId,
        }, { queue: true });
        this.lobbyCode = null;
        setStoredLobbyCode(null);
    }

    toggleReady(): void {
        this.client?.emit('ss:toggleReady', {
            code: this.lobbyCode,
            userId: this.userId,
        }, { queue: true });
    }

    startMatch(): void {
        this.client?.emit('ss:startMatch', {
            code: this.lobbyCode,
            userId: this.userId,
        }, { queue: true });
    }

    sendScoreUpdate(data: {
        matchId: string;
        score: number;
        maxCombo: number;
        puzzlesSolved: number;
        puzzlesMissed: number;
    }): void {
        this.client?.emit('ss:scoreUpdate', {
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
        this.client?.emit('ss:finishMatch', {
            ...data,
            userId: this.userId,
            displayName: this.displayName,
        }, { queue: true });
    }

    returnToLobby(): void {
        this.client?.emit('ss:returnToLobby', {
            code: this.lobbyCode,
            userId: this.userId,
        }, { queue: true });
    }
}

let _clientInstance: SynapseStormMultiplayerClient | null = null;

export function getMultiplayerClient(): SynapseStormMultiplayerClient {
    if (!_clientInstance) {
        _clientInstance = new SynapseStormMultiplayerClient();
    }
    return _clientInstance;
}
