/**
 * Turn an admin audience (all users, filters, or a manual list) into a Prisma
 * `where` on `user`. Pure: the caller passes in the ids of current members, so
 * the builder needs no database and is unit-tested (`audience.test.ts`).
 *
 * Whatever the audience, the same floor applies: never a bot, never an account
 * without a routable address (none at all, or a provider placeholder), and
 * never a banned account unless the filters explicitly include them. A manual
 * selection gets the same floor, so picking a bot or a placeholder address
 * simply leaves it out of the count.
 */
import type { Prisma } from '@prisma/client';
import { PLACEHOLDER_EMAIL_SUFFIX } from '@/lib/auth/providers';
import type { Audience } from '@/lib/email/campaign-schema';
import {
  EMAIL_COLUMNS,
  EMAIL_DEFAULTS,
  campaignPreference,
  type CampaignCategory,
} from '@/lib/email/preferences';

const DAY_MS = 86_400_000;

/** True when the audience needs the member id list (so the caller can skip that query). */
export function needsMemberIds(audience: Audience): boolean {
  return audience.mode === 'filter' && audience.filters.membership !== undefined;
}

export function audienceWhere(
  audience: Audience,
  opts: { now?: Date; memberIds?: readonly string[] } = {},
): Prisma.UserWhereInput {
  const now = opts.now ?? new Date();
  const and: Prisma.UserWhereInput[] = [
    { isBot: false },
    { email: { not: null } },
    { NOT: { email: { endsWith: PLACEHOLDER_EMAIL_SUFFIX, mode: 'insensitive' } } },
  ];

  const includeBanned = audience.mode === 'filter' && audience.filters.includeBanned === true;
  if (!includeBanned) {
    and.push({ OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }] });
  }

  if (audience.mode === 'manual') {
    and.push({ id: { in: [...new Set(audience.userIds)] } });
  }

  if (audience.mode === 'filter') {
    const f = audience.filters;
    if (f.search) {
      const contains = { contains: f.search, mode: 'insensitive' as const };
      and.push({
        OR: [{ name: contains }, { username: contains }, { handle: contains }, { email: contains }],
      });
    }
    if (f.emailDomain) {
      and.push({ email: { endsWith: `@${f.emailDomain}`, mode: 'insensitive' } });
    }
    if (f.joinedAfter) and.push({ createdAt: { gte: new Date(`${f.joinedAfter}T00:00:00Z`) } });
    if (f.joinedBefore) {
      // Inclusive of the whole day named.
      and.push({ createdAt: { lt: new Date(Date.parse(`${f.joinedBefore}T00:00:00Z`) + DAY_MS) } });
    }
    if (f.activeWithinDays !== undefined) {
      and.push({ lastSeenAt: { gte: new Date(now.getTime() - f.activeWithinDays * DAY_MS) } });
    }
    if (f.inactiveForDays !== undefined) {
      const cutoff = new Date(now.getTime() - f.inactiveForDays * DAY_MS);
      and.push({ OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] });
    }
    if (f.emailVerified === true) and.push({ emailVerified: true });
    if (f.emailVerified === false) and.push({ NOT: { emailVerified: true } });
    if (f.role === 'admins') and.push({ isAdmin: true });
    if (f.role === 'non-admins') and.push({ isAdmin: false });
    if (f.verifiedBadge === 'yes') and.push({ isVerified: true });
    if (f.verifiedBadge === 'no') and.push({ isVerified: false });
    if (f.membership) {
      const ids = [...(opts.memberIds ?? [])];
      and.push(f.membership === 'members' ? { id: { in: ids } } : { id: { notIn: ids } });
    }
    if (f.minFollowers) and.push({ followerCount: { gte: f.minFollowers } });
    if (f.minPosts) and.push({ postCount: { gte: f.minPosts } });
  }

  return { AND: and };
}

/**
 * The users who accept a campaign category, as a `where` on `user`, or `null`
 * when the category ignores preferences (a required service notice). A user
 * with no preference row reads the category default.
 */
export function preferenceWhere(category: CampaignCategory): Prisma.UserWhereInput | null {
  const pref = campaignPreference(category);
  if (!pref) return null;
  const column = EMAIL_COLUMNS[pref];
  return EMAIL_DEFAULTS[pref]
    ? { NOT: { notificationPreference: { is: { [column]: false } } } }
    : { notificationPreference: { is: { [column]: true } } };
}
