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

/**
 * Whether to show the one-time "your playtime is visible" notice. Playtime is
 * public by default, so an existing user becomes visible without having done
 * anything; this tells them once, with a way to change it. Someone who has
 * already narrowed the setting does not need telling.
 */
export function shouldShowNotice(s: {
  signedIn: boolean;
  noticeDismissed: boolean;
  privacy: PlaytimePrivacy;
}): boolean {
  return s.signedIn && !s.noticeDismissed && s.privacy === 'public';
}
