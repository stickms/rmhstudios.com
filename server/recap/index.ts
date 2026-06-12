/**
 * Lights Out — Recap Runner
 *
 * Long-running process that checks for due daily recaps every 5 minutes.
 * A recap is scheduled 24h after the first player opens the daily puzzle in a guild.
 * Runs as a Docker service alongside the web/socket servers.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    getDateSeed,
    formatDateKey,
    createSeededRng,
} from '../../lib/lights-out/seed';
import { getDailyShape, getShapeLabel } from '../../lib/lights-out/shapes';
import { generatePuzzle, getOptimalMoves } from '../../lib/lights-out/lights-out';
import { stripTrailingSlash } from '../../lib/url';

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});
const prisma = new PrismaClient({ adapter });
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BOT_TOKEN = process.env.DISCORD_ACTIVITY_BOT_TOKEN;
const APP_ID = process.env.VITE_DISCORD_ACTIVITY_CLIENT_ID ?? process.env.DISCORD_ACTIVITY_CLIENT_ID;
const SITE_URL = stripTrailingSlash(process.env.SITE_URL ?? process.env.VITE_BETTER_AUTH_URL ?? 'https://rmhstudios.com');

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] [recap] ${msg}`);
}

async function discordApi(path: string, method: string, body?: object): Promise<{ data: any; status: number } | null> {
    if (!BOT_TOKEN) return null;

    try {
        const res = await fetch(`https://discord.com/api/v10${path}`, {
            method,
            headers: {
                Authorization: `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            if (res.status === 403 || res.status === 404) {
                // Bot not in guild or channel deleted — not an error, just skip
                log(`  Skipping (${res.status}): bot lacks access to ${path}`);
            } else {
                log(`Discord API ${method} ${path}: ${res.status} ${text}`);
            }
            return { data: null, status: res.status };
        }

        return { data: await res.json(), status: res.status };
    } catch (e) {
        log(`Discord API network error: ${e}`);
        return null;
    }
}

async function processDueRecaps() {
    const now = new Date();

    const dueChannels = await prisma.discordActivityChannel.findMany({
        where: {
            activity: 'lights-out',
            recapDueAt: { lte: now },
            recapDateKey: { not: null },
        },
    });

    if (dueChannels.length === 0) return;

    log(`Found ${dueChannels.length} recap(s) due.`);

    for (const channel of dueChannels) {
        const dateKey = channel.recapDateKey!;

        try {
            const participants = await prisma.discordDailyParticipant.findMany({
                where: { guildId: channel.guildId, dateKey },
                orderBy: { moves: 'asc' },
            });

            if (participants.length === 0) {
                await prisma.discordActivityChannel.update({
                    where: { id: channel.id },
                    data: { recapDateKey: null, recapDueAt: null },
                });
                continue;
            }

            // Puzzle info
            const [y, m, d] = dateKey.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            const seed = getDateSeed(date);
            const shape = getDailyShape(seed);
            const shapeLabel = getShapeLabel(shape);
            const puzzleGrid = generatePuzzle(createSeededRng(seed), shape);
            const optimal = getOptimalMoves(puzzleGrid, shape);

            type Participant = typeof participants[number];
            const completed = participants.filter((p: Participant) => p.status === 'completed');
            const playing = participants.filter((p: Participant) => p.status === 'playing');

            const lines: string[] = [];
            const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

            completed.forEach((p: Participant, i: number) => {
                const medal = medals[i] ?? '\u25AA\uFE0F';
                const emoji = p.ratingEmoji ?? '\u{1F4A1}';
                lines.push(`${medal} **${p.username}** \u2014 ${emoji} ${p.moves} move${p.moves !== 1 ? 's' : ''}${p.ratingLabel ? ` (${p.ratingLabel})` : ''}`);
            });

            if (playing.length > 0) {
                lines.push(`\u{1F3F3}\uFE0F ${playing.length} player${playing.length !== 1 ? 's' : ''} did not finish`);
            }

            const launchUrl = APP_ID ? `https://discord.com/activities/${APP_ID}` : null;

            const recapImgUrl = `${SITE_URL}/api/discord/activity-image?type=leaderboard&guildId=${channel.guildId}&dateKey=${dateKey}&recap=1`;

            const embed = {
                embeds: [{
                    title: '\u{1F526} Lights Out \u2014 Daily Recap',
                    description: [
                        `**${dateKey}** \u00b7 ${shapeLabel}${optimal != null ? ` \u00b7 Optimal: ${optimal} moves` : ''}`,
                        '',
                        `**${participants.length}** player${participants.length !== 1 ? 's' : ''} attempted yesterday\u2019s puzzle:`,
                        '',
                        ...lines,
                        '',
                        launchUrl ? `[\u25B6\uFE0F Play today\u2019s puzzle](${launchUrl})` : '',
                    ].filter(Boolean).join('\n'),
                    color: 0xf59e0b,
                    image: { url: recapImgUrl },
                    footer: { text: 'Lights Out \u00b7 Daily Puzzle' },
                    timestamp: new Date().toISOString(),
                }],
            };

            const result = await discordApi(`/channels/${channel.channelId}/messages`, 'POST', embed);

            if (result?.data) {
                log(`Posted recap to guild ${channel.guildId} channel ${channel.channelId}`);
            } else if (result?.status === 403 || result?.status === 404) {
                log(`  Bot lacks access to guild ${channel.guildId} — clearing recap (will retry if bot is added later).`);
            }

            // Always clear the recap schedule — whether it succeeded or the bot lacks access.
            // If the bot gets added later, the next day's activity will schedule a new recap.
            await prisma.discordActivityChannel.update({
                where: { id: channel.id },
                data: { recapDateKey: null, recapDueAt: null },
            });
        } catch (e) {
            log(`Failed for guild ${channel.guildId}: ${e}`);
        }
    }
}

// ─── Discord Gateway (bot presence) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gatewayWs: any = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let gatewaySeq: number | null = null;

async function connectGateway() {
    if (!BOT_TOKEN) return;

    try {
        // @ts-expect-error — ws types not available in server build
        const { WebSocket } = await import('ws');

        // Get gateway URL
        const res = await fetch('https://discord.com/api/v10/gateway/bot', {
            headers: { Authorization: `Bot ${BOT_TOKEN}` },
        });
        if (!res.ok) {
            log(`Failed to get gateway URL: ${res.status}`);
            return;
        }
        const { url } = await res.json();

        const ws = new WebSocket(`${url}?v=10&encoding=json`);
        gatewayWs = ws;

        ws.on('message', (data: Buffer) => {
            try {
                const payload = JSON.parse(data.toString());
                const { op, d, s } = payload;
                if (s) gatewaySeq = s;

                switch (op) {
                    case 10: {
                        // Hello — start heartbeat and identify
                        const interval = d.heartbeat_interval;
                        heartbeatInterval = setInterval(() => {
                            ws.send(JSON.stringify({ op: 1, d: gatewaySeq }));
                        }, interval);

                        // Identify with presence
                        ws.send(JSON.stringify({
                            op: 2,
                            d: {
                                token: BOT_TOKEN,
                                intents: 0, // no privileged intents needed
                                properties: { os: 'linux', browser: 'rmhbox', device: 'rmhbox' },
                                presence: {
                                    activities: [{
                                        name: 'RMHBox',
                                        type: 0, // Playing
                                    }],
                                    status: 'online',
                                },
                            },
                        }));
                        break;
                    }
                    case 11:
                        // Heartbeat ACK — all good
                        break;
                    case 7:
                        // Reconnect requested
                        log('Gateway reconnect requested.');
                        ws.close();
                        break;
                    case 9:
                        // Invalid session
                        log('Gateway invalid session.');
                        ws.close();
                        break;
                }
            } catch {}
        });

        ws.on('open', () => log('Gateway connected — bot is online.'));

        ws.on('close', () => {
            log('Gateway disconnected. Reconnecting in 30s...');
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            gatewayWs = null;
            setTimeout(connectGateway, 30_000);
        });

        ws.on('error', (err: Error) => {
            log(`Gateway error: ${err.message}`);
        });
    } catch (e) {
        log(`Gateway connection failed: ${e}. Retrying in 30s...`);
        setTimeout(connectGateway, 30_000);
    }
}

// ─── Main loop ───────────────────────────────────────────────────────

async function main() {
    if (!BOT_TOKEN) {
        log('No DISCORD_ACTIVITY_BOT_TOKEN set — recap runner disabled. Exiting.');
        process.exit(0);
    }

    log(`Recap runner started. Checking every ${CHECK_INTERVAL_MS / 1000}s.`);

    // Connect to Discord Gateway (shows bot as online)
    connectGateway();

    // Initial recap check
    await processDueRecaps().catch(e => log(`Error: ${e}`));

    // Recurring check
    const interval = setInterval(async () => {
        await processDueRecaps().catch(e => log(`Error: ${e}`));
    }, CHECK_INTERVAL_MS);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        log(`${signal} received — shutting down.`);
        clearInterval(interval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (gatewayWs) gatewayWs.close();
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Health check endpoint
    const http = await import('http');
    const PORT = parseInt(process.env.RECAP_PORT ?? '7004', 10);
    const server = http.createServer((_, res) => {
        res.writeHead(200);
        res.end('ok');
    });
    server.listen(PORT, '0.0.0.0', () => {
        log(`Health check listening on port ${PORT}`);
    });
}

main();
