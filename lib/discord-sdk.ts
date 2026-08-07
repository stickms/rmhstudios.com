'use client';

import { useState, useEffect, useRef } from 'react';
import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';

// Re-exported for the /discord/* call sites, which load the SDK anyway. Code on
// a SHARED path (__root.tsx, lib/sw-register.ts, …) must import it from
// '@/lib/discord-activity' directly — importing it from here would pull the
// 135 KB SDK into the client entry chunk. See that file's docblock.
export { isDiscordActivity } from '@/lib/discord-activity';

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
  /**
   * Everyone currently connected to this Activity instance, including the
   * caller. Seeded with just `[user]` until the real roster comes back from
   * `getActivityInstanceConnectedParticipants()` (below) and kept live via
   * `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` — callers that need to know "am I
   * the one who opened this Activity" (`participants[0]?.id === user.id`)
   * would otherwise always see themselves alone and always answer yes.
   */
  participants: DiscordUser[];
  /** The rmhstudios.com user ID if this Discord account is linked */
  linkedUserId: string | null;
}

/** The subset of Discord's participant payload every call site needs. */
interface RawParticipant {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string | null;
  global_name?: string | null;
}

function toDiscordUsers(raw: RawParticipant[]): DiscordUser[] {
  return raw.map((p) => ({
    id: p.id,
    username: p.username,
    discriminator: p.discriminator,
    avatar: p.avatar ?? null,
    global_name: p.global_name ?? null,
  }));
}

/**
 * Convert a full HTTPS URL into Discord's `mp:external/` proxy format
 * so it can be used as a rich presence image.
 */
function toDiscordImageProxy(url: string): string {
  // Discord expects: mp:external/https/domain.com/path?query
  return url.replace(/^https:\/\//, 'mp:external/https/');
}

/**
 * A Discord CDN avatar URL for display — never fetched or copied into our own
 * storage, just referenced directly, which is also why this returns a URL and
 * not a blob.
 */
export function discordAvatarUrl(user: DiscordUser, size = 128): string {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}`;
  }
  // Modern (migrated, discriminator "0") accounts pick a default avatar from
  // the snowflake itself; legacy ones from the discriminator. Matches the
  // formula already used server-side in lib/discord-activity-image.tsx.
  const index =
    user.discriminator === '0' || !user.discriminator
      ? Number(BigInt(user.id) >> 22n) % 6
      : Number(user.discriminator) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/**
 * Update the Discord Activity rich presence status text + image.
 * The `state` text appears in the Game Invitation embed and user profile.
 * The `imageUrl` appears only in the user's profile rich presence popup.
 */
export function setActivityStatus(
  sdk: DiscordSDK,
  state: string,
  opts?: {
    details?: string;
    partySize?: [current: number, max: number];
    imageUrl?: string;
    /** Alt text for `imageUrl`. Defaults to the platform name — pass the
     *  game's own title once more than one Activity sets an image, or
     *  every game's rich presence reads "RMH Studios" underneath its art. */
    imageLabel?: string;
  },
) {
  const assets = opts?.imageUrl
    ? {
        large_image: toDiscordImageProxy(opts.imageUrl),
        large_text: opts.imageLabel ?? 'RMH Studios',
      }
    : undefined;

  sdk.commands
    .setActivity({
      activity: {
        state,
        details: opts?.details,
        type: 0,
        ...(opts?.partySize ? { party: { size: opts.partySize } } : {}),
        ...(assets ? { assets } : {}),
      },
    })
    .catch((err) => {
      console.warn('[Discord] setActivity failed:', err);
    });
}

type DiscordState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; context: DiscordContext };

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
        const mappings: { prefix: string; target: string }[] = [];
        const socketUrl = import.meta.env.VITE_SOCKET_URL;
        if (socketUrl) {
          try {
            mappings.push({ prefix: '/socket/', target: new URL(socketUrl).host });
          } catch {}
        }
        const rmhboxUrl = import.meta.env.VITE_RMHBOX_SOCKET_URL;
        if (rmhboxUrl) {
          try {
            mappings.push({ prefix: '/rmhbox-ws/', target: new URL(rmhboxUrl).host });
          } catch {}
        }
        if (mappings.length > 0) patchUrlMappings(mappings);

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

  // The real roster, fetched once the handshake is done and kept live.
  //
  // `state.context.participants` starts as `[user]` (set above) because that is
  // the only participant the handshake itself knows about. Anything that reads
  // "am I first" off that seed — the Activity gateway's game picker, chiefly —
  // would otherwise see itself alone and always answer yes, which defeats the
  // whole point of asking.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const sdk = state.context.sdk;
    let cancelled = false;

    const apply = (participants: DiscordUser[]) => {
      if (cancelled || participants.length === 0) return;
      setState((prev) =>
        prev.status === 'ready' ? { ...prev, context: { ...prev.context, participants } } : prev,
      );
    };

    sdk.commands
      .getActivityInstanceConnectedParticipants()
      .then((res) => apply(toDiscordUsers(res.participants)))
      .catch((err) => {
        // Left at the `[user]` seed — a stale-but-safe answer to "who is
        // here", not a broken Activity.
        console.warn('[Discord] getActivityInstanceConnectedParticipants failed:', err);
      });

    const onUpdate = (payload: { participants: RawParticipant[] }) => {
      apply(toDiscordUsers(payload.participants));
    };
    sdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', onUpdate);

    return () => {
      cancelled = true;
      sdk.unsubscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', onUpdate);
    };
    // `state.context.sdk` is deliberately omitted: it is stable for the
    // whole 'ready' lifetime, and this effect's own `apply()` writes a new
    // `state.context` on every roster update — depending on it here would
    // tear the subscription down and rebuild it on every update it causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  return state;
}
