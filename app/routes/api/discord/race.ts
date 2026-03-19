import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * In-memory race state store.
 * Each race is keyed by Discord Activity instanceId.
 * Entries expire after 30 minutes to prevent unbounded growth.
 */

interface RaceParticipant {
    discordId: string;
    username: string;
    avatar: string | null;
    status: 'solving' | 'solved' | 'dnf';
    moves: number;
    finishedAt: number | null;
}

interface RaceEntry {
    seed: number;
    participants: RaceParticipant[];
    startedAt: number;
    lastUpdated: number;
}

const MAX_RACES = 1000;
const RACE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const races = new Map<string, RaceEntry>();

// Sweep expired races every 5 minutes
const gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of races) {
        if (now - entry.lastUpdated > RACE_TTL_MS) {
            races.delete(key);
        }
    }
}, 5 * 60 * 1000);
if (gcTimer && typeof gcTimer === 'object' && 'unref' in gcTimer) {
    gcTimer.unref();
}

export const Route = createFileRoute('/api/discord/race')({
    server: {
        handlers: {
            // GET — fetch race state
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const instanceId = url.searchParams.get('instanceId');
                if (!instanceId) {
                    return Response.json({ error: 'Missing instanceId' }, { status: 400 });
                }

                const race = races.get(instanceId);
                if (!race) {
                    return Response.json({ participants: [], seed: 0, startedAt: 0 });
                }

                return Response.json({
                    seed: race.seed,
                    participants: race.participants,
                    startedAt: race.startedAt,
                });
            },

            // POST — update participant status
            POST: async ({ request }) => {
                const ip = getClientIp(request);
                const { allowed, retryAfter } = rateLimit(ip, {
                    limit: 60,
                    windowMs: 60_000,
                    prefix: 'discord-race',
                });

                if (!allowed) {
                    return Response.json(
                        { error: 'Too many requests' },
                        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                    );
                }

                try {
                    const { instanceId, seed, participant } = await request.json();

                    if (!instanceId || typeof instanceId !== 'string') {
                        return Response.json({ error: 'Missing instanceId' }, { status: 400 });
                    }
                    if (!participant?.discordId) {
                        return Response.json({ error: 'Missing participant' }, { status: 400 });
                    }

                    const now = Date.now();
                    let race = races.get(instanceId);

                    if (!race) {
                        // Evict oldest if at capacity
                        if (races.size >= MAX_RACES) {
                            const oldest = races.keys().next().value;
                            if (oldest !== undefined) races.delete(oldest);
                        }

                        race = {
                            seed: seed ?? 0,
                            participants: [],
                            startedAt: now,
                            lastUpdated: now,
                        };
                        races.set(instanceId, race);
                    }

                    // Upsert participant
                    const idx = race.participants.findIndex(p => p.discordId === participant.discordId);
                    const entry: RaceParticipant = {
                        discordId: participant.discordId,
                        username: participant.username ?? 'Unknown',
                        avatar: participant.avatar ?? null,
                        status: participant.status ?? 'solving',
                        moves: participant.moves ?? 0,
                        finishedAt: participant.finishedAt ?? null,
                    };

                    if (idx >= 0) {
                        race.participants[idx] = entry;
                    } else {
                        race.participants.push(entry);
                    }

                    race.lastUpdated = now;

                    return Response.json({ success: true });
                } catch (e) {
                    console.error('Discord race endpoint error:', e);
                    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
                }
            },
        },
    },
});
