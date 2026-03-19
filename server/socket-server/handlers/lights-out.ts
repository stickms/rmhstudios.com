/**
 * Lights Out — Race Lobby Handler
 *
 * WebSocket-based lobby system for the Discord Activity race mode.
 * Follows the same pattern as rmhtype.ts: in-memory rooms, socket.io broadcast.
 */

import type { Server, Socket } from 'socket.io';
import { checkRateLimit } from '../rate-limit';

// ─── Types ──────────────────────────────────────────────────────────

type LobbyPhase = 'waiting' | 'countdown' | 'racing' | 'results';

interface LobbyParticipant {
    discordId: string;
    username: string;
    avatar: string | null;
    socketId: string;
    ready: boolean;
    status: 'idle' | 'solving' | 'solved' | 'dnf';
    moves: number;
    finishedAt: number | null;
    joinedAt: number;
}

interface LobbyEntry {
    phase: LobbyPhase;
    hostId: string;
    participants: LobbyParticipant[];
    seed: number | null;
    roundNumber: number;
    countdownStartedAt: number | null;
    raceStartedAt: number | null;
    countdownTimer: ReturnType<typeof setTimeout> | null;
    lastUpdated: number;
}

// ─── State ──────────────────────────────────────────────────────────

const lobbies = new Map<string, LobbyEntry>();
const socketLobbyMap = new Map<string, string>(); // socketId → instanceId

const LOBBY_TTL_MS = 30 * 60 * 1000;
const COUNTDOWN_MS = 3000;

// GC sweep every 5 minutes
const gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of lobbies) {
        if (now - entry.lastUpdated > LOBBY_TTL_MS) {
            if (entry.countdownTimer) clearTimeout(entry.countdownTimer);
            lobbies.delete(key);
        }
    }
}, 5 * 60 * 1000);
if (gcTimer && typeof gcTimer === 'object' && 'unref' in gcTimer) gcTimer.unref();

// ─── Helpers ────────────────────────────────────────────────────────

function roomName(instanceId: string): string {
    return `lights-out:${instanceId}`;
}

function generateSeed(instanceId: string, roundNumber: number): number {
    const str = `${instanceId}:${roundNumber}:${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function serializeLobby(lobby: LobbyEntry) {
    return {
        phase: lobby.phase,
        hostId: lobby.hostId,
        seed: lobby.seed,
        roundNumber: lobby.roundNumber,
        countdownStartedAt: lobby.countdownStartedAt,
        raceStartedAt: lobby.raceStartedAt,
        participants: lobby.participants.map(p => ({
            discordId: p.discordId,
            username: p.username,
            avatar: p.avatar,
            ready: p.ready,
            status: p.status,
            moves: p.moves,
            finishedAt: p.finishedAt,
        })),
    };
}

function broadcast(io: Server, instanceId: string, lobby: LobbyEntry) {
    io.to(roomName(instanceId)).emit('lights-out:state', serializeLobby(lobby));
}

function reassignHost(lobby: LobbyEntry): void {
    if (lobby.participants.length === 0) return;
    if (lobby.participants.some(p => p.discordId === lobby.hostId)) return;
    const earliest = lobby.participants.reduce((a, b) => a.joinedAt < b.joinedAt ? a : b);
    lobby.hostId = earliest.discordId;
}

function checkRaceComplete(lobby: LobbyEntry): boolean {
    if (lobby.phase !== 'racing') return false;
    const racers = lobby.participants.filter(p => p.status === 'solving' || p.status === 'solved' || p.status === 'dnf');
    if (racers.length === 0) return false;
    if (racers.every(p => p.status === 'solved' || p.status === 'dnf')) {
        lobby.phase = 'results';
        return true;
    }
    return false;
}

function removeLobbyIfEmpty(instanceId: string, lobby: LobbyEntry): boolean {
    if (lobby.participants.length === 0) {
        if (lobby.countdownTimer) clearTimeout(lobby.countdownTimer);
        lobbies.delete(instanceId);
        return true;
    }
    return false;
}

// ─── Handler Registration ───────────────────────────────────────────

export function registerLightsOutHandlers(io: Server, socket: Socket): void {

    // ── Join ──────────────────────────────────────────────────────────
    socket.on('lights-out:join', (payload: {
        instanceId: string;
        discordId: string;
        username: string;
        avatar: string | null;
    }) => {
        if (!checkRateLimit(socket.id, 'lights-out:join')) {
            socket.emit('lights-out:error', { message: 'Rate limit exceeded' });
            return;
        }

        const { instanceId, discordId, username, avatar } = payload;
        if (!instanceId || !discordId) return;

        const now = Date.now();
        let lobby = lobbies.get(instanceId);

        if (!lobby) {
            lobby = {
                phase: 'waiting',
                hostId: discordId,
                participants: [],
                seed: null,
                roundNumber: 0,
                countdownStartedAt: null,
                raceStartedAt: null,
                countdownTimer: null,
                lastUpdated: now,
            };
            lobbies.set(instanceId, lobby);
        }

        // Check if reconnecting
        const existing = lobby.participants.find(p => p.discordId === discordId);
        if (existing) {
            // Leave old socket room if different
            if (existing.socketId !== socket.id) {
                const oldSocket = io.sockets.sockets.get(existing.socketId);
                oldSocket?.leave(roomName(instanceId));
                socketLobbyMap.delete(existing.socketId);
            }
            existing.socketId = socket.id;
            existing.username = username ?? existing.username;
            existing.avatar = avatar ?? existing.avatar;
        } else {
            lobby.participants.push({
                discordId,
                username: username ?? 'Unknown',
                avatar: avatar ?? null,
                socketId: socket.id,
                ready: false,
                status: lobby.phase === 'racing' || lobby.phase === 'countdown' ? 'idle' : 'idle',
                moves: 0,
                finishedAt: null,
                joinedAt: now,
            });
        }

        socket.join(roomName(instanceId));
        socketLobbyMap.set(socket.id, instanceId);
        lobby.lastUpdated = now;
        broadcast(io, instanceId, lobby);
    });

    // ── Ready ─────────────────────────────────────────────────────────
    socket.on('lights-out:ready', (payload: {
        instanceId: string;
        discordId: string;
        ready: boolean;
    }) => {
        if (!checkRateLimit(socket.id, 'lights-out:ready')) return;

        const { instanceId, discordId, ready } = payload;
        const lobby = lobbies.get(instanceId);
        if (!lobby || lobby.phase !== 'waiting') return;

        const p = lobby.participants.find(x => x.discordId === discordId);
        if (!p) return;

        p.ready = !!ready;
        lobby.lastUpdated = Date.now();
        broadcast(io, instanceId, lobby);
    });

    // ── Start ─────────────────────────────────────────────────────────
    socket.on('lights-out:start', (payload: {
        instanceId: string;
        discordId: string;
    }) => {
        if (!checkRateLimit(socket.id, 'lights-out:start')) return;

        const { instanceId, discordId } = payload;
        const lobby = lobbies.get(instanceId);
        if (!lobby || lobby.phase !== 'waiting') return;
        if (lobby.hostId !== discordId) return;

        const host = lobby.participants.find(p => p.discordId === discordId);
        if (!host?.ready) return;

        const now = Date.now();
        lobby.roundNumber += 1;
        lobby.seed = generateSeed(instanceId, lobby.roundNumber);
        lobby.phase = 'countdown';
        lobby.countdownStartedAt = now;
        lobby.raceStartedAt = null;

        for (const p of lobby.participants) {
            p.status = p.ready ? 'solving' : 'idle';
            p.moves = 0;
            p.finishedAt = null;
            p.ready = false;
        }

        lobby.lastUpdated = now;
        broadcast(io, instanceId, lobby);

        // Auto-transition to racing after countdown
        lobby.countdownTimer = setTimeout(() => {
            lobby.countdownTimer = null;
            if (lobby.phase !== 'countdown') return; // may have been cancelled
            lobby.phase = 'racing';
            lobby.raceStartedAt = Date.now();
            lobby.lastUpdated = Date.now();
            broadcast(io, instanceId, lobby);
        }, COUNTDOWN_MS);
    });

    // ── Update (during race) ──────────────────────────────────────────
    socket.on('lights-out:update', (payload: {
        instanceId: string;
        discordId: string;
        status?: string;
        moves?: number;
        finishedAt?: number | null;
    }) => {
        if (!checkRateLimit(socket.id, 'lights-out:update')) return;

        const { instanceId, discordId, status, moves, finishedAt } = payload;
        const lobby = lobbies.get(instanceId);
        if (!lobby || (lobby.phase !== 'racing' && lobby.phase !== 'countdown')) return;

        const p = lobby.participants.find(x => x.discordId === discordId);
        if (!p || p.status === 'idle') return;

        if (status === 'solving' || status === 'solved' || status === 'dnf') p.status = status;
        if (typeof moves === 'number') p.moves = moves;
        if (finishedAt != null) p.finishedAt = finishedAt;

        checkRaceComplete(lobby);
        lobby.lastUpdated = Date.now();
        broadcast(io, instanceId, lobby);
    });

    // ── Leave ─────────────────────────────────────────────────────────
    socket.on('lights-out:leave', (payload: {
        instanceId: string;
        discordId: string;
    }) => {
        if (!checkRateLimit(socket.id, 'lights-out:leave')) return;

        const { instanceId, discordId } = payload;
        const lobby = lobbies.get(instanceId);
        if (!lobby) return;

        lobby.participants = lobby.participants.filter(p => p.discordId !== discordId);
        socket.leave(roomName(instanceId));
        socketLobbyMap.delete(socket.id);

        if (removeLobbyIfEmpty(instanceId, lobby)) return;

        reassignHost(lobby);
        checkRaceComplete(lobby);
        lobby.lastUpdated = Date.now();
        broadcast(io, instanceId, lobby);
    });

    // ── Return to Lobby ───────────────────────────────────────────────
    socket.on('lights-out:return', (payload: {
        instanceId: string;
        discordId: string;
    }) => {
        if (!checkRateLimit(socket.id, 'lights-out:return')) return;

        const { instanceId, discordId } = payload;
        const lobby = lobbies.get(instanceId);
        if (!lobby || lobby.phase !== 'results') return;
        if (lobby.hostId !== discordId) return;

        lobby.phase = 'waiting';
        lobby.seed = null;
        lobby.countdownStartedAt = null;
        lobby.raceStartedAt = null;

        for (const p of lobby.participants) {
            p.ready = false;
            p.status = 'idle';
            p.moves = 0;
            p.finishedAt = null;
        }

        lobby.lastUpdated = Date.now();
        broadcast(io, instanceId, lobby);
    });
}

// ─── Disconnect Handler ─────────────────────────────────────────────

export function handleLightsOutDisconnect(io: Server, socket: Socket): void {
    const instanceId = socketLobbyMap.get(socket.id);
    if (!instanceId) return;

    socketLobbyMap.delete(socket.id);
    const lobby = lobbies.get(instanceId);
    if (!lobby) return;

    // Remove the disconnected participant
    lobby.participants = lobby.participants.filter(p => p.socketId !== socket.id);

    if (removeLobbyIfEmpty(instanceId, lobby)) return;

    reassignHost(lobby);
    checkRaceComplete(lobby);
    lobby.lastUpdated = Date.now();
    broadcast(io, instanceId, lobby);
}
