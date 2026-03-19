import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/discord/token')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const ip = getClientIp(request);
                const { allowed, retryAfter } = rateLimit(ip, {
                    limit: 10,
                    windowMs: 60_000,
                    prefix: 'discord-token',
                });

                if (!allowed) {
                    return Response.json(
                        { error: 'Too many requests' },
                        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
                    );
                }

                try {
                    const { code } = await request.json();
                    if (!code || typeof code !== 'string') {
                        return Response.json({ error: 'Missing code' }, { status: 400 });
                    }

                    const clientId = process.env.DISCORD_ACTIVITY_CLIENT_ID;
                    const clientSecret = process.env.DISCORD_ACTIVITY_CLIENT_SECRET;

                    if (!clientId || !clientSecret) {
                        return Response.json({ error: 'Server misconfigured' }, { status: 500 });
                    }

                    // Exchange the authorization code for an access token
                    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            client_id: clientId,
                            client_secret: clientSecret,
                            grant_type: 'authorization_code',
                            code,
                        }),
                    });

                    if (!tokenRes.ok) {
                        const errBody = await tokenRes.text();
                        console.error('Discord token exchange failed:', errBody);
                        return Response.json({ error: 'Token exchange failed' }, { status: 502 });
                    }

                    const { access_token } = await tokenRes.json();

                    // Fetch the Discord user to get their ID
                    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
                        headers: { Authorization: `Bearer ${access_token}` },
                    });

                    let linkedUserId: string | null = null;

                    if (userRes.ok) {
                        const discordUser = await userRes.json();
                        const discordId = discordUser.id;

                        // Check if this Discord account is linked to an rmhstudios account
                        const account = await prisma.account.findFirst({
                            where: {
                                providerId: 'discord',
                                accountId: discordId,
                            },
                            select: { userId: true },
                        });

                        linkedUserId = account?.userId ?? null;
                    }

                    return Response.json({ access_token, linkedUserId });
                } catch (e) {
                    console.error('Discord token endpoint error:', e);
                    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
                }
            },
        },
    },
});
