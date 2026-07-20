/**
 * Neon Driftway — Multiplayer Lobby Handler
 *
 * Extracted from legacy socket-server.ts.
 */

import type { Server, Socket } from 'socket.io';
import { sanitizeLobbyId, sanitizeUserName } from '../utils';
import { checkRateLimit } from '../rate-limit';

interface NDWPlayer {
  id: string;
  name: string;
  score: number;
  speed: number;
  distance: number;
  x: number;
  lane: number;
  ready: boolean;
  finished: boolean;
  abilityCharges: number;
  lastAbilityTime: number;
}

interface NDWLobby {
  id: string;
  hostId: string;
  players: Map<string, NDWPlayer>;
  status: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';
  levelId: number;
}

const ndwLobbies = new Map<string, NDWLobby>();
const ABILITY_COOLDOWN_MS = 5000;
const MAX_NDW_PLAYERS = 6;

function broadcastLobby(io: Server, lobbyId: string): void {
  const lobby = ndwLobbies.get(lobbyId);
  if (!lobby) return;
  const players = Array.from(lobby.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    ready: p.ready,
    isHost: p.id === lobby.hostId,
  }));
  io.to(`ndw:${lobbyId}`).emit('ndw:lobbyState', {
    roomId: lobbyId,
    players,
    gameStarted: lobby.status === 'PLAYING',
    levelId: lobby.levelId,
  });
}

export function registerNeonDriftwayHandlers(io: Server, socket: Socket): void {
  socket.on('ndw:joinLobby', (payload: { roomId?: string; playerName?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const name = sanitizeUserName(payload?.playerName);
    let lobby = ndwLobbies.get(roomId);
    if (!lobby) {
      lobby = { id: roomId, hostId: socket.id, players: new Map(), status: 'WAITING', levelId: 1 };
      ndwLobbies.set(roomId, lobby);
    }
    if (lobby.players.size >= MAX_NDW_PLAYERS || lobby.status !== 'WAITING') return;
    lobby.players.set(socket.id, {
      id: socket.id,
      name,
      score: 0,
      speed: 0,
      distance: 0,
      x: 0,
      lane: 0,
      ready: false,
      finished: false,
      abilityCharges: 0,
      lastAbilityTime: 0,
    });
    socket.join(`ndw:${roomId}`);
    broadcastLobby(io, roomId);
  });

  socket.on('ndw:toggleReady', (payload: { roomId?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = ndwLobbies.get(roomId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (player) {
      player.ready = !player.ready;
      broadcastLobby(io, roomId);
    }
  });

  socket.on('ndw:startGame', (payload: { roomId?: string; levelId?: number }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = ndwLobbies.get(roomId);
    if (!lobby || lobby.hostId !== socket.id || lobby.status !== 'WAITING') return;
    lobby.levelId = typeof payload?.levelId === 'number' ? payload.levelId : 1;
    lobby.status = 'COUNTDOWN';
    lobby.players.forEach((p) => {
      p.score = 0;
      p.speed = 0;
      p.distance = 0;
      p.finished = false;
      p.abilityCharges = 0;
    });
    io.to(`ndw:${roomId}`).emit('ndw:startCountdown', {
      countdownSeconds: 3,
      levelId: lobby.levelId,
    });
    setTimeout(() => {
      if (lobby.status !== 'COUNTDOWN') return;
      lobby.status = 'PLAYING';
      io.to(`ndw:${roomId}`).emit('ndw:gameStarted', { levelId: lobby.levelId });
      broadcastLobby(io, roomId);
    }, 3000);
  });

  socket.on(
    'ndw:playerUpdate',
    (payload: {
      roomId?: string;
      x?: number;
      speed?: number;
      distance?: number;
      score?: number;
      lane?: number;
    }) => {
      // High-frequency position relay — silently drop over-limit packets.
      if (!checkRateLimit(socket.id, 'ndw:playerUpdate')) return;
      const roomId = sanitizeLobbyId(payload?.roomId);
      const lobby = ndwLobbies.get(roomId);
      if (!lobby || lobby.status !== 'PLAYING') return;
      const player = lobby.players.get(socket.id);
      if (!player) return;
      if (typeof payload?.x === 'number') player.x = payload.x;
      if (typeof payload?.speed === 'number') player.speed = payload.speed;
      if (typeof payload?.distance === 'number') player.distance = payload.distance;
      if (typeof payload?.score === 'number') player.score = payload.score;
      if (typeof payload?.lane === 'number') player.lane = payload.lane;
      socket.to(`ndw:${roomId}`).emit('ndw:playerUpdate', {
        id: socket.id,
        name: player.name,
        x: player.x,
        speed: player.speed,
        distance: player.distance,
        score: player.score,
        lane: player.lane,
      });
    },
  );

  socket.on('ndw:scoreUpdate', (payload: { roomId?: string; score?: number }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = ndwLobbies.get(roomId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;
    player.score = typeof payload?.score === 'number' ? payload.score : player.score;
    socket
      .to(`ndw:${roomId}`)
      .emit('ndw:scoreUpdate', { id: socket.id, score: player.score, name: player.name });
  });

  socket.on('ndw:abilityUsed', (payload: { roomId?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = ndwLobbies.get(roomId);
    if (!lobby || lobby.status !== 'PLAYING') return;
    const player = lobby.players.get(socket.id);
    if (!player || player.abilityCharges <= 0) return;
    const now = Date.now();
    if (now - player.lastAbilityTime < ABILITY_COOLDOWN_MS) return;
    player.abilityCharges--;
    player.lastAbilityTime = now;
    const others = Array.from(lobby.players.keys()).filter(
      (id) => id !== socket.id && !lobby.players.get(id)!.finished,
    );
    if (others.length === 0) return;
    const targetId = others[Math.floor(Math.random() * others.length)];
    io.to(`ndw:${roomId}`).emit('ndw:slowdownApplied', {
      senderId: socket.id,
      senderName: player.name,
      targetId,
    });
  });

  socket.on('ndw:playerFinished', (payload: { roomId?: string; finalScore?: number }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = ndwLobbies.get(roomId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;
    player.finished = true;
    player.score = typeof payload?.finalScore === 'number' ? payload.finalScore : player.score;
    io.to(`ndw:${roomId}`).emit('ndw:playerDisconnected', { id: socket.id, reason: 'finished' });
    if (Array.from(lobby.players.values()).every((p) => p.finished)) {
      lobby.status = 'WAITING';
      const rankings = Array.from(lobby.players.values())
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({ id: p.id, name: p.name, score: p.score, rank: i + 1 }));
      io.to(`ndw:${roomId}`).emit('ndw:gameOver', { rankings });
      lobby.players.forEach((p) => {
        p.ready = false;
        p.finished = false;
      });
      broadcastLobby(io, roomId);
    }
  });

  socket.on('ndw:leaveLobby', (payload: { roomId?: string }) => {
    const roomId = sanitizeLobbyId(payload?.roomId);
    const lobby = ndwLobbies.get(roomId);
    if (!lobby || !lobby.players.has(socket.id)) return;
    lobby.players.delete(socket.id);
    socket.leave(`ndw:${roomId}`);
    if (lobby.players.size === 0) {
      ndwLobbies.delete(roomId);
    } else {
      if (lobby.hostId === socket.id) lobby.hostId = lobby.players.keys().next().value || '';
      broadcastLobby(io, roomId);
    }
  });
}

export function handleNeonDriftwayDisconnect(io: Server, socket: Socket): void {
  for (const [roomId, lobby] of ndwLobbies.entries()) {
    if (lobby.players.has(socket.id)) {
      lobby.players.delete(socket.id);
      socket.leave(`ndw:${roomId}`);
      if (lobby.players.size === 0) {
        ndwLobbies.delete(roomId);
      } else {
        if (lobby.hostId === socket.id) lobby.hostId = lobby.players.keys().next().value || '';
        io.to(`ndw:${roomId}`).emit('ndw:playerDisconnected', {
          id: socket.id,
          reason: 'disconnect',
        });
        broadcastLobby(io, roomId);
      }
      break;
    }
  }
}
