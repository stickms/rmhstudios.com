import 'dotenv/config';
import { Server, Socket } from "socket.io";
import { createServer } from "http";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

// ═══════════════════════════════════════════════════════
// ── Synapse Storm Multiplayer (ss: events) ──
// ═══════════════════════════════════════════════════════

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface SSPlayer {
    socketId: string;
    userId: string;
    displayName: string;
    isReady: boolean;
    isHost: boolean;
}

interface SSMatchPlayer {
    userId: string;
    displayName: string;
    score: number;
    maxCombo: number;
    puzzlesSolved: number;
    puzzlesMissed: number;
    finished: boolean;
    lastUpdateAt: number;
    lastScore: number;
}

interface SSLobbyInMemory {
    id: string;
    code: string;
    hostUserId: string;
    status: 'WAITING' | 'IN_MATCH' | 'CLOSED';
    players: Map<string, SSPlayer>; // keyed by userId
    currentMatchId: string | null;
    currentMatchSeed: number | null;
    currentMatchStartAt: number | null;
    matchPlayers: Map<string, SSMatchPlayer>; // keyed by userId
}

const ssLobbies = new Map<string, SSLobbyInMemory>(); // keyed by code
const ssUserSocketMap = new Map<string, string>(); // userId -> socketId
const ssSocketUserMap = new Map<string, string>(); // socketId -> userId
const ssSocketLobbyMap = new Map<string, string>(); // socketId -> lobbyCode

const MAX_SS_PLAYERS = 8;
const SCORE_RATE_LIMIT = 5000; // max score increase per 5 seconds
const SCORE_UPDATE_INTERVAL = 5000; // ms between server-side rate checks

function generateLobbyCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function ssGetLobbyByCode(code: string): SSLobbyInMemory | undefined {
    return ssLobbies.get(code.toUpperCase());
}

function ssBroadcastLobby(lobby: SSLobbyInMemory): void {
    const players = Array.from(lobby.players.values()).map(p => ({
        id: p.socketId,
        userId: p.userId,
        displayName: p.displayName,
        isReady: p.isReady,
        isHost: p.isHost,
    }));
    io.to(`ss:${lobby.code}`).emit('ss:lobbyUpdate', {
        lobbyId: lobby.id,
        code: lobby.code,
        status: lobby.status,
        players,
        hostUserId: lobby.hostUserId,
    });
}

function ssBroadcastLeaderboard(lobby: SSLobbyInMemory): void {
    const leaderboard = Array.from(lobby.matchPlayers.values())
        .sort((a, b) => b.score - a.score)
        .map(p => ({
            userId: p.userId,
            displayName: p.displayName,
            score: p.score,
            maxCombo: p.maxCombo,
            puzzlesSolved: p.puzzlesSolved,
            puzzlesMissed: p.puzzlesMissed,
            finished: p.finished,
        }));
    io.to(`ss:${lobby.code}`).emit('ss:leaderboardUpdate', { leaderboard });
}

function ssRemovePlayer(socketId: string): void {
    const userId = ssSocketUserMap.get(socketId);
    const lobbyCode = ssSocketLobbyMap.get(socketId);
    if (!userId || !lobbyCode) return;

    const lobby = ssLobbies.get(lobbyCode);
    if (!lobby) return;

    lobby.players.delete(userId);
    ssUserSocketMap.delete(userId);
    ssSocketUserMap.delete(socketId);
    ssSocketLobbyMap.delete(socketId);

    if (lobby.players.size === 0) {
        ssLobbies.delete(lobbyCode);
        return;
    }

    // Host migration
    if (lobby.hostUserId === userId) {
        const newHost = lobby.players.values().next().value;
        if (newHost) {
            lobby.hostUserId = newHost.userId;
            newHost.isHost = true;
        }
    }

    ssBroadcastLobby(lobby);

    if (lobby.status === 'IN_MATCH') {
        ssBroadcastLeaderboard(lobby);
    }
}

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

    // ═══════════════════════════════════════════════════════
    // ── Synapse Storm Events ──
    // ═══════════════════════════════════════════════════════

    socket.on('ss:timeSync', (payload: { clientTime?: number }) => {
        const clientTime = typeof payload?.clientTime === 'number' ? payload.clientTime : Date.now();
        socket.emit('ss:timeSync', { serverTime: Date.now(), clientTime });
    });

    socket.on('ss:createLobby', async (payload: { userId?: string; displayName?: string }) => {
        const userId = typeof payload?.userId === 'string' ? payload.userId : '';
        const displayName = sanitizeUserName(payload?.displayName);
        if (!userId) { socket.emit('ss:error', { message: 'Missing userId' }); return; }

        // Leave existing lobby if any
        ssRemovePlayer(socket.id);

        let code = generateLobbyCode();
        let attempts = 0;
        while (ssLobbies.has(code) && attempts < 20) { code = generateLobbyCode(); attempts++; }

        let dbLobby;
        try {
            dbLobby = await prisma.sSLobby.create({
                data: { code, hostUserId: userId, status: 'WAITING' },
            });
        } catch (err) {
            console.error('[SS] Failed to create lobby in DB:', err);
            socket.emit('ss:error', { message: 'Failed to create lobby' });
            return;
        }

        const lobby: SSLobbyInMemory = {
            id: dbLobby.id,
            code,
            hostUserId: userId,
            status: 'WAITING',
            players: new Map(),
            currentMatchId: null,
            currentMatchSeed: null,
            currentMatchStartAt: null,
            matchPlayers: new Map(),
        };

        const player: SSPlayer = { socketId: socket.id, userId, displayName, isReady: false, isHost: true };
        lobby.players.set(userId, player);
        ssLobbies.set(code, lobby);
        ssUserSocketMap.set(userId, socket.id);
        ssSocketUserMap.set(socket.id, userId);
        ssSocketLobbyMap.set(socket.id, code);

        socket.join(`ss:${code}`);

        try {
            await prisma.sSLobbyMember.upsert({
                where: { lobbyId_userId: { lobbyId: dbLobby.id, userId } },
                update: { displayName, isHost: true, lastSeenAt: new Date() },
                create: { lobbyId: dbLobby.id, userId, displayName, isHost: true },
            });
        } catch (err) {
            console.error('[SS] Failed to upsert lobby member:', err);
        }

        ssBroadcastLobby(lobby);
        console.log(`[SS] ${displayName} created lobby ${code}`);
    });

    socket.on('ss:joinLobby', async (payload: { code?: string; userId?: string; displayName?: string }) => {
        const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase().trim();
        const userId = typeof payload?.userId === 'string' ? payload.userId : '';
        const displayName = sanitizeUserName(payload?.displayName);
        if (!code || !userId) { socket.emit('ss:error', { message: 'Missing code or userId' }); return; }

        const lobby = ssGetLobbyByCode(code);
        if (!lobby) { socket.emit('ss:error', { message: 'Lobby not found' }); return; }
        if (lobby.status === 'CLOSED') { socket.emit('ss:error', { message: 'Lobby is closed' }); return; }
        if (lobby.players.size >= MAX_SS_PLAYERS && !lobby.players.has(userId)) {
            socket.emit('ss:error', { message: 'Lobby is full' }); return;
        }

        // If this user already in a different lobby, remove them
        const existingCode = ssSocketLobbyMap.get(socket.id);
        if (existingCode && existingCode !== code) ssRemovePlayer(socket.id);

        // Clean up old socket mapping for this userId (reconnect case)
        const oldSocketId = ssUserSocketMap.get(userId);
        if (oldSocketId && oldSocketId !== socket.id) {
            ssSocketUserMap.delete(oldSocketId);
            ssSocketLobbyMap.delete(oldSocketId);
        }

        const isHost = lobby.players.size === 0 || lobby.hostUserId === userId;
        const player: SSPlayer = {
            socketId: socket.id, userId, displayName,
            isReady: lobby.players.get(userId)?.isReady ?? false,
            isHost,
        };
        lobby.players.set(userId, player);
        ssUserSocketMap.set(userId, socket.id);
        ssSocketUserMap.set(socket.id, userId);
        ssSocketLobbyMap.set(socket.id, code);

        socket.join(`ss:${code}`);

        try {
            await prisma.sSLobbyMember.upsert({
                where: { lobbyId_userId: { lobbyId: lobby.id, userId } },
                update: { displayName, lastSeenAt: new Date(), isHost },
                create: { lobbyId: lobby.id, userId, displayName, isHost },
            });
        } catch (err) {
            console.error('[SS] Failed to upsert lobby member:', err);
        }

        ssBroadcastLobby(lobby);

        // If match is in progress, send match state for reconnection
        if (lobby.status === 'IN_MATCH' && lobby.currentMatchId && lobby.currentMatchSeed !== null && lobby.currentMatchStartAt !== null) {
            const leaderboard = Array.from(lobby.matchPlayers.values())
                .sort((a, b) => b.score - a.score)
                .map(p => ({
                    userId: p.userId, displayName: p.displayName,
                    score: p.score, maxCombo: p.maxCombo,
                    puzzlesSolved: p.puzzlesSolved, puzzlesMissed: p.puzzlesMissed,
                    finished: p.finished,
                }));
            socket.emit('ss:matchStart', {
                matchId: lobby.currentMatchId,
                seed: lobby.currentMatchSeed,
                startAt: lobby.currentMatchStartAt,
                status: 'RUNNING',
                leaderboard,
            });
        }

        console.log(`[SS] ${displayName} joined lobby ${code}`);
    });

    socket.on('ss:leaveLobby', (payload: { code?: string; userId?: string }) => {
        ssRemovePlayer(socket.id);
        const code = typeof payload?.code === 'string' ? payload.code.toUpperCase() : '';
        if (code) socket.leave(`ss:${code}`);
    });

    socket.on('ss:toggleReady', (payload: { code?: string; userId?: string }) => {
        const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
        const userId = typeof payload?.userId === 'string' ? payload.userId : '';
        const lobby = ssGetLobbyByCode(code);
        if (!lobby) return;
        const player = lobby.players.get(userId);
        if (!player) return;
        player.isReady = !player.isReady;
        ssBroadcastLobby(lobby);
    });

    socket.on('ss:startMatch', async (payload: { code?: string; userId?: string }) => {
        const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
        const userId = typeof payload?.userId === 'string' ? payload.userId : '';
        const lobby = ssGetLobbyByCode(code);
        if (!lobby) { socket.emit('ss:error', { message: 'Lobby not found' }); return; }
        if (lobby.hostUserId !== userId) { socket.emit('ss:error', { message: 'Only host can start' }); return; }
        if (lobby.status !== 'WAITING') { socket.emit('ss:error', { message: 'Lobby not in waiting state' }); return; }
        if (lobby.players.size < 1) { socket.emit('ss:error', { message: 'Need at least 1 player' }); return; }

        const seed = Math.floor(Math.random() * 2147483647);
        const countdownMs = 3000;
        const startAt = Date.now() + countdownMs;

        let dbMatch;
        try {
            dbMatch = await prisma.sSMatch.create({
                data: {
                    lobbyId: lobby.id,
                    seed,
                    startAt: new Date(startAt),
                    status: 'RUNNING',
                },
            });
        } catch (err) {
            console.error('[SS] Failed to create match in DB:', err);
            socket.emit('ss:error', { message: 'Failed to start match' });
            return;
        }

        lobby.status = 'IN_MATCH';
        lobby.currentMatchId = dbMatch.id;
        lobby.currentMatchSeed = seed;
        lobby.currentMatchStartAt = startAt;
        lobby.matchPlayers.clear();

        const playerMatchCreates: Promise<unknown>[] = [];
        for (const [uid, p] of lobby.players) {
            lobby.matchPlayers.set(uid, {
                userId: uid,
                displayName: p.displayName,
                score: 0, maxCombo: 0, puzzlesSolved: 0, puzzlesMissed: 0,
                finished: false, lastUpdateAt: Date.now(), lastScore: 0,
            });
            playerMatchCreates.push(
                prisma.sSPlayerMatch.create({
                    data: {
                        matchId: dbMatch.id,
                        lobbyId: lobby.id,
                        userId: uid,
                        displayName: p.displayName,
                    },
                }).catch(err => console.error('[SS] Failed to create player match:', err))
            );
        }
        await Promise.all(playerMatchCreates);

        try {
            await prisma.sSLobby.update({ where: { id: lobby.id }, data: { status: 'IN_MATCH' } });
        } catch (err) {
            console.error('[SS] Failed to update lobby status:', err);
        }

        // Send countdown
        io.to(`ss:${code}`).emit('ss:countdown', { countdownEndsAt: startAt });

        ssBroadcastLobby(lobby);

        // After countdown, send match start
        setTimeout(() => {
            const leaderboard = Array.from(lobby.matchPlayers.values())
                .sort((a, b) => b.score - a.score)
                .map(p => ({
                    userId: p.userId, displayName: p.displayName,
                    score: p.score, maxCombo: p.maxCombo,
                    puzzlesSolved: p.puzzlesSolved, puzzlesMissed: p.puzzlesMissed,
                    finished: p.finished,
                }));
            io.to(`ss:${code}`).emit('ss:matchStart', {
                matchId: dbMatch.id,
                seed,
                startAt,
                status: 'RUNNING',
                leaderboard,
            });
        }, countdownMs);

        console.log(`[SS] Match started in lobby ${code}, seed=${seed}`);
    });

    socket.on('ss:scoreUpdate', (payload: {
        matchId?: string; userId?: string; displayName?: string;
        score?: number; maxCombo?: number; puzzlesSolved?: number; puzzlesMissed?: number;
    }) => {
        const userId = typeof payload?.userId === 'string' ? payload.userId : '';
        const lobbyCode = ssSocketLobbyMap.get(socket.id);
        if (!lobbyCode) return;
        const lobby = ssGetLobbyByCode(lobbyCode);
        if (!lobby || lobby.status !== 'IN_MATCH') return;

        const mp = lobby.matchPlayers.get(userId);
        if (!mp || mp.finished) return;

        const newScore = typeof payload?.score === 'number' ? payload.score : mp.score;

        // Anti-cheat: score cannot decrease
        if (newScore < mp.score) return;

        // Anti-cheat: rate limit score growth
        const now = Date.now();
        const elapsed = Math.max(1, now - mp.lastUpdateAt);
        const scoreDelta = newScore - mp.lastScore;
        if (elapsed < SCORE_UPDATE_INTERVAL && scoreDelta > SCORE_RATE_LIMIT) {
            console.warn(`[SS] Score rate limit exceeded for ${userId}: delta=${scoreDelta} in ${elapsed}ms`);
            return;
        }

        const newSolved = typeof payload?.puzzlesSolved === 'number' ? payload.puzzlesSolved : mp.puzzlesSolved;
        const solvedDelta = newSolved - mp.puzzlesSolved;
        if (solvedDelta > 10) {
            console.warn(`[SS] Puzzle solved jump too high for ${userId}: delta=${solvedDelta}`);
            return;
        }

        mp.score = newScore;
        mp.maxCombo = Math.max(mp.maxCombo, typeof payload?.maxCombo === 'number' ? payload.maxCombo : 0);
        mp.puzzlesSolved = newSolved;
        mp.puzzlesMissed = typeof payload?.puzzlesMissed === 'number' ? payload.puzzlesMissed : mp.puzzlesMissed;
        mp.lastUpdateAt = now;
        mp.lastScore = newScore;

        ssBroadcastLeaderboard(lobby);

        // Persist score (throttled at server level, only write on significant changes)
        if (scoreDelta >= 500 || solvedDelta >= 5) {
            prisma.sSPlayerMatch.updateMany({
                where: { matchId: lobby.currentMatchId!, userId },
                data: {
                    score: mp.score,
                    maxCombo: mp.maxCombo,
                    puzzlesSolved: mp.puzzlesSolved,
                    puzzlesMissed: mp.puzzlesMissed,
                    lastUpdateAt: new Date(),
                },
            }).catch(err => console.error('[SS] Failed to update player match score:', err));
        }
    });

    socket.on('ss:finishMatch', async (payload: {
        matchId?: string; userId?: string;
        score?: number; maxCombo?: number; puzzlesSolved?: number; puzzlesMissed?: number;
    }) => {
        const userId = typeof payload?.userId === 'string' ? payload.userId : '';
        const lobbyCode = ssSocketLobbyMap.get(socket.id);
        if (!lobbyCode) return;
        const lobby = ssGetLobbyByCode(lobbyCode);
        if (!lobby || lobby.status !== 'IN_MATCH') return;

        const mp = lobby.matchPlayers.get(userId);
        if (!mp) return;

        mp.finished = true;
        mp.score = typeof payload?.score === 'number' ? Math.max(mp.score, payload.score) : mp.score;
        mp.maxCombo = Math.max(mp.maxCombo, typeof payload?.maxCombo === 'number' ? payload.maxCombo : 0);
        mp.puzzlesSolved = typeof payload?.puzzlesSolved === 'number' ? payload.puzzlesSolved : mp.puzzlesSolved;
        mp.puzzlesMissed = typeof payload?.puzzlesMissed === 'number' ? payload.puzzlesMissed : mp.puzzlesMissed;

        try {
            await prisma.sSPlayerMatch.updateMany({
                where: { matchId: lobby.currentMatchId!, userId },
                data: {
                    score: mp.score, maxCombo: mp.maxCombo,
                    puzzlesSolved: mp.puzzlesSolved, puzzlesMissed: mp.puzzlesMissed,
                    finishedAt: new Date(), lastUpdateAt: new Date(),
                },
            });
        } catch (err) {
            console.error('[SS] Failed to update finished player:', err);
        }

        ssBroadcastLeaderboard(lobby);

        // Check if all players finished
        const allFinished = Array.from(lobby.matchPlayers.values()).every(p => p.finished);
        if (allFinished) {
            lobby.status = 'WAITING';
            try {
                await prisma.sSMatch.update({
                    where: { id: lobby.currentMatchId! },
                    data: { status: 'FINISHED', endAt: new Date() },
                });
                await prisma.sSLobby.update({
                    where: { id: lobby.id },
                    data: { status: 'WAITING' },
                });
            } catch (err) {
                console.error('[SS] Failed to finish match in DB:', err);
            }

            const finalLeaderboard = Array.from(lobby.matchPlayers.values())
                .sort((a, b) => b.score - a.score)
                .map(p => ({
                    userId: p.userId, displayName: p.displayName,
                    score: p.score, maxCombo: p.maxCombo,
                    puzzlesSolved: p.puzzlesSolved, puzzlesMissed: p.puzzlesMissed,
                    finished: p.finished,
                }));
            io.to(`ss:${lobby.code}`).emit('ss:matchFinished', { leaderboard: finalLeaderboard });

            // Reset ready state
            for (const p of lobby.players.values()) p.isReady = false;
            ssBroadcastLobby(lobby);
            console.log(`[SS] Match finished in lobby ${lobby.code}`);
        }
    });

    socket.on('ss:returnToLobby', async (payload: { code?: string; userId?: string }) => {
        const code = (typeof payload?.code === 'string' ? payload.code : '').toUpperCase();
        const userId = typeof payload?.userId === 'string' ? payload.userId : '';
        const lobby = ssGetLobbyByCode(code);
        if (!lobby) return;
        if (lobby.hostUserId !== userId) return;

        lobby.status = 'WAITING';
        lobby.matchPlayers.clear();
        lobby.currentMatchId = null;
        lobby.currentMatchSeed = null;
        lobby.currentMatchStartAt = null;

        for (const p of lobby.players.values()) p.isReady = false;

        try {
            await prisma.sSLobby.update({ where: { id: lobby.id }, data: { status: 'WAITING' } });
        } catch (err) {
            console.error('[SS] Failed to update lobby to WAITING:', err);
        }

        io.to(`ss:${code}`).emit('ss:returnToLobby');
        ssBroadcastLobby(lobby);
    });

    // DISCONNECT
    socket.on("disconnect", () => {
        console.log(`Player disconnected: ${socket.id}`);

        // Synapse Storm cleanup (soft - keep player in match for reconnect)
        const ssUserId = ssSocketUserMap.get(socket.id);
        if (ssUserId) {
            const ssLobbyCode = ssSocketLobbyMap.get(socket.id);
            if (ssLobbyCode) {
                const ssLobby = ssLobbies.get(ssLobbyCode);
                if (ssLobby && ssLobby.status !== 'IN_MATCH') {
                    ssRemovePlayer(socket.id);
                } else {
                    // During match, just clear socket mappings but keep player data
                    ssSocketUserMap.delete(socket.id);
                    ssSocketLobbyMap.delete(socket.id);
                }
            }
        }

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
