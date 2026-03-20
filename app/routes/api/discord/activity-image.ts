import { createFileRoute } from '@tanstack/react-router';
import { generateDailyImage, generateRaceImage } from '@/lib/discord-activity-image';

/**
 * Dynamic image generation for Discord Activity rich presence.
 * Returns a PNG image based on query parameters.
 *
 * Optimizations:
 * - Fonts loaded once at startup, kept in memory
 * - Discord avatars pre-fetched as base64 data URIs (10 min cache)
 * - Rendered PNGs cached in-memory LRU (1 min TTL, 100 entries)
 * - Cache-Control headers: 5 min for completed, 30s for in-progress
 */
export const Route = createFileRoute('/api/discord/activity-image')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const url = new URL(request.url);
                const type = url.searchParams.get('type');

                try {
                    let png: Buffer;
                    let maxAge = 30;

                    if (type === 'daily') {
                        const userId = url.searchParams.get('userId') ?? '0';
                        const avatar = url.searchParams.get('avatar') || null;
                        const username = url.searchParams.get('username') ?? 'Player';
                        const status = url.searchParams.get('status') === 'completed' ? 'completed' : 'solving';

                        png = await generateDailyImage(userId, avatar, username, status);
                        maxAge = status === 'completed' ? 300 : 30;
                    } else if (type === 'race') {
                        const playersJson = url.searchParams.get('players');
                        const players = playersJson ? JSON.parse(playersJson) : [];
                        const phase = url.searchParams.get('phase') ?? 'waiting';
                        const round = parseInt(url.searchParams.get('round') ?? '0', 10);
                        const raceMode = url.searchParams.get('raceMode') ?? 'time';
                        const raceStartedAt = parseInt(url.searchParams.get('raceStartedAt') ?? '0', 10) || null;

                        png = await generateRaceImage(players, phase, round, raceMode, raceStartedAt);
                        maxAge = phase === 'results' ? 120 : 15;
                    } else {
                        return new Response('Missing or invalid type parameter', { status: 400 });
                    }

                    return new Response(new Uint8Array(png), {
                        headers: {
                            'Content-Type': 'image/png',
                            'Cache-Control': `public, max-age=${maxAge}`,
                        },
                    });
                } catch (e) {
                    console.error('Activity image generation error:', e);
                    return new Response('Image generation failed', { status: 500 });
                }
            },
        },
    },
});
