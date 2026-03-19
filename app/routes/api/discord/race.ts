import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Lights Out — Race Lobby API (HTTP fallback)
 *
 * Used when the socket.io connection through Discord's proxy fails.
 * Mirrors the same lobby logic as the socket handler.
 */

type LobbyPhase = 'waiting' | 'countdown' | 'racing' | 'results';

interface LobbyParticipant {
    discordId: string;
    username: string;
    avatar: string | null;
    ready: boolean;
    status: 'idle' | 'solving' | 'solved' | 'dnf';
    moves: number;
    finishedAt: number | null;
    joinedAt: number;
    lastSeen: number;
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

const MAX_LOBBIES = 1000;
const LOBBY_TTL_MS = 30 * 60 * 1000;
const STALE_MS = 30_000;
const STALE_HOST_MS = 15_000;
const COUNTDOWN_MS = 3_000;

const lobbies = new Map<string, LobbyEntry>();

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

function generateSeed(instanceId: string, roundNumber: number): number {
    const str = `${instanceId}:${roundNumber}:${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function pruneAndFixHost(lobby: LobbyEntry, now: number): void {
    lobby.participants = lobby.participants.filter(p => now - p.lastSeen < STALE_MS);
    if (lobby.participants.length === 0) return;
    const host = lobby.participants.find(p => p.discordId === lobby.hostId);
    if (!host || now - host.lastSeen > STALE_HOST_MS) {
        const earliest = lobby.participants.reduce((a, b) => a.joinedAt < b.joinedAt ? a : b);
        lobby.hostId = earliest.discordId;
    }
}

function checkRaceComplete(lobby: LobbyEntry): void {
    if (lobby.phase !== 'racing') return;
    const racers = lobby.participants.filter(p => p.status === 'solving' || p.status === 'solved' || p.status === 'dnf');
    if (racers.length === 0) return;
    if (racers.every(p => p.status === 'solved' || p.status === 'dnf')) {
        lobby.phase = 'results';
    }
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

export const Route = createFileRoute('/api/discord/race')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const instanceId = url.searchParams.get('instanceId');
                const discordId = url.searchParams.get('discordId');
                if (!instanceId) return Response.json({ error: 'Missing instanceId' }, { status: 400 });

                const lobby = lobbies.get(instanceId);
                if (!lobby) return Response.json({ phase: 'empty' });

                const now = Date.now();
                if (discordId) {
                    const p = lobby.participants.find(x => x.discordId === discordId);
                    if (p) p.lastSeen = now;
                }

                // Auto-transition countdown → racing
                if (lobby.phase === 'countdown' && lobby.countdownStartedAt && now >= lobby.countdownStartedAt + COUNTDOWN_MS) {
                    lobby.phase = 'racing';
                    lobby.raceStartedAt = now;
                }

                pruneAndFixHost(lobby, now);
                if (lobby.participants.length === 0) {
                    if (lobby.countdownTimer) clearTimeout(lobby.countdownTimer);
                    lobbies.delete(instanceId);
                    return Response.json({ phase: 'empty' });
                }
                checkRaceComplete(lobby);
                lobby.lastUpdated = now;
                return Response.json(serializeLobby(lobby));
            },

            POST: async ({ request }) => {
                const ip = getClientIp(request);
                const { allowed, retryAfter } = rateLimit(ip, { limit: 90, windowMs: 60_000, prefix: 'discord-race' });
                if (!allowed) {
                    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
                }

                try {
                    const body = await request.json();
                    const { instanceId, action } = body;
                    if (!instanceId || !action) return Response.json({ error: 'Missing fields' }, { status: 400 });

                    const now = Date.now();

                    switch (action) {
                        case 'join': {
                            const { discordId, username, avatar } = body;
                            if (!discordId) return Response.json({ error: 'Missing discordId' }, { status: 400 });
                            let lobby = lobbies.get(instanceId);
                            if (!lobby) {
                                if (lobbies.size >= MAX_LOBBIES) {
                                    const oldest = lobbies.keys().next().value;
                                    if (oldest !== undefined) lobbies.delete(oldest);
                                }
                                lobby = { phase: 'waiting', hostId: discordId, participants: [], seed: null, roundNumber: 0, countdownStartedAt: null, raceStartedAt: null, countdownTimer: null, lastUpdated: now };
                                lobbies.set(instanceId, lobby);
                            }
                            const existing = lobby.participants.find(p => p.discordId === discordId);
                            if (existing) {
                                existing.username = username ?? existing.username;
                                existing.avatar = avatar ?? existing.avatar;
                                existing.lastSeen = now;
                            } else {
                                lobby.participants.push({ discordId, username: username ?? 'Unknown', avatar: avatar ?? null, ready: false, status: 'idle', moves: 0, finishedAt: null, joinedAt: now, lastSeen: now });
                            }
                            lobby.lastUpdated = now;
                            return Response.json({ success: true });
                        }
                        case 'ready': {
                            const { discordId, ready } = body;
                            const lobby = lobbies.get(instanceId);
                            if (!lobby || lobby.phase !== 'waiting') return Response.json({ error: 'Invalid' }, { status: 400 });
                            const p = lobby.participants.find(x => x.discordId === discordId);
                            if (p) { p.ready = !!ready; p.lastSeen = now; }
                            lobby.lastUpdated = now;
                            return Response.json({ success: true });
                        }
                        case 'start': {
                            const { discordId } = body;
                            const lobby = lobbies.get(instanceId);
                            if (!lobby || lobby.phase !== 'waiting' || lobby.hostId !== discordId) return Response.json({ error: 'Invalid' }, { status: 400 });
                            const host = lobby.participants.find(p => p.discordId === discordId);
                            if (!host?.ready) return Response.json({ error: 'Host must be ready' }, { status: 400 });
                            lobby.roundNumber += 1;
                            lobby.seed = generateSeed(instanceId, lobby.roundNumber);
                            lobby.phase = 'countdown';
                            lobby.countdownStartedAt = now;
                            lobby.raceStartedAt = null;
                            for (const p of lobby.participants) {
                                p.status = p.ready ? 'solving' : 'idle';
                                p.moves = 0; p.finishedAt = null; p.ready = false; p.lastSeen = now;
                            }
                            lobby.lastUpdated = now;
                            return Response.json({ success: true });
                        }
                        case 'update': {
                            const { discordId, status, moves, finishedAt } = body;
                            const lobby = lobbies.get(instanceId);
                            if (!lobby || (lobby.phase !== 'racing' && lobby.phase !== 'countdown')) return Response.json({ error: 'Invalid' }, { status: 400 });
                            const p = lobby.participants.find(x => x.discordId === discordId);
                            if (p && p.status !== 'idle') {
                                if (status === 'solving' || status === 'solved' || status === 'dnf') p.status = status;
                                if (typeof moves === 'number') p.moves = moves;
                                if (finishedAt != null) p.finishedAt = finishedAt;
                                p.lastSeen = now;
                            }
                            checkRaceComplete(lobby);
                            lobby.lastUpdated = now;
                            return Response.json({ success: true });
                        }
                        case 'leave': {
                            const { discordId } = body;
                            const lobby = lobbies.get(instanceId);
                            if (!lobby) return Response.json({ success: true });
                            lobby.participants = lobby.participants.filter(p => p.discordId !== discordId);
                            if (lobby.participants.length === 0) { if (lobby.countdownTimer) clearTimeout(lobby.countdownTimer); lobbies.delete(instanceId); return Response.json({ success: true }); }
                            if (lobby.hostId === discordId) { const e = lobby.participants.reduce((a, b) => a.joinedAt < b.joinedAt ? a : b); lobby.hostId = e.discordId; }
                            checkRaceComplete(lobby);
                            lobby.lastUpdated = now;
                            return Response.json({ success: true });
                        }
                        case 'return_to_lobby': {
                            const { discordId } = body;
                            const lobby = lobbies.get(instanceId);
                            if (!lobby || lobby.phase !== 'results' || lobby.hostId !== discordId) return Response.json({ error: 'Invalid' }, { status: 400 });
                            lobby.phase = 'waiting'; lobby.seed = null; lobby.countdownStartedAt = null; lobby.raceStartedAt = null;
                            for (const p of lobby.participants) { p.ready = false; p.status = 'idle'; p.moves = 0; p.finishedAt = null; }
                            lobby.lastUpdated = now;
                            return Response.json({ success: true });
                        }
                        default:
                            return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
                    }
                } catch (e) {
                    console.error('Discord race endpoint error:', e);
                    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
                }
            },
        },
    },
});
