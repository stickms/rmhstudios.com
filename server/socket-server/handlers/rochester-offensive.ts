/**
 * Rochester Offensive — Handler for the unified socket server.
 *
 * Browsable lobbies for a multiplayer 3D FPS. The server is a pure ROOM
 * MANAGER + DUMB RELAY: it tracks lobby membership, team balancing, host
 * election and match state, but it does NOT simulate the game. In-match
 * payloads (player state, hits, fx, …) are opaque blobs the server routes
 * between sockets without inspecting their contents.
 *
 * Rooms can be public (listed in the browser) or private (join by id +
 * password only). The host configures the per-side CPU count and may start
 * the match.
 *
 * Modes: 'standard' (attackers vs defenders, max 5 each / 10 total) and
 * 'zombies' (everyone forced to 'attackers' survivors, max 5 total).
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode } from '../utils';

// ── Event Constants ────────────────────────────────────────────────
const C2S = {
    JOIN: 'ro:join',              // legacy alias for quick-join
    QUICK_JOIN: 'ro:quickJoin',
    LIST_ROOMS: 'ro:listRooms',
    CREATE_ROOM: 'ro:createRoom',
    JOIN_ROOM: 'ro:joinRoom',
    SET_CPU: 'ro:setCpu',
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
    BUY: 'ro:buy',
    ABILITY: 'ro:ability',
} as const;

const S2C = {
    ROOM_LIST: 'ro:roomList',
    LOBBY: 'ro:lobby',
    START: 'ro:start',
    PLAYER: 'ro:player',
    MATCH: 'ro:match',
    HIT: 'ro:hit',
    DEATH: 'ro:death',
    BHIT: 'ro:bhit',
    FX: 'ro:fx',
    SPIKE: 'ro:spike',
    BUY: 'ro:buy',
    ABILITY: 'ro:ability',
    PLAYER_LEFT: 'ro:playerLeft',
    ERROR: 'ro:error',
    RETURN_LOBBY: 'ro:returnLobby',
} as const;

const MAX_PER_TEAM = 5;      // standard: 5 attackers + 5 defenders
const MAX_ZOMBIES = 5;       // zombies: 5 survivors total
const MAX_NAME_LEN = 40;
const MAX_AGENT_LEN = 40;
const MAX_ROOM_NAME_LEN = 32;
const MAX_PASSWORD_LEN = 64;
const MIN_CPU = 0;
const MAX_CPU = 5;
const DEFAULT_CPU = 4;
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
    name: string;
    mode: Mode;
    state: State;
    hostId: string;
    isPublic: boolean;
    password: string | null;
    cpuPerSide: number; // clamp 0..5
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

function sanitizeRoomName(raw: unknown, fallback: string): string {
    if (typeof raw !== 'string') return fallback;
    const cleaned = raw.trim().slice(0, MAX_ROOM_NAME_LEN);
    return cleaned || fallback;
}

function sanitizePassword(raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw) return null;
    return raw.slice(0, MAX_PASSWORD_LEN);
}

function sanitizeMode(raw: unknown): Mode {
    return raw === 'zombies' ? 'zombies' : 'standard';
}

function clampCpu(raw: unknown): number {
    const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_CPU;
    return Math.max(MIN_CPU, Math.min(MAX_CPU, n));
}

function maxForMode(mode: Mode): number {
    return mode === 'zombies' ? MAX_ZOMBIES : MAX_PER_TEAM * 2;
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
            name: room.name,
            mode: room.mode,
            state: room.state,
            hostId: room.hostId,
            isPublic: room.isPublic,
            cpuPerSide: room.cpuPerSide,
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

function roomListPayload() {
    const list: Array<{
        id: string;
        name: string;
        mode: Mode;
        count: number;
        max: number;
        hasPassword: boolean;
        state: State;
    }> = [];
    for (const r of rooms.values()) {
        if (!r.isPublic) continue; // never list private rooms
        list.push({
            id: r.id,
            name: r.name,
            mode: r.mode,
            count: r.players.size,
            max: maxForMode(r.mode),
            hasPassword: r.password !== null,
            state: r.state,
        });
    }
    return { rooms: list };
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

/** Add `socket` to `room` as a player on `team` (host if room is empty). */
function addPlayer(socket: Socket, room: RORoom, name: string, agentId: string, team: Team): void {
    const isHost = room.players.size === 0;
    if (isHost) room.hostId = socket.id;
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

// ── Lobby / Room Management Handlers ───────────────────────────────
function onListRooms(socket: Socket): void {
    socket.emit(S2C.ROOM_LIST, roomListPayload());
}

function onCreateRoom(socket: Socket, payload: any): void {
    // A socket only belongs to one room at a time.
    cleanupSocket(socket.id);

    const name = sanitizeName(payload?.name);
    const agentId = sanitizeAgent(payload?.agentId);
    const mode = sanitizeMode(payload?.mode);
    const roomName = sanitizeRoomName(payload?.roomName, `${name}'s Lobby`);
    const isPublic = payload?.isPublic !== false; // default public unless explicitly false
    const password = sanitizePassword(payload?.password);

    const room: RORoom = {
        id: generateUniqueCode(),
        name: roomName,
        mode,
        state: 'lobby',
        hostId: socket.id,
        isPublic: isPublic === true,
        password,
        cpuPerSide: DEFAULT_CPU,
        players: new Map(),
    };
    rooms.set(room.id, room);

    addPlayer(socket, room, name, agentId, 'attackers'); // host joins as attacker
    emitLobby(room);
}

function onJoinRoom(socket: Socket, payload: any): void {
    const id = typeof payload?.id === 'string' ? payload.id : '';
    if (!id) {
        socket.emit(S2C.ERROR, { message: 'Room not found' });
        return;
    }
    const room = rooms.get(id);
    if (!room) {
        socket.emit(S2C.ERROR, { message: 'Room not found' });
        return;
    }
    if (room.state !== 'lobby') {
        socket.emit(S2C.ERROR, { message: 'Match already started' });
        return;
    }
    if (room.password !== null) {
        const given = typeof payload?.password === 'string' ? payload.password : '';
        if (given !== room.password) {
            socket.emit(S2C.ERROR, { message: 'Wrong password' });
            return;
        }
    }
    if (!hasFreeCapacity(room)) {
        socket.emit(S2C.ERROR, { message: 'Room full' });
        return;
    }

    // Commit: leave any current room, then join.
    cleanupSocket(socket.id);
    // Room may have been deleted if the caller was its sole member.
    if (!rooms.has(room.id)) {
        socket.emit(S2C.ERROR, { message: 'Room not found' });
        return;
    }

    const name = sanitizeName(payload?.name);
    const agentId = sanitizeAgent(payload?.agentId);
    const team: Team = room.mode === 'zombies' ? 'attackers' : balancedTeam(room);
    addPlayer(socket, room, name, agentId, team);
    emitLobby(room);
}

/** Shared quick-join / auto-match logic used by ro:quickJoin and legacy ro:join. */
function quickJoin(socket: Socket, payload: any): void {
    cleanupSocket(socket.id);

    const name = sanitizeName(payload?.name);
    const agentId = sanitizeAgent(payload?.agentId);

    // Find the first joinable PUBLIC lobby (standard mode preferred).
    let room: RORoom | undefined;
    for (const r of rooms.values()) {
        if (r.isPublic && r.mode === 'standard' && r.state === 'lobby' && hasFreeCapacity(r)) {
            room = r;
            break;
        }
    }
    if (!room) {
        for (const r of rooms.values()) {
            if (r.isPublic && r.state === 'lobby' && hasFreeCapacity(r)) {
                room = r;
                break;
            }
        }
    }

    if (!room) {
        // Create a new public standard lobby; caller becomes host.
        room = {
            id: generateUniqueCode(),
            name: `${name}'s Lobby`,
            mode: 'standard',
            state: 'lobby',
            hostId: socket.id,
            isPublic: true,
            password: null,
            cpuPerSide: DEFAULT_CPU,
            players: new Map(),
        };
        rooms.set(room.id, room);
    }

    const team: Team = room.mode === 'zombies' ? 'attackers' : balancedTeam(room);
    addPlayer(socket, room, name, agentId, team);
    emitLobby(room);
}

function onSetCpu(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return; // host only
    room.cpuPerSide = clampCpu(payload?.count);
    emitLobby(room);
}

// ── Lobby Configuration Handlers ───────────────────────────────────
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
    const startPayload = {
        mode: room.mode,
        hostId: room.hostId,
        cpuPerSide: room.cpuPerSide,
        players,
    };

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

function onBuy(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room || !room.players.has(socket.id)) return;
    const hostSock = ioRef.sockets.sockets.get(room.hostId);
    if (!hostSock) return;
    // Opaque relay: spread original fields back, plus `from`.
    const original = payload && typeof payload === 'object' ? payload : {};
    hostSock.emit(S2C.BUY, { ...original, from: socket.id });
}

function onAbility(socket: Socket, payload: any): void {
    const room = getRoomOf(socket.id);
    if (!room || !room.players.has(socket.id)) return;
    const hostSock = ioRef.sockets.sockets.get(room.hostId);
    if (!hostSock) return;
    hostSock.emit(S2C.ABILITY, { from: socket.id, slot: payload?.slot });
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
    // Lobby / room management
    socket.on(C2S.LIST_ROOMS, safe(() => onListRooms(socket)));
    socket.on(C2S.CREATE_ROOM, safe((p) => onCreateRoom(socket, p)));
    socket.on(C2S.JOIN_ROOM, safe((p) => onJoinRoom(socket, p)));
    socket.on(C2S.QUICK_JOIN, safe((p) => quickJoin(socket, p)));
    socket.on(C2S.JOIN, safe((p) => quickJoin(socket, p))); // legacy alias
    socket.on(C2S.SET_CPU, safe((p) => onSetCpu(socket, p)));
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
    socket.on(C2S.BUY, safe((p) => onBuy(socket, p)));
    socket.on(C2S.ABILITY, safe((p) => onAbility(socket, p)));
}

export function handleRochesterOffensiveDisconnect(_io: Server, socket: Socket): void {
    cleanupSocket(socket.id);
}
