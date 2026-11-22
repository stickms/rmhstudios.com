/**
 * The pure audience rules a profile applies to a viewer: who sits inside the presence audience, and which tabs the
 * profile shows. `getProfile` (lib/profile.server.ts) and the profile tab bar call these, and so does the profile
 * preview when it describes what a follower sees, so the preview never restates a rule of its own.
 */

export const PRESENCE_VISIBILITIES = ['followers', 'mutuals', 'nobody'] as const;

/** The facts the presence audience needs about one viewer of one profile. */
export interface PresenceAudienceFacts {
  /** The profile owner's "who can see my presence" setting (`mutuals` is the default). */
  visibility: string;
  isOwnProfile: boolean;
  /** False when signed out. */
  hasViewer: boolean;
  viewerFollowsOwner: boolean;
  ownerFollowsViewer: boolean;
}

/**
 * Whether the viewer is inside the owner's presence audience: the owner always, `followers` for anyone who follows
 * the owner, `mutuals` also needs the owner to follow back, `nobody` for no one else. Outside it the profile reads
 * offline.
 */
export function inPresenceAudience(f: PresenceAudienceFacts): boolean {
  if (f.isOwnProfile) return true;
  if (!f.hasViewer || f.visibility === 'nobody' || !f.viewerFollowsOwner) return false;
  if (f.visibility === 'followers') return true;
  return f.ownerFollowsViewer;
}

/** Whether the profile shows a Likes tab: always to its owner, to others when the owner shows likes. */
export function likesTabVisible(f: { isOwnProfile: boolean; showLikes: boolean }): boolean {
  return f.isOwnProfile || f.showLikes;
}

/** Whether the profile shows a Guestbook tab: always to its owner, to others unless the guestbook is off. */
export function guestbookTabVisible(f: { isOwnProfile: boolean; guestbookMode?: string | null | undefined }): boolean {
  return f.isOwnProfile || (!!f.guestbookMode && f.guestbookMode !== 'off');
}
