/**
 * Who may edit a community wiki page (F21). Client-safe.
 *
 * The interesting policy is `trusted` — "a member for 30 days with no strikes".
 * Wikis fail in exactly one way, and it is not a technical one: the first time
 * a drive-by account rewrites the rules page, the community stops using the
 * wiki. `members` is the open setting for communities that want it; `trusted`
 * is the setting that makes an open wiki survivable, and it is only meaningful
 * if the tenure and the strike record are checked against the real tables
 * rather than approximated.
 *
 * The predicate is pure and lives here so the editor can grey out the Save
 * button with the same rule the server refuses on.
 */

export const EDIT_POLICIES = ['mods', 'members', 'trusted'] as const;
export type EditPolicy = (typeof EDIT_POLICIES)[number];

export function isEditPolicy(value: string): value is EditPolicy {
  return (EDIT_POLICIES as readonly string[]).includes(value);
}

/** Mirrors `enum CommunityRole`; re-declared so this file stays Prisma-free. */
export type CommunityRole = 'MEMBER' | 'MOD' | 'ADMIN';

/** How long a member must have been around to count as trusted. */
export const TRUSTED_MEMBER_DAYS = 30;
export const TRUSTED_MEMBER_MS = TRUSTED_MEMBER_DAYS * 24 * 60 * 60 * 1000;

/** Everything the policy needs to know about one would-be editor. */
export interface EditorStanding {
  /** `null` when the viewer is not a member (or is signed out). */
  role: CommunityRole | null;
  /** When they joined this community; `null` when not a member. */
  joinedAt: Date | null;
  /**
   * Strikes that are still in force — permanent ones, or ones that have not
   * expired yet. A lapsed strike does not bar someone forever; a live one does.
   */
  activeStrikes: number;
  /** Site admins edit anything, the same as everywhere else on the platform. */
  isSiteAdmin?: boolean;
}

export function isModerator(role: CommunityRole | null): boolean {
  return role === 'MOD' || role === 'ADMIN';
}

/**
 * Whether `standing` may edit a page governed by `policy`.
 *
 * Moderators are above the policy by construction: `editPolicy` restricts who
 * *else* can edit, and a setting that could lock a community's own mods out of
 * their rules page would be a footgun with no upside.
 */
export function canEditPage(
  policy: EditPolicy,
  standing: EditorStanding,
  now: Date = new Date(),
): boolean {
  if (standing.isSiteAdmin) return true;
  if (isModerator(standing.role)) return true;
  if (standing.role === null) return false;
  if (policy === 'mods') return false;
  if (policy === 'members') return true;

  // trusted
  if (standing.activeStrikes > 0) return false;
  if (!standing.joinedAt) return false;
  return now.getTime() - standing.joinedAt.getTime() >= TRUSTED_MEMBER_MS;
}

/** Why an edit was refused — so the UI can say something more useful than "no". */
export type EditRefusal = 'NOT_A_MEMBER' | 'MODS_ONLY' | 'TOO_NEW' | 'HAS_STRIKES';

export function refusalReason(
  policy: EditPolicy,
  standing: EditorStanding,
  now: Date = new Date(),
): EditRefusal | null {
  if (canEditPage(policy, standing, now)) return null;
  if (standing.role === null) return 'NOT_A_MEMBER';
  if (policy === 'mods') return 'MODS_ONLY';
  if (standing.activeStrikes > 0) return 'HAS_STRIKES';
  return 'TOO_NEW';
}

/**
 * Slug for a wiki page. Bounded to the column's `VarChar(60)` and never empty —
 * an empty slug would collide on the `(communityId, slug)` unique index and
 * make the *second* page anyone creates fail with a database error.
 */
export const MAX_PAGE_SLUG = 60;
export const MAX_PAGE_TITLE = 120;
export const MAX_PAGE_BODY = 100_000;
export const MAX_REVISION_SUMMARY = 200;

export function slugifyPageTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_PAGE_SLUG)
    .replace(/-+$/, '');
  return slug || 'page';
}
