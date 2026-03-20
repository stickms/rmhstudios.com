'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DiscordSDK, patchUrlMappings, type Types } from '@discord/embedded-app-sdk';

export interface DiscordUser {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    global_name: string | null;
}

export interface DiscordContext {
    sdk: DiscordSDK;
    user: DiscordUser;
    accessToken: string;
    channelId: string | null;
    guildId: string | null;
    participants: DiscordUser[];
    /** The rmhstudios.com user ID if this Discord account is linked */
    linkedUserId: string | null;
}

/**
 * Update the Discord Activity rich presence status text + image.
 * Silently fails if the SDK doesn't support it.
 */
export function setActivityStatus(
    sdk: DiscordSDK,
    state: string,
    opts?: {
        details?: string;
        partySize?: [current: number, max: number];
        imageUrl?: string;
    },
) {
    sdk.commands.setActivity({
        activity: {
            state,
            details: opts?.details,
            type: 0,
            ...(opts?.partySize ? { party: { size: opts.partySize } } : {}),
            ...(opts?.imageUrl ? { assets: { large_image: opts.imageUrl, large_text: 'Lights Out' } } : {}),
        },
    }).catch(() => {});
}

type DiscordState =
    | { status: 'loading' }
    | { status: 'error'; error: string }
    | { status: 'ready'; context: DiscordContext };

/**
 * Detects whether the app is running inside a Discord Activity iframe.
 */
export function isDiscordActivity(): boolean {
    if (typeof window === 'undefined') return false;
    // Discord Activities are loaded in an iframe with a specific query param
    const params = new URLSearchParams(window.location.search);
    return params.has('frame_id') && params.has('instance_id');
}

/**
 * Hook to initialize the Discord Embedded App SDK.
 * Handles the full handshake: ready → authorize → token exchange → authenticate.
 */
export function useDiscordSdk(): DiscordState {
    const [state, setState] = useState<DiscordState>({ status: 'loading' });
    const initRef = useRef(false);

    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;

        const clientId = import.meta.env.VITE_DISCORD_ACTIVITY_CLIENT_ID;
        if (!clientId) {
            setState({ status: 'error', error: 'Missing VITE_DISCORD_ACTIVITY_CLIENT_ID' });
            return;
        }

        const sdk = new DiscordSDK(clientId);

        (async () => {
            try {
                // 1. Wait for SDK to be ready
                await sdk.ready();

                // 1b. Patch URL mappings so WebSocket/fetch/XHR route through Discord's proxy.
                // This rewrites requests to the actual server → proxy (discordsays.com).
                // Must match the URL mappings in Discord Developer Portal.
                const socketUrl = import.meta.env.VITE_SOCKET_URL;
                if (socketUrl) {
                    try {
                        const socketHost = new URL(socketUrl).host;
                        patchUrlMappings([
                            { prefix: '/socket/', target: socketHost },
                        ]);
                    } catch {}
                }

                // 2. Authorize — request an auth code
                const { code } = await sdk.commands.authorize({
                    client_id: clientId,
                    response_type: 'code',
                    state: '',
                    prompt: 'none',
                    scope: ['identify'],
                });

                // 3. Exchange code for access token via our server
                const tokenRes = await fetch('/api/discord/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });

                if (!tokenRes.ok) {
                    throw new Error('Token exchange failed');
                }

                const { access_token, linkedUserId } = await tokenRes.json();

                // 4. Authenticate with Discord
                const authResult = await sdk.commands.authenticate({
                    access_token,
                });

                if (!authResult?.user) {
                    throw new Error('Discord authentication failed');
                }

                const user: DiscordUser = {
                    id: authResult.user.id,
                    username: authResult.user.username,
                    discriminator: authResult.user.discriminator,
                    avatar: authResult.user.avatar ?? null,
                    global_name: (authResult.user as any).global_name ?? null,
                };

                setState({
                    status: 'ready',
                    context: {
                        sdk,
                        user,
                        accessToken: access_token,
                        channelId: sdk.channelId,
                        guildId: sdk.guildId,
                        participants: [user],
                        linkedUserId: linkedUserId ?? null,
                    },
                });
            } catch (err) {
                console.error('Discord SDK init failed:', err);
                setState({
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        })();
    }, []);

    return state;
}
