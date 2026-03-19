import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
    getDateSeed,
    createSeededRng,
} from '@/lib/lights-out/seed';
import { getDailyShape, getShapeLabel } from '@/lib/lights-out/shapes';
import { generatePuzzle, getOptimalMoves } from '@/lib/lights-out/lights-out';

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

function buildEmbed(dateKey: string, participants: ParticipantRow[]): object {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const seed = getDateSeed(date);
    const shape = getDailyShape(seed);
    const shapeLabel = getShapeLabel(shape);
    const puzzleGrid = generatePuzzle(createSeededRng(seed), shape);
    const optimal = getOptimalMoves(puzzleGrid, shape);

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

    return {
        embeds: [{
            title: `\u{1F526} Lights Out \u2014 ${dateKey}`,
            description: [
                `**${shapeLabel}**${optimal != null ? ` \u00b7 Optimal: ${optimal} moves` : ''}`,
                '',
                ...lines,
            ].join('\n'),
            color: 0xf59e0b,
            footer: { text: 'Lights Out \u00b7 Daily Puzzle' },
            timestamp: new Date().toISOString(),
        }],
    };
}

/**
 * Call Discord API. Returns null on any failure (missing token, 403, 404, etc.)
 * Marks channels as blocked on 403 (Missing Access) to avoid spamming Discord.
 */
async function discordApi(path: string, method: string, body?: object): Promise<any> {
    const token = process.env.DISCORD_ACTIVITY_BOT_TOKEN;
    if (!token) return null;

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

/**
 * Post or edit an embed in a channel.
 * Silently skips if the channel is blocked (bot lacks access).
 */
async function postOrEditEmbed(channelId: string, dateKey: string, participants: ParticipantRow[]) {
    if (blockedChannels.has(channelId)) return;

    const cacheKey = `${channelId}:${dateKey}`;
    const cached = messageCache.get(cacheKey);
    const embed = buildEmbed(dateKey, participants);

    if (cached) {
        const result = await discordApi(
            `/channels/${channelId}/messages/${cached.messageId}`,
            'PATCH',
            embed
        );
        if (result) {
            cached.updatedAt = Date.now();
            return;
        }
        messageCache.delete(cacheKey);
        // If channel is now blocked, don't try to create
        if (blockedChannels.has(channelId)) return;
    }

    const msg = await discordApi(`/channels/${channelId}/messages`, 'POST', embed);
    if (msg?.id) {
        if (messageCache.size >= MAX_MSG_CACHE) {
            const oldest = messageCache.keys().next().value;
            if (oldest !== undefined) messageCache.delete(oldest);
        }
        messageCache.set(cacheKey, { messageId: msg.id, updatedAt: Date.now() });
    }
}

export const Route = createFileRoute('/api/discord/embed')({
    server: {
        handlers: {
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

                    // Minimum required: dateKey and user ID (for any tracking)
                    if (!dateKey || !user?.id) {
                        return Response.json({ error: 'Missing dateKey or user' }, { status: 400 });
                    }

                    // No guild context (DM or user-app without guild) — nothing to track or post
                    if (!guildId) {
                        return Response.json({ success: true, skipped: 'no-guild' });
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
                                postOrEditEmbed(ch.channelId, dateKey, participants).catch(() => {});
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
                        postOrEditEmbed(channelId, dateKey, guildParticipants).catch(() => {});
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
