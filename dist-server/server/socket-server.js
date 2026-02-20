"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_1 = require("socket.io");
// No http server needed if standalone, but usually we wrap http.
// But standalone socket.io can listen on a port directly.
// We'll use http + socket.io for better control.
const http_1 = require("http");
const httpServer = (0, http_1.createServer)();
const io = new socket_io_1.Server(httpServer, {
    path: "/socket/",
    cors: {
        origin: "*", // Allow all origins for dev
        methods: ["GET", "POST"]
    }
});
const lobbies = new Map();
io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);
    // JOIN LOBBY
    socket.on("join_lobby", ({ lobbyId, userName, userId }) => {
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
        if (!lobby)
            return;
        // Create Player
        const player = {
            id: socket.id,
            userId: userId || 'guest',
            name: userName || `Player ${lobby.players.size + 1}`,
            score: 0,
            combo: 0,
            health: 100,
            isReady: false
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
    socket.on("select_song", ({ lobbyId, song }) => {
        const lobby = lobbies.get(lobbyId);
        if (!lobby)
            return;
        if (lobby.hostId !== socket.id)
            return;
        lobby.song = song;
        io.to(lobbyId).emit("song_selected", { song });
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
    socket.on("start_game", ({ lobbyId }) => {
        const lobby = lobbies.get(lobbyId);
        if (!lobby)
            return;
        if (lobby.hostId !== socket.id)
            return;
        if (!lobby.song)
            return;
        lobby.status = 'PLAYING';
        // Reset scores and set all to NOT READY (meaning not loaded)
        lobby.players.forEach(p => {
            p.score = 0;
            p.combo = 0;
            p.health = 100;
            p.isReady = false;
        });
        // Emit signal to start loading assets
        io.to(lobbyId).emit("init_loading", { song: lobby.song });
    });
    // PLAYER LOADED (Ready to start countdown)
    socket.on("player_loaded", ({ lobbyId }) => {
        const lobby = lobbies.get(lobbyId);
        if (!lobby)
            return;
        const player = lobby.players.get(socket.id);
        if (player) {
            player.isReady = true;
            console.log(`Player ${player.name} loaded in lobby ${lobbyId}`);
            // Check if all loaded
            const allLoaded = Array.from(lobby.players.values()).every(p => p.isReady);
            if (allLoaded) {
                console.log(`All players loaded in ${lobbyId}. Starting countdown...`);
                // Reset isReady for "finished" tracking later
                lobby.players.forEach(p => p.isReady = false);
                const startTime = Date.now() + 3000;
                io.to(lobbyId).emit("start_countdown", { startTime });
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
    socket.on("score_update", ({ lobbyId, score, combo, health }) => {
        const lobby = lobbies.get(lobbyId);
        if (!lobby)
            return;
        const player = lobby.players.get(socket.id);
        if (player) {
            player.score = score;
            player.combo = combo;
            player.health = health;
            // Broadcast to others (or everyone including self for consistent state)
            // Optimized: throttle this? 
            // For now, emit to everyone.
            io.to(lobbyId).emit("player_update", {
                id: socket.id,
                score,
                combo,
                health
            });
        }
    });
    // PLAYER COMPLETED / DIED
    socket.on("player_finished", ({ lobbyId, finalScore }) => {
        const lobby = lobbies.get(lobbyId);
        if (!lobby)
            return;
        const player = lobby.players.get(socket.id);
        if (player) {
            player.isReady = true; // Mark as finished using isReady flag
            player.score = finalScore;
            io.to(lobbyId).emit("player_finished", { id: socket.id, finalScore });
            // Check if all finished
            // Note: "isReady" is reused here to mean "finished" during PLAYING state.
            const allFinished = Array.from(lobby.players.values()).every(p => p.isReady || p.health <= 0);
            if (allFinished) {
                lobby.status = 'FINISHED';
                io.to(lobbyId).emit("match_results", {
                    players: Array.from(lobby.players.values()).sort((a, b) => b.score - a.score)
                });
                // Reset status to waiting after a delay? Or keep as FINISHED until host returns to lobby.
                // Let's set it to WAITING so they can pick next song, but UI handles showing results first.
                lobby.status = 'WAITING';
                lobby.players.forEach(p => p.isReady = false);
            }
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
                }
                else {
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
