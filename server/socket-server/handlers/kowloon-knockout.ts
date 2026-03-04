/**
 * Kowloon Knockout — Handler for the unified socket server.
 *
 * Simple 1v1 room relay: host creates room, guest joins,
 * then input/game_state messages are relayed between them.
 */

import type { Server, Socket } from 'socket.io';
import { generateRoomCode } from '../utils';

// ── Event Constants ────────────────────────────────────────────────

const C2S = {
    CREATE_ROOM:   'kk:create_room',
    JOIN_ROOM:     'kk:join_room',
    INPUT:         'kk:input',
    GAME_STATE:    'kk:game_state',
    FIGHTER_READY: 'kk:fighter_ready',
    LEAVE:         'kk:leave',
} as const;

const S2C = {
    ROOM_CREATED:          'kk:room_created',
    ROOM_JOINED:           'kk:room_joined',
    INPUT:                 'kk:input',
    GAME_STATE:            'kk:game_state',
    OPPONENT_READY:        'kk:opponent_ready',
    OPPONENT_DISCONNECTED: 'kk:opponent_disconnected',
    ERROR:                 'kk:error',
} as const;

// ── Types ──────────────────────────────────────────────────────────

interface KKRoom {
    code: string;
    hostSocketId: string;
    guestSocketId: string | null;
    hostClass: string;
    guestClass: string | null;
    // Rematch: pending fighter selections
    hostReady: boolean;
    guestReady: boolean;
    pendingHostClass: string | null;
    pendingGuestClass: string | null;
}

// ── State ──────────────────────────────────────────────────────────

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

function cleanupSocket(socketId: string): void {
    const roomCode = socketToRoom.get(socketId);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) {
        socketToRoom.delete(socketId);
        return;
    }

    // Notify the other player
    if (room.hostSocketId === socketId && room.guestSocketId) {
        const guestSocket = ioRef.sockets.sockets.get(room.guestSocketId);
        if (guestSocket) guestSocket.emit(S2C.OPPONENT_DISCONNECTED, {});
        socketToRoom.delete(room.guestSocketId);
    } else if (room.guestSocketId === socketId) {
        const hostSocket = ioRef.sockets.sockets.get(room.hostSocketId);
        if (hostSocket) hostSocket.emit(S2C.OPPONENT_DISCONNECTED, {});
        socketToRoom.delete(room.hostSocketId);
    }

    rooms.delete(roomCode);
    socketToRoom.delete(socketId);
}

// ── Event Handlers ─────────────────────────────────────────────────

function onCreateRoom(socket: Socket, payload: any): void {
    // Clean up any previous room
    cleanupSocket(socket.id);

    const code = generateUniqueCode();
    const room: KKRoom = {
        code,
        hostSocketId: socket.id,
        guestSocketId: null,
        hostClass: payload?.fighterClass || 'stone_tiger',
        guestClass: null,
        hostReady: false,
        guestReady: false,
        pendingHostClass: null,
        pendingGuestClass: null,
    };

    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.emit(S2C.ROOM_CREATED, { code });
}

function onJoinRoom(socket: Socket, payload: any): void {
    const code = typeof payload?.code === 'string' ? payload.code.toUpperCase() : '';
    const room = rooms.get(code);

    if (!room) {
        socket.emit(S2C.ERROR, { message: 'Room not found' });
        return;
    }
    if (room.guestSocketId) {
        socket.emit(S2C.ERROR, { message: 'Room is full' });
        return;
    }

    room.guestSocketId = socket.id;
    room.guestClass = payload?.fighterClass || 'stone_tiger';
    socketToRoom.set(socket.id, code);

    // Notify both players
    const hostSocket = ioRef.sockets.sockets.get(room.hostSocketId);
    if (hostSocket) {
        hostSocket.emit(S2C.ROOM_JOINED, {
            hostClass: room.hostClass,
            guestClass: room.guestClass,
            isHost: true,
        });
    }
    socket.emit(S2C.ROOM_JOINED, {
        hostClass: room.hostClass,
        guestClass: room.guestClass,
        isHost: false,
    });
}

function onInput(socket: Socket, payload: any): void {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.guestSocketId !== socket.id) return;

    // Guest → Host relay
    const hostSocket = ioRef.sockets.sockets.get(room.hostSocketId);
    if (hostSocket) {
        hostSocket.emit(S2C.INPUT, payload);
    }
}

function onGameState(socket: Socket, payload: any): void {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.hostSocketId !== socket.id || !room.guestSocketId) return;

    // Host → Guest relay
    const guestSocket = ioRef.sockets.sockets.get(room.guestSocketId);
    if (guestSocket) {
        guestSocket.emit(S2C.GAME_STATE, payload);
    }
}

function onFighterReady(socket: Socket, payload: any): void {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.guestSocketId) return;

    const fighterClass = payload?.fighterClass || 'stone_tiger';

    if (room.hostSocketId === socket.id) {
        room.pendingHostClass = fighterClass;
        room.hostReady = true;
        // Notify guest that host is ready
        const guestSocket = ioRef.sockets.sockets.get(room.guestSocketId);
        if (guestSocket) guestSocket.emit(S2C.OPPONENT_READY, {});
    } else if (room.guestSocketId === socket.id) {
        room.pendingGuestClass = fighterClass;
        room.guestReady = true;
        // Notify host that guest is ready
        const hostSocket = ioRef.sockets.sockets.get(room.hostSocketId);
        if (hostSocket) hostSocket.emit(S2C.OPPONENT_READY, {});
    } else {
        return;
    }

    // If both ready, start the rematch
    if (room.hostReady && room.guestReady) {
        room.hostClass = room.pendingHostClass!;
        room.guestClass = room.pendingGuestClass!;
        room.hostReady = false;
        room.guestReady = false;
        room.pendingHostClass = null;
        room.pendingGuestClass = null;

        const hostSocket = ioRef.sockets.sockets.get(room.hostSocketId);
        const guestSocket = ioRef.sockets.sockets.get(room.guestSocketId);

        if (hostSocket) {
            hostSocket.emit(S2C.ROOM_JOINED, {
                hostClass: room.hostClass,
                guestClass: room.guestClass,
                isHost: true,
            });
        }
        if (guestSocket) {
            guestSocket.emit(S2C.ROOM_JOINED, {
                hostClass: room.hostClass,
                guestClass: room.guestClass,
                isHost: false,
            });
        }
    }
}

function onLeave(socket: Socket): void {
    cleanupSocket(socket.id);
}

// ── Public API ─────────────────────────────────────────────────────

export function registerKowloonKnockoutHandlers(io: Server, socket: Socket): void {
    ioRef = io;

    socket.on(C2S.CREATE_ROOM, (payload) => onCreateRoom(socket, payload));
    socket.on(C2S.JOIN_ROOM, (payload) => onJoinRoom(socket, payload));
    socket.on(C2S.INPUT, (payload) => onInput(socket, payload));
    socket.on(C2S.GAME_STATE, (payload) => onGameState(socket, payload));
    socket.on(C2S.FIGHTER_READY, (payload) => onFighterReady(socket, payload));
    socket.on(C2S.LEAVE, () => onLeave(socket));
}

export function handleKowloonKnockoutDisconnect(_io: Server, socket: Socket): void {
    cleanupSocket(socket.id);
}
