/**
 * Dream Rift socket connection + lobby client.
 *
 * Owns the singleton socket to the port-7001 relay server, mirrors lobby state
 * into the zustand store, and dispatches realtime relay messages to whatever
 * GameSession is currently active. Auth is optional — guests can play
 * multiplayer (the server soft-authenticates).
 */

'use client';

import { io, type Socket } from 'socket.io-client';
import { ensureTrailingSlash } from '@/lib/url';
import { authClient } from '@/lib/auth-client';
import { useDreamRift } from '../store';
import { C2S, S2C, type DrDifficulty, type DrPlayerId, type LobbySnapshot, type PublicLobbyInfo, type RelayMsg, type StartPayload } from './events';

let socket: Socket | null = null;
let relayHandler: ((msg: RelayMsg) => void) | null = null;
let startHandler: ((p: StartPayload) => void) | null = null;

export function setRelayHandler(fn: ((msg: RelayMsg) => void) | null): void {
    relayHandler = fn;
}
export function setStartHandler(fn: ((p: StartPayload) => void) | null): void {
    startHandler = fn;
}

export function getSocket(): Socket | null {
    return socket;
}

export async function connectDreamRift(): Promise<Socket> {
    if (socket?.connected) return socket;
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
    const store = useDreamRift.getState();
    store.setConnection('connecting');

    let token: string | undefined;
    try {
        const session = await authClient.getSession();
        token = session?.data?.session?.token;
    } catch {
        token = undefined;
    }

    const serverUrl = ensureTrailingSlash(import.meta.env.VITE_SOCKET_URL);
    socket = io(serverUrl, {
        path: '/socket/',
        forceNew: true,
        auth: token ? { token } : {},
        reconnection: true,
        reconnectionAttempts: 6,
        reconnectionDelay: 1000,
    });

    const s = socket;
    s.on('connect', () => useDreamRift.getState().setConnection('connected'));
    s.on('disconnect', () => useDreamRift.getState().setConnection('idle'));
    s.on('connect_error', () => {
        useDreamRift.getState().setConnection('error');
        useDreamRift.getState().setError('Could not reach the multiplayer server.');
    });

    s.on(S2C.LOBBY, (lobby: LobbySnapshot) => useDreamRift.getState().setLobby(lobby));
    s.on(S2C.BROWSE_RESULT, (data: { lobbies: PublicLobbyInfo[] }) => useDreamRift.getState().setBrowse(data.lobbies ?? []));
    s.on(S2C.JOINED, (data: { code: string; yourSlot: number; selfId: string }) => {
        useDreamRift.getState().setSelf(data.selfId);
        useDreamRift.getState().setScreen('lobby');
        useDreamRift.getState().setError(null);
    });
    s.on(S2C.ERROR, (data: { message: string }) => useDreamRift.getState().setError(data?.message ?? 'Error'));
    s.on(S2C.KICKED, () => {
        useDreamRift.getState().setLobby(null);
        useDreamRift.getState().setScreen('lobby-browser');
        useDreamRift.getState().setError('You were removed from the lobby.');
    });
    s.on(S2C.HOST_CHANGED, (lobby: LobbySnapshot) => useDreamRift.getState().setLobby(lobby));
    s.on(S2C.PEER_LEFT, () => {});
    s.on(S2C.START, (p: StartPayload) => startHandler?.(p));
    s.on(S2C.RELAY, (msg: RelayMsg) => relayHandler?.(msg));

    return s;
}

export function disconnectDreamRift(): void {
    if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
    }
    relayHandler = null;
    startHandler = null;
}

// ── lobby actions ──

export function createLobby(opts: { name?: string; isPublic: boolean; difficulty: DrDifficulty }): void {
    socket?.emit(C2S.CREATE, opts);
}
export function joinLobby(code: string): void {
    socket?.emit(C2S.JOIN, { code: code.toUpperCase() });
}
export function quickplay(): void {
    socket?.emit(C2S.QUICKPLAY, {});
}
export function browseLobbies(): void {
    socket?.emit(C2S.BROWSE, {});
}
export function leaveLobby(): void {
    socket?.emit(C2S.LEAVE, {});
    useDreamRift.getState().setLobby(null);
}
export function setLobbyChar(charId: DrPlayerId): void {
    socket?.emit(C2S.SET_CHAR, { charId });
}
export function setLobbyReady(ready: boolean): void {
    socket?.emit(C2S.READY, { ready });
}
export function setLobbySettings(difficulty: DrDifficulty): void {
    socket?.emit(C2S.SET_SETTINGS, { difficulty });
}
export function startLobby(): void {
    socket?.emit(C2S.START, {});
}
export function kickPlayer(slot: number): void {
    socket?.emit(C2S.KICK, { slot });
}
export function sendRelay(msg: RelayMsg): void {
    socket?.emit(C2S.RELAY, msg);
}
