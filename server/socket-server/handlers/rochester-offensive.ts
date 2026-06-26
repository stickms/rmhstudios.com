/**
 * Rochester Offensive — Handler for the unified socket server.
 *
 * Public auto-matchmaking rooms for a multiplayer 3D FPS. The server is a
 * pure ROOM MANAGER + DUMB RELAY: it tracks lobby membership, team
 * balancing, host election and match state, but it does NOT simulate the
 * game. In-match payloads (player state, hits, fx, …) are opaque blobs the
 * server routes between sockets without inspecting their contents.
 *
 * Modes: 'standard' (attackers vs defenders, max 5 each / 10 total) and
 * 'zombies' (everyone forced to 'attackers' survivors, max 5 total).
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode } from '../utils';

// ── Event Constants ────────────────────────────────────────────────
const C2S = {
    JOIN: 'ro:join',
    SELECT_TEAM: 'ro:selectTeam',
    SELECT_AGENT: 'ro:selectAgent',
    READY: 'ro:ready',
    SET_MODE: 'ro:setMode',
    START: 'ro:start',
    RETURN_LOBBY: 'ro:returnLobby',
    LEAVE: 'ro:leave',
    // Match relay (opaque payloads)
    PLAYER: 'ro:player',
    MATCH: 'ro:match',
    HIT: 'ro:hit',
    DEATH: 'ro:death',
    BHIT: 'ro:bhit',
    FX: 'ro:fx',
    SPIKE: 'ro:spike',
} as const;

const S2C = {
    LOBBY: 'ro:lobby',
    START: 'ro:start',
    PLAYER: 'ro:player',
    MATCH: 'ro:match',
    HIT: 'ro:hit',
    DEATH: 'ro:death',
    BHIT: 'ro:bhit',
    FX: 'ro:fx',
    SPIKE: 'ro:spike',
    PLAYER_LEFT: 'ro:playerLeft',
    ERROR: 'ro:error',
    RETURN_LOBBY: 'ro:returnLobby',
} as const;

const MAX_PER_TEAM = 5;      // standard: 5 attackers + 5 defenders
const MAX_ZOMBIES = 5;       // zombies: 5 survivors total
const MAX_NAME_LEN = 40;
const MAX_AGENT_LEN = 40;
const DEFAULT_NAME = 'Player';

type Mode = 'standard' | 'zombies';
type State = 'lobby' | 'playing';
type Team = 'attackers' | 'defenders';

interface ROPlayer {
    id: string;       // socketId
    name: string;
    agentId: string;
    team: Team;
    ready: boolean;
    isHost: boolean;
}

interface RORoom {
    id: string;       // room code
    mode: Mode;
    state: State;
    hostId: string;
    players: Map<string, ROPlayer>; // insertion order === join order
}

const rooms = new Map<string, RORoom>();
const socketToRoom = new Map<string, string>();
let ioRef: Server;

// ── Helpers ────────────────────────────────────────────────────────
function generateUniqueCode(): string {
    for (let i = 0; i < 20; i++) {
        const code = generateRoomCode();
        if (!rooms.has(code)) return code;
    }
    throw new Error('Failed to generate unique room code');
}

function sanitizeName(raw: unknown): string {
    if (typeof raw !== 'string') return DEFAULT_NAME;
    const cleaned = raw.trim().slice(0, MAX_NAME_LEN);
    return cleaned || DEFAULT_NAME;
}

function sanitizeAgent(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return raw.trim().slice(0, MAX_AGENT_LEN);
}

function countTeam(room: RORoom, team: Team): number {
    let n = 0;
    for (const p of room.players.values()) if (p.team === team) n++;
    return n;
}

/** Whether `team` has room for one more player in the room's current mode. */
function hasCapacityFor(room: RORoom, team: Team): boolean {
    if (room.mode === 'zombies') {
        return room.players.size < MAX_ZOMBIES; // all players are attackers
    }
    return countTeam(room, team) < MAX_PER_TEAM;
}

/** Whether a brand-new player can be placed anywhere in the room. */
function hasFreeCapacity(room: RORoom): boolean {
    if (room.mode === 'zombies') return room.players.size < MAX_ZOMBIES;
    return countTeam(room, 'attackers') < MAX_PER_TEAM || countTeam(room, 'defenders') < MAX_PER_TEAM;
}

/** Pick the lighter side; attackers win ties. (standard mode only) */
function balancedTeam(room: RORoom): Team {
    const a = countTeam(room, 'attackers');
    const d = countTeam(room, 'defenders');
    if (d < a) return 'defenders';
    return 'attackers';
}

/** Players in deterministic order (host first, then join order). */
function orderedPlayers(room: RORoom): ROPlayer[] {
    const list = [...room.players.values()];
    list.sort((x, y) => {
        if (x.isHost !== y.isHost) return x.isHost ? -1 : 1;
        return 0; // Array#sort is stable → preserves insertion (join) order
    });
    return list;
}

function lobbyPayload(room: RORoom) {
    return {
        room: {
            id: room.id,
            mode: room.mode,
            state: room.state,
            hostId: room.hostId,
            players: orderedPlayers(room).map((p) => ({
                id: p.id,
                name: p.name,
                agentId: p.agentId,
                team: p.team,
                ready: p.ready,
                isHost: p.isHost,
            })),
        },
    };
}

function emitLobby(room: RORoom): void {
    const payload = lobbyPayload(room);
    for (const id of room.players.keys()) {
        ioRef.sockets.sockets.get(id)?.emit(S2C.LOBBY, payload);
    }
}

function getRoomOf(socketId: string): RORoom | undefined {
    const code = socketToRoom.get(socketId);
    if (!code) return undefined;
    return rooms.get(code);
}

/** First player in join order other than `exceptId` (deterministic). */
function firstPlayer(room: RORoom, exceptId?: string): ROPlayer | undefined {
    for (const p of room.players.values()) {
        if (p.id !== exceptId) return p;
    }
    return undefined;
}

/**
 * Remove a socket from its room and run host-handover / teardown.
 * Used by both `ro:leave` and disconnect cleanup.
 */
function cleanupSocket(socketId: string): void {
    const code = socketToRoom.get(socketId);
    socketToRoom.delete(socketId);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    const leaver = room.players.get(socketId);
    if (!leaver) return;

    const wasHost = leaver.isHost || room.hostId === socketId;
    room.players.delete(socketId);

    // Empty room → discard.
    if (room.players.size === 0) {
        rooms.delete(code);
        return;
    }

    // Tell survivors who left.
    const left = { id: socketId };
    for (const id of room.players.keys()) {
        ioRef.sockets.sockets.get(id)?.emit(S2C.PLAYER_LEFT, left);
    }

    if (wasHost) {
        const wasPlaying = room.state === 'playing';
        const next = firstPlayer(room);
        if (next) {
            next.isHost = true;
            room.hostId = next.id;
        }
        if (wasPlaying) {
            // Guests bail back to the lobby when the host abandons a match.
            room.state = 'lobby';
            for (const p of room.players.values()) p.ready = false;
            for (const id of room.players.keys()) {
                ioRef.sockets.sockets.get(id)?.emit(S2C.ERROR, { message: 'Host left' });
            }
        }
    }

    emitLobby(room);
}

// ── Event Handlers ─────────────────────────────────────────────────
function onJoin(socket: Socket, payload: any): void {
    // A socket only belongs to one room at a time.
    cleanupSocket(socket.id);

    const name = sanitizeName(payload?.name);
    const agentId = sanitizeAgent(payload?.agentId);

    // Find the first joinable public lobby.
    let room: RORoom | undefined;
    for (const r of rooms.values()) {
        if (r.state === 'lobby' && hasFreeCapacity(r)) { room = r; break; }
    }

    if (!room) {
        // Create a new standard lobby; caller becomes host.
        room = {
            id: generateUniqueCode(),
            mode: 'standard',
            state: 'lobby',
            hostId: socket.id,
            players: new Map(),
        };
        rooms.set(room.id, room);
    }

    const isHost = room.players.size === 0;
    if (isHost) room.hostId = socket.id;

    const team: Team = room.mode === 'zombies' ? 'attackers' : balancedTeam(room);

    const player: ROPlayer = {
        id: socket.id,
        name,
        agentId,
        team,
        ready: false,
        isHost,
    };
    room.players.set(socket.id, player);
    socketToRoom.set(socket.id, room.id);

    emitLobby(room);
}

function onSelectTeam(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (room.mode !== 'standard') return; // teams locked in zombies
    const player = room.players.get(socket.id);
    if (!player) return;

    const team = payload?.team;
    if (team !== 'attackers' && team !== 'defenders') return;
    if (team === player.team) { emitLobby(room); return; }
    if (!hasCapacityFor(room, team)) return; // side full → ignore

    player.team = team;
    emitLobby(room);
}

function onSelectAgent(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    const agentId = sanitizeAgent(payload?.agentId);
    if (!agentId) return;
    player.agentId = agentId;
    emitLobby(room);
}

function onReady(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    player.ready = payload?.ready === true;
    emitLobby(room);
}

function onSetMode(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return; // host only
    if (room.state !== 'lobby') return;

    const mode = payload?.mode;
    if (mode !== 'standard' && mode !== 'zombies') return;
    if (mode === room.mode) { emitLobby(room); return; }

    room.mode = mode;
    if (mode === 'zombies') {
        // Force everyone onto the survivor (attackers) side. Don't kick the
        // overflow — they simply can't start a >5 lobby.
        for (const p of room.players.values()) p.team = 'attackers';
        if (room.players.size > MAX_ZOMBIES) {
            let i = 0;
            for (const p of room.players.values()) {
                if (i >= MAX_ZOMBIES) {
                    ioRef.sockets.sockets.get(p.id)?.emit(S2C.ERROR, {
                        message: 'Lobby exceeds zombies capacity (5); you cannot start.',
                    });
                }
                i++;
            }
        }
    }
    emitLobby(room);
}

function onStart(socket: Socket): void {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return; // host only
    if (room.state !== 'lobby') return;
    if (room.players.size < 1) return;

    room.state = 'playing';
    const players = orderedPlayers(room).map((p) => ({
        id: p.id,
        name: p.name,
        agentId: p.agentId,
        team: p.team,
        isHost: p.isHost,
    }));
    const startPayload = { mode: room.mode, hostId: room.hostId, players };

    for (const id of room.players.keys()) {
        ioRef.sockets.sockets.get(id)?.emit(S2C.START, startPayload);
    }
}

function onReturnLobby(socket: Socket): void {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (!room.players.has(socket.id)) return;
    if (room.state !== 'playing') return; // only meaningful after a match

    room.state = 'lobby';
    for (const p of room.players.values()) p.ready = false;
    emitLobby(room);
}

function onLeave(socket: Socket): void {
    cleanupSocket(socket.id);
}

// ── Match Relay (opaque payloads; server only routes) ──────────────
function onPlayer(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room || !room.players.has(socket.id)) return;
    const out = { id: socket.id, state: payload?.state };
    for (const id of room.players.keys()) {
        if (id === socket.id) continue; // all OTHER players
        ioRef.sockets.sockets.get(id)?.emit(S2C.PLAYER, out);
    }
}

function onMatch(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return; // host only
    const out = { state: payload?.state };
    for (const id of room.players.keys()) {
        if (id === socket.id) continue;
        ioRef.sockets.sockets.get(id)?.emit(S2C.MATCH, out);
    }
}

function onHit(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room || !room.players.has(socket.id)) return;
    const target = payload?.target;
    if (typeof target !== 'string' || !room.players.has(target)) return;
    ioRef.sockets.sockets.get(target)?.emit(S2C.HIT, {
        from: socket.id,
        dmg: payload?.dmg,
        head: payload?.head,
        weapon: payload?.weapon,
    });
}

function onDeath(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room || !room.players.has(socket.id)) return;
    const out = {
        id: socket.id,
        killer: payload?.killer,
        weapon: payload?.weapon,
        head: payload?.head,
    };
    for (const id of room.players.keys()) {
        if (id === socket.id) continue; // everyone incl. host, excl. sender
        ioRef.sockets.sockets.get(id)?.emit(S2C.DEATH, out);
    }
}

function onBhit(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room || !room.players.has(socket.id)) return;
    const hostSock = ioRef.sockets.sockets.get(room.hostId);
    if (!hostSock) return;
    hostSock.emit(S2C.BHIT, {
        from: socket.id,
        target: payload?.target,
        dmg: payload?.dmg,
        head: payload?.head,
        weapon: payload?.weapon,
    });
}

function onFx(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room || !room.players.has(socket.id)) return;
    const out = { ownerId: socket.id, fx: payload?.fx };
    for (const id of room.players.keys()) {
        if (id === socket.id) continue; // all OTHER players
        ioRef.sockets.sockets.get(id)?.emit(S2C.FX, out);
    }
}

function onSpike(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room || !room.players.has(socket.id)) return;
    const hostSock = ioRef.sockets.sockets.get(room.hostId);
    if (!hostSock) return;
    hostSock.emit(S2C.SPIKE, {
        playerId: socket.id,
        type: payload?.type,
        active: payload?.active,
        pos: payload?.pos,
    });
}

/** Wrap a handler so a thrown error can never escape into Socket.IO. */
function safe(fn: (p: any) => void): (p: any) => void {
    return (p: any) => {
        try {
            fn(p);
        } catch {
            // Swallow — a relay handler must never crash the connection.
        }
    };
}

// ── Public API ─────────────────────────────────────────────────────
export function registerRochesterOffensiveHandlers(io: Server, socket: Socket): void {
    ioRef = io;
    socket.on(C2S.JOIN, safe((p) => onJoin(socket, p)));
    socket.on(C2S.SELECT_TEAM, safe((p) => onSelectTeam(socket, p)));
    socket.on(C2S.SELECT_AGENT, safe((p) => onSelectAgent(socket, p)));
    socket.on(C2S.READY, safe((p) => onReady(socket, p)));
    socket.on(C2S.SET_MODE, safe((p) => onSetMode(socket, p)));
    socket.on(C2S.START, safe(() => onStart(socket)));
    socket.on(C2S.RETURN_LOBBY, safe(() => onReturnLobby(socket)));
    socket.on(C2S.LEAVE, safe(() => onLeave(socket)));

    // Match relay
    socket.on(C2S.PLAYER, safe((p) => onPlayer(socket, p)));
    socket.on(C2S.MATCH, safe((p) => onMatch(socket, p)));
    socket.on(C2S.HIT, safe((p) => onHit(socket, p)));
    socket.on(C2S.DEATH, safe((p) => onDeath(socket, p)));
    socket.on(C2S.BHIT, safe((p) => onBhit(socket, p)));
    socket.on(C2S.FX, safe((p) => onFx(socket, p)));
    socket.on(C2S.SPIKE, safe((p) => onSpike(socket, p)));
}

export function handleRochesterOffensiveDisconnect(_io: Server, socket: Socket): void {
    cleanupSocket(socket.id);
}
