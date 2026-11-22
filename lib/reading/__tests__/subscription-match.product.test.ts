import { describe, expect, it } from 'vitest';
import {
  EMAIL_MAX_ITEMS,
  itemEntityType,
  itemPath,
  itemsForEmail,
  matchesSubscription,
  matchingSubscribers,
  renderSubscriptionEmail,
  validateTarget,
  type EmailSubscription,
  type ReadingItem,
} from '@/lib/reading/subscriptions';

const base = new Date('2026-11-22T10:00:00Z');
const item = (over: Partial<ReadingItem> = {}): ReadingItem => ({
  source: 'blog',
  id: 'i1',
  slug: 's1',
  title: 'A title',
  description: 'A description',
  createdAt: base,
  tags: [],
  ...over,
});

describe('validateTarget', () => {
  it('takes no target for the Logs', () => {
    expect(validateTarget('blog', '')).toEqual({
      ok: true,
      target: '',
    });
    expect(validateTarget('blog', 'x')).toMatchObject({
      ok: false,
      reason: 'target-not-allowed',
    });
  });
  it('checks a category against the known list', () => {
    expect(validateTarget('news_category', 'Gaming')).toEqual({
      ok: true,
      target: 'Gaming',
    });
    expect(validateTarget('news_category', 'Nonsense')).toMatchObject({
      ok: false,
      reason: 'unknown-category',
    });
  });
  it('needs a tag, trims it and caps its length', () => {
    expect(validateTarget('blog_tag', '  devlog ')).toEqual({
      ok: true,
      target: 'devlog',
    });
    expect(validateTarget('blog_tag', '  ')).toMatchObject({
      ok: false,
      reason: 'target-required',
    });
    expect(validateTarget('blog_tag', 'x'.repeat(81))).toMatchObject({
      ok: false,
      reason: 'target-too-long',
    });
  });
  it('accepts a story slug and refuses anything else', () => {
    expect(validateTarget('news_story', 'big-story-2')).toEqual({
      ok: true,
      target: 'big-story-2',
    });
    expect(validateTarget('news_story', 'Big Story!')).toMatchObject({
      ok: false,
      reason: 'invalid-target',
    });
  });
});

describe('matchesSubscription', () => {
  it('matches the Logs to any Log and nothing in News', () => {
    expect(
      matchesSubscription(item(), {
        kind: 'blog',
        target: '',
      }),
    ).toBe(true);
    expect(
      matchesSubscription(
        item({
          source: 'news',
        }),
        {
          kind: 'blog',
          target: '',
        },
      ),
    ).toBe(false);
  });
  it('matches a tag only on a Log that carries it', () => {
    const post = item({
      tags: ['a', 'b'],
    });
    expect(
      matchesSubscription(post, {
        kind: 'blog_tag',
        target: 'b',
      }),
    ).toBe(true);
    expect(
      matchesSubscription(post, {
        kind: 'blog_tag',
        target: 'c',
      }),
    ).toBe(false);
    expect(
      matchesSubscription(
        item({
          source: 'news',
          tags: ['b'],
        }),
        {
          kind: 'blog_tag',
          target: 'b',
        },
      ),
    ).toBe(false);
  });
  it('matches a category and a story on News only', () => {
    const news = item({
      source: 'news',
      category: 'Arts',
      storySlug: 'st',
    });
    expect(
      matchesSubscription(news, {
        kind: 'news_category',
        target: 'Arts',
      }),
    ).toBe(true);
    expect(
      matchesSubscription(news, {
        kind: 'news_category',
        target: 'Gaming',
      }),
    ).toBe(false);
    expect(
      matchesSubscription(news, {
        kind: 'news_story',
        target: 'st',
      }),
    ).toBe(true);
    expect(
      matchesSubscription(
        item({
          source: 'news',
          category: 'Arts',
        }),
        {
          kind: 'news_story',
          target: 'st',
        },
      ),
    ).toBe(false);
  });
});

describe('matchingSubscribers', () => {
  it('returns each member once however many of their follows match', () => {
    const post = item({
      tags: ['t'],
    });
    const users = matchingSubscribers(post, [
      {
        userId: 'u1',
        kind: 'blog',
        target: '',
      },
      {
        userId: 'u1',
        kind: 'blog_tag',
        target: 't',
      },
      {
        userId: 'u2',
        kind: 'blog_tag',
        target: 't',
      },
      {
        userId: 'u3',
        kind: 'blog_tag',
        target: 'other',
      },
    ]);
    expect(users.sort()).toEqual(['u1', 'u2']);
  });
});

describe('itemPath and entity type', () => {
  it('names the page and the notification entity', () => {
    expect(itemPath(item())).toBe('/blog/s1');
    expect(
      itemPath(
        item({
          source: 'news',
        }),
      ),
    ).toBe('/news/s1');
    expect(itemEntityType(item())).toBe('blog_post');
    expect(
      itemEntityType(
        item({
          source: 'news',
        }),
      ),
    ).toBe('news_article');
  });
});

describe('itemsForEmail', () => {
  const sub = (since: Date, kind: EmailSubscription['kind'] = 'blog', target = ''): EmailSubscription => ({
    userId: 'u',
    kind,
    target,
    since,
  });
  const at = (min: number) => new Date(base.getTime() + min * 60_000);

  it("keeps only items newer than the matching subscription's own since", () => {
    const items = [
      item({
        id: 'old',
        createdAt: at(-10),
        tags: ['t'],
      }),
      item({
        id: 'new',
        createdAt: at(10),
        tags: ['t'],
      }),
    ];
    const got = itemsForEmail(items, [sub(at(0), 'blog_tag', 't')]);
    expect(got.map((i) => i.id)).toEqual(['new']);
  });
  it("uses each subscription's own since, so a fresh tag does not pull in an older post", () => {
    const post = item({
      id: 'p',
      createdAt: at(5),
      tags: ['t'],
    });
    expect(itemsForEmail([post], [sub(at(10), 'blog_tag', 't')])).toEqual([]);
    expect(itemsForEmail([post], [sub(at(10), 'blog_tag', 't'), sub(at(0))])).toHaveLength(1);
  });
  it('lists an item once, newest first, at most 20', () => {
    const items = Array.from(
      {
        length: 30,
      },
      (_, i) =>
        item({
          id: `i${i}`,
          createdAt: at(i + 1),
        }),
    );
    const got = itemsForEmail(items, [sub(at(0)), sub(at(0), 'blog')]);
    expect(got).toHaveLength(EMAIL_MAX_ITEMS);
    expect(got[0]?.id).toBe('i29');
  });
});

describe('renderSubscriptionEmail', () => {
  const opts = {
    siteUrl: 'https://example.test',
    unsubscribeUrl: 'https://example.test/api/email/unsubscribe?token=t&list=logs',
    settingsUrl: 'https://example.test/settings/notifications',
  };
  it('escapes titles and links to each item and the unsubscribe page', () => {
    const mail = renderSubscriptionEmail(
      [
        item({
          title: '<b>Bold</b> & co',
        }),
      ],
      opts,
    );
    expect(mail.html).not.toContain('<b>Bold</b>');
    expect(mail.html).toContain('&lt;b&gt;Bold&lt;/b&gt; &amp; co');
    expect(mail.html).toContain('https://example.test/blog/s1');
    expect(mail.html).toContain('list=logs');
    expect(mail.text).toContain('https://example.test/blog/s1');
  });
  it('names the one item in the subject, or counts several', () => {
    expect(
      renderSubscriptionEmail(
        [
          item({
            title: 'Solo',
          }),
        ],
        opts,
      ).subject,
    ).toContain('Solo');
    expect(
      renderSubscriptionEmail(
        [
          item(),
          item({
            id: 'i2',
          }),
        ],
        opts,
      ).subject,
    ).toContain('2 new items');
  });
});
