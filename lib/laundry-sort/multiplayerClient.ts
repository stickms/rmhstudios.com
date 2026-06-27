/**
 * Socket.io client for Laundry Sort multiplayer.
 *
 * Mirrors the battle-tested Synapse Storm client: N-player lobbies by code,
 * seeded synced rounds (everyone sorts the *same* clothing stream), a live
 * leaderboard during the round, a final results broadcast when the timer ends,
 * server time-sync, and auto-reconnect / rejoin.
 */

import { io, Socket } from 'socket.io-client';
import { ensureTrailingSlash } from '@/lib/url';

export interface LSPlayer {
  id: string;
  userId: string;
  displayName: string;
  isReady: boolean;
  isHost: boolean;
}

export interface LSLeaderboardEntry {
  userId: string;
  displayName: string;
  score: number;
  bestStreak: number;
  sorted: number;
  missed: number;
  accuracy: number;
  finished: boolean;
}

export interface LSLobbyState {
  lobbyId: string;
  code: string;
  status: 'WAITING' | 'IN_MATCH' | 'CLOSED';
  players: LSPlayer[];
  hostUserId: string;
  durationSec: number;
}

export interface LSMatchState {
  matchId: string;
  seed: number;
  startAt: number; // unix ms (server clock)
  durationSec: number;
  status: 'RUNNING';
  leaderboard: LSLeaderboardEntry[];
}

export type LSConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface LSEventHandlers {
  onConnectionChange?: (s: LSConnectionStatus) => void;
  onLobbyUpdate?: (l: LSLobbyState) => void;
  onCountdown?: (countdownEndsAt: number) => void;
  onMatchStart?: (m: LSMatchState) => void;
  onLeaderboardUpdate?: (lb: LSLeaderboardEntry[]) => void;
  onMatchFinished?: (lb: LSLeaderboardEntry[]) => void;
  onTimeSync?: (serverTime: number) => void;
  onReturnToLobby?: () => void;
  onError?: (message: string) => void;
}

const SOCKET_URL = ensureTrailingSlash(import.meta.env.VITE_SOCKET_URL || 'http://localhost:7001');

const K_USER = 'ls_mp_userId';
const K_NAME = 'ls_mp_displayName';
const K_CODE = 'ls_mp_lobbyCode';

export function getStoredUserId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(K_USER);
  if (!id) {
    id = 'guest-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(K_USER, id);
  }
  return id;
}
export function getStoredDisplayName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(K_NAME) || '';
}
export function setStoredDisplayName(name: string): void {
  if (typeof window !== 'undefined') localStorage.setItem(K_NAME, name);
}
function setStoredCode(code: string | null): void {
  if (typeof window === 'undefined') return;
  if (code) localStorage.setItem(K_CODE, code);
  else localStorage.removeItem(K_CODE);
}
export function getStoredCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(K_CODE);
}

export class LaundryMultiplayerClient {
  private socket: Socket | null = null;
  private handlers: LSEventHandlers = {};
  private userId = '';
  private displayName = '';
  private lobbyCode: string | null = null;
  private serverTimeOffset = 0;
  private status: LSConnectionStatus = 'disconnected';

  get connectionStatus(): LSConnectionStatus {
    return this.status;
  }
  getServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }
  setHandlers(h: LSEventHandlers): void {
    this.handlers = h;
  }

  connect(userId: string, displayName: string): void {
    if (this.socket?.connected) return;
    this.userId = userId;
    this.displayName = displayName;
    this.status = 'connecting';
    this.handlers.onConnectionChange?.('connecting');

    const token = typeof window !== 'undefined' ? (window as any).__LS_SESSION_TOKEN__ : undefined;
    this.socket = io(SOCKET_URL, {
      path: '/socket/',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: token ? { token } : undefined,
    });

    this.socket.on('connect', () => {
      this.status = 'connected';
      this.handlers.onConnectionChange?.('connected');
      this.socket?.emit('ls:timeSync', { clientTime: Date.now() });
      if (this.lobbyCode) this.joinLobby(this.lobbyCode);
    });
    this.socket.on('disconnect', () => {
      this.status = 'disconnected';
      this.handlers.onConnectionChange?.('disconnected');
    });
    this.socket.on('reconnect_attempt', () => {
      this.status = 'reconnecting';
      this.handlers.onConnectionChange?.('reconnecting');
    });

    this.socket.on('ls:lobbyUpdate', (d: LSLobbyState) => {
      if (d.code && !this.lobbyCode) {
        this.lobbyCode = d.code;
        setStoredCode(d.code);
      }
      this.handlers.onLobbyUpdate?.(d);
    });
    this.socket.on('ls:countdown', (d: { countdownEndsAt: number }) => this.handlers.onCountdown?.(d.countdownEndsAt));
    this.socket.on('ls:matchStart', (d: LSMatchState) => this.handlers.onMatchStart?.(d));
    this.socket.on('ls:leaderboardUpdate', (d: { leaderboard: LSLeaderboardEntry[] }) =>
      this.handlers.onLeaderboardUpdate?.(d.leaderboard),
    );
    this.socket.on('ls:matchFinished', (d: { leaderboard: LSLeaderboardEntry[] }) =>
      this.handlers.onMatchFinished?.(d.leaderboard),
    );
    this.socket.on('ls:timeSync', (d: { serverTime: number; clientTime: number }) => {
      const now = Date.now();
      const rtt = now - d.clientTime;
      this.serverTimeOffset = d.serverTime - now + rtt / 2;
      this.handlers.onTimeSync?.(d.serverTime);
    });
    this.socket.on('ls:returnToLobby', () => this.handlers.onReturnToLobby?.());
    this.socket.on('ls:error', (d: { message: string }) => this.handlers.onError?.(d.message));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.status = 'disconnected';
    this.lobbyCode = null;
    setStoredCode(null);
  }

  createLobby(): void {
    this.socket?.emit('ls:createLobby', { userId: this.userId, displayName: this.displayName });
  }
  joinLobby(code: string): void {
    this.lobbyCode = code.toUpperCase();
    setStoredCode(this.lobbyCode);
    this.socket?.emit('ls:joinLobby', { code: this.lobbyCode, userId: this.userId, displayName: this.displayName });
  }
  leaveLobby(): void {
    this.socket?.emit('ls:leaveLobby', { code: this.lobbyCode, userId: this.userId });
    this.lobbyCode = null;
    setStoredCode(null);
  }
  toggleReady(): void {
    this.socket?.emit('ls:toggleReady', { code: this.lobbyCode, userId: this.userId });
  }
  setDuration(durationSec: number): void {
    this.socket?.emit('ls:setDuration', { code: this.lobbyCode, userId: this.userId, durationSec });
  }
  startMatch(): void {
    this.socket?.emit('ls:startMatch', { code: this.lobbyCode, userId: this.userId });
  }
  sendScore(d: { matchId: string; score: number; bestStreak: number; sorted: number; missed: number; accuracy: number }): void {
    this.socket?.emit('ls:scoreUpdate', { ...d, userId: this.userId, displayName: this.displayName });
  }
  finishMatch(d: { matchId: string; score: number; bestStreak: number; sorted: number; missed: number; accuracy: number }): void {
    this.socket?.emit('ls:finishMatch', { ...d, userId: this.userId, displayName: this.displayName });
  }
  returnToLobby(): void {
    this.socket?.emit('ls:returnToLobby', { code: this.lobbyCode, userId: this.userId });
  }
}

let _instance: LaundryMultiplayerClient | null = null;
export function getLaundryMultiplayerClient(): LaundryMultiplayerClient {
  if (!_instance) _instance = new LaundryMultiplayerClient();
  return _instance;
}
