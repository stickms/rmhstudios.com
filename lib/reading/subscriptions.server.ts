/**
 * Reading subscriptions — server only.
 *
 * A member follows the Logs, a Log tag, a News category or a News story. Two things act on that:
 *
 *  - {@link fanOutNewItems} (every 15 minutes) reads the Logs and published News articles created since a stored
 *    cursor and writes one in-site notification per new item per subscriber, however many of their subscriptions
 *    match it. Reading from the tables, not hooking each writer, covers every way an item arrives (the admin, the
 *    news pipeline, a migration). The cursor moves only after the batch is written, and a notification is skipped
 *    when the member already has one for that item, so a crash or a second run repeats nothing.
 *  - {@link sendDailySubscriptionEmails} (17:00 UTC) emails members who turned email on for a subscription: at most
 *    one message a day, up to 20 items, with its own one-click unsubscribe list (`logs`).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { publishedLogWhere } from '@/lib/blog/publication';
import { createNotification } from '@/lib/notifications.server';
import { sendOnce } from '@/lib/email/deliveries.server';
import { signUnsubToken } from '@/lib/email/unsubscribe';
import { SITE_URL } from '@/lib/seo';
import type { SubscriptionView } from '@/lib/reading/subscriptions-schema';
import {
  itemEntityType,
  itemPath,
  itemsForEmail,
  isSubscriptionKind,
  matchingSubscribers,
  MAX_SUBSCRIPTIONS,
  renderSubscriptionEmail,
  validateTarget,
  type EmailSubscription,
  type ReadingItem,
  type SubscriptionKind,
} from '@/lib/reading/subscriptions';

/** New items read per source per run. */
export const FANOUT_MAX_ITEMS = 200;
/** Notifications written per run; a larger backlog continues on the next run. */
export const FANOUT_MAX_NOTIFICATIONS = 5000;
/** How far back the daily email looks for items, whatever a member's last email says. */
const EMAIL_LOOKBACK_DAYS = 14;
const DAY_MS = 86_400_000;

const FANOUT_LOCK = 'reading-subscriptions-fanout';
const NOTIFY_CHUNK = 50;

/* ── CRUD ───────────────────────────────────────────────────────────────── */

const viewSelect = {
  id: true,
  kind: true,
  target: true,
  inApp: true,
  email: true,
  createdAt: true,
} as const;

type Row = {
  id: string;
  kind: string;
  target: string;
  inApp: boolean;
  email: boolean;
  createdAt: Date;
};

function toView(row: Row, titles: ReadonlyMap<string, string>): SubscriptionView | null {
  if (!isSubscriptionKind(row.kind)) return null;
  return {
    id: row.id,
    kind: row.kind,
    target: row.target,
    title: row.kind === 'news_story' ? (titles.get(row.target) ?? null) : null,
    inApp: row.inApp,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  };
}

async function storyTitles(rows: readonly Row[]): Promise<Map<string, string>> {
  const slugs = rows.filter((r) => r.kind === 'news_story').map((r) => r.target);
  if (slugs.length === 0) return new Map();
  const stories = await prisma.newsStory.findMany({
    where: {
      slug: {
        in: slugs,
      },
    },
    select: {
      slug: true,
      title: true,
    },
  });
  return new Map(stories.map((s) => [s.slug, s.title]));
}

export async function listSubscriptions(userId: string): Promise<SubscriptionView[]> {
  const rows = await prisma.readingSubscription.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: MAX_SUBSCRIPTIONS,
    select: viewSelect,
  });
  const titles = await storyTitles(rows);
  return rows.flatMap((r) => toView(r, titles) ?? []);
}

export type SubscriptionResult =
  | {
      ok: true;
      subscription: SubscriptionView;
    }
  | {
      ok: false;
      status: 400 | 404 | 409;
      reason: string;
    };

/**
 * Follow a target. Following what is already followed returns the existing row, so a double press is harmless.
 * The target must be well formed (`validateTarget`), a Log tag some Log carries, or a story that exists.
 */
export async function createSubscription(
  userId: string,
  input: {
    kind: SubscriptionKind;
    target: string;
  },
): Promise<SubscriptionResult> {
  const checked = validateTarget(input.kind, input.target);
  if (!checked.ok)
    return {
      ok: false,
      status: 400,
      reason: checked.reason,
    };
  const { target } = checked;
  const { kind } = input;

  if (kind === 'blog_tag') {
    const known = await prisma.blogPost.findFirst({
      where: {
        tags: {
          has: target,
        },
        ...publishedLogWhere(new Date()),
      },
      select: {
        id: true,
      },
    });
    if (!known)
      return {
        ok: false,
        status: 404,
        reason: 'target-not-found',
      };
  } else if (kind === 'news_story') {
    const story = await prisma.newsStory.findUnique({
      where: {
        slug: target,
      },
      select: {
        id: true,
      },
    });
    if (!story)
      return {
        ok: false,
        status: 404,
        reason: 'target-not-found',
      };
  }

  const where = {
    userId_kind_target: {
      userId,
      kind,
      target,
    },
  };
  const existing = await prisma.readingSubscription.findUnique({
    where,
    select: viewSelect,
  });
  if (existing) return viewOf(existing);

  const count = await prisma.readingSubscription.count({
    where: {
      userId,
    },
  });
  if (count >= MAX_SUBSCRIPTIONS)
    return {
      ok: false,
      status: 409,
      reason: 'limit-reached',
    };

  try {
    const row = await prisma.readingSubscription.create({
      data: {
        userId,
        kind,
        target,
      },
      select: viewSelect,
    });
    return viewOf(row);
  } catch (error) {
    // A second press that raced the first: the unique key refused it, so the row is there.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const row = await prisma.readingSubscription.findUnique({
        where,
        select: viewSelect,
      });
      if (row) return viewOf(row);
    }
    throw error;
  }
}

async function viewOf(row: Row): Promise<SubscriptionResult> {
  const view = toView(row, await storyTitles([row]));
  return view
    ? {
        ok: true,
        subscription: view,
      }
    : {
        ok: false,
        status: 400,
        reason: 'invalid-target',
      };
}

/** Change a channel of one of the caller's own subscriptions. `null` when it is not theirs (or not there). */
export async function updateSubscription(
  userId: string,
  id: string,
  patch: {
    inApp?: boolean;
    email?: boolean;
  },
): Promise<SubscriptionView | null> {
  const { count } = await prisma.readingSubscription.updateMany({
    where: {
      id,
      userId,
    },
    data: {
      ...(patch.inApp !== undefined
        ? {
            inApp: patch.inApp,
          }
        : {}),
      ...(patch.email !== undefined
        ? {
            email: patch.email,
          }
        : {}),
    },
  });
  if (count === 0) return null;
  const row = await prisma.readingSubscription.findFirst({
    where: {
      id,
      userId,
    },
    select: viewSelect,
  });
  return row ? toView(row, await storyTitles([row])) : null;
}

/** Unfollow. False when the row is not the caller's (or already gone). */
export async function deleteSubscription(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.readingSubscription.deleteMany({
    where: {
      id,
      userId,
    },
  });
  return count > 0;
}

/** The member's subscriptions for the account export (wired by the account export route). */
export async function exportReadingSubscriptions(userId: string): Promise<{
  subscriptions: Array<
    Omit<SubscriptionView, 'id'> & {
      lastEmailedAt: string | null;
    }
  >;
}> {
  const rows = await prisma.readingSubscription.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: MAX_SUBSCRIPTIONS,
    select: {
      ...viewSelect,
      lastEmailedAt: true,
    },
  });
  const titles = await storyTitles(rows);
  return {
    subscriptions: rows.flatMap((r) => {
      const view = toView(r, titles);
      if (!view) return [];
      return [
        {
          kind: view.kind,
          target: view.target,
          title: view.title,
          inApp: view.inApp,
          email: view.email,
          createdAt: view.createdAt,
          lastEmailedAt: r.lastEmailedAt?.toISOString() ?? null,
        },
      ];
    }),
  };
}

/* ── items ──────────────────────────────────────────────────────────────── */

async function attachStories<
  T extends {
    slug: string;
  },
>(db: Pick<Prisma.TransactionClient, 'newsStoryArticle'>, articles: readonly T[]): Promise<Map<string, string>> {
  if (articles.length === 0) return new Map();
  const links = await db.newsStoryArticle.findMany({
    where: {
      articleSlug: {
        in: articles.map((a) => a.slug),
      },
    },
    select: {
      articleSlug: true,
      story: {
        select: {
          slug: true,
        },
      },
    },
  });
  return new Map(links.map((l) => [l.articleSlug, l.story.slug]));
}

/**
 * Live Logs published in `[after, until]`, oldest first. A Log counts as new from the moment it went live
 * (`publishedAt`), so a draft is never seen and a scheduled Log is seen once, when the publish job sets it.
 */
async function newBlogItems(
  db: Pick<Prisma.TransactionClient, 'blogPost'>,
  after: Date,
  take: number,
  order: 'asc' | 'desc',
  until?: Date,
): Promise<ReadingItem[]> {
  const rows = await db.blogPost.findMany({
    where: {
      AND: [
        publishedLogWhere(new Date()),
        {
          publishedAt: {
            gte: after,
            ...(until
              ? {
                  lte: until,
                }
              : {}),
          },
        },
      ],
    },
    orderBy: [
      {
        publishedAt: order,
      },
      {
        id: order,
      },
    ],
    take,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      tags: true,
      publishedAt: true,
    },
  });
  return rows.flatMap((r) =>
    r.publishedAt
      ? [
          {
            id: r.id,
            slug: r.slug,
            title: r.title,
            description: r.description,
            tags: r.tags,
            createdAt: r.publishedAt,
            source: 'blog' as const,
          },
        ]
      : [],
  );
}

/** Published News articles created in `[after, until]`. */
async function newNewsItems(
  db: Pick<Prisma.TransactionClient, 'newsArticle' | 'newsStoryArticle'>,
  after: Date,
  take: number,
  order: 'asc' | 'desc',
  until?: Date,
): Promise<ReadingItem[]> {
  const rows = await db.newsArticle.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: {
        gte: after,
        ...(until
          ? {
              lte: until,
            }
          : {}),
      },
    },
    orderBy: [
      {
        createdAt: order,
      },
      {
        id: order,
      },
    ],
    take,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      tags: true,
      category: true,
      createdAt: true,
    },
  });
  const stories = await attachStories(db, rows);
  return rows.map((r) => ({
    ...r,
    source: 'news' as const,
    storySlug: stories.get(r.slug) ?? null,
  }));
}

/* ── fan-out ────────────────────────────────────────────────────────────── */

export interface FanOutResult {
  /** False when another run held the lock: nothing was read or written. */
  ran: boolean;
  items: number;
  notified: number;
}

/**
 * Notify subscribers of everything new since the last run. Safe to run twice at once (a transaction-scoped
 * advisory lock: the second run returns `ran: false`) and safe to repeat (dedupe by member and item). A failure
 * anywhere before the end leaves the cursors where they were, so the next run reads the same items again.
 */
export async function fanOutNewItems(now: Date = new Date()): Promise<FanOutResult> {
  return prisma.$transaction(
    async (tx): Promise<FanOutResult> => {
      const [lock] = await tx.$queryRaw<
        {
          locked: boolean;
        }[]
      >`
        SELECT pg_try_advisory_xact_lock(hashtext(${FANOUT_LOCK})) AS locked`;
      if (!lock?.locked)
        return {
          ran: false,
          items: 0,
          notified: 0,
        };

      const total: FanOutResult = {
        ran: true,
        items: 0,
        notified: 0,
      };
      for (const source of ['blog', 'news'] as const) {
        const cursor = await tx.readingFanoutCursor.findUnique({
          where: {
            name: source,
          },
        });
        if (!cursor) {
          // First run: start from now. Notifying a member about the whole archive on the day the feature ships
          // would be the opposite of "new item".
          await tx.readingFanoutCursor.create({
            data: {
              name: source,
              lastSeenAt: now,
            },
          });
          continue;
        }
        // `gte`: an item sharing the cursor's instant is read again and skipped by the dedupe below, so a
        // batch that ended mid-instant loses nothing.
        const items =
          source === 'blog'
            ? await newBlogItems(tx, cursor.lastSeenAt, FANOUT_MAX_ITEMS, 'asc')
            : await newNewsItems(tx, cursor.lastSeenAt, FANOUT_MAX_ITEMS, 'asc');
        if (items.length === 0) continue;

        const { notified, processed } = await notifyForItems(tx, items);
        total.items += processed.length;
        total.notified += notified;
        const last = processed[processed.length - 1];
        if (last && last.createdAt > cursor.lastSeenAt) {
          await tx.readingFanoutCursor.update({
            where: {
              name: source,
            },
            data: {
              lastSeenAt: last.createdAt,
            },
          });
        }
      }
      return total;
    },
    {
      timeout: 120_000,
      maxWait: 10_000,
    },
  );
}

/**
 * Write the notifications for `items` (oldest first), stopping before the run would pass
 * {@link FANOUT_MAX_NOTIFICATIONS}. Returns how many were written and which items were handled, in order.
 */
async function notifyForItems(
  tx: Prisma.TransactionClient,
  items: readonly ReadingItem[],
): Promise<{
  notified: number;
  processed: ReadingItem[];
}> {
  const subs = await tx.readingSubscription.findMany({
    where: {
      inApp: true,
      OR: subscriptionFilter(items),
    },
    select: {
      userId: true,
      kind: true,
      target: true,
    },
  });
  const keys = subs.flatMap((s) =>
    isSubscriptionKind(s.kind)
      ? [
          {
            ...s,
            kind: s.kind,
          },
        ]
      : [],
  );

  const plan = items.map((item) => ({
    item,
    users: matchingSubscribers(item, keys),
  }));
  const everyone = [...new Set(plan.flatMap((p) => p.users))];
  const have = new Set<string>();
  if (everyone.length > 0) {
    const existing = await tx.notification.findMany({
      where: {
        userId: {
          in: everyone,
        },
        entityType: {
          in: ['blog_post', 'news_article'],
        },
        entityId: {
          in: items.map((i) => i.id),
        },
      },
      select: {
        userId: true,
        entityType: true,
        entityId: true,
      },
    });
    for (const n of existing) have.add(`${n.userId}:${n.entityType}:${n.entityId}`);
  }

  let notified = 0;
  const processed: ReadingItem[] = [];
  for (const { item, users } of plan) {
    const entityType = itemEntityType(item);
    const fresh = users.filter((u) => !have.has(`${u}:${entityType}:${item.id}`));
    if (processed.length > 0 && notified + fresh.length > FANOUT_MAX_NOTIFICATIONS) break;
    for (let i = 0; i < fresh.length; i += NOTIFY_CHUNK) {
      // `createNotification` applies the member's own notification settings and mirrors to push.
      await Promise.all(
        fresh.slice(i, i + NOTIFY_CHUNK).map((userId) =>
          createNotification({
            userId,
            type: 'SYSTEM',
            entityType,
            entityId: item.id,
            preview: item.title,
            link: itemPath(item),
          }),
        ),
      );
    }
    notified += fresh.length;
    processed.push(item);
  }
  return {
    notified,
    processed,
  };
}

/** The `(kind, target)` pairs that can match any of `items`, so the lookup uses the index. */
function subscriptionFilter(items: readonly ReadingItem[]): Prisma.ReadingSubscriptionWhereInput[] {
  const filters: Prisma.ReadingSubscriptionWhereInput[] = [];
  const tags = new Set<string>();
  const categories = new Set<string>();
  const stories = new Set<string>();
  let blog = false;
  for (const item of items) {
    if (item.source === 'blog') {
      blog = true;
      for (const t of item.tags) tags.add(t);
    } else {
      if (item.category) categories.add(item.category);
      if (item.storySlug) stories.add(item.storySlug);
    }
  }
  if (blog)
    filters.push({
      kind: 'blog',
      target: '',
    });
  if (tags.size > 0)
    filters.push({
      kind: 'blog_tag',
      target: {
        in: [...tags],
      },
    });
  if (categories.size > 0)
    filters.push({
      kind: 'news_category',
      target: {
        in: [...categories],
      },
    });
  if (stories.size > 0)
    filters.push({
      kind: 'news_story',
      target: {
        in: [...stories],
      },
    });
  // `OR: []` matches nothing, which is right when no item can have a subscriber.
  return filters;
}

/* ── daily email ────────────────────────────────────────────────────────── */

export interface DailyEmailResult {
  members: number;
  sent: number;
  skipped: number;
  failed: number;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Email each member who has email on for a subscription and has new matching items since their last email. One
 * message per member per day: `sendOnce` claims `logs:<date>`, so a retried or double-fired job sends nothing
 * twice. `lastEmailedAt` moves only after a send went out.
 */
export async function sendDailySubscriptionEmails(now: Date = new Date()): Promise<DailyEmailResult> {
  const result: DailyEmailResult = {
    members: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  const rows = await prisma.readingSubscription.findMany({
    where: {
      email: true,
      // A suspended or banned member gets no email.
      user: {
        OR: [
          {
            bannedUntil: null,
          },
          {
            bannedUntil: {
              lte: now,
            },
          },
        ],
      },
    },
    orderBy: [
      {
        userId: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
    take: 20_000,
    select: {
      id: true,
      userId: true,
      kind: true,
      target: true,
      lastEmailedAt: true,
      createdAt: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });
  if (rows.length === 0) return result;

  const floor = new Date(now.getTime() - EMAIL_LOOKBACK_DAYS * DAY_MS);
  const byUser = new Map<
    string,
    {
      to: string;
      subs: EmailSubscription[];
      ids: string[];
    }
  >();
  for (const r of rows) {
    if (!isSubscriptionKind(r.kind) || !r.user.email) continue;
    const since = new Date(Math.max((r.lastEmailedAt ?? r.createdAt).getTime(), floor.getTime()));
    const entry = byUser.get(r.userId) ?? {
      to: r.user.email,
      subs: [],
      ids: [],
    };
    entry.subs.push({
      userId: r.userId,
      kind: r.kind,
      target: r.target,
      since,
    });
    entry.ids.push(r.id);
    byUser.set(r.userId, entry);
  }
  result.members = byUser.size;

  const oldest = new Date(Math.min(...[...byUser.values()].flatMap((m) => m.subs.map((s) => s.since.getTime()))));
  const [blog, news] = await Promise.all([
    newBlogItems(prisma, oldest, 500, 'desc', now),
    newNewsItems(prisma, oldest, 500, 'desc', now),
  ]);
  const items = [...blog, ...news];

  for (const [userId, member] of byUser) {
    try {
      const mine = itemsForEmail(items, member.subs);
      if (mine.length === 0) {
        result.skipped++;
        continue;
      }
      const unsubscribeUrl = `${SITE_URL}/api/email/unsubscribe?token=${encodeURIComponent(
        signUnsubToken(userId, undefined, 'logs'),
      )}&list=logs`;
      const email = renderSubscriptionEmail(mine, {
        siteUrl: SITE_URL,
        unsubscribeUrl,
        settingsUrl: `${SITE_URL}/settings/notifications`,
      });
      const outcome = await sendOnce({
        userId,
        kind: 'digest',
        dedupeKey: `logs:${ymd(now)}`,
        to: member.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (outcome === 'sent') {
        result.sent++;
        await prisma.readingSubscription.updateMany({
          where: {
            id: {
              in: member.ids,
            },
          },
          data: {
            lastEmailedAt: now,
          },
        });
      } else if (outcome === 'failed') result.failed++;
      else result.skipped++;
    } catch (error) {
      result.failed++;
      console.error(
        `[reading-subscriptions] email failed for ${userId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return result;
}
