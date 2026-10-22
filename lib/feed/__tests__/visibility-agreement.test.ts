/**
 * `canViewPost`, `canReadThread` and `viewerVisiblePostWhere` are three
 * spellings of ONE rule. They disagreed once (canViewPost ignored deleted posts
 * and blocks, so a viewer blocked by A still got A's post body, history and
 * translation while its comments 404ed). This table walks the whole cross
 * product and asserts all three give the same answer as an independent oracle:
 *
 *   audience (PUBLIC / FOLLOWERS / SUPPORTERS / CIRCLE / PRIVATE)
 * x relation (author / follower / supporter active|expired / circle / stranger / anonymous)
 * x blocked (no / either direction: one set, `getBlockedAuthorIds` is symmetric)
 * x community (none / public / private member / private non-member)
 * x deleted x expired.
 *
 * `viewerVisiblePostWhere` is evaluated with the repo's where-eval helper, i.e.
 * against ROWS, not by inspecting the query shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evalWhere, type Row } from './where-eval';

type Audience = 'PUBLIC' | 'FOLLOWERS' | 'SUPPORTERS' | 'CIRCLE' | 'PRIVATE';
type Relation =
  | 'author'
  | 'follower'
  | 'supporter-active'
  | 'supporter-expired'
  | 'circle'
  | 'stranger'
  | 'anonymous';
type Community = 'none' | 'public' | 'private-member' | 'private-non-member';

const h = vi.hoisted(() => ({
  blocked: [] as string[],
  following: false,
  circle: false,
  membership: null as null | { expiresAt: Date },
  community: null as null | { isPrivate: boolean; member: boolean },
  viewer: null as string | null,
}));

vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => h.blocked,
  getBlockedAuthorIds: async () => h.blocked,
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    community: {
      findUnique: async () =>
        h.community
          ? {
              isPrivate: h.community.isPrivate,
              members: h.viewer ? (h.community.member ? [{ id: 'm' }] : []) : undefined,
            }
          : null,
    },
    closeFriend: { findUnique: async () => (h.circle ? { ownerId: 'author' } : null) },
    creatorMembership: { findUnique: async () => h.membership },
    follow: { findUnique: async () => (h.following ? { id: 'f' } : null) },
  },
}));

import { canReadThread, canViewPost, viewerVisiblePostWhere } from '../audience.server';

const AUDIENCES: Audience[] = ['PUBLIC', 'FOLLOWERS', 'SUPPORTERS', 'CIRCLE', 'PRIVATE'];
const RELATIONS: Relation[] = [
  'author',
  'follower',
  'supporter-active',
  'supporter-expired',
  'circle',
  'stranger',
  'anonymous',
];
const COMMUNITIES: Community[] = ['none', 'public', 'private-member', 'private-non-member'];
const DAY = 86_400_000;

/** The rule, written once more, plainly, independent of every implementation. */
function oracle(c: {
  audience: Audience;
  relation: Relation;
  blocked: boolean;
  community: Community;
  deleted: boolean;
  expired: boolean;
}): boolean {
  if (c.deleted || c.expired) return false;
  if (c.blocked && c.relation !== 'author' && c.relation !== 'anonymous') return false;
  if (c.community === 'private-non-member') return false;
  if (c.community === 'private-member' && c.relation === 'anonymous') return false;
  if (c.audience === 'PUBLIC') return true;
  if (c.relation === 'anonymous') return false;
  if (c.relation === 'author') return true;
  switch (c.audience) {
    case 'FOLLOWERS':
      return c.relation === 'follower';
    case 'SUPPORTERS':
      return c.relation === 'supporter-active';
    case 'CIRCLE':
      return c.relation === 'circle';
    default:
      return false;
  }
}

beforeEach(() => {
  h.blocked = [];
});

describe('canViewPost / canReadThread / viewerVisiblePostWhere agree', () => {
  it.each(AUDIENCES)('audience %s, every relation x blocked x community x deleted x expired', async (audience) => {
    const mismatches: string[] = [];
    let cases = 0;
    for (const relation of RELATIONS) {
      for (const blocked of [false, true]) {
        for (const community of COMMUNITIES) {
          for (const deleted of [false, true]) {
            for (const expired of [false, true]) {
              // "blocked" is meaningless for the author and for a signed-out viewer.
              if (blocked && (relation === 'author' || relation === 'anonymous')) continue;
              // Anonymous viewers are members of nothing.
              if (relation === 'anonymous' && community === 'private-member') continue;
              cases++;
              const viewer = relation === 'anonymous' ? null : relation === 'author' ? 'author' : 'viewer';
              h.viewer = viewer;
              h.blocked = blocked ? ['author'] : [];
              h.following = relation === 'follower';
              h.circle = relation === 'circle';
              h.membership =
                relation === 'supporter-active'
                  ? { expiresAt: new Date(Date.now() + DAY) }
                  : relation === 'supporter-expired'
                    ? { expiresAt: new Date(Date.now() - DAY) }
                    : null;
              h.community =
                community === 'none'
                  ? null
                  : {
                      isPrivate: community !== 'public',
                      member: community === 'private-member',
                    };

              const deletedAt = deleted ? new Date(Date.now() - DAY) : null;
              const expiresAt = expired ? new Date(Date.now() - 1000) : new Date(Date.now() + DAY);
              const post = {
                userId: 'author',
                audience,
                communityId: community === 'none' ? null : 'c1',
                deletedAt,
                expiresAt,
              };

              // The row, with the relations `audienceWhereExact` / `communityVisibleWhere` join through.
              const row: Row = {
                ...post,
                community: h.community
                  ? {
                      isPrivate: h.community.isPrivate,
                      members: h.community.member && viewer ? [{ userId: viewer }] : [],
                    }
                  : null,
                user: {
                  followers: h.following ? [{ followerId: viewer }] : [],
                  closeFriendsOwned: h.circle ? [{ memberId: viewer }] : [],
                  creatorMemberships: h.membership
                    ? [{ supporterId: viewer, expiresAt: h.membership.expiresAt }]
                    : [],
                },
              };

              const where = await viewerVisiblePostWhere(viewer);
              const got = {
                canViewPost: await canViewPost(post, viewer),
                canReadThread: await canReadThread(post, viewer),
                where: evalWhere(row, where),
              };
              const want = oracle({ audience, relation, blocked, community, deleted, expired });
              if (got.canViewPost !== want || got.canReadThread !== want || got.where !== want) {
                mismatches.push(
                  `${relation} blocked=${blocked} community=${community} deleted=${deleted} expired=${expired}: want ${want}, got ${JSON.stringify(got)}`,
                );
              }
            }
          }
        }
      }
    }
    expect(cases).toBeGreaterThan(100);
    expect(mismatches).toEqual([]);
  });

  it('a deleted post stays viewable by the tombstone route when it omits deletedAt, but a block still denies', async () => {
    // The post-detail route renders deleted posts as a tombstone on purpose, so it
    // calls canViewPost WITHOUT deletedAt; blocks and audience still apply.
    h.viewer = 'viewer';
    h.community = null;
    h.blocked = [];
    expect(await canViewPost({ userId: 'author', audience: 'PUBLIC', communityId: null }, 'viewer')).toBe(true);
    h.blocked = ['author'];
    expect(await canViewPost({ userId: 'author', audience: 'PUBLIC', communityId: null }, 'viewer')).toBe(false);
  });

  it('a failed block lookup fails the read, never reads as "no blocks"', async () => {
    h.viewer = 'viewer';
    h.community = null;
    const mod = await import('@/lib/moderation.server');
    vi.spyOn(mod, 'getBlockedAuthorIds').mockRejectedValueOnce(new Error('db down'));
    await expect(
      canViewPost({ userId: 'author', audience: 'PUBLIC', communityId: null }, 'viewer'),
    ).rejects.toThrow('db down');
  });
});
