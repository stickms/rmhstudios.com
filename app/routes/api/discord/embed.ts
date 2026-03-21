import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
    getDateSeed,
} from '@/lib/lights-out/seed';
import { getDailyShape, getShapeLabel } from '@/lib/lights-out/shapes';


/**
 * Discord embed posting endpoint.
 *
 * Handles these scenarios gracefully:
 *   - User app in DMs (no guildId) → track nothing, skip embeds
 *   - User app in a guild without the bot → track participation in DB, skip embeds
 *   - Activity in a guild with the bot → full tracking + embeds
 *   - Bot removed from guild → embed fails silently, DB tracking still works
 *   - No bot token configured → skip all Discord API calls, still track in DB
 */

// In-memory cache: channelId+dateKey → Discord message ID (for editing embeds)
const MAX_MSG_CACHE = 500;
const MSG_TTL_MS = 24 * 60 * 60 * 1000;
const messageCache = new Map<string, { messageId: string; updatedAt: number }>();

// Track channels where the bot is known to lack access (avoid repeated 403s)
const blockedChannels = new Set<string>();
const BLOCKED_TTL_MS = 30 * 60 * 1000; // retry after 30 min
const blockedTimers = new Map<string, ReturnType<typeof setTimeout>>();

const gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of messageCache) {
        if (now - entry.updatedAt > MSG_TTL_MS) messageCache.delete(key);
    }
}, 30 * 60 * 1000);
if (gcTimer && typeof gcTimer === 'object' && 'unref' in gcTimer) gcTimer.unref();

interface ParticipantRow {
    username: string;
    status: string;
    moves: number | null;
    ratingEmoji: string | null;
    ratingLabel: string | null;
}

const SITE_URL = process.env.SITE_URL ?? process.env.VITE_BETTER_AUTH_URL?.replace(/\/$/, '') ?? 'https://rmhstudios.com';

function buildEmbed(dateKey: string, guildId: string, participants: ParticipantRow[]): object {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const seed = getDateSeed(date);
    const shape = getDailyShape(seed);
    const shapeLabel = getShapeLabel(shape);

    const playing = participants.filter(p => p.status === 'playing');
    const completed = participants
        .filter(p => p.status === 'completed')
        .sort((a, b) => (a.moves ?? 999) - (b.moves ?? 999));

    const lines: string[] = [];

    for (const p of completed) {
        lines.push(`${p.ratingEmoji ?? '\u{1F4A1}'} **${p.username}** \u2014 ${p.moves} move${p.moves !== 1 ? 's' : ''}${p.ratingLabel ? ` (${p.ratingLabel})` : ''}`);
    }

    if (playing.length > 0) {
        const names = playing.map(p => p.username).join(', ');
        lines.push(`\u{1F3AE} ${names} ${playing.length === 1 ? 'is' : 'are'} playing...`);
    }

    // Cache-bust the image so Discord re-fetches on updates
    const imgUrl = `${SITE_URL}/api/discord/activity-image?type=leaderboard&guildId=${guildId}&dateKey=${dateKey}&_t=${Date.now()}`;

    return {
        embeds: [{
            title: `\u{1F526} Lights Out \u2014 ${dateKey}`,
            description: [
                `**${shapeLabel}**`,
                '',
                ...lines,
            ].join('\n'),
            color: 0xf59e0b,
            image: { url: imgUrl },
            footer: { text: 'Lights Out \u00b7 Daily Puzzle' },
            timestamp: new Date().toISOString(),
        }],
    };
}

interface RaceParticipant {
    username: string;
    userId: string;
    avatar: string | null;
    status: string;
    moves: number;
    finishedAt: number | null;
}

function buildRaceEmbed(
    channelId: string,
    raceResults: { roundNumber: number; raceMode: string; raceStartedAt: number | null; participants: RaceParticipant[] },
): object {
    const { roundNumber, raceMode, participants } = raceResults;

    const sorted = [...participants]
        .filter(p => p.status === 'solved')
        .sort((a, b) => {
            if (raceMode === 'moves') return a.moves - b.moves;
            return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity);
        });
    const dnf = participants.filter(p => p.status === 'dnf');

    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    const lines: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];
        const medal = i < 3 ? medals[i] : `**#${i + 1}**`;
        lines.push(`${medal} **${p.username}** \u2014 ${p.moves} move${p.moves !== 1 ? 's' : ''}`);
    }

    for (const p of dnf) {
        lines.push(`\u{274C} **${p.username}** \u2014 DNF`);
    }

    const imgUrl = `${SITE_URL}/api/discord/activity-image?type=race&players=${encodeURIComponent(JSON.stringify(participants))}&phase=results&round=${roundNumber}&raceMode=${raceMode}&raceStartedAt=${raceResults.raceStartedAt ?? 0}&_t=${Date.now()}`;

    return {
        embeds: [{
            title: `\u{1F3C1} Race Results \u2014 Round ${roundNumber}`,
            description: [
                `**${raceMode === 'moves' ? 'Fewest Moves' : 'Timed Race'}** \u00b7 ${participants.length} racer${participants.length !== 1 ? 's' : ''}`,
                '',
                ...lines,
            ].join('\n'),
            color: 0xa855f7, // purple for race mode
            image: { url: imgUrl },
            footer: { text: 'Lights Out \u00b7 Race Mode' },
            timestamp: new Date().toISOString(),
        }],
    };
}

/**
 * Call Discord API. Returns null on any failure (missing token, 403, 404, etc.)
 * Marks channels as blocked on 403 (Missing Access) to avoid spamming Discord.
 */
async function discordApi(path: string, method: string, body?: object): Promise<any> {
    const token = process.env.DISCORD_ACTIVITY_BOT_TOKEN ?? process.env.DISCORD_BOT_TOKEN;
    if (!token) {
        console.warn('[embed] No bot token set (DISCORD_ACTIVITY_BOT_TOKEN or DISCORD_BOT_TOKEN) — skipping Discord API call');
        return null;
    }

    try {
        const res = await fetch(`https://discord.com/api/v10${path}`, {
            method,
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
            const status = res.status;
            const text = await res.text().catch(() => '');

            // 403 = bot not in guild or missing permissions
            // 404 = channel deleted
            // Don't log these as errors — they're expected when bot isn't installed everywhere
            if (status === 403 || status === 404) {
                console.warn(`Discord API ${method} ${path}: ${status} (bot lacks access) — ${text.slice(0, 200)}`);
                // Extract channelId from path for blocking
                const channelMatch = path.match(/\/channels\/(\d+)/);
                if (channelMatch) {
                    const chId = channelMatch[1];
                    blockedChannels.add(chId);
                    // Auto-unblock after TTL
                    const existing = blockedTimers.get(chId);
                    if (existing) clearTimeout(existing);
                    blockedTimers.set(chId, setTimeout(() => {
                        blockedChannels.delete(chId);
                        blockedTimers.delete(chId);
                    }, BLOCKED_TTL_MS));
                }
                return null;
            }

            console.error(`Discord API ${method} ${path} failed:`, status, text);
            return null;
        }

        return res.json();
    } catch (e) {
        // Network errors — don't crash
        console.error(`Discord API ${method} ${path} network error:`, e);
        return null;
    }
}

// If the cached message is older than this, reply to it instead of editing
const EMBED_FRESHNESS_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Post, edit, or reply to an embed in a channel.
 *
 * - If a cached message exists and is < 5 min old: EDIT it in place.
 * - If a cached message exists but is > 5 min old: REPLY to it (thread-style).
 * - Otherwise: POST a new standalone message.
 *
 * Silently skips if the channel is blocked (bot lacks access).
 */
async function postOrEditEmbed(channelId: string, guildId: string, dateKey: string, participants: ParticipantRow[]) {
    if (blockedChannels.has(channelId)) {
        console.log(`[embed] Skipping channel ${channelId}: blocked (bot lacks access)`);
        return;
    }

    const cacheKey = `${channelId}:${dateKey}`;
    const cached = messageCache.get(cacheKey);
    const embed = buildEmbed(dateKey, guildId, participants);

    if (cached) {
        const age = Date.now() - cached.updatedAt;

        if (age < EMBED_FRESHNESS_MS) {
            // Message is fresh — edit it
            console.log(`[embed] Editing recent message ${cached.messageId} in channel ${channelId} (${Math.round(age / 1000)}s old)`);
            const result = await discordApi(
                `/channels/${channelId}/messages/${cached.messageId}`,
                'PATCH',
                embed
            );
            if (result) {
                cached.updatedAt = Date.now();
                return;
            }
            // PATCH failed — fall through to post new
            messageCache.delete(cacheKey);
            if (blockedChannels.has(channelId)) return;
        } else {
            // Message is stale — reply to it
            console.log(`[embed] Replying to stale message ${cached.messageId} in channel ${channelId} (${Math.round(age / 1000)}s old)`);
            const replyBody = {
                ...embed,
                message_reference: { message_id: cached.messageId },
            };
            const msg = await discordApi(`/channels/${channelId}/messages`, 'POST', replyBody);
            if (msg?.id) {
                console.log(`[embed] Replied with message ${msg.id} to channel ${channelId}`);
                messageCache.set(cacheKey, { messageId: msg.id, updatedAt: Date.now() });
                return;
            }
            // Reply failed (original deleted?) — clear cache, fall through to fresh POST
            console.log(`[embed] Reply failed, posting fresh message instead`);
            messageCache.delete(cacheKey);
            if (blockedChannels.has(channelId)) return;
        }
    }

    console.log(`[embed] Posting new embed to channel ${channelId} (guild ${guildId}, ${participants.length} participants)`);
    const msg = await discordApi(`/channels/${channelId}/messages`, 'POST', embed);
    if (msg?.id) {
        console.log(`[embed] Posted message ${msg.id} to channel ${channelId}`);
        if (messageCache.size >= MAX_MSG_CACHE) {
            const oldest = messageCache.keys().next().value;
            if (oldest !== undefined) messageCache.delete(oldest);
        }
        messageCache.set(cacheKey, { messageId: msg.id, updatedAt: Date.now() });
    } else {
        console.log(`[embed] Failed to post to channel ${channelId} — discordApi returned null`);
    }
}

export const Route = createFileRoute('/api/discord/embed')({
    server: {
        handlers: {
            // GET — check completion or fetch guild leaderboard
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const dateKey = url.searchParams.get('dateKey');
                const guildId = url.searchParams.get('guildId');
                const leaderboard = url.searchParams.get('leaderboard');
                const discordId = url.searchParams.get('discordId');

                if (!dateKey) {
                    return Response.json({ error: 'Missing dateKey' }, { status: 400 });
                }

                // Leaderboard mode: return all participants for a guild+date
                if (leaderboard && guildId) {
                    try {
                        const participants = await prisma.discordDailyParticipant.findMany({
                            where: { guildId, dateKey },
                            select: { username: true, status: true, moves: true, ratingEmoji: true },
                            orderBy: [{ status: 'asc' }, { moves: 'asc' }],
                        });
                        return Response.json({ participants });
                    } catch (e) {
                        console.error('Discord leaderboard GET error:', e);
                        return Response.json({ participants: [] });
                    }
                }

                // Completion check mode
                if (!discordId) {
                    return Response.json({ error: 'Missing discordId' }, { status: 400 });
                }

                try {
                    // Find completion across any guild (user may have completed in a different server)
                    const participant = await prisma.discordDailyParticipant.findFirst({
                        where: { discordId, dateKey, status: 'completed' },
                        select: { moves: true, ratingEmoji: true, ratingLabel: true },
                    });

                    if (participant) {
                        return Response.json({
                            completed: true,
                            moves: participant.moves,
                            ratingEmoji: participant.ratingEmoji,
                            ratingLabel: participant.ratingLabel,
                        });
                    }

                    return Response.json({ completed: false });
                } catch (e) {
                    console.error('Discord embed GET error:', e);
                    return Response.json({ completed: false });
                }
            },

            POST: async ({ request }) => {
                const ip = getClientIp(request);
                const { allowed, retryAfter } = rateLimit(ip, {
                    limit: 30,
                    windowMs: 60_000,
                    prefix: 'discord-embed',
                });

                if (!allowed) {
                    return Response.json(
                        { error: 'Too many requests' },
                        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                    );
                }

                try {
                    const body = await request.json();
                    const { channelId, guildId, action, dateKey, user, result } = body;

                    console.log(`[embed] action=${action} guild=${guildId} channel=${channelId} user=${user?.id} dateKey=${dateKey}`);

                    // Minimum required: dateKey and user ID (for any tracking)
                    if (!dateKey || !user?.id) {
                        console.log('[embed] Skipped: missing dateKey or user');
                        return Response.json({ error: 'Missing dateKey or user' }, { status: 400 });
                    }

                    // No guild context (DM or user-app without guild) — nothing to track or post
                    if (!guildId) {
                        console.log('[embed] Skipped: no guildId (DM context)');
                        return Response.json({ success: true, skipped: 'no-guild' });
                    }

                    if (!channelId) {
                        console.log('[embed] Warning: guildId present but channelId is null — will track in DB but cannot post embed');
                    }

                    // ─── Race results: post race leaderboard embed ───
                    if (action === 'race_completed') {
                        const { raceResults } = body;
                        if (!raceResults || !channelId) {
                            return Response.json({ success: true, skipped: 'no-race-data-or-channel' });
                        }

                        const roundNumber = raceResults.roundNumber ?? 0;
                        const raceCacheKey = `${channelId}:race:${roundNumber}`;

                        // Deduplicate: if we already posted for this round, skip
                        if (messageCache.has(raceCacheKey)) {
                            console.log(`[embed] Race round ${roundNumber} already posted, skipping`);
                            return Response.json({ success: true, skipped: 'already-posted' });
                        }

                        const raceEmbed = buildRaceEmbed(channelId, raceResults);
                        if (!blockedChannels.has(channelId)) {
                            const msg = await discordApi(`/channels/${channelId}/messages`, 'POST', raceEmbed);
                            if (msg?.id) {
                                console.log(`[embed] Posted race results (round ${roundNumber}) as message ${msg.id}`);
                                messageCache.set(raceCacheKey, { messageId: msg.id, updatedAt: Date.now() });
                            }
                        }

                        return Response.json({ success: true });
                    }

                    const isCompleted = action === 'completed';

                    // 1. Track participation in DB (always works, no bot needed)
                    try {
                        await prisma.discordDailyParticipant.upsert({
                            where: {
                                discordId_guildId_dateKey: {
                                    discordId: user.id,
                                    guildId,
                                    dateKey,
                                },
                            },
                            update: {
                                username: user.username ?? 'Unknown',
                                ...(isCompleted ? {
                                    status: 'completed',
                                    moves: result?.moves ?? null,
                                    ratingEmoji: result?.ratingEmoji ?? null,
                                    ratingLabel: result?.ratingLabel ?? null,
                                } : {}),
                            },
                            create: {
                                discordId: user.id,
                                guildId,
                                dateKey,
                                username: user.username ?? 'Unknown',
                                status: isCompleted ? 'completed' : 'playing',
                                moves: isCompleted ? (result?.moves ?? null) : null,
                                ratingEmoji: isCompleted ? (result?.ratingEmoji ?? null) : null,
                                ratingLabel: isCompleted ? (result?.ratingLabel ?? null) : null,
                            },
                        });
                    } catch (dbErr) {
                        console.error('Failed to upsert participant:', dbErr);
                        // Don't fail the whole request — embed posting can still proceed
                    }

                    // 2. If completed, propagate to ALL guilds this user participated in today
                    if (isCompleted) {
                        try {
                            await prisma.discordDailyParticipant.updateMany({
                                where: {
                                    discordId: user.id,
                                    dateKey,
                                    status: 'playing',
                                },
                                data: {
                                    status: 'completed',
                                    moves: result?.moves ?? null,
                                    ratingEmoji: result?.ratingEmoji ?? null,
                                    ratingLabel: result?.ratingLabel ?? null,
                                },
                            });

                            // Update embeds in other guilds (fire-and-forget)
                            const otherGuilds = await prisma.discordDailyParticipant.findMany({
                                where: { discordId: user.id, dateKey, guildId: { not: guildId } },
                                select: { guildId: true },
                                distinct: ['guildId'],
                            });

                            for (const { guildId: g } of otherGuilds) {
                                const ch = await prisma.discordActivityChannel.findUnique({
                                    where: { guildId_activity: { guildId: g, activity: 'lights-out' } },
                                });
                                if (!ch) continue;

                                const participants = await prisma.discordDailyParticipant.findMany({
                                    where: { guildId: g, dateKey },
                                });
                                postOrEditEmbed(ch.channelId, g, dateKey, participants).catch(e => console.error('[embed] postOrEditEmbed error:', e));
                            }
                        } catch (propErr) {
                            console.error('Failed to propagate completion:', propErr);
                        }
                    }

                    // 3. Track channel + schedule recap (needs channelId)
                    if (channelId) {
                        try {
                            const existing = await prisma.discordActivityChannel.findUnique({
                                where: { guildId_activity: { guildId, activity: 'lights-out' } },
                            });

                            const needsRecap = !existing?.recapDateKey || existing.recapDateKey !== dateKey;
                            const recapDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

                            await prisma.discordActivityChannel.upsert({
                                where: { guildId_activity: { guildId, activity: 'lights-out' } },
                                update: {
                                    channelId,
                                    ...(needsRecap ? { recapDateKey: dateKey, recapDueAt } : {}),
                                },
                                create: {
                                    guildId,
                                    channelId,
                                    activity: 'lights-out',
                                    recapDateKey: dateKey,
                                    recapDueAt,
                                },
                            });
                        } catch (chErr) {
                            console.error('Failed to upsert channel:', chErr);
                        }

                        // 4. Post/edit embed in channel (bot may not have access — that's OK)
                        const guildParticipants = await prisma.discordDailyParticipant.findMany({
                            where: { guildId, dateKey },
                        });

                        // Fire-and-forget — don't let embed failure block the response
                        postOrEditEmbed(channelId, guildId, dateKey, guildParticipants).catch(e => console.error('[embed] postOrEditEmbed error:', e));
                    }

                    return Response.json({ success: true });
                } catch (e) {
                    console.error('Discord embed endpoint error:', e);
                    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
                }
            },
        },
    },
});
