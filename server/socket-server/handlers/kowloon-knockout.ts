/**
 * Kowloon Knockout — Handler for the unified socket server.
 *
 * Lobby-based, host-authoritative rooms for up to 4 fighters (FFA or
 * teams). Humans occupy stable seat slots (0..3); empty slots up to the
 * host-chosen arena size are filled by CPU. In-match, guests stream
 * compact input commands to the host (seat 0), and the host broadcasts
 * quantized snapshots to every guest.
 */

import type { Server, Socket } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { generateRoomCode } from '../utils';

// ── Event Constants ────────────────────────────────────────────────
const C2S = {
    CREATE_ROOM: 'kk:create_room',
    JOIN_ROOM: 'kk:join_room',
    SET_FIGHTER: 'kk:set_fighter',
    SET_CONFIG: 'kk:set_config',
    LIST_LOBBIES: 'kk:list_lobbies',
    RETURN_LOBBY: 'kk:return_lobby',
    START: 'kk:start',
    INPUT: 'kk:input',
    SNAPSHOT: 'kk:snapshot',
    LEAVE: 'kk:leave',
    RESUME: 'kk:resume',
} as const;

const S2C = {
    ROOM_CREATED: 'kk:room_created',
    LOBBY_UPDATE: 'kk:lobby_update',
    LOBBY_LIST: 'kk:lobby_list',
    MATCH_START: 'kk:match_start',
    INPUT: 'kk:input',
    SNAPSHOT: 'kk:snapshot',
    PLAYER_LEFT: 'kk:player_left',
    ERROR: 'kk:error',
    /** A seated player's connection dropped (connected:false) or came back (true). */
    PEER_STATUS: 'kk:peer_status',
    /** Answer to a successful RESUME: the seat is yours again. */
    RESUMED: 'kk:resumed',
} as const;

/**
 * How long a seat is held after its socket drops mid-match. Matches the shared
 * PEER_GRACE_MS (lib/shared/realtime/types.ts) every other game uses. Lobbies
 * are not held: rejoining a lobby is one click and a ghost seat would block a
 * public room.
 */
export const KK_RESUME_GRACE_MS = 15_000;

const MAX_SEATS = 4;
const DEFAULT_FIGHTER = 'stone_tiger';
const AI_DIFFICULTY = 0.6;
const AI_POOL = [
    'iron_bull', 'silver_viper', 'night_crane', 'ghost_monkey',
    'black_tortoise', 'red_phoenix', 'smoke_leopard', 'jade_dragon', 'stone_tiger',
];

type Mode = 'ffa' | 'teams';

interface Slot {
    socketId: string;
    className: string;
    /** Secret handed to this seat's client; presenting it reclaims the seat after a drop. */
    token: string;
    /** Set while the socket is gone and the seat is being held. */
    dropTimer?: ReturnType<typeof setTimeout>;
}

function newSlot(socketId: string, className: string): Slot {
    return { socketId, className, token: randomBytes(16).toString('hex') };
}

interface KKRoom {
    code: string;
    mode: Mode;
    arenaSize: number;     // 2..4 number of fighters
    maxRounds: number;
    state: 'lobby' | 'playing';
    isPublic: boolean;     // listed on the versus page when true
    slots: (Slot | null)[]; // length MAX_SEATS, index = seat
}

const rooms = new Map<string, KKRoom>();
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

function seatOf(room: KKRoom, socketId: string): number {
    return room.slots.findIndex((s) => s?.socketId === socketId);
}

function highestOccupied(room: KKRoom): number {
    let h = -1;
    room.slots.forEach((s, i) => { if (s) h = i; });
    return h;
}

function teamFor(room: KKRoom, seat: number): number {
    return room.mode === 'teams' ? seat % 2 : seat;
}

function aiClassFor(seat: number): string {
    return AI_POOL[seat % AI_POOL.length];
}

/** Roster of `arenaSize` fighters: humans where slots are filled, else CPU. */
function roster(room: KKRoom) {
    const out = [];
    for (let i = 0; i < room.arenaSize; i++) {
        const slot = room.slots[i];
        if (slot) {
            out.push({ seat: i, className: slot.className, team: teamFor(room, i), name: `P${i + 1}`, connected: true, human: true });
        } else {
            out.push({ seat: i, className: aiClassFor(i), team: teamFor(room, i), name: 'CPU', connected: true, human: false });
        }
    }
    return out;
}

function clampArena(room: KKRoom, requested: number): number {
    const lo = Math.max(2, highestOccupied(room) + 1);
    return Math.max(lo, Math.min(MAX_SEATS, requested));
}

function occupiedCount(room: KKRoom): number {
    return room.slots.filter((s): s is Slot => s !== null).length;
}

function emitLobby(room: KKRoom): void {
    const seats = roster(room);
    for (let i = 0; i < MAX_SEATS; i++) {
        const slot = room.slots[i];
        if (!slot) continue;
        const sock = ioRef.sockets.sockets.get(slot.socketId);
        sock?.emit(S2C.LOBBY_UPDATE, {
            you: i, hostSeat: 0, code: room.code, isPublic: room.isPublic,
            mode: room.mode, arenaSize: room.arenaSize, maxRounds: room.maxRounds, seats,
            resumeToken: slot.token,
        });
    }
}

function cleanupSocket(socketId: string): void {
    const code = socketToRoom.get(socketId);
    socketToRoom.delete(socketId);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    const seat = seatOf(room, socketId);
    if (seat === -1) return;
    removeSeat(room, seat);
}

/** Free a seat for good (leave, grace expiry). Seat 0 is the host: its leaving ends the room. */
function removeSeat(room: KKRoom, seat: number): void {
    const leaving = room.slots[seat];
    if (!leaving) return;
    if (leaving.dropTimer) clearTimeout(leaving.dropTimer);
    socketToRoom.delete(leaving.socketId);

    if (seat === 0) {
        // Host left — disband the room.
        for (const slot of room.slots) {
            if (slot && slot !== leaving) {
                if (slot.dropTimer) clearTimeout(slot.dropTimer);
                ioRef.sockets.sockets.get(slot.socketId)?.emit(S2C.ERROR, { message: 'Host left the room' });
                socketToRoom.delete(slot.socketId);
            }
        }
        rooms.delete(room.code);
        return;
    }

    room.slots[seat] = null;
    // Tell remaining players (host converts the empty seat to a standing CPU).
    for (const slot of room.slots) {
        if (slot) ioRef.sockets.sockets.get(slot.socketId)?.emit(S2C.PLAYER_LEFT, { seat });
    }
    if (room.state === 'lobby') emitLobby(room);
}

function broadcastPeerStatus(room: KKRoom, seat: number, connected: boolean): void {
    for (const slot of room.slots) {
        if (slot && !slot.dropTimer) ioRef.sockets.sockets.get(slot.socketId)?.emit(S2C.PEER_STATUS, { seat, connected });
    }
}

/**
 * A socket dropped. Mid-match the seat is held for KK_RESUME_GRACE_MS so the
 * player can come back to the same fight (the host's simulation lives in its
 * browser and keeps running; a guest just misses some snapshots). If nobody
 * reclaims it in time the seat is freed exactly as if they had left: a guest
 * becomes a CPU, a host ends the room with "Host left the room" for everyone.
 */
function holdOrCleanup(socketId: string): void {
    const code = socketToRoom.get(socketId);
    const room = code ? rooms.get(code) : undefined;
    const seat = room ? seatOf(room, socketId) : -1;
    if (!room || seat === -1 || room.state !== 'playing') {
        cleanupSocket(socketId);
        return;
    }
    const slot = room.slots[seat]!;
    socketToRoom.delete(socketId);
    slot.dropTimer = setTimeout(() => {
        slot.dropTimer = undefined;
        if (room.slots[seat] === slot) removeSeat(room, seat);
    }, KK_RESUME_GRACE_MS);
    slot.dropTimer.unref?.();
    broadcastPeerStatus(room, seat, false);
}

/** Rebind a held seat to a fresh socket when the presented token matches. */
function onResume(socket: Socket, payload: any): void {
    const code = typeof payload?.code === 'string' ? payload.code.toUpperCase() : '';
    const token = typeof payload?.token === 'string' ? payload.token : '';
    const room = rooms.get(code);
    const seat = room ? room.slots.findIndex((s) => s && s.token === token) : -1;
    if (!room || seat === -1) {
        socket.emit(S2C.ERROR, { message: 'Room closed' });
        return;
    }
    const slot = room.slots[seat]!;
    if (slot.dropTimer) { clearTimeout(slot.dropTimer); slot.dropTimer = undefined; }
    const stale = slot.socketId;
    if (stale !== socket.id) {
        socketToRoom.delete(stale);
        slot.socketId = socket.id;
    }
    socketToRoom.set(socket.id, room.code);

    if (room.state === 'lobby') {
        // The match ended while they were away: put them with everyone else.
        emitLobby(room);
        return;
    }
    const seats = roster(room).map((r) => ({
        seat: r.seat, className: r.className, team: r.team,
        kind: r.human ? 'human' : 'ai', name: r.name,
    }));
    socket.emit(S2C.RESUMED, {
        you: seat, code: room.code, mode: room.mode, maxRounds: room.maxRounds,
        aiDifficulty: AI_DIFFICULTY, seats, resumeToken: slot.token,
    });
    broadcastPeerStatus(room, seat, true);
}

// ── Event Handlers ─────────────────────────────────────────────────
function onCreateRoom(socket: Socket, payload: any): void {
    cleanupSocket(socket.id);
    const code = generateUniqueCode();
    const room: KKRoom = {
        code,
        mode: payload?.mode === 'teams' ? 'teams' : 'ffa',
        arenaSize: 2,
        maxRounds: 3,
        state: 'lobby',
        isPublic: payload?.isPublic !== false, // public by default
        slots: [newSlot(socket.id, payload?.fighterClass || DEFAULT_FIGHTER), null, null, null],
    };
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.emit(S2C.ROOM_CREATED, { code, seat: 0 });
    emitLobby(room);
}

function onJoinRoom(socket: Socket, payload: any): void {
    const code = typeof payload?.code === 'string' ? payload.code.toUpperCase() : '';
    const room = rooms.get(code);
    if (!room) { socket.emit(S2C.ERROR, { message: 'Room not found' }); return; }
    if (room.state !== 'lobby') { socket.emit(S2C.ERROR, { message: 'Match already in progress' }); return; }

    const seat = room.slots.findIndex((s) => s === null);
    if (seat === -1) { socket.emit(S2C.ERROR, { message: 'Room is full' }); return; }

    cleanupSocket(socket.id);
    room.slots[seat] = newSlot(socket.id, payload?.fighterClass || DEFAULT_FIGHTER);
    socketToRoom.set(socket.id, code);
    if (room.arenaSize < seat + 1) room.arenaSize = seat + 1;
    if (room.mode === 'teams' && room.arenaSize % 2 !== 0) room.mode = 'ffa';
    emitLobby(room);
}

function onSetFighter(socket: Socket, payload: any): void {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.state !== 'lobby') return;
    const seat = seatOf(room, socket.id);
    if (seat === -1) return;
    if (payload?.fighterClass) room.slots[seat]!.className = String(payload.fighterClass);
    emitLobby(room);
}

function onSetConfig(socket: Socket, payload: any): void {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.state !== 'lobby') return;
    if (seatOf(room, socket.id) !== 0) return; // host only

    if (payload?.mode === 'ffa' || payload?.mode === 'teams') room.mode = payload.mode;
    if (typeof payload?.arenaSize === 'number') room.arenaSize = clampArena(room, payload.arenaSize);
    if (typeof payload?.maxRounds === 'number') room.maxRounds = Math.max(1, Math.min(5, payload.maxRounds));
    if (typeof payload?.isPublic === 'boolean') room.isPublic = payload.isPublic;
    if (room.mode === 'teams' && room.arenaSize % 2 !== 0) room.mode = 'ffa';
    emitLobby(room);
}

/** Send the caller the list of joinable public lobbies. */
function onListLobbies(socket: Socket): void {
    const lobbies = [];
    for (const room of rooms.values()) {
        if (room.state !== 'lobby' || !room.isPublic) continue;
        const players = occupiedCount(room);
        if (players >= MAX_SEATS) continue; // no free human slot
        lobbies.push({
            code: room.code, mode: room.mode, arenaSize: room.arenaSize,
            players, host: room.slots[0]?.className ?? DEFAULT_FIGHTER,
        });
    }
    socket.emit(S2C.LOBBY_LIST, { lobbies });
}

/** Return the whole room to the lobby after a match (any seated player can). */
function onReturnLobby(socket: Socket): void {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || seatOf(room, socket.id) === -1) return;
    room.state = 'lobby';
    emitLobby(room);
}

function onStart(socket: Socket): void {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.state !== 'lobby') return;
    if (seatOf(room, socket.id) !== 0) return; // host only

    room.state = 'playing';
    const seats = roster(room).map((r) => ({
        seat: r.seat, className: r.className, team: r.team,
        kind: r.human ? 'human' : 'ai', name: r.name,
    }));

    for (let i = 0; i < MAX_SEATS; i++) {
        const slot = room.slots[i];
        if (!slot) continue;
        ioRef.sockets.sockets.get(slot.socketId)?.emit(S2C.MATCH_START, {
            you: i, mode: room.mode, maxRounds: room.maxRounds, aiDifficulty: AI_DIFFICULTY, seats,
            resumeToken: slot.token,
        });
    }
}

function onInput(socket: Socket, payload: any): void {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const seat = seatOf(room, socket.id);
    if (seat <= 0) return; // only guests relay input to host
    const host = room.slots[0];
    if (!host) return;
    ioRef.sockets.sockets.get(host.socketId)?.emit(S2C.INPUT, { seat, input: payload?.input });
}

function onSnapshot(socket: Socket, payload: any): void {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (seatOf(room, socket.id) !== 0) return; // host only
    for (let i = 1; i < MAX_SEATS; i++) {
        const slot = room.slots[i];
        if (slot) ioRef.sockets.sockets.get(slot.socketId)?.emit(S2C.SNAPSHOT, payload);
    }
}

function onLeave(socket: Socket): void {
    cleanupSocket(socket.id);
}

// ── Public API ─────────────────────────────────────────────────────
export function registerKowloonKnockoutHandlers(io: Server, socket: Socket): void {
    ioRef = io;
    socket.on(C2S.CREATE_ROOM, (p) => onCreateRoom(socket, p));
    socket.on(C2S.JOIN_ROOM, (p) => onJoinRoom(socket, p));
    socket.on(C2S.SET_FIGHTER, (p) => onSetFighter(socket, p));
    socket.on(C2S.SET_CONFIG, (p) => onSetConfig(socket, p));
    socket.on(C2S.LIST_LOBBIES, () => onListLobbies(socket));
    socket.on(C2S.RETURN_LOBBY, () => onReturnLobby(socket));
    socket.on(C2S.START, () => onStart(socket));
    socket.on(C2S.INPUT, (p) => onInput(socket, p));
    socket.on(C2S.SNAPSHOT, (p) => onSnapshot(socket, p));
    socket.on(C2S.LEAVE, () => onLeave(socket));
    socket.on(C2S.RESUME, (p) => onResume(socket, p));
}

export function handleKowloonKnockoutDisconnect(io: Server, socket: Socket): void {
    ioRef = io;
    holdOrCleanup(socket.id);
}

/** Test seam: forget every room (and its timers). */
export function __resetKowloonRooms(): void {
    for (const room of rooms.values()) for (const s of room.slots) if (s?.dropTimer) clearTimeout(s.dropTimer);
    rooms.clear();
    socketToRoom.clear();
}

// ── Party support (P1) ─────────────────────────────────────────────
//
// See `handlers/party.ts` for why this exists: the party system was finished
// and had an empty registry. Kowloon's rooms are seat-indexed and keyed by
// socket id, so a party room is simply one with every seat still empty —
// members take seats through the ordinary `JOIN_ROOM`, and the host-leaves
// teardown, the CPU backfill and the arena sizing all keep working untouched.
//
// `isPublic: false` matters here specifically. Kowloon lists public rooms on
// the versus page, and a party room that appeared there could be filled by a
// stranger in the seconds between the leader queuing and the party arriving.

import { registerPartyGame, type PartyMember, type RoomRef } from '../party-contract';

registerPartyGame('kowloon-knockout', {
    // Four seats, and a fifth member would have nowhere to sit.
    maxPartySize: 4,
    createRoomForParty(members: PartyMember[]): Promise<RoomRef> {
        const code = generateUniqueCode();
        const room: KKRoom = {
            code,
            // Teams needs an even arena; a party of 2 or 4 gets teams offered,
            // a party of 3 would be silently downgraded on the first join, so
            // start every party room in ffa and let the host change it.
            mode: 'ffa',
            arenaSize: Math.max(2, Math.min(members.length, 4)),
            maxRounds: 3,
            state: 'lobby',
            isPublic: false,
            slots: [null, null, null, null],
        };
        rooms.set(code, room);
        return Promise.resolve({ game: 'kowloon-knockout', roomId: code });
    },

    reapIfEmpty(roomId: string): void {
        const room = rooms.get(roomId.toUpperCase());
        if (!room || room.slots.some((slot) => slot !== null)) return;
        rooms.delete(room.code);
    },
});
