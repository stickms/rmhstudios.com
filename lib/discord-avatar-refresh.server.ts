import { prisma } from '@/lib/prisma.server';

/**
 * Lazy, best-effort refresh of a user's stored Discord avatar.
 *
 * Discord avatar URLs embed the avatar *hash*
 * (`https://cdn.discordapp.com/avatars/{userId}/{hash}.png`). When a user
 * changes their Discord avatar the hash changes and the stored URL starts
 * returning 404/502. Better-auth already re-syncs the avatar on every sign-in
 * (`overrideUserInfoOnSignIn`), so this only fixes the stragglers who changed
 * their avatar but haven't logged back in.
 *
 * This runs lazily — only when the image proxy actually fails to load a Discord
 * avatar — and is heavily guarded so it can't spam the Discord API:
 *   - only fires for `cdn.discordapp.com/avatars/...` URLs
 *   - a per-Discord-user in-memory cooldown rate-limits repeat attempts
 *   - makes at most one `GET /users/{id}` call per attempt
 */

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_ACTIVITY_BOT_TOKEN;

// https://cdn.discordapp.com/avatars/{discordUserId}/{hash}.{ext}
const DISCORD_AVATAR_RE = /^https?:\/\/cdn\.discordapp\.com\/avatars\/(\d+)\/[^/?#]+/;

// Don't re-attempt a refresh for the same Discord user more than once per window,
// no matter how many times their broken avatar is rendered.
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const lastAttempt = new Map<string, number>();
const MAX_TRACKED = 5000;

export function isDiscordAvatarUrl(url: string | null | undefined): url is string {
  return !!url && DISCORD_AVATAR_RE.test(url);
}

function extractDiscordId(url: string): string | null {
  return url.match(DISCORD_AVATAR_RE)?.[1] ?? null;
}

function onCooldown(discordId: string): boolean {
  const now = Date.now();
  const last = lastAttempt.get(discordId);
  if (last !== undefined && now - last < COOLDOWN_MS) return true;

  // Opportunistically prune expired entries so the map stays bounded.
  if (lastAttempt.size >= MAX_TRACKED) {
    for (const [id, t] of lastAttempt) {
      if (now - t >= COOLDOWN_MS) lastAttempt.delete(id);
    }
  }
  lastAttempt.set(discordId, now);
  return false;
}

/**
 * Given the broken Discord avatar URL that just failed to load, fetch the
 * user's current avatar from Discord and update their stored `image`.
 * Best-effort and non-blocking: callers should not await the result.
 */
export async function refreshDiscordAvatarFromBrokenUrl(brokenUrl: string): Promise<void> {
  if (!BOT_TOKEN) return;

  const discordId = extractDiscordId(brokenUrl);
  if (!discordId || onCooldown(discordId)) return;

  try {
    const account = await prisma.account.findFirst({
      where: { providerId: 'discord', accountId: discordId },
      select: { userId: true },
    });
    if (!account) return;

    const user = await prisma.user.findUnique({
      where: { id: account.userId },
      select: { image: true },
    });
    // Only act if the stored avatar is the one that's actually broken — avoids
    // clobbering an image the user has since updated through another path.
    if (!user || user.image !== brokenUrl) return;

    const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!res.ok) return;

    const discordUser = (await res.json()) as { avatar: string | null };
    const newImage = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.${
          discordUser.avatar.startsWith('a_') ? 'gif' : 'png'
        }`
      : null; // avatar removed — fall back to the default avatar in the UI

    if (newImage === user.image) return;

    await prisma.user.update({
      where: { id: account.userId },
      data: { image: newImage },
    });
  } catch {
    // Best-effort: never let a refresh failure affect the request that triggered it.
  }
}
