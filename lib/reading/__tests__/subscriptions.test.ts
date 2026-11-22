/**
 * Reading subscriptions — the parts that touch a member's data and mail: the fan-out is idempotent and loses
 * nothing when a batch fails, one item notifies a member once however many follows match it, the daily email goes
 * only to members who turned it on, subscriptions are owner-only and capped, and the `logs` unsubscribe token
 * opens nothing else. Prisma is faked in memory; no database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Sub {
  id: string;
  userId: string;
  kind: string;
  target: string;
  inApp: boolean;
  email: boolean;
  lastEmailedAt: Date | null;
  createdAt: Date;
  user: {
    email: string | null;
  };
}
interface Post {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  status?: string;
  createdAt: Date;
}

const db = vi.hoisted(() => ({
  cursors: new Map<string, Date>(),
  subs: [] as Sub[],
  posts: [] as Post[],
  news: [] as Post[],
  storyLinks: [] as {
    articleSlug: string;
    story: {
      slug: string;
    };
  }[],
  notifications: [] as {
    userId: string;
    entityType: string;
    entityId: string;
    link: string;
  }[],
  locked: true,
  failNotificationLookup: false,
  cursorWrites: 0,
}));
const sendOnce = vi.hoisted(() => vi.fn(async () => 'sent' as const));

vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: { userId: string; entityType: string; entityId: string; link: string }) => {
    db.notifications.push({
      userId: n.userId,
      entityType: n.entityType,
      entityId: n.entityId,
      link: n.link,
    });
  }),
}));
vi.mock('@/lib/email/deliveries.server', () => ({
  sendOnce,
}));

const inRange = (
  d: Date,
  w: {
    gte?: Date;
    lte?: Date;
  },
) => (!w.gte || d >= w.gte) && (!w.lte || d <= w.lte);
const sortBy = (rows: Post[], order: 'asc' | 'desc') =>
  [...rows].sort((a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * (order === 'asc' ? 1 : -1));

const fake = vi.hoisted(() => {
  const client = {
    $queryRaw: async () => [
      {
        locked: db.locked,
      },
    ],
    // Logs are read by when they went live (`publishedAt`, in a status-and-range `AND`); the fixtures'
    // `createdAt` stands for that moment, and a fixture with `status: 'draft'` is not live.
    blogPost: {
      findMany: async (a: {
        where: {
          AND: [
            {
              status: string;
            },
            {
              publishedAt: {
                gte?: Date;
                lte?: Date;
              };
            },
          ];
        };
        orderBy: {
          publishedAt: 'asc' | 'desc';
        }[];
        take: number;
      }) =>
        sortBy(
          db.posts.filter(
            (p) =>
              (p.status ?? 'published') === a.where.AND[0].status && inRange(p.createdAt, a.where.AND[1].publishedAt),
          ),
          a.orderBy[0]!.publishedAt,
        )
          .slice(0, a.take)
          .map((p) => ({
            ...p,
            publishedAt: p.createdAt,
          })),
    },
    newsArticle: {
      findMany: async (a: {
        where: {
          status: string;
          createdAt: {
            gte?: Date;
            lte?: Date;
          };
        };
        orderBy: {
          createdAt: 'asc' | 'desc';
        }[];
        take: number;
      }) =>
        sortBy(
          db.news.filter((p) => p.status === a.where.status && inRange(p.createdAt, a.where.createdAt)),
          a.orderBy[0]!.createdAt,
        ).slice(0, a.take),
    },
    newsStoryArticle: {
      findMany: async (a: {
        where: {
          articleSlug: {
            in: string[];
          };
        };
      }) => db.storyLinks.filter((l) => a.where.articleSlug.in.includes(l.articleSlug)),
    },
    readingFanoutCursor: {
      findUnique: async (a: {
        where: {
          name: string;
        };
      }) => {
        const at = db.cursors.get(a.where.name);
        return at
          ? {
              name: a.where.name,
              lastSeenAt: at,
            }
          : null;
      },
      create: async (a: {
        data: {
          name: string;
          lastSeenAt: Date;
        };
      }) => {
        db.cursors.set(a.data.name, a.data.lastSeenAt);
      },
      update: async (a: {
        where: {
          name: string;
        };
        data: {
          lastSeenAt: Date;
        };
      }) => {
        db.cursorWrites++;
        db.cursors.set(a.where.name, a.data.lastSeenAt);
      },
    },
    readingSubscription: {
      findMany: async (a: {
        where: {
          inApp?: boolean;
          email?: boolean;
          userId?: string;
        };
      }) =>
        db.subs.filter(
          (s) =>
            (a.where.inApp === undefined || s.inApp === a.where.inApp) &&
            (a.where.email === undefined || s.email === a.where.email) &&
            (a.where.userId === undefined || s.userId === a.where.userId),
        ),
      updateMany: vi.fn(
        async (a: {
          where: {
            id?:
              | string
              | {
                  in: string[];
                };
            userId?: string;
          };
          data: Partial<Sub>;
        }) => {
          const hit = db.subs.filter((s) => {
            const id = a.where.id;
            const idOk = id === undefined || (typeof id === 'string' ? s.id === id : id.in.includes(s.id));
            return idOk && (a.where.userId === undefined || s.userId === a.where.userId);
          });
          for (const s of hit) Object.assign(s, a.data);
          return {
            count: hit.length,
          };
        },
      ),
      deleteMany: vi.fn(
        async (a: {
          where: {
            id: string;
            userId: string;
          };
        }) => {
          const before = db.subs.length;
          db.subs = db.subs.filter((s) => !(s.id === a.where.id && s.userId === a.where.userId));
          return {
            count: before - db.subs.length,
          };
        },
      ),
      findFirst: async (a: {
        where: {
          id: string;
          userId: string;
        };
      }) => db.subs.find((s) => s.id === a.where.id && s.userId === a.where.userId) ?? null,
      findUnique: async () => null,
      count: async (a: {
        where: {
          userId: string;
        };
      }) => db.subs.filter((s) => s.userId === a.where.userId).length,
      create: async (a: {
        data: {
          userId: string;
          kind: string;
          target: string;
        };
      }) => {
        const row: Sub = {
          id: `s${db.subs.length + 1}`,
          ...a.data,
          inApp: true,
          email: false,
          lastEmailedAt: null,
          createdAt: new Date(),
          user: {
            email: 'a@example.test',
          },
        };
        db.subs.push(row);
        return row;
      },
    },
    notification: {
      findMany: async (a: {
        where: {
          userId: {
            in: string[];
          };
          entityType: {
            in: string[];
          };
          entityId: {
            in: string[];
          };
        };
      }) => {
        if (db.failNotificationLookup) throw new Error('db down');
        return db.notifications.filter(
          (n) =>
            a.where.userId.in.includes(n.userId) &&
            a.where.entityType.in.includes(n.entityType) &&
            a.where.entityId.in.includes(n.entityId),
        );
      },
    },
    newsStory: {
      findMany: async () => [],
      findUnique: async () => null,
    },
  };
  return client;
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    ...fake,
    $transaction: async (fn: (tx: typeof fake) => Promise<unknown>) => fn(fake),
  },
}));

process.env.BETTER_AUTH_SECRET = 'test-secret-for-reading-subscriptions';

const { createSubscription, deleteSubscription, fanOutNewItems, sendDailySubscriptionEmails, updateSubscription } =
  await import('@/lib/reading/subscriptions.server');
const { MAX_SUBSCRIPTIONS } = await import('@/lib/reading/subscriptions');
const { signUnsubToken, verifyUnsubToken } = await import('@/lib/email/unsubscribe');

const T0 = new Date('2026-11-22T10:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

function sub(userId: string, kind: string, target = '', extra: Partial<Sub> = {}): Sub {
  const row: Sub = {
    id: `${userId}-${kind}-${target}`,
    userId,
    kind,
    target,
    inApp: true,
    email: false,
    lastEmailedAt: null,
    createdAt: at(-1000),
    user: {
      email: `${userId}@example.test`,
    },
    ...extra,
  };
  db.subs.push(row);
  return row;
}

const post = (id: string, min: number, tags: string[] = []): Post => ({
  id,
  slug: `slug-${id}`,
  title: `Title ${id}`,
  description: `About ${id}`,
  tags,
  createdAt: at(min),
});

beforeEach(() => {
  db.cursors.clear();
  db.cursors.set('blog', T0);
  db.cursors.set('news', T0);
  db.subs = [];
  db.posts = [];
  db.news = [];
  db.storyLinks = [];
  db.notifications = [];
  db.locked = true;
  db.failNotificationLookup = false;
  db.cursorWrites = 0;
  sendOnce.mockClear();
});

describe('fan-out', () => {
  // A Log is "new" from the moment it went live (`publishedAt`; the fixture's `createdAt` stands for it), and a
  // draft or scheduled Log is not live (s03-05).
  it('never notifies for a draft or scheduled Log', async () => {
    sub('u1', 'blog');
    db.posts.push(
      {
        ...post('d1', 5),
        status: 'draft',
      },
      {
        ...post('s1', 6),
        status: 'scheduled',
      },
    );
    const run = await fanOutNewItems(at(15));
    expect(run.notified).toBe(0);
    expect(db.notifications).toEqual([]);
  });

  it('notifies once when a scheduled Log is published after earlier runs passed it by', async () => {
    sub('u1', 'blog');
    const scheduled = {
      ...post('s1', 5),
      status: 'scheduled',
    };
    db.posts.push(scheduled);
    expect((await fanOutNewItems(at(15))).notified).toBe(0);

    // The publish job goes live at minute 20: status flips and `publishedAt` is that moment.
    scheduled.status = 'published';
    scheduled.createdAt = at(20);
    expect((await fanOutNewItems(at(30))).notified).toBe(1);
    expect((await fanOutNewItems(at(45))).notified).toBe(0);
    expect(db.notifications.map((n) => n.entityId)).toEqual(['s1']);
  });

  it('creates each notification once when it runs twice', async () => {
    sub('u1', 'blog');
    db.posts.push(post('p1', 5));
    const first = await fanOutNewItems(at(15));
    const second = await fanOutNewItems(at(30));
    expect(first.notified).toBe(1);
    expect(second.notified).toBe(0);
    expect(db.notifications).toEqual([
      {
        userId: 'u1',
        entityType: 'blog_post',
        entityId: 'p1',
        link: '/blog/slug-p1',
      },
    ]);
  });

  it('does not repeat a notification when a crashed run left the cursor behind', async () => {
    sub('u1', 'blog');
    db.posts.push(post('p1', 5));
    db.notifications.push({
      userId: 'u1',
      entityType: 'blog_post',
      entityId: 'p1',
      link: '/blog/slug-p1',
    });
    const result = await fanOutNewItems(at(15));
    expect(result.notified).toBe(0);
    expect(db.notifications).toHaveLength(1);
  });

  it('leaves the cursor where it was when the batch fails', async () => {
    sub('u1', 'blog');
    db.posts.push(post('p1', 5));
    db.failNotificationLookup = true;
    await expect(fanOutNewItems(at(15))).rejects.toThrow('db down');
    expect(db.cursors.get('blog')).toEqual(T0);
    expect(db.cursorWrites).toBe(0);
    db.failNotificationLookup = false;
    await fanOutNewItems(at(30));
    expect(db.notifications).toHaveLength(1);
    expect(db.cursors.get('blog')).toEqual(at(5));
  });

  it('notifies a member once for an item that matches two of their subscriptions', async () => {
    sub('u1', 'blog');
    sub('u1', 'blog_tag', 'devlog');
    sub('u2', 'blog_tag', 'devlog');
    db.posts.push(post('p1', 5, ['devlog']));
    await fanOutNewItems(at(15));
    expect(db.notifications.filter((n) => n.userId === 'u1')).toHaveLength(1);
    expect(db.notifications.filter((n) => n.userId === 'u2')).toHaveLength(1);
  });

  it('gives one notification for an article in both a followed category and a followed story', async () => {
    sub('u1', 'news_category', 'Gaming');
    sub('u1', 'news_story', 'big-story');
    db.news.push({
      ...post('n1', 5),
      category: 'Gaming',
      status: 'PUBLISHED',
    });
    db.storyLinks.push({
      articleSlug: 'slug-n1',
      story: {
        slug: 'big-story',
      },
    });
    await fanOutNewItems(at(15));
    expect(db.notifications).toEqual([
      {
        userId: 'u1',
        entityType: 'news_article',
        entityId: 'n1',
        link: '/news/slug-n1',
      },
    ]);
  });

  it('skips drafts, members with the in-site channel off, and non-matching follows', async () => {
    sub('off', 'blog', '', {
      inApp: false,
    });
    sub('other', 'news_category', 'Arts');
    db.posts.push(post('p1', 5));
    db.news.push({
      ...post('n1', 6),
      category: 'Gaming',
      status: 'DRAFT',
    });
    db.news.push({
      ...post('n2', 7),
      category: 'Gaming',
      status: 'PUBLISHED',
    });
    await fanOutNewItems(at(15));
    expect(db.notifications).toEqual([]);
  });

  it('starts from now on its first run instead of notifying about the archive', async () => {
    db.cursors.clear();
    sub('u1', 'blog');
    db.posts.push(post('old', -500));
    const result = await fanOutNewItems(at(15));
    expect(result.notified).toBe(0);
    expect(db.cursors.get('blog')).toEqual(at(15));
  });

  it('does nothing when another run holds the lock', async () => {
    sub('u1', 'blog');
    db.posts.push(post('p1', 5));
    db.locked = false;
    expect(await fanOutNewItems(at(15))).toEqual({
      ran: false,
      items: 0,
      notified: 0,
    });
    expect(db.notifications).toEqual([]);
    expect(db.cursors.get('blog')).toEqual(T0);
  });
});

describe('daily email', () => {
  it('sends nothing to members whose email channel is off', async () => {
    sub('u1', 'blog', '', {
      email: false,
    });
    db.posts.push(post('p1', 5));
    const result = await sendDailySubscriptionEmails(at(60));
    expect(sendOnce).not.toHaveBeenCalled();
    expect(result.members).toBe(0);
  });

  it('sends one email per member with a one-click unsubscribe for the logs list, then stamps lastEmailedAt', async () => {
    const s1 = sub('u1', 'blog', '', {
      email: true,
      createdAt: at(-60),
    });
    sub('u1', 'blog_tag', 'devlog', {
      email: true,
      createdAt: at(-60),
    });
    db.posts.push(post('p1', 5, ['devlog']), post('p2', 8));
    const result = await sendDailySubscriptionEmails(at(60));
    expect(result.sent).toBe(1);
    expect(sendOnce).toHaveBeenCalledTimes(1);
    const mail = (sendOnce.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(mail).toMatchObject({
      userId: 'u1',
      kind: 'digest',
      dedupeKey: 'logs:2026-11-22',
    });
    const headers = mail.headers as Record<string, string>;
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(headers['List-Unsubscribe']).toContain('list=logs');
    expect(String(mail.text)).toContain('Title p1');
    expect(String(mail.text)).toContain('Title p2');
    expect(s1.lastEmailedAt).toEqual(at(60));
  });

  it('skips a member with nothing new since their last email', async () => {
    sub('u1', 'blog', '', {
      email: true,
      lastEmailedAt: at(30),
    });
    db.posts.push(post('p1', 5));
    const result = await sendDailySubscriptionEmails(at(60));
    expect(sendOnce).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it('does not stamp lastEmailedAt when the send fails', async () => {
    const s = sub('u1', 'blog', '', {
      email: true,
      createdAt: at(-60),
    });
    db.posts.push(post('p1', 5));
    sendOnce.mockResolvedValueOnce('failed' as never);
    const result = await sendDailySubscriptionEmails(at(60));
    expect(result.failed).toBe(1);
    expect(s.lastEmailedAt).toBeNull();
  });
});

describe('the logs unsubscribe token', () => {
  it('verifies for logs and for nothing else', () => {
    const token = signUnsubToken('u1', undefined, 'logs');
    expect(verifyUnsubToken(token, 'logs')).toBe('u1');
    for (const list of ['digest', 'announcements', 'product'] as const) {
      expect(verifyUnsubToken(token, list)).toBeNull();
    }
  });

  it('is not accepted for logs when it was minted for another list', () => {
    for (const list of ['digest', 'announcements', 'product'] as const) {
      expect(verifyUnsubToken(signUnsubToken('u1', undefined, list), 'logs')).toBeNull();
    }
  });
});

describe('ownership and limits', () => {
  it("changes only the caller's own subscription", async () => {
    const mine = sub('u1', 'blog');
    expect(
      await updateSubscription('u2', mine.id, {
        email: true,
      }),
    ).toBeNull();
    expect(mine.email).toBe(false);
    expect(
      await updateSubscription('u1', mine.id, {
        email: true,
      }),
    ).toMatchObject({
      email: true,
    });
  });

  it("deletes only the caller's own subscription", async () => {
    const mine = sub('u1', 'blog');
    expect(await deleteSubscription('u2', mine.id)).toBe(false);
    expect(db.subs).toHaveLength(1);
    expect(await deleteSubscription('u1', mine.id)).toBe(true);
    expect(db.subs).toHaveLength(0);
  });

  it('refuses the 101st subscription and a target that is not valid for its kind', async () => {
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) sub('u1', 'news_category', `c${i}`);
    expect(
      await createSubscription('u1', {
        kind: 'blog',
        target: '',
      }),
    ).toMatchObject({
      ok: false,
      status: 409,
      reason: 'limit-reached',
    });
    expect(
      await createSubscription('u2', {
        kind: 'news_category',
        target: 'Not a category',
      }),
    ).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});
