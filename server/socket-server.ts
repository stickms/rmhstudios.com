
import { Server, Socket } from "socket.io";
// No http server needed if standalone, but usually we wrap http.
// But standalone socket.io can listen on a port directly.
// We'll use http + socket.io for better control.

import { createServer } from "http";

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/socket/",
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});

const MAX_LOBBY_ID_LENGTH = 64;
const MAX_USER_NAME_LENGTH = 32;

function sanitizeLobbyId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[^a-zA-Z0-9-]/g, "").slice(0, MAX_LOBBY_ID_LENGTH) || "default";
}

function sanitizeUserName(raw: unknown): string {
  if (typeof raw !== "string") return "Player";
  return raw.trim().replace(/[^a-zA-Z0-9_\-. ]/g, "").slice(0, MAX_USER_NAME_LENGTH) || "Player";
}

interface Player {
    id: string; // Socket ID
    userId: string; // Account ID
    name: string;
    score: number;
    combo: number;
    health: number;
    isReady: boolean;
    isFinished: boolean;
    difficulty: { speed: number; bombs: boolean; switching: boolean; suddenDeath: boolean; invisible: boolean; level: string };
}

interface Lobby {
    id: string;
    hostId: string;
    players: Map<string, Player>;
    song: any | null;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
}

const lobbies = new Map<string, Lobby>();

io.on("connection", (socket: Socket) => {
  console.log(`Player connected: ${socket.id}`);

  // JOIN LOBBY
  socket.on("join_lobby", (payload: { lobbyId?: string; userName?: string; userId?: string }) => {
    const lobbyId = sanitizeLobbyId(payload?.lobbyId);
    const userName = sanitizeUserName(payload?.userName) || `Player ${Date.now().toString(36).slice(-4)}`;
    const userId = typeof payload?.userId === "string" ? payload.userId : "guest";

    let lobby = lobbies.get(lobbyId);
    
    // Create if not exists
    if (!lobby) {
        lobby = {
            id: lobbyId,
            hostId: socket.id,
            players: new Map(),
            song: null,
            status: 'WAITING'
        };
        lobbies.set(lobbyId, lobby);
    }
    
    if (!lobby) return;
    
    // Create Player
    const player: Player = {
        id: socket.id,
        userId,
        name: userName,
        score: 0,
        combo: 0,
        health: 100,
        isReady: false,
        isFinished: false,
        difficulty: { speed: 1.0, bombs: false, switching: false, suddenDeath: false, invisible: false, level: 'normal' },
    };
    
    lobby.players.set(socket.id, player);
    socket.join(lobbyId); // Socket.io room
    
    // Notify everyone in lobby
    io.to(lobbyId).emit("lobby_update", {
        lobbyId,
        players: Array.from(lobby.players.values()),
        hostId: lobby.hostId,
        status: lobby.status,
        song: lobby.song
    });
    
    console.log(`${player.name} joined lobby ${lobbyId}`);
  });
  
  // HOST SELECT SONG
  socket.on("select_song", (payload: { lobbyId?: string; song?: unknown }) => {
      const lobbyId = sanitizeLobbyId(payload?.lobbyId);
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== socket.id) return;
      
      lobby.song = payload?.song ?? null;
      io.to(lobbyId).emit("song_selected", { song: lobby.song });
      // Also update everyone with lobby status
      io.to(lobbyId).emit("lobby_update", {
        lobbyId,
        players: Array.from(lobby.players.values()),
        hostId: lobby.hostId,
        status: lobby.status,
        song: lobby.song
    });
  });

  // START GAME (Initiate Loading)
  socket.on("start_game", (payload: { lobbyId?: string }) => {
      const lobbyId = sanitizeLobbyId(payload?.lobbyId);
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== socket.id) return;
      
      if (!lobby.song) return;
      
      lobby.status = 'PLAYING';
      
      // Reset scores and set all to NOT READY (meaning not loaded)
      lobby.players.forEach(p => {
          p.score = 0;
          p.combo = 0;
          p.health = 100;
          p.isReady = false;
          p.isFinished = false;
      });

      // Broadcast updated lobby status so clients transition to the game screen
      io.to(lobbyId).emit("lobby_update", {
          lobbyId,
          players: Array.from(lobby.players.values()),
          hostId: lobby.hostId,
          status: lobby.status,
          song: lobby.song
      });
      
      // Emit signal to start loading assets
      io.to(lobbyId).emit("init_loading", { song: lobby.song });

      // Immediately broadcast loading status (all players unloaded)
      const initialLoadingStatus = Array.from(lobby.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          loaded: false
      }));
      io.to(lobbyId).emit("loading_update", { players: initialLoadingStatus });
  });

  // PLAYER LOADED (Ready to start countdown)
  socket.on("player_loaded", (payload: { lobbyId?: string }) => {
      const lobbyId = sanitizeLobbyId(payload?.lobbyId);
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      
      const player = lobby.players.get(socket.id);
      if (player) {
          player.isReady = true;
          console.log(`Player ${player.name} loaded in lobby ${lobbyId}`);

          // Broadcast per-player loading status to everyone
          const loadingStatus = Array.from(lobby.players.values()).map(p => ({
              id: p.id,
              name: p.name,
              loaded: p.isReady
          }));
          io.to(lobbyId).emit("loading_update", { players: loadingStatus });
          
          // Check if all loaded
          const allLoaded = Array.from(lobby.players.values()).every(p => p.isReady);
          
          if (allLoaded) {
              console.log(`All players loaded in ${lobbyId}. Starting countdown...`);
              // Reset isReady for "finished" tracking later
              lobby.players.forEach(p => { p.isReady = false; p.isFinished = false; });
              
              // Send relative countdown duration (avoids clock skew issues)
              io.to(lobbyId).emit("start_countdown", { countdownSeconds: 3 });
              
              setTimeout(() => {
                  io.to(lobbyId).emit("game_started");
                  io.to(lobbyId).emit("lobby_update", {
                    lobbyId,
                    players: Array.from(lobby.players.values()),
                    hostId: lobby.hostId,
                    status: lobby.status,
                    song: lobby.song
                  });
              }, 3000);
          }
      }
  });

  // SCORE UPDATE (Real-time)
  socket.on("score_update", (payload: { lobbyId?: string; score?: number; combo?: number; health?: number }) => {
      const lobbyId = sanitizeLobbyId(payload?.lobbyId);
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      
      const player = lobby.players.get(socket.id);
      if (player) {
          const score = typeof payload?.score === "number" ? payload.score : 0;
          const combo = typeof payload?.combo === "number" ? payload.combo : 0;
          const health = typeof payload?.health === "number" ? payload.health : 100;
          player.score = score;
          player.combo = combo;
          player.health = health;
          
          io.to(lobbyId).emit("player_update", {
              id: socket.id,
              score,
              combo,
              health
          });
      }
  });
  
  // PLAYER COMPLETED / DIED
  socket.on("player_finished", (payload: { lobbyId?: string; finalScore?: number }) => {
       const lobbyId = sanitizeLobbyId(payload?.lobbyId);
       const lobby = lobbies.get(lobbyId);
       if (!lobby) return;
       
       const player = lobby.players.get(socket.id);
       if (player) {
           const finalScore = typeof payload?.finalScore === "number" ? payload.finalScore : 0;
           player.isFinished = true;
           player.score = finalScore;
           
           io.to(lobbyId).emit("player_finished", { id: socket.id, finalScore });
           
           // Check if all finished
           const allFinished = Array.from(lobby.players.values()).every(p => p.isFinished);
           
           if (allFinished) {
               lobby.status = 'WAITING';
               io.to(lobbyId).emit("match_results", { 
                   players: Array.from(lobby.players.values()).sort((a,b) => b.score - a.score)
               });
               
               // Reset for next round
               lobby.players.forEach(p => { p.isReady = false; p.isFinished = false; });

               io.to(lobbyId).emit("lobby_update", {
                   lobbyId,
                   players: Array.from(lobby.players.values()),
                   hostId: lobby.hostId,
                   status: lobby.status,
                   song: lobby.song
               });
           }
       }
  });

  // LEAVE LOBBY (explicit)
  socket.on("leave_lobby", (payload: { lobbyId?: string }) => {
      const lobbyId = sanitizeLobbyId(payload?.lobbyId);
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      if (!lobby.players.has(socket.id)) return;

      lobby.players.delete(socket.id);
      socket.leave(lobbyId);

      if (lobby.players.size === 0) {
          lobbies.delete(lobbyId);
      } else {
          if (lobby.hostId === socket.id) {
              lobby.hostId = lobby.players.keys().next().value || '';
          }
          io.to(lobbyId).emit("lobby_update", {
              lobbyId,
              players: Array.from(lobby.players.values()),
              hostId: lobby.hostId,
              status: lobby.status,
              song: lobby.song
          });
      }
  });

  // RETURN TO LOBBY (host triggers all players back to lobby)
  socket.on("return_to_lobby", (payload: { lobbyId?: string }) => {
      const lobbyId = sanitizeLobbyId(payload?.lobbyId);
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      if (lobby.hostId !== socket.id) return; // Only host can trigger

      lobby.status = 'WAITING';
      // Reset player states for next round
      lobby.players.forEach(p => {
          p.score = 0;
          p.combo = 0;
          p.health = 100;
          p.isReady = false;
          p.isFinished = false;
      });

      // Notify all players to return to lobby
      io.to(lobbyId).emit("return_to_lobby", { lobbyId });
      io.to(lobbyId).emit("lobby_update", {
          lobbyId,
          players: Array.from(lobby.players.values()),
          hostId: lobby.hostId,
          status: lobby.status,
          song: lobby.song
      });
  });

  // TOGGLE READY
  socket.on("toggle_ready", (payload: { lobbyId?: string }) => {
      const lobbyId = sanitizeLobbyId(payload?.lobbyId);
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      const player = lobby.players.get(socket.id);
      if (player) {
          player.isReady = !player.isReady;
          io.to(lobbyId).emit("lobby_update", {
              lobbyId,
              players: Array.from(lobby.players.values()),
              hostId: lobby.hostId,
              status: lobby.status,
              song: lobby.song
          });
      }
  });

  // UPDATE DIFFICULTY
  socket.on("update_difficulty", (payload: { lobbyId?: string; difficulty?: unknown }) => {
      const lobbyId = sanitizeLobbyId(payload?.lobbyId);
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;
      const player = lobby.players.get(socket.id);
      if (player) {
          const d = payload?.difficulty;
          player.difficulty = d && typeof d === "object" && !Array.isArray(d)
            ? {
                speed: typeof (d as { speed?: number }).speed === "number" ? (d as { speed: number }).speed : 1.0,
                bombs: Boolean((d as { bombs?: boolean }).bombs),
                switching: Boolean((d as { switching?: boolean }).switching),
                suddenDeath: Boolean((d as { suddenDeath?: boolean }).suddenDeath),
                invisible: Boolean((d as { invisible?: boolean }).invisible),
                level: typeof (d as { level?: string }).level === "string" ? (d as { level: string }).level.slice(0, 32) : "normal",
              }
            : { speed: 1.0, bombs: false, switching: false, suddenDeath: false, invisible: false, level: "normal" };
          io.to(lobbyId).emit("lobby_update", {
              lobbyId,
              players: Array.from(lobby.players.values()),
              hostId: lobby.hostId,
              status: lobby.status,
              song: lobby.song
          });
      }
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Find lobby
    for (const [lobbyId, lobby] of lobbies.entries()) {
        if (lobby.players.has(socket.id)) {
            lobby.players.delete(socket.id);
            
            if (lobby.players.size === 0) {
                lobbies.delete(lobbyId);
            } else {
                // If host left, assign new host
                if (lobby.hostId === socket.id) {
                    lobby.hostId = lobby.players.keys().next().value || '';
                }
                
                io.to(lobbyId).emit("lobby_update", {
                    lobbyId,
                    players: Array.from(lobby.players.values()),
                    hostId: lobby.hostId,
                    status: lobby.status,
                    song: lobby.song
                });
            }
            break; 
        }
    }
  });
});

const PORT = 7001;
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on http://localhost:${PORT}`);
});
