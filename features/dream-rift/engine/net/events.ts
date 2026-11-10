/**
 * Dream Rift netcode protocol — shared by the browser client and the socket
 * relay handler (features/dream-rift/server/handlers.ts).
 *
 * The server is a thin lobby manager + message relay; it does not simulate the
 * game. Authority lives on the host client. This file is intentionally free of
 * any browser/canvas imports so it can be bundled into the Node server.
 */

export type DrPlayerId = 'bllm' | 'mls' | 'qln' | 'dyj' | 'lmy';
export type DrDifficulty = 'easy' | 'normal' | 'hard' | 'lunatic';
export type DrLobbyState = 'waiting' | 'playing';

// ── Client → Server ──
export const C2S = {
    CREATE: 'dr:create',
    JOIN: 'dr:join',
    QUICKPLAY: 'dr:quickplay',
    BROWSE: 'dr:browse',
    LEAVE: 'dr:leave',
    SET_CHAR: 'dr:setChar',
    READY: 'dr:ready',
    SET_SETTINGS: 'dr:setSettings',
    START: 'dr:start',
    KICK: 'dr:kick',
    /** Reclaim a seat after a dropped connection: `{ code, token }` (token from JOINED). */
    RESUME: 'dr:resume',
    /** Realtime in-game payload to relay to everyone else in the room. */
    RELAY: 'dr:relay',
} as const;

// ── Server → Client ──
export const S2C = {
    LOBBY: 'dr:lobby',
    BROWSE_RESULT: 'dr:browseResult',
    JOINED: 'dr:joined',
    ERROR: 'dr:error',
    START: 'dr:start',
    PEER_LEFT: 'dr:peerLeft',
    KICKED: 'dr:kicked',
    /** A relayed realtime payload from a peer. */
    RELAY: 'dr:relay',
    HOST_CHANGED: 'dr:hostChanged',
    /** Answer to a successful RESUME: the seat is yours again, on this new socket. */
    RESUMED: 'dr:resumed',
    /** A seated player's connection dropped (connected:false) or came back (true). */
    PEER_STATUS: 'dr:peerStatus',
} as const;

/** Payload of S2C.JOINED / S2C.RESUMED. `resumeToken` is private to this client, never broadcast. */
export interface JoinedPayload {
    code: string;
    yourSlot: number;
    selfId: string;
    resumeToken: string;
}

export interface LobbyPlayerInfo {
    socketId: string;
    userId: string;
    name: string;
    avatarUrl: string | null;
    slot: number;
    charId: DrPlayerId;
    ready: boolean;
    isHost: boolean;
}

export interface LobbySnapshot {
    code: string;
    hostSocketId: string;
    isPublic: boolean;
    difficulty: DrDifficulty;
    state: DrLobbyState;
    players: LobbyPlayerInfo[];
    maxPlayers: number;
}

export interface PublicLobbyInfo {
    code: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    difficulty: DrDifficulty;
    state: DrLobbyState;
}

export interface StartPayload {
    seed: number;
    difficulty: DrDifficulty;
    stageIndex: number;
    roster: { slot: number; userId: string; name: string; charId: DrPlayerId; isHost: boolean }[];
    yourSlot: number;
}

// ── Realtime relay payloads (carried inside C2S.RELAY / S2C.RELAY) ──

export type RelayKind =
    | 'p' // per-player ship state
    | 'death'
    | 'bomb'
    | 'dmg' // boss damage dealt (client → host)
    | 'world' // host → all: authoritative world snapshot
    | 'cmd' // host → all: discrete command (boss card, stage clear, etc.)
    | 'advance' // request host to advance dialogue
    | 'comment'; // host → all: a scrolling danmaku comment

export interface RelayMsg {
    k: RelayKind;
    slot?: number;
    /** Arbitrary compact payload — shape depends on `k`. */
    d?: Record<string, number | string | boolean | null>;
}

export const ROOM_PREFIX = 'dr:room:';
export const MAX_LOBBY_PLAYERS = 4;
