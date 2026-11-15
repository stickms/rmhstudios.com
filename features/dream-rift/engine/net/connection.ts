/**
 * Dream Rift socket connection + lobby client.
 *
 * Owns the singleton socket to the port-7001 relay server, mirrors lobby state
 * into the zustand store, and dispatches realtime relay messages to whatever
 * GameSession is currently active. Auth is optional — guests can play
 * multiplayer (the server soft-authenticates).
 */

import { singleFlight } from '@/lib/shared/realtime/single-flight';
import type { Socket } from 'socket.io-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { authClient } from '@/lib/auth-client';
import { useDreamRift, type ConnectionState } from '../store';
import { C2S, S2C, type DrDifficulty, type JoinedPayload, type DrPlayerId, type LobbySnapshot, type PublicLobbyInfo, type RelayMsg, type StartPayload } from './events';

let client: RealtimeClient | null = null;
let relayHandler: ((msg: RelayMsg) => void) | null = null;
let startHandler: ((p: StartPayload) => void) | null = null;
let peerLeftHandler: ((slot: number) => void) | null = null;
let resumedHandler: (() => void) | null = null;
let resumeFailedHandler: (() => void) | null = null;
/** True from the moment we ask for our seat back until the hub answers. */
let resumePending = false;
/** Seat credentials from the last JOINED/RESUMED: presenting them on a reconnect reclaims the seat. */
let resumeCreds: { code: string; token: string } | null = null;

export function setRelayHandler(fn: ((msg: RelayMsg) => void) | null): void {
    relayHandler = fn;
}
/** Notified with the slot of any player who leaves the lobby (used by guests to notice a vanished host). */
export function setPeerLeftHandler(fn: ((slot: number) => void) | null): void {
    peerLeftHandler = fn;
}
/** In-run reconnect: `onResumed` when the hub hands the seat back, `onFailed` when it can't (the grace window ran out, or the lobby closed). */
export function setResumeHandlers(onResumed: (() => void) | null, onFailed: (() => void) | null): void {
    resumedHandler = onResumed;
    resumeFailedHandler = onFailed;
}
export function setStartHandler(fn: ((p: StartPayload) => void) | null): void {
    startHandler = fn;
}

export function getSocket(): Socket | null {
    return client?.socket ?? null;
}

/** The shared client's six states, folded onto the four the Dream Rift store knows. */
function toConnectionState(status: RealtimeStatus): ConnectionState {
    if (status === 'connected' || status === 'error') return status;
    // A dropped transport that is being retried is `connecting` again, not idle.
    return status === 'connecting' || status === 'reconnecting' ? 'connecting' : 'idle';
}

/** Lobby intents are queued across a blip; positional relay traffic is not (see `sendRelay`). */
function emit(event: string, data: unknown, queue = true): void {
    client?.emit(event, data, { queue });
}

async function connectDreamRiftInner(): Promise<Socket> {
    if (client) {
        // An existing client re-joins on connect; a second call only nudges a stalled one.
        client.reconnectNow();
        return client.socket;
    }

    client = createRealtimeClient({
        name: 'DreamRift',
        url: import.meta.env.VITE_SOCKET_URL,
        path: '/socket/',
        // Guests can play multiplayer (the hub soft-authenticates), so a missing
        // or unreadable session is an anonymous handshake, not a failure.
        auth: async () => {
            try {
                const session = await authClient.getSession();
                const token = session?.data?.session?.token;
                return token ? { token } : {};
            } catch {
                return {};
            }
        },
        onStatus: (status) => useDreamRift.getState().setConnection(toConnectionState(status)),
        onConnect: (socket) => {
            // A transport that dropped and came back is a NEW socket id: ask the server
            // to rebind our held seat to it (it keeps the seat for the shared grace window).
            if (resumeCreds) {
                resumePending = true;
                socket.emit(C2S.RESUME, resumeCreds);
            }
        },
        bind: bindHandlers,
    });

    return client.socket;
}

function bindHandlers(s: Socket): void {
    s.on('connect_error', () => {
        useDreamRift.getState().setError('Could not reach the multiplayer server.');
    });

    s.on(S2C.LOBBY, (lobby: LobbySnapshot) => useDreamRift.getState().setLobby(lobby));
    s.on(S2C.BROWSE_RESULT, (data: { lobbies: PublicLobbyInfo[] }) => useDreamRift.getState().setBrowse(data.lobbies ?? []));
    s.on(S2C.JOINED, (data: JoinedPayload) => {
        resumeCreds = data.resumeToken ? { code: data.code, token: data.resumeToken } : null;
        useDreamRift.getState().setSelf(data.selfId);
        useDreamRift.getState().setScreen('lobby');
        useDreamRift.getState().setError(null);
    });
    s.on(S2C.RESUMED, (data: JoinedPayload) => {
        // Same seat, new socket: only our own id changes (the lobby broadcast follows).
        useDreamRift.getState().setSelf(data.selfId);
        useDreamRift.getState().setError(null);
        resumePending = false;
        resumedHandler?.();
    });
    s.on(S2C.ERROR, (data: { message: string }) => {
        if (resumePending) {
            // The only error a RESUME can produce: the seat is gone.
            resumePending = false;
            resumeCreds = null;
            resumeFailedHandler?.();
        }
        useDreamRift.getState().setError(data?.message ?? 'Error');
    });
    s.on(S2C.KICKED, () => {
        resumeCreds = null;
        useDreamRift.getState().setLobby(null);
        useDreamRift.getState().setScreen('lobby-browser');
        useDreamRift.getState().setError('You were removed from the lobby.');
    });
    s.on(S2C.HOST_CHANGED, (lobby: LobbySnapshot) => useDreamRift.getState().setLobby(lobby));
    s.on(S2C.PEER_LEFT, (data: { slot?: number }) => {
        if (typeof data?.slot === 'number') peerLeftHandler?.(data.slot);
    });
    s.on(S2C.START, (p: StartPayload) => startHandler?.(p));
    s.on(S2C.RELAY, (msg: RelayMsg) => relayHandler?.(msg));
}

export function disconnectDreamRift(): void {
    client?.destroy();
    client = null;
    relayHandler = null;
    startHandler = null;
    peerLeftHandler = null;
    resumeCreds = null;
    resumePending = false;
    resumedHandler = null;
    resumeFailedHandler = null;
}

// ── lobby actions ──

export function createLobby(opts: { name?: string; isPublic: boolean; difficulty: DrDifficulty }): void {
    emit(C2S.CREATE, opts);
}
export function joinLobby(code: string): void {
    emit(C2S.JOIN, { code: code.toUpperCase() });
}
export function quickplay(): void {
    emit(C2S.QUICKPLAY, {});
}
export function browseLobbies(): void {
    emit(C2S.BROWSE, {});
}
export function leaveLobby(): void {
    resumeCreds = null;
    emit(C2S.LEAVE, {});
    useDreamRift.getState().setLobby(null);
}
export function setLobbyChar(charId: DrPlayerId): void {
    emit(C2S.SET_CHAR, { charId });
}
export function setLobbyReady(ready: boolean): void {
    emit(C2S.READY, { ready });
}
export function setLobbySettings(difficulty: DrDifficulty): void {
    emit(C2S.SET_SETTINGS, { difficulty });
}
export function startLobby(): void {
    emit(C2S.START, {});
}
export function kickPlayer(slot: number): void {
    emit(C2S.KICK, { slot });
}
export function sendRelay(msg: RelayMsg): void {
    emit(C2S.RELAY, msg, false);
}

/** Concurrent callers share one in-flight connect (see single-flight.ts). */
export const connectDreamRift = singleFlight(connectDreamRiftInner);
