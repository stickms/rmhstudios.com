/**
 * Slice It — Multiplayer Lobby Handler
 *
 * Extracted from legacy socket-server.ts.
 * Handles lobby management, song selection, score updates, and game lifecycle.
 */

import type { Server, Socket } from 'socket.io';
import { sanitizeLobbyId, sanitizeUserName } from '../utils';

interface Player {
  id: string;
  userId: string;
  name: string;
  score: number;
  combo: number;
  health: number;
  isReady: boolean;
  isFinished: boolean;
  difficulty: {
    speed: number; bombs: boolean; switching: boolean; suddenDeath: boolean;
    invisible: boolean; spin: boolean; strictTiming: boolean; oneTrack: boolean; level: string;
  };
}

interface Lobby {
  id: string;
  hostId: string;
  players: Map<string, Player>;
  song: any | null;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
}

const lobbies = new Map<string, Lobby>();

function broadcastLobby(io: Server, lobbyId: string, lobby: Lobby): void {
  io.to(lobbyId).emit('lobby_update', {
    lobbyId,
    players: Array.from(lobby.players.values()),
    hostId: lobby.hostId,
    status: lobby.status,
    song: lobby.song,
  });
}

export function registerSliceItHandlers(io: Server, socket: Socket): void {
  socket.on('join_lobby', (payload: { lobbyId?: string; userName?: string; userId?: string }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const userName = sanitizeUserName(payload?.userName) || `Player ${Date.now().toString(36).slice(-4)}`;
    const userId = typeof payload?.userId === 'string' ? payload.userId : 'guest';

    let lobby = lobbies.get(lobbyId);
    if (!lobby) {
      lobby = { id: lobbyId, hostId: socket.id, players: new Map(), song: null, status: 'WAITING' };
      lobbies.set(lobbyId, lobby);
    }

    const player: Player = {
      id: socket.id, userId, name: userName,
      score: 0, combo: 0, health: 100, isReady: false, isFinished: false,
      difficulty: { speed: 1.0, bombs: false, switching: false, suddenDeath: false, invisible: false, spin: false, strictTiming: false, oneTrack: false, level: 'normal' },
    };
    lobby.players.set(socket.id, player);
    socket.join(lobbyId);
    broadcastLobby(io, lobbyId, lobby);
  });

  socket.on('select_song', (payload: { lobbyId?: string; song?: unknown }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return;
    lobby.song = payload?.song ?? null;
    io.to(lobbyId).emit('song_selected', { song: lobby.song });
    broadcastLobby(io, lobbyId, lobby);
  });

  socket.on('start_game', (payload: { lobbyId?: string }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.hostId !== socket.id || !lobby.song) return;

    lobby.status = 'PLAYING';
    lobby.players.forEach(p => { p.score = 0; p.combo = 0; p.health = 100; p.isReady = false; p.isFinished = false; });
    broadcastLobby(io, lobbyId, lobby);
    io.to(lobbyId).emit('init_loading', { song: lobby.song });

    const initialLoadingStatus = Array.from(lobby.players.values()).map(p => ({ id: p.id, name: p.name, loaded: false }));
    io.to(lobbyId).emit('loading_update', { players: initialLoadingStatus });
  });

  socket.on('player_loaded', (payload: { lobbyId?: string }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;

    player.isReady = true;
    const loadingStatus = Array.from(lobby.players.values()).map(p => ({ id: p.id, name: p.name, loaded: p.isReady }));
    io.to(lobbyId).emit('loading_update', { players: loadingStatus });

    if (Array.from(lobby.players.values()).every(p => p.isReady)) {
      lobby.players.forEach(p => { p.isReady = false; p.isFinished = false; });
      io.to(lobbyId).emit('start_countdown', { countdownSeconds: 3 });
      setTimeout(() => {
        io.to(lobbyId).emit('game_started');
        broadcastLobby(io, lobbyId, lobby);
      }, 3000);
    }
  });

  socket.on('score_update', (payload: { lobbyId?: string; score?: number; combo?: number; health?: number }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;
    player.score = typeof payload?.score === 'number' ? payload.score : 0;
    player.combo = typeof payload?.combo === 'number' ? payload.combo : 0;
    player.health = typeof payload?.health === 'number' ? payload.health : 100;
    io.to(lobbyId).emit('player_update', { id: socket.id, score: player.score, combo: player.combo, health: player.health });
  });

  socket.on('player_finished', (payload: { lobbyId?: string; finalScore?: number }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;
    player.isFinished = true;
    player.score = typeof payload?.finalScore === 'number' ? payload.finalScore : player.score;
    io.to(lobbyId).emit('player_finished', { id: socket.id, finalScore: player.score });

    if (Array.from(lobby.players.values()).every(p => p.isFinished)) {
      lobby.status = 'WAITING';
      io.to(lobbyId).emit('match_results', { players: Array.from(lobby.players.values()).sort((a, b) => b.score - a.score) });
      lobby.players.forEach(p => { p.isReady = false; p.isFinished = false; });
      broadcastLobby(io, lobbyId, lobby);
    }
  });

  socket.on('leave_lobby', (payload: { lobbyId?: string }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby || !lobby.players.has(socket.id)) return;
    lobby.players.delete(socket.id);
    socket.leave(lobbyId);
    if (lobby.players.size === 0) {
      lobbies.delete(lobbyId);
    } else {
      if (lobby.hostId === socket.id) lobby.hostId = lobby.players.keys().next().value || '';
      broadcastLobby(io, lobbyId, lobby);
    }
  });

  socket.on('return_to_lobby', (payload: { lobbyId?: string }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby || lobby.hostId !== socket.id) return;
    lobby.status = 'WAITING';
    lobby.players.forEach(p => { p.score = 0; p.combo = 0; p.health = 100; p.isReady = false; p.isFinished = false; });
    io.to(lobbyId).emit('return_to_lobby', { lobbyId });
    broadcastLobby(io, lobbyId, lobby);
  });

  socket.on('toggle_ready', (payload: { lobbyId?: string }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (player) {
      player.isReady = !player.isReady;
      broadcastLobby(io, lobbyId, lobby);
    }
  });

  socket.on('update_difficulty', (payload: { lobbyId?: string; difficulty?: unknown }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const player = lobby.players.get(socket.id);
    if (!player) return;
    const d = payload?.difficulty;
    player.difficulty = d && typeof d === 'object' && !Array.isArray(d)
      ? {
          speed: typeof (d as any).speed === 'number' ? (d as any).speed : 1.0,
          bombs: Boolean((d as any).bombs), switching: Boolean((d as any).switching),
          suddenDeath: Boolean((d as any).suddenDeath), invisible: Boolean((d as any).invisible),
          spin: Boolean((d as any).spin), strictTiming: Boolean((d as any).strictTiming),
          oneTrack: Boolean((d as any).oneTrack),
          level: typeof (d as any).level === 'string' ? (d as any).level.slice(0, 32) : 'normal',
        }
      : { speed: 1.0, bombs: false, switching: false, suddenDeath: false, invisible: false, spin: false, strictTiming: false, oneTrack: false, level: 'normal' };
    broadcastLobby(io, lobbyId, lobby);
  });
}

export function handleSliceItDisconnect(io: Server, socket: Socket): void {
  for (const [lobbyId, lobby] of lobbies.entries()) {
    if (lobby.players.has(socket.id)) {
      lobby.players.delete(socket.id);
      if (lobby.players.size === 0) {
        lobbies.delete(lobbyId);
      } else {
        if (lobby.hostId === socket.id) lobby.hostId = lobby.players.keys().next().value || '';
        io.to(lobbyId).emit('lobby_update', {
          lobbyId, players: Array.from(lobby.players.values()),
          hostId: lobby.hostId, status: lobby.status, song: lobby.song,
        });
      }
      break;
    }
  }
}
