/**
 * Who may see a user's per-title playtime. The setting lives on
 * `User.playtimePrivacy` (default `public` — an owner decision: public, opt out)
 * and is enforced server-side, in every read path, by `canViewPlaytime`.
 *
 * `followers` means visible to the people who follow that user.
 *
 * Pure and client-safe.
 */

export const PLAYTIME_PRIVACY_VALUES = ['public', 'followers', 'private'] as const;
export type PlaytimePrivacy = (typeof PLAYTIME_PRIVACY_VALUES)[number];

export function isPlaytimePrivacy(v: unknown): v is PlaytimePrivacy {
  return (PLAYTIME_PRIVACY_VALUES as readonly unknown[]).includes(v);
}

export function canViewPlaytime(
  setting: PlaytimePrivacy,
  ctx: { viewerId: string | null; ownerId: string; viewerFollowsOwner: boolean },
): boolean {
  if (!ctx.viewerId) return false;
  if (ctx.viewerId === ctx.ownerId) return true;
  if (setting === 'public') return true;
  if (setting === 'followers') return ctx.viewerFollowsOwner;
  return false;
}
