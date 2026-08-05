/**
 * ───────────── deterministic test fixtures for the social models ─────────────
 *
 * Every value produced here is a pure function of a module-level counter. There
 * is **no `Date.now()` and no `Math.random()` anywhere in this file**, and that
 * is the entire point of it existing.
 *
 * A factory built on the wall clock produces a test that passes 99 times and
 * fails the hundredth, and the failures cluster in exactly the places that make
 * them hardest to read:
 *
 *   • `Date.now()` in a fixture plus a `toEqual` on a serialized row is a
 *     millisecond race with the assertion. It fails when CI is slow.
 *   • Timestamps derived from "now" straddle DST and month boundaries, so a
 *     "posted 30 days ago" fixture is 29 or 31 days ago twice a year — which
 *     breaks the streak, wrapped, quest-window and battlepass-season logic that
 *     this codebase has a lot of.
 *   • `Math.random()` ids collide rarely enough that the collision looks like a
 *     logic bug in whatever consumed them, and the reproduction is gone by the
 *     time anyone looks.
 *
 * All three land in the same place: someone marks the test flaky, retries it in
 * CI, and the suite stops being evidence of anything. A fixed epoch and a
 * sequence make a failing test failing *for a reason*, every time.
 *
 * ## Shapes
 *
 * The return types are Prisma's own generated model types (`User`, `RMHark`,
 * `RMHarkComment`, `Notification`), not hand-copied interfaces. That is
 * deliberate: `pnpm exec tsc --noEmit` fails here the moment a column is added,
 * renamed or made non-nullable in `prisma/schema.prisma`, which is the only way
 * a fixture file stays honest. A hand-written shape silently drifts from the
 * schema and the tests keep passing against a row the database can no longer
 * produce.
 *
 * ## Usage
 *
 *   import { aUser, aPost, resetFactories, SEED_USER_ID } from '@/testing/factories';
 *
 *   beforeEach(() => resetFactories());   // ids restart at 0001 for every test
 *
 *   const author = aUser({ handle: 'ada' });
 *   const post = aPost({ userId: author.id, content: 'hello' });
 *
 * Call `resetFactories()` in `beforeEach`, not `beforeAll`: without it the ids a
 * test sees depend on how many fixtures the tests *before* it built, so the
 * suite passes in file order and fails under `--shard` or `.only`. That is the
 * same class of bug as the wall clock, arriving by a different door.
 */

import type { Notification, RMHark, RMHarkComment, User } from '@prisma/client';

/**
 * The fixed clock. 2026-01-01T00:00:00Z — a Thursday, deliberately not a month
 * or quarter boundary edge case, and safely in the past relative to any code
 * that reasons about "before now".
 */
export const EPOCH = new Date('2026-01-01T00:00:00.000Z');

/** Milliseconds since the unix epoch for `EPOCH`, for arithmetic. */
export const EPOCH_MS = EPOCH.getTime();

/** One minute between consecutive fixtures — enough to sort, small enough to read. */
const STEP_MS = 60_000;

/**
 * The id `aUser()` returns on the first call after `resetFactories()`. The
 * post/comment/notification factories default their foreign keys to it, so
 * `aUser()` + `aPost()` compose into a consistent little graph with no wiring.
 * Pass an explicit `userId` for anything more than one author.
 */
export const SEED_USER_ID = 'usr_0001';

let sequence = 0;

/** Reset the id/timestamp sequence. Call in `beforeEach`. */
export function resetFactories(): void {
  sequence = 0;
}

/** The current sequence value — exposed for assertions about fixture counts. */
export function factorySequence(): number {
  return sequence;
}

function next(): number {
  sequence += 1;
  return sequence;
}

/** `usr_0001`, `post_0012` — sortable, greppable, and stable across runs. */
function idFor(prefix: string, n: number): string {
  return `${prefix}_${String(n).padStart(4, '0')}`;
}

/**
 * A timestamp derived from the sequence: fixture N is N minutes after `EPOCH`.
 * Monotonic, so `createdAt desc` orderings in tests match creation order.
 */
export function at(n: number, offsetMs = 0): Date {
  return new Date(EPOCH_MS + n * STEP_MS + offsetMs);
}

/**
 * A `User` row. Defaults describe an ordinary, unremarkable member — not an
 * admin, not verified, not banned, not a bot — so a test that cares about any
 * of those has to say so, and reads as being about that thing.
 */
export function aUser(overrides: Partial<User> = {}): User {
  const n = next();
  const created = at(n);
  return {
    id: idFor('usr', n),
    name: `Test User ${n}`,
    username: `testuser${n}`,
    handle: `testuser${n}`,
    handleChangedAt: null,
    email: `user${n}@example.test`,
    emailVerified: true,
    password: null,
    image: null,
    stripeCustomerId: null,
    isAdmin: false,
    isVerified: false,
    bannedUntil: null,
    banReason: null,
    lastSeenAt: created,
    referralCode: null,
    isBot: false,
    botPersona: null,
    botLastPostAt: null,
    followerCount: 0,
    followingCount: 0,
    postCount: 0,
    createdAt: created,
    updatedAt: created,
    libraryUploadQuota: null,
    // Non-nullable with schema defaults — mirrored here so the fixture is a row
    // the database could actually have produced.
    doctrineTier: 'PUBLIC',
    doctrineTierChangedAt: null,
    doctrineTimezone: 'America/New_York',
    doctrineRecruitedById: null,
    deletionScheduledAt: null,
    ...overrides,
  };
}

/**
 * An `RMHark` (feed post) row.
 *
 * The denormalized counters (`likeCount`, `commentCount`, `repostCount`,
 * `viewCount`) start at 0 rather than at a random-looking number on purpose:
 * they are maintained by the write routes and reconciled by
 * `scripts/reconcile-feed-counts.ts`, so a test about counter drift should set
 * them explicitly and be obvious about it.
 */
export function aPost(overrides: Partial<RMHark> = {}): RMHark {
  const n = next();
  const created = at(n);
  return {
    id: idFor('post', n),
    userId: SEED_USER_ID,
    content: `Test post ${n}`,
    gifUrl: null,
    imageUrls: [],
    imageAlts: [],
    createdAt: created,
    updatedAt: created,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    unlockPrice: null,
    communityId: null,
    originalId: null,
    deletedAt: null,
    deletedBy: null,
    deletedByAdmin: false,
    audience: 'PUBLIC',
    isSensitive: false,
    replyControl: 'EVERYONE',
    pinnedAt: null,
    editedAt: null,
    threadRootId: null,
    threadReplyCount: 0,
    ...overrides,
  };
}

/**
 * An `RMHarkComment` row. `rmheetId` is the post FK — note the column keeps the
 * pre-rename `rmheet` spelling that `@@map("rmheet_comment")` also carries; the
 * model is `RMHark`, the table is not.
 */
export function aComment(overrides: Partial<RMHarkComment> = {}): RMHarkComment {
  const n = next();
  const created = at(n);
  return {
    id: idFor('cmt', n),
    rmheetId: 'post_0001',
    userId: SEED_USER_ID,
    content: `Test comment ${n}`,
    createdAt: created,
    updatedAt: created,
    likeCount: 0,
    replyCount: 0,
    parentId: null,
    deletedAt: null,
    deletedBy: null,
    deletedByAdmin: false,
    ...overrides,
  };
}

/**
 * A `Notification` row. Defaults to an unread LIKE from an actor on a post,
 * because that is the shape the badge, the grouping key and the retraction
 * `deleteMany` all key off — the paths most worth exercising.
 */
export function aNotification(overrides: Partial<Notification> = {}): Notification {
  const n = next();
  return {
    id: idFor('ntf', n),
    userId: SEED_USER_ID,
    actorId: 'usr_0002',
    type: 'LIKE',
    entityType: 'rmhark',
    entityId: 'post_0001',
    preview: `Test notification ${n}`,
    link: '/rmharks/post_0001',
    read: false,
    groupKey: null,
    createdAt: at(n),
    ...overrides,
  };
}
