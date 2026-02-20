
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
    difficulty: { speed: number; bombs: boolean; switching: boolean; suddenDeath: boolean; invisible: boolean; spin: boolean; strictTiming: boolean; oneTrack: boolean; level: string };
}

interface Lobby {
    id: string;
    hostId: string;
    players: Map<string, Player>;
    song: any | null;
    status: 'WAITING' | 'PLAYING' | 'FINISHED';
}

const lobbies = new Map<string, Lobby>();

// ═══════════════════════════════════════════════════════
// ── NeonDriftway Multiplayer (ndw: events) ──
// ═══════════════════════════════════════════════════════

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

function ndwBroadcastLobby(lobbyId: string): void {
    const lobby = ndwLobbies.get(lobbyId);
    if (!lobby) return;
    const players = Array.from(lobby.players.values()).map(p => ({
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

io.on("connection", (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    // ─── NDW: Join Lobby ───
    socket.on('ndw:joinLobby', (payload: { roomId?: string; playerName?: string }) => {
        const roomId = sanitizeLobbyId(payload?.roomId);
        const name = sanitizeUserName(payload?.playerName);
        let lobby = ndwLobbies.get(roomId);

        if (!lobby) {
            lobby = { id: roomId, hostId: socket.id, players: new Map(), status: 'WAITING', levelId: 1 };
            ndwLobbies.set(roomId, lobby);
        }
        if (lobby.players.size >= MAX_NDW_PLAYERS) return;
        if (lobby.status !== 'WAITING') return;

        const player: NDWPlayer = {
            id: socket.id, name, score: 0, speed: 0, distance: 0, x: 0, lane: 0,
            ready: false, finished: false, abilityCharges: 0, lastAbilityTime: 0,
        };
        lobby.players.set(socket.id, player);
        socket.join(`ndw:${roomId}`);
        ndwBroadcastLobby(roomId);
        console.log(`[NDW] ${name} joined lobby ${roomId}`);
    });

    // ─── NDW: Toggle Ready ───
    socket.on('ndw:toggleReady', (payload: { roomId?: string }) => {
        const roomId = sanitizeLobbyId(payload?.roomId);
        const lobby = ndwLobbies.get(roomId);
        if (!lobby) return;
        const player = lobby.players.get(socket.id);
        if (player) {
            player.ready = !player.ready;
            ndwBroadcastLobby(roomId);
        }
    });

    // ─── NDW: Start Game (host only) ───
    socket.on('ndw:startGame', (payload: { roomId?: string; levelId?: number }) => {
        const roomId = sanitizeLobbyId(payload?.roomId);
        const lobby = ndwLobbies.get(roomId);
        if (!lobby || lobby.hostId !== socket.id) return;
        if (lobby.status !== 'WAITING') return;

        lobby.levelId = typeof payload?.levelId === 'number' ? payload.levelId : 1;
        lobby.status = 'COUNTDOWN';
        lobby.players.forEach(p => { p.score = 0; p.speed = 0; p.distance = 0; p.finished = false; p.abilityCharges = 0; });

        io.to(`ndw:${roomId}`).emit('ndw:startCountdown', { countdownSeconds: 3, levelId: lobby.levelId });

        setTimeout(() => {
            if (lobby.status !== 'COUNTDOWN') return;
            lobby.status = 'PLAYING';
            io.to(`ndw:${roomId}`).emit('ndw:gameStarted', { levelId: lobby.levelId });
            ndwBroadcastLobby(roomId);
        }, 3000);
    });

    // ─── NDW: Player Update (10 Hz position relay) ───
    socket.on('ndw:playerUpdate', (payload: { roomId?: string; x?: number; speed?: number; distance?: number; score?: number; lane?: number }) => {
        const roomId = sanitizeLobbyId(payload?.roomId);
        const lobby = ndwLobbies.get(roomId);
        if (!lobby || lobby.status !== 'PLAYING') return;
        const player = lobby.players.get(socket.id);
        if (!player) return;

        player.x = typeof payload?.x === 'number' ? payload.x : player.x;
        player.speed = typeof payload?.speed === 'number' ? payload.speed : player.speed;
        player.distance = typeof payload?.distance === 'number' ? payload.distance : player.distance;
        player.score = typeof payload?.score === 'number' ? payload.score : player.score;
        player.lane = typeof payload?.lane === 'number' ? payload.lane : player.lane;

        socket.to(`ndw:${roomId}`).emit('ndw:playerUpdate', {
            id: socket.id,
            name: player.name,
            x: player.x,
            speed: player.speed,
            distance: player.distance,
            score: player.score,
            lane: player.lane,
        });
    });

    // ─── NDW: Score Update (2 Hz) ───
    socket.on('ndw:scoreUpdate', (payload: { roomId?: string; score?: number }) => {
        const roomId = sanitizeLobbyId(payload?.roomId);
        const lobby = ndwLobbies.get(roomId);
        if (!lobby) return;
        const player = lobby.players.get(socket.id);
        if (!player) return;
        player.score = typeof payload?.score === 'number' ? payload.score : player.score;

        socket.to(`ndw:${roomId}`).emit('ndw:scoreUpdate', { id: socket.id, score: player.score, name: player.name });
    });

    // ─── NDW: Ability Used ───
    socket.on('ndw:abilityUsed', (payload: { roomId?: string }) => {
        const roomId = sanitizeLobbyId(payload?.roomId);
        const lobby = ndwLobbies.get(roomId);
        if (!lobby || lobby.status !== 'PLAYING') return;
        const player = lobby.players.get(socket.id);
        if (!player) return;

        // Anti-cheat: check charges and cooldown
        if (player.abilityCharges <= 0) return;
        const now = Date.now();
        if (now - player.lastAbilityTime < ABILITY_COOLDOWN_MS) return;

        player.abilityCharges--;
        player.lastAbilityTime = now;

        // Pick random target (not self)
        const others = Array.from(lobby.players.keys()).filter(id => id !== socket.id && !lobby.players.get(id)!.finished);
        if (others.length === 0) return;
        const targetId = others[Math.floor(Math.random() * others.length)];

        io.to(`ndw:${roomId}`).emit('ndw:slowdownApplied', {
            senderId: socket.id,
            senderName: player.name,
            targetId,
        });
    });

    // ─── NDW: Player Finished ───
    socket.on('ndw:playerFinished', (payload: { roomId?: string; finalScore?: number }) => {
        const roomId = sanitizeLobbyId(payload?.roomId);
        const lobby = ndwLobbies.get(roomId);
        if (!lobby) return;
        const player = lobby.players.get(socket.id);
        if (!player) return;

        player.finished = true;
        player.score = typeof payload?.finalScore === 'number' ? payload.finalScore : player.score;

        io.to(`ndw:${roomId}`).emit('ndw:playerDisconnected', { id: socket.id, reason: 'finished' });

        // Check if all finished
        const allFinished = Array.from(lobby.players.values()).every(p => p.finished);
        if (allFinished) {
            lobby.status = 'WAITING';
            const rankings = Array.from(lobby.players.values())
                .sort((a, b) => b.score - a.score)
                .map((p, i) => ({ id: p.id, name: p.name, score: p.score, rank: i + 1 }));

            io.to(`ndw:${roomId}`).emit('ndw:gameOver', { rankings });
            lobby.players.forEach(p => { p.ready = false; p.finished = false; });
            ndwBroadcastLobby(roomId);
        }
    });

    // ─── NDW: Leave Lobby ───
    socket.on('ndw:leaveLobby', (payload: { roomId?: string }) => {
        const roomId = sanitizeLobbyId(payload?.roomId);
        const lobby = ndwLobbies.get(roomId);
        if (!lobby || !lobby.players.has(socket.id)) return;

        lobby.players.delete(socket.id);
        socket.leave(`ndw:${roomId}`);

        if (lobby.players.size === 0) {
            ndwLobbies.delete(roomId);
        } else {
            if (lobby.hostId === socket.id) {
                lobby.hostId = lobby.players.keys().next().value || '';
            }
            ndwBroadcastLobby(roomId);
        }
    });

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
            difficulty: { speed: 1.0, bombs: false, switching: false, suddenDeath: false, invisible: false, spin: false, strictTiming: false, oneTrack: false, level: 'normal' },
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
                    players: Array.from(lobby.players.values()).sort((a, b) => b.score - a.score)
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
                    spin: Boolean((d as { spin?: boolean }).spin),
                    strictTiming: Boolean((d as { strictTiming?: boolean }).strictTiming),
                    oneTrack: Boolean((d as { oneTrack?: boolean }).oneTrack),
                    level: typeof (d as { level?: string }).level === "string" ? (d as { level: string }).level.slice(0, 32) : "normal",
                }
                : { speed: 1.0, bombs: false, switching: false, suddenDeath: false, invisible: false, spin: false, strictTiming: false, oneTrack: false, level: "normal" };
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

        // Slice It lobby cleanup
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

        // NDW lobby cleanup
        for (const [roomId, lobby] of ndwLobbies.entries()) {
            if (lobby.players.has(socket.id)) {
                lobby.players.delete(socket.id);
                socket.leave(`ndw:${roomId}`);

                if (lobby.players.size === 0) {
                    ndwLobbies.delete(roomId);
                } else {
                    if (lobby.hostId === socket.id) {
                        lobby.hostId = lobby.players.keys().next().value || '';
                    }
                    io.to(`ndw:${roomId}`).emit('ndw:playerDisconnected', { id: socket.id, reason: 'disconnect' });
                    ndwBroadcastLobby(roomId);
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
