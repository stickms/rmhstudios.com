/**
 * VELUM 2099 — Multiplayer Lobby & Cruise Handler
 *
 * Players share a fully deterministic procedural city (the world is seeded by
 * chunk coordinates, so every client renders an identical map without any world
 * sync). This handler therefore only manages lobbies and relays lightweight
 * per-player driving state so everyone can see each other drive together.
 *
 * All socket events are prefixed with `velum:`.
 */

import type { Server, Socket } from 'socket.io';
import { sanitizeLobbyId, sanitizeUserName, generateRoomCode, sanitizeString } from '../utils';
import { config } from '../config';

interface VelumPlayer {
  id: string;
  name: string;
  ready: boolean;
  colorIndex: number;
  // Last known driving state (mirrored for late joiners).
  x: number; y: number; z: number; ry: number;
  speed: number; drifting: boolean;
}

interface VelumLobby {
  id: string;
  hostId: string;
  players: Map<string, VelumPlayer>;
  status: 'WAITING' | 'PLAYING';
}

const velumLobbies = new Map<string, VelumLobby>();
const MAX_VELUM_PLAYERS = 8;
const ROOM = (id: string) => `velum:${id}`;

/** Pick the lowest unused colour index (0..MAX-1) in a lobby. */
function nextColorIndex(lobby: VelumLobby): number {
  const used = new Set<number>();
  for (const p of lobby.players.values()) used.add(p.colorIndex);
  for (let i = 0; i < MAX_VELUM_PLAYERS; i++) if (!used.has(i)) return i;
  return 0;
}

function lobbyView(lobby: VelumLobby) {
  return {
    roomId: lobby.id,
    status: lobby.status,
    hostId: lobby.hostId,
    players: Array.from(lobby.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      isHost: p.id === lobby.hostId,
      colorIndex: p.colorIndex,
    })),
  };
}

function broadcastLobby(io: Server, lobbyId: string): void {
  const lobby = velumLobbies.get(lobbyId);
  if (!lobby) return;
  io.to(ROOM(lobbyId)).emit('velum:lobbyState', lobbyView(lobby));
}

function makePlayer(id: string, name: string, colorIndex: number): VelumPlayer {
  return {
    id, name, ready: false, colorIndex,
    x: 0, y: 0, z: 0, ry: 0, speed: 0, drifting: false,
  };
}

function joinLobbyInternal(
  io: Server, socket: Socket, lobby: VelumLobby, name: string,
): boolean {
  if (lobby.players.size >= MAX_VELUM_PLAYERS) {
    socket.emit('velum:error', { code: 'FULL', message: 'Lobby is full.' });
    return false;
  }
  if (!lobby.players.has(socket.id)) {
    lobby.players.set(socket.id, makePlayer(socket.id, name, nextColorIndex(lobby)));
  }
  socket.join(ROOM(lobby.id));
  // Tell the joiner the current snapshot (incl. whether a game is in progress).
  socket.emit('velum:joined', lobbyView(lobby));
  broadcastLobby(io, lobby.id);
  return true;
}

export function registerVelumHandlers(io: Server, socket: Socket): void {
  // ── Create a brand-new lobby with a server-generated room code ──
  socket.on('velum:createLobby', (payload: { playerName?: string }) => {
    const name = sanitizeUserName(payload?.playerName ?? socket.data.userName);
    // Find a free room code.
    let roomId = generateRoomCode();
    let guard = 0;
    while (velumLobbies.has(roomId) && guard++ < 20) roomId = generateRoomCode();

    const lobby: VelumLobby = {
      id: roomId, hostId: socket.id, players: new Map(), status: 'WAITING',
    };
    velumLobbies.set(roomId, lobby);
    socket.emit('velum:lobbyCreated', { roomId });
    joinLobbyInternal(io, socket, lobby, name);
  });

  // ── Join an existing lobby by code (drop-in allowed mid-cruise) ──
  socket.on('velum:joinLobby', (payload: { roomId?: string; playerName?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const name = sanitizeUserName(payload?.playerName ?? socket.data.userName);
    const lobby = velumLobbies.get(roomId);
    if (!lobby) {
      socket.emit('velum:error', { code: 'NOT_FOUND', message: 'No lobby with that code.' });
      return;
    }
    joinLobbyInternal(io, socket, lobby, name);
  });

  // ── Toggle ready state in the lobby ──
  socket.on('velum:toggleReady', (payload: { roomId?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = velumLobbies.get(roomId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;
    player.ready = !player.ready;
    broadcastLobby(io, roomId);
  });

  // ── Host launches the shared cruise ──
  socket.on('velum:startGame', (payload: { roomId?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = velumLobbies.get(roomId);
    if (!lobby || lobby.hostId !== socket.id) return;
    lobby.status = 'PLAYING';
    io.to(ROOM(roomId)).emit('velum:gameStarted', { roomId });
    broadcastLobby(io, roomId);
  });

  // ── High-frequency driving-state relay (≈15 Hz from each client) ──
  socket.on('velum:playerState', (payload: {
    roomId?: string; x?: number; y?: number; z?: number; ry?: number;
    speed?: number; drifting?: boolean;
  }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = velumLobbies.get(roomId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;

    if (typeof payload?.x === 'number' && Number.isFinite(payload.x)) player.x = payload.x;
    if (typeof payload?.y === 'number' && Number.isFinite(payload.y)) player.y = payload.y;
    if (typeof payload?.z === 'number' && Number.isFinite(payload.z)) player.z = payload.z;
    if (typeof payload?.ry === 'number' && Number.isFinite(payload.ry)) player.ry = payload.ry;
    if (typeof payload?.speed === 'number' && Number.isFinite(payload.speed)) player.speed = payload.speed;
    player.drifting = !!payload?.drifting;

    // Relay only to the rest of the room (not back to the sender).
    socket.to(ROOM(roomId)).emit('velum:playerState', {
      id: socket.id,
      name: player.name,
      colorIndex: player.colorIndex,
      x: player.x, y: player.y, z: player.z, ry: player.ry,
      speed: player.speed, drifting: player.drifting,
    });
  });

  // ── Lobby / in-game chat ──
  socket.on('velum:chat', (payload: { roomId?: string; text?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = velumLobbies.get(roomId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;
    const text = sanitizeString(payload?.text, config.CHAT_MAX_LENGTH);
    if (!text) return;
    io.to(ROOM(roomId)).emit('velum:chat', {
      id: socket.id, name: player.name, colorIndex: player.colorIndex, text,
      ts: Date.now(),
    });
  });

  // ── Leave the lobby explicitly ──
  socket.on('velum:leaveLobby', (payload: { roomId?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    removeFromLobby(io, socket, roomId);
  });
}

function removeFromLobby(io: Server, socket: Socket, roomId: string): void {
  const lobby = velumLobbies.get(roomId);
  if (!lobby || !lobby.players.has(socket.id)) return;
  lobby.players.delete(socket.id);
  socket.leave(ROOM(roomId));
  if (lobby.players.size === 0) {
    velumLobbies.delete(roomId);
    return;
  }
  if (lobby.hostId === socket.id) {
    lobby.hostId = lobby.players.keys().next().value || '';
  }
  io.to(ROOM(roomId)).emit('velum:playerLeft', { id: socket.id });
  broadcastLobby(io, roomId);
}

export function handleVelumDisconnect(io: Server, socket: Socket): void {
  for (const [roomId, lobby] of velumLobbies.entries()) {
    if (lobby.players.has(socket.id)) {
      removeFromLobby(io, socket, roomId);
      break;
    }
  }
}
